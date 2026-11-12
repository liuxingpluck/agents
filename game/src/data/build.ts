// 招式定义的简写工具,让角色数据保持紧凑可读。
import { AnimKind, Box, MoveDef } from '../sim/types';

/** 造一个攻击判定框:x 向前、y 高度、z 纵深,单位是米。 */
export const box = (x0: number, x1: number, y0: number, y1: number, z = 0.7): Box => ({ x0, x1, y0, y1, z });

/**
 * 造一个招式。frames = [前摇, 判定, 收招] 帧数;stun = [受击硬直, 顿帧, 击退距离]。
 * 顿帧 = 命中瞬间双方短暂定格,增强打击感。
 */
export function mv(
  id: string, name: string, tier: number, anim: AnimKind,
  frames: [number, number, number], damage: number, hitbox: Box,
  stun: [number, number, number], extra: Partial<MoveDef> = {},
): MoveDef {
  return {
    id, name, tier, anim,
    startup: frames[0], active: frames[1], recovery: frames[2],
    damage, comboValue: tier === 0 ? 1 : tier === 1 ? 2 : 3,
    hitbox, hitstun: stun[0], hitstop: stun[1], pushX: stun[2],
    ...extra,
  };
}

/** 把招式数组转成「id → 招式」的查找表。 */
export function toMap(moves: MoveDef[]): Record<string, MoveDef> {
  const r: Record<string, MoveDef> = {};
  for (const m of moves) r[m.id] = m;
  return r;
}
