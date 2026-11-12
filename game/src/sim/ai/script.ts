// 脚本 AI:靠近、对齐纵深、按节奏出手。也是之后神经网络训练的基线对手。
import { Btn, Fighter } from '../types';
import { Controller, isAlive, World } from '../world';

export function nearestFoe(w: World, self: Fighter): Fighter | null {
  let best: Fighter | null = null, bd = Infinity;
  for (const f of w.fighters) {
    if (f.team === self.team || !isAlive(f)) continue;
    const d = Math.abs(f.x - self.x) + Math.abs(f.z - self.z) * 2;
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

/** aggression 0..1:越高出手越频繁 */
export function makeScriptAI(aggression = 0.5): Controller {
  return (w, self) => {
    const b = self.brain;
    const t = nearestFoe(w, self);
    if (!t) return 0;
    b.cd = (b.cd ?? 40) - 1;
    const dx = t.x - self.x, dz = t.z - self.z;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const reach = self.def.look.scale > 1.1 ? 1.6 : 1.1;
    let out = 0;
    // 进攻名额:同时最多 2 个队友在出手,其余保持距离绕行
    let attackers = 0;
    for (const f of w.fighters) if (f.team === self.team && f !== self && isAlive(f) && (f.state === 'attack' || (f.brain.engage ?? 0) > 0)) attackers++;
    const mayEngage = attackers < 2 || (b.engage ?? 0) > 0;
    const wantDist = mayEngage ? reach * 0.85 : 3.2 + (self.id % 3) * 0.6;

    if (adx > wantDist + 0.15) out |= dx > 0 ? Btn.RIGHT : Btn.LEFT;
    else if (adx < wantDist - 0.5) out |= dx > 0 ? Btn.LEFT : Btn.RIGHT;
    else if ((dx > 0) !== (self.facing === 1) && w.frame % 8 === 0) out |= dx > 0 ? Btn.RIGHT : Btn.LEFT;
    const zOff = mayEngage ? 0 : ((self.id % 2) * 2 - 1) * 0.9;
    const tz = dz + zOff;
    if (Math.abs(tz) > 0.25) out |= tz > 0 ? Btn.DOWN : Btn.UP;

    b.engage = 0;
    if (mayEngage && adx <= reach + 0.2 && adz <= 0.45) {
      b.engage = 1;
      if (b.cd <= 0 && t.state !== 'knockdown' && t.state !== 'getup') {
        // 用脉冲制造「按下」边沿
        if (w.frame % 6 < 3) out |= w.rng.next() < 0.3 ? Btn.HP : Btn.LP;
        if (self.state === 'attack') b.cd = Math.round((90 - 60 * aggression) + w.rng.int(50));
      }
    }
    return out;
  };
}
