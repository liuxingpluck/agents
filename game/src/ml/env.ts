// 训练环境:一场无渲染的 1 对 1 对战,返回「适应度」分数。
// 同一份模拟代码既驱动正式游戏,也在这里以最高速度空跑。
import { CharacterDef, RoomDef } from '../sim/types';
import { Controller, createWorld, spawnFighter, step } from '../sim/world';

/** 训练用的小场地:窄一些,逼双方交手 */
export const ARENA: RoomDef = { id: 'arena', name: '试炼场', width: 14, depth: 3.5, theme: 'arena', waves: [] };

/** 一局的最长帧数(15 秒) */
export const EPISODE_FRAMES = 900;

/** 一局打完后的成绩单 */
export interface EpisodeResult {
  /** 适应度:越高越好 */
  fitness: number;
  /** 1 胜 / 0 平 / -1 负 */
  outcome: number;
  /** 打掉对手血量的比例 0..1 */
  dealt: number;
  /** 自己掉血的比例 0..1 */
  taken: number;
  /** 这局里对手被连击的最大段数(即被训练方打出的最高连击) */
  maxCombo: number;
  /** 实际打了多少帧 */
  frames: number;
}

/**
 * 跑一局对战。
 * @param roster   角色表
 * @param heroDef  被训练方使用的角色
 * @param foeDef   对手使用的角色
 * @param hero     被训练方的控制器
 * @param foe      对手的控制器
 * @param seed     随机种子(决定初始站位和脚本 AI 的随机数)
 * @param swap     是否交换左右站位(消除站位偏差)
 */
export function runEpisode(
  roster: Record<string, CharacterDef>, heroDef: CharacterDef, foeDef: CharacterDef,
  hero: Controller, foe: Controller, seed: number, swap = false, maxFrames = EPISODE_FRAMES,
): EpisodeResult {
  // 关掉刷怪、掉落,并让所有人不会被「保护」打断,只留纯粹的 1 对 1
  const w = createWorld(ARENA, roster, seed);
  w.useWaves = false;
  w.protectAll = true;
  w.drops = false;
  w.obstacles = false;
  // 开局两人相距随机一小段,左右站位可互换
  const gap = 2.5 + w.rng.next() * 3;
  const cx = ARENA.width / 2;
  const hx = swap ? cx + gap / 2 : cx - gap / 2, fx = swap ? cx - gap / 2 : cx + gap / 2;
  // 被训练方放在 team 1、对手放在 team 0 也可以,这里固定 hero = team 0
  const h = spawnFighter(w, heroDef, 0, hx, 1 + w.rng.next() * 1.5, hero);
  const f = spawnFighter(w, foeDef, 1, fx, 1 + w.rng.next() * 1.5, foe);
  h.facing = swap ? -1 : 1; f.facing = swap ? 1 : -1;
  h.energy = 30; f.energy = 30;

  // farSum 累计「离得太远」的程度,用来惩罚躲着不打
  let maxCombo = 0, farSum = 0, frames = 0;
  for (; frames < maxFrames; frames++) {
    step(w);
    if (f.comboCount > maxCombo) maxCombo = f.comboCount;
    farSum += Math.max(0, Math.abs(h.x - f.x) - 2.5);
    // 有人倒下就提前结束(frames++ 把最后这一帧也算上)
    if (h.hp <= 0 || f.hp <= 0) { frames++; break; }
  }
  const dealt = 1 - Math.max(0, f.hp) / foeDef.stats.hp;
  const taken = 1 - Math.max(0, h.hp) / heroDef.stats.hp;
  const outcome = f.hp <= 0 && h.hp > 0 ? 1 : h.hp <= 0 && f.hp > 0 ? -1 : 0;
  // 适应度 = 造成伤害 − 承受伤害 + 胜负奖励 + 少量「打出连击」与「别躲太远」的引导
  const fitness = dealt * 1.2 - taken + outcome * 0.5
    + Math.min(maxCombo, 12) * 0.015
    - (farSum / frames) * 0.03
    + (outcome === 1 ? (1 - frames / maxFrames) * 0.2 : 0);
  return { fitness, outcome, dealt, taken, maxCombo, frames };
}
