// 观测:把模拟层的内部状态编码成神经网络的输入向量。
// AI 直接读游戏数据(位置、帧数据、血量……),不看画面。
// 所有量都以「自己 → 对手」的方向为正,所以站在左边还是右边对网络来说是一回事。
// 数值大多除以一个常数,让它们落在 -1..1 附近,网络学起来更容易。
import { Fighter, FState } from '../sim/types';
import { World } from '../sim/world';
import { nearestFoe } from '../sim/ai/script';

/** 把角色的 12 种状态归并成 8 组(one-hot = 只有所属那一组填 1,其余填 0) */
const STATE_GROUP: Record<FState, number> = {
  idle: 0, walk: 0, run: 0, jump: 1, attack: 2, hitstun: 3, launched: 4,
  knockdown: 5, getup: 5, dodge: 6, guard: 6, grabbed: 7, dead: 5,
};
/** 状态分组的数量 */
const N_STATE = 8;

/** 观测向量的长度(即网络输入的个数)。改动 encodeObs 的内容时必须同步修改,并提升 OBS_VERSION。 */
export const OBS_DIM = 46;
/** 观测格式版本:存档的权重与此不符时不能加载(输入含义变了,旧权重就没用了) */
export const OBS_VERSION = 1;

/**
 * 编码一个角色视角下的观测。
 * @param out 输出缓冲区(长度 OBS_DIM),复用以避免分配
 * @returns 对手(没有对手时为 null,此时 out 全 0)
 */
export function encodeObs(w: World, self: Fighter, out: Float32Array): Fighter | null {
  out.fill(0);
  // 只针对最近的一个敌人观察
  const opp = nearestFoe(w, self);
  if (!opp) return null;
  /** 对手在右边为 +1,在左边为 -1;后面的左右方向量都乘它,实现「镜像无关」 */
  const dir = opp.x >= self.x ? 1 : -1;
  let i = 0;
  // --- 相对位置与速度 ---
  out[i++] = Math.abs(opp.x - self.x) / 10;
  out[i++] = (opp.z - self.z) / 4;
  out[i++] = self.y / 3;
  out[i++] = opp.y / 3;
  out[i++] = (self.vx * dir) / 0.2;
  out[i++] = self.vy / 0.4;
  out[i++] = (opp.vx * dir) / 0.2;
  out[i++] = opp.vy / 0.4;
  // --- 朝向:是否面对着对方 ---
  out[i++] = self.facing === dir ? 1 : -1;
  out[i++] = opp.facing === -dir ? 1 : -1;
  // --- 资源 ---
  out[i++] = self.hp / self.def.stats.hp;
  out[i++] = opp.hp / opp.def.stats.hp;
  out[i++] = self.energy / self.def.stats.energyMax;
  out[i++] = opp.energy / opp.def.stats.energyMax;
  // --- 双方状态 one-hot ---
  out[i + STATE_GROUP[self.state]] = 1; i += N_STATE;
  out[i + STATE_GROUP[opp.state]] = 1; i += N_STATE;
  // --- 自己的出招进度 ---
  if (self.move) {
    const m = self.move;
    out[i] = self.moveFrame / (m.startup + m.active + m.recovery);
    out[i + 1] = self.moveHit ? 1 : 0;
    out[i + 2] = m.tier / 4;
  }
  i += 3;
  // --- 对手的出招阶段:前摇 / 判定 / 收招(这是「帧优势」的来源) ---
  if (opp.move) {
    const m = opp.move, f = opp.moveFrame;
    out[i] = f < m.startup ? 1 : 0;
    out[i + 1] = f >= m.startup && f < m.startup + m.active ? 1 : 0;
    out[i + 2] = f >= m.startup + m.active ? 1 : 0;
    out[i + 3] = m.tier / 4;
    out[i + 4] = (m.hitbox.x1) / 3; // 对手这招够得着多远
  }
  i += 5;
  // --- 无敌状态与连击(opp.comboCount 是「我连了对手几下」) ---
  out[i++] = self.invuln > 0 ? 1 : 0;
  out[i++] = opp.invuln > 0 ? 1 : 0;
  out[i++] = Math.min(1, opp.comboCount / 10); // 我已经连了对手多少下
  out[i++] = Math.min(1, opp.comboValue / 10);
  out[i++] = Math.min(1, self.comboCount / 10); // 我正被连多少下
  out[i++] = Math.min(1, opp.stun / 30);
  // --- 离场地边缘的距离(自己身后 / 对手身后),判断有没有被逼到角落 ---
  const W = w.room.width;
  out[i++] = (dir === 1 ? self.x : W - self.x) / W;
  out[i++] = (dir === 1 ? W - opp.x : opp.x) / W;
  // --- 最近的、正朝自己飞来的敌方飞行道具(有没有 + 多远) ---
  let best = Infinity;
  for (const p of w.projectiles) {
    if (p.team === self.team) continue;
    const d = (p.x - self.x) * dir;
    const approaching = p.dir === -dir;
    if (approaching && d > -0.5 && d < best && Math.abs(p.z - self.z) < 1) best = d;
  }
  out[i++] = best === Infinity ? 0 : 1;
  out[i++] = best === Infinity ? 0 : best / 10;
  // --- 常数项 ---
  out[i++] = 1;
  return opp;
}
