// 评估一个参数向量:让它打几局并取平均分。主线程测试与 Worker 都调用这里。
import { CharacterDef } from '../sim/types';
import { makeScriptAI } from '../sim/ai/script';
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
 * 评估一组参数的适应度。
 * 固定打 2 局脚本 AI(左右各一局);若对手池非空,再打 2 局池中对手(自博弈)。
 */
export function evaluate(roster: Record<string, CharacterDef>, theta: Float32Array, spec: EvalSpec): number {
  const hero = roster[spec.hero], foe = roster[spec.foe];
  let sum = 0, n = 0;
  // k === 1 时左右站位互换,抵消站位带来的偏差
  for (let k = 0; k < 2; k++) {
    sum += runEpisode(roster, hero, foe, makePolicyController(theta, spec.layout), makeScriptAI(spec.scriptAggression), spec.seed + k, k === 1).fitness;
    n++;
  }
  if (spec.pool.length) {
    for (let k = 0; k < 2; k++) {
      const opp = spec.pool[(spec.seed + k) % spec.pool.length];
      // 自博弈:对手用池里某个历史版本的网络,操纵 foe 角色
      sum += runEpisode(roster, hero, foe, makePolicyController(theta, spec.layout), makePolicyController(opp, spec.layout), spec.seed + 10 + k, k === 1).fitness;
      n++;
    }
  }
  return sum / n;
}

/**
 * 「考试」:用固定的一组种子对战脚本 AI,返回胜率等统计。
 * 这组题目不参与训练,用来画出看得见的进步曲线。
 */
export function exam(roster: Record<string, CharacterDef>, theta: Float32Array, spec: EvalSpec, games = 10) {
  const hero = roster[spec.hero], foe = roster[spec.foe];
  // 种子固定为 9000+,与训练时的种子错开,保证是「没见过的题」
  let wins = 0, losses = 0, dealt = 0, taken = 0, combo = 0;
  for (let k = 0; k < games; k++) {
    const r = runEpisode(roster, hero, foe, makePolicyController(theta, spec.layout), makeScriptAI(spec.scriptAggression), 9000 + k, k % 2 === 1);
    if (r.outcome > 0) wins++; else if (r.outcome < 0) losses++;
    dealt += r.dealt; taken += r.taken; combo = Math.max(combo, r.maxCombo);
  }
  return { winRate: wins / games, lossRate: losses / games, dealt: dealt / games, taken: taken / games, maxCombo: combo };
}
