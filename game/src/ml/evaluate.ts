// 评估一个参数向量:让它打几局并取平均分。主线程测试与 Worker 都调用这里。
import { CharacterDef } from '../sim/types';
import { makeScriptAI } from '../sim/ai/script';
import { makeMasher } from '../sim/ai/masher';
import { Layout } from './mlp';
import { makePolicyController } from './policy';
import { runEpisode } from './env';

/** 一次评估任务的描述(可以原样通过 postMessage 传给 Worker) */
export interface EvalSpec {
  /** 被训练方角色 id */
  hero: string;
  /** 对手角色 id */
  foe: string;
  layout: Layout;
  /** 本代公共随机种子:同一代所有个体面对相同的开局,比较才公平 */
  seed: number;
  /** 脚本 AI 对手的攻击欲望 0..1 */
  scriptAggression: number;
  /** 自博弈对手池:历史快照的参数;为空则只打脚本 AI */
  pool: Float32Array[];
}

/**
 * 评估一组参数的适应度。陪练分三档,越往后越难:
 *  1. 脚本 AI(按冷却出招)
 *  2. 「连打新手」机器人(贴身连打、放技能、会躲霸体大招)——比脚本 AI 凶得多
 *  3. 对手池里的历史版本(自博弈),池子非空时才打
 * 只练第一档的话,十几代就能赢,但学到的只是针对呆板对手的套路。
 */
export function evaluate(roster: Record<string, CharacterDef>, theta: Float32Array, spec: EvalSpec): number {
  const hero = roster[spec.hero], foe = roster[spec.foe];
  const me = () => makePolicyController(theta, spec.layout);
  let sum = 0, n = 0;
  // 每档打两局,第二局左右站位互换,抵消站位带来的偏差
  for (let k = 0; k < 2; k++) {
    sum += runEpisode(roster, hero, foe, me(), makeScriptAI(spec.scriptAggression), spec.seed + k, k === 1).fitness;
    sum += runEpisode(roster, hero, foe, me(), makeMasher(), spec.seed + 20 + k, k === 1).fitness;
    n += 2;
  }
  if (spec.pool.length) {
    for (let k = 0; k < 2; k++) {
      const opp = spec.pool[(spec.seed + k) % spec.pool.length];
      sum += runEpisode(roster, hero, foe, me(), makePolicyController(opp, spec.layout), spec.seed + 10 + k, k === 1).fitness;
      n++;
    }
  }
  return sum / n;
}

/**
 * 「考试」:用固定的一组种子分别对战脚本 AI 和连打机器人,返回胜率等统计。
 * 这组题目不参与训练,用来画出看得见的进步曲线。
 */
export function exam(roster: Record<string, CharacterDef>, theta: Float32Array, spec: EvalSpec, games = 10) {
  const hero = roster[spec.hero], foe = roster[spec.foe];
  // 种子固定为 9000+,与训练时的种子错开,保证是「没见过的题」
  let wins = 0, losses = 0, dealt = 0, taken = 0, combo = 0, hardWins = 0;
  for (let k = 0; k < games; k++) {
    const r = runEpisode(roster, hero, foe, makePolicyController(theta, spec.layout), makeScriptAI(spec.scriptAggression), 9000 + k, k % 2 === 1);
    if (r.outcome > 0) wins++; else if (r.outcome < 0) losses++;
    dealt += r.dealt; taken += r.taken; combo = Math.max(combo, r.maxCombo);
    const h = runEpisode(roster, hero, foe, makePolicyController(theta, spec.layout), makeMasher(), 9500 + k, k % 2 === 1);
    if (h.outcome > 0) hardWins++;
    combo = Math.max(combo, h.maxCombo);
  }
  return {
    winRate: wins / games, lossRate: losses / games, dealt: dealt / games, taken: taken / games, maxCombo: combo,
    /** 对连打机器人的胜率(更难的一档) */
    winRateHard: hardWins / games,
  };
}
