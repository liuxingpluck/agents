// 脚本 AI:清版敌人与 Boss 的行为逻辑,也是神经网络训练时的基线对手。
//
// 行为概要:
//  - 近战型:靠近目标、对齐纵深,进入射程后按冷却出招
//  - 远程型(轻攻击是飞行道具):保持中距离放风筝,被贴身时后撤
//  - 「进攻名额」:同时最多 2 个小怪上前动手,其余在外圈游走,避免一拥而上无法应对
//  - 出招时从所有可用招式里按距离筛选,层级越高权重越大;Boss 冷却更短,且不受名额限制
import { Btn, Fighter, MoveDef } from '../types';
import { Controller, isAlive, World } from '../world';

/** 找最近的敌对存活角色(纵深差按 2 倍计,优先同一条线上的目标) */
export function nearestFoe(w: World, self: Fighter): Fighter | null {
  let best: Fighter | null = null, bd = Infinity;
  for (const f of w.fighters) {
    if (f.team === self.team || !isAlive(f)) continue;
    const d = Math.abs(f.x - self.x) + Math.abs(f.z - self.z) * 2;
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

/** 角色的全部地面招式(普通技入口 + 指令技 + 技能),去重后缓存在闭包里 */
function groundMoves(self: Fighter): MoveDef[] {
  const d = self.def;
  const ids = new Set<string>([...Object.values(d.normals), ...d.commands.map(c => c.move), ...d.skills]);
  const out: MoveDef[] = [];
  for (const id of ids) { const m = d.moves[id]; if (m && !m.air) out.push(m); }
  return out;
}

/** 一招大致能打多远(含自身突进与瞬移的位移) */
function reachOf(m: MoveDef): number {
  return m.hitbox.x1 * 0.9 + (m.moveX ? m.moveX * (m.startup + m.active) * 0.7 : 0) + (m.teleport && m.teleport > 0 ? m.teleport : 0);
}

/**
 * 创建脚本 AI 控制器。
 * @param aggression 攻击欲望 0..1:越高出手间隔越短
 */
export function makeScriptAI(aggression = 0.5): Controller {
  /** 每种角色的招式表缓存(key 为角色 id) */
  const cache = new Map<string, { moves: MoveDef[]; ranged: boolean; reach: number }>();

  return (w, self) => {
    const b = self.brain;
    const t = nearestFoe(w, self);
    if (!t) return 0;

    let info = cache.get(self.def.id);
    if (!info) {
      const moves = groundMoves(self);
      const lp = self.def.moves[self.def.normals.LP ?? ''];
      const melee = moves.filter(m => !m.projectile && !m.heal && !m.summon);
      info = {
        moves,
        ranged: !!lp?.projectile,
        // 「基本射程」取最短的近战招,保证走到这个距离时至少有一招够得着
        reach: melee.length ? Math.max(0.9, Math.min(...melee.map(reachOf))) : 1.1,
      };
      cache.set(self.def.id, info);
    }

    const isBoss = self.def.role === 'boss';
    if ((b.rage ?? 0) > 0) b.rage--;
    b.cd = (b.cd ?? 40) - 1;
    const dx = t.x - self.x, dz = t.z - self.z;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const toward = dx > 0 ? Btn.RIGHT : Btn.LEFT, away = dx > 0 ? Btn.LEFT : Btn.RIGHT;
    let out = 0;

    // --- 进攻名额 ---
    let attackers = 0;
    for (const f of w.fighters) {
      if (f.team === self.team && f !== self && isAlive(f) && (f.state === 'attack' || (f.brain.engage ?? 0) > 0)) attackers++;
    }
    const mayEngage = isBoss || info.ranged || attackers < 2 || (b.engage ?? 0) > 0;

    // --- 走位 ---
    const wantDist = info.ranged ? 5.5 : mayEngage ? info.reach * 0.85 : 3.2 + (self.id % 3) * 0.6;
    if (adx > wantDist + 0.2) out |= toward;
    else if (adx < wantDist - (info.ranged ? 2 : 0.5)) out |= away;
    else if ((dx > 0) !== (self.facing === 1) && w.frame % 8 === 0) out |= toward; // 原地转身面向目标
    const zOff = mayEngage ? 0 : ((self.id % 2) * 2 - 1) * 0.9;
    const tz = dz + zOff;
    if (Math.abs(tz) > 0.25) out |= tz > 0 ? Btn.DOWN : Btn.UP;

    // --- 出招 ---
    b.engage = 0;
    const targetDown = t.state === 'knockdown' || t.state === 'getup';
    if (mayEngage && b.cd <= 0 && !targetDown && (self.state === 'idle' || self.state === 'walk' || self.state === 'run')) {
      let pick: MoveDef | null = null, total = 0;
      for (const m of info.moves) {
        if (m.cost && self.energy < m.cost) continue;
        let ok: boolean;
        if (m.heal) ok = self.hp < self.def.stats.hp * 0.55;
        else if (m.summon) ok = w.fighters.filter(f => f.brain.owner === self.id && isAlive(f)).length < 2;
        else if (m.projectile) ok = adx >= 2.5 && adx <= 9 && adz <= 0.5;
        else ok = adx <= reachOf(m) && adx >= Math.max(0, m.hitbox.x0 - 0.2) && adz <= Math.min(0.5, m.hitbox.z);
        if (!ok) continue;
        // 加权随机:层级高的招更常用(蓄水池抽样,保持确定性)
        const wgt = 1 + m.tier * 1.5;
        total += wgt;
        if (w.rng.next() * total < wgt) pick = m;
      }
      if (pick) {
        self.aiMove = pick.id;
        out = (out & (Btn.UP | Btn.DOWN)) | toward; // 出招瞬间面向目标
        const base = (90 - 60 * aggression) + w.rng.int(50);
        b.cd = Math.round(base * (isBoss ? 0.55 : 1) * ((b.rage ?? 0) > 0 ? 0.5 : 1));
        b.engage = 1;
      }
    }
    if (!info.ranged && mayEngage && adx <= info.reach + 0.6 && adz <= 0.6) b.engage = 1;
    return out;
  };
}
