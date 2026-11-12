// 招式定义的简写工具,让角色数据保持紧凑可读。
import { AnimKind, Box, MoveDef } from '../sim/types';

export const box = (x0: number, x1: number, y0: number, y1: number, z = 0.7): Box => ({ x0, x1, y0, y1, z });

/** frames: [startup, active, recovery];stun: [hitstun, hitstop, pushX] */
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

export function toMap(moves: MoveDef[]): Record<string, MoveDef> {
  const r: Record<string, MoveDef> = {};
  for (const m of moves) r[m.id] = m;
  return r;
}
