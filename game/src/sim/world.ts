// 确定性战斗模拟:固定 60Hz 步进,无渲染依赖,不使用 Math.random。
import {
  ATTACK_BTNS, Btn, BtnName, CharacterDef, DIR_MASK, Fighter, Motion, MoveDef, Projectile,
  RoomDef, SIM, SimEvent, SKILL_BTNS, Tier,
} from './types';

export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  /** mulberry32,返回 [0,1) */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(n: number): number { return Math.floor(this.next() * n); }
  get state(): number { return this.s; }
  set state(v: number) { this.s = v >>> 0; }
}

/** 控制器:读世界状态,返回输入位掩码。玩家、脚本 AI、神经网络都实现它。 */
export type Controller = (world: World, self: Fighter) => number;

export interface World {
  frame: number;
  rng: Rng;
  room: RoomDef;
  roster: Record<string, CharacterDef>;
  fighters: Fighter[];
  projectiles: Projectile[];
  events: SimEvent[];
  controllers: Map<number, Controller>;
  nextId: number;
  /** 下一波的序号 */
  wave: number;
  waveTimer: number;
  cleared: boolean;
  /** 清版模式下由波次生成敌人;对战/训练模式关闭 */
  useWaves: boolean;
  defaultEnemyAI: Controller | null;
  /** 召唤物使用的控制器 */
  summonAI: Controller | null;
  /** 对战 / 训练模式:双方都享有玩家级的连击保护,保证公平 */
  protectAll: boolean;
}

export function createWorld(room: RoomDef, roster: Record<string, CharacterDef>, seed = 1): World {
  return {
    frame: 0, rng: new Rng(seed), room, roster, fighters: [], projectiles: [], events: [],
    controllers: new Map(), nextId: 1, wave: 0, waveTimer: 30, cleared: false, useWaves: true,
    defaultEnemyAI: null, summonAI: null, protectAll: false,
  };
}

export function spawnFighter(w: World, def: CharacterDef, team: number, x: number, z: number, ctrl?: Controller): Fighter {
  const f: Fighter = {
    id: w.nextId++, team, def, x, y: 0, z, vx: 0, vy: 0, vz: 0,
    facing: team === 0 ? 1 : -1, state: 'idle', stateFrame: 0,
    hp: def.stats.hp, energy: 0,
    move: null, moveFrame: 0, moveHit: false, hitIds: [], lastRehitFrame: 0,
    stun: 0, hitstop: 0, comboCount: 0, comboValue: 0, comboDamage: 0, comboMoveUses: {}, juggle: 0, invuln: 0,
    input: 0, prevInput: 0, dirHist: [], buffer: {}, airActions: 0, grabTarget: 0, grabTimer: 0, brain: {}, deadFrame: 0,
  };
  w.fighters.push(f);
  if (ctrl) w.controllers.set(f.id, ctrl);
  w.events.push({ type: 'spawn', id: f.id });
  return f;
}

export const isAlive = (f: Fighter) => f.state !== 'dead' && f.hp > 0;
export const isAirborne = (f: Fighter) => f.y > 0 || f.state === 'jump' || f.state === 'launched';

function setState(f: Fighter, s: Fighter['state']) {
  f.state = s;
  f.stateFrame = 0;
  if (s !== 'attack') f.move = null;
}

function resetCombo(f: Fighter) {
  f.comboCount = 0; f.comboValue = 0; f.comboDamage = 0; f.comboMoveUses = {}; f.juggle = 0;
}

// ---------- 输入 ----------

const REL_F = 1, REL_B = 2, REL_D = 4, REL_U = 8;

function relDir(f: Fighter, input: number): number {
  let r = 0;
  const right = (input & Btn.RIGHT) !== 0, left = (input & Btn.LEFT) !== 0;
  if (right !== left) {
    const fwd = (right && f.facing === 1) || (left && f.facing === -1);
    r |= fwd ? REL_F : REL_B;
  }
  if (input & Btn.DOWN) r |= REL_D;
  else if (input & Btn.UP) r |= REL_U;
  return r;
}

const MOTIONS: Record<Motion, number[]> = {
  DF: [REL_D, REL_F], DB: [REL_D, REL_B], DU: [REL_D, REL_U],
  BF: [REL_B, REL_F], FF: [REL_F, 0, REL_F], DD: [REL_D, 0, REL_D],
};

/** 在方向历史中自后向前匹配指令序列 */
export function hasMotion(f: Fighter, motion: Motion, frame: number, window: number = SIM.MOTION_WINDOW): boolean {
  const seq = MOTIONS[motion];
  const pivot = seq[seq.length - 1];
  let i = f.dirHist.length - 1;
  for (let k = seq.length - 1; k >= 0; k--) {
    const need = seq[k];
    let found = false;
    while (i >= 0) {
      const [fr, bits] = f.dirHist[i];
      if (frame - fr > window) return false;
      i--;
      // 0 表示「松开了关键方向」
      if (need === 0 ? (bits & pivot) === 0 : (bits & need) !== 0) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}

function feedInput(w: World, f: Fighter, input: number) {
  f.prevInput = f.input;
  f.input = input;
  const rd = relDir(f, input);
  const last = f.dirHist.length ? f.dirHist[f.dirHist.length - 1][1] : 0;
  if (rd !== last) {
    f.dirHist.push([w.frame, rd]);
    if (f.dirHist.length > 12) f.dirHist.shift();
  }
  const pressed = input & ~f.prevInput;
  if (pressed & ~DIR_MASK) {
    for (const k of Object.keys(Btn) as BtnName[]) {
      if ((Btn[k] & DIR_MASK) === 0 && (pressed & Btn[k])) f.buffer[k] = w.frame;
    }
  }
}

function buffered(w: World, f: Fighter, b: BtnName): boolean {
  const t = f.buffer[b];
  return t !== undefined && w.frame - t <= SIM.INPUT_BUFFER;
}
const consume = (f: Fighter, b: BtnName) => { delete f.buffer[b]; };

// ---------- 出招 ----------

function turnToInput(f: Fighter) {
  const right = (f.input & Btn.RIGHT) !== 0, left = (f.input & Btn.LEFT) !== 0;
  if (right && !left) f.facing = 1;
  else if (left && !right) f.facing = -1;
}

function startMove(w: World, f: Fighter, m: MoveDef) {
  // 允许在出招瞬间转身——这是「左右连击」的来源
  if (!isAirborne(f)) turnToInput(f);
  f.state = 'attack';
  f.stateFrame = 0;
  f.move = m;
  f.moveFrame = 0;
  f.moveHit = false;
  f.hitIds = [];
  f.lastRehitFrame = 0;
  if (m.cost) f.energy -= m.cost;
  if (m.selfLaunch) { f.vy = m.selfLaunch; f.y = Math.max(f.y, 0.001); }
  if (m.invuln) f.invuln = Math.max(f.invuln, m.invuln);
  if (!isAirborne(f)) { f.vx = 0; f.vz = 0; }
  if (m.projectile || m.anim === 'cast') w.events.push({ type: 'cast', id: f.id });
}

function canUse(f: Fighter, m: MoveDef | undefined, air: boolean): m is MoveDef {
  if (!m) return false;
  if (!!m.air !== air) return false;
  if (m.cost && f.energy < m.cost) return false;
  return true;
}

/**
 * 根据缓冲输入挑选要出的招。minTier:只允许层级严格大于它的招(取消用);-1 表示不限。
 */
function pickMove(w: World, f: Fighter, minTier: number): MoveDef | null {
  const air = isAirborne(f);
  const d = f.def;
  // 抓取:轻拳 + 轻脚 同时按(两键都在缓冲内即可)
  if (!air && d.moves.grab && d.moves.grab.tier > minTier && buffered(w, f, 'LP') && buffered(w, f, 'LK')) {
    consume(f, 'LP'); consume(f, 'LK');
    return d.moves.grab;
  }
  // 技能
  for (let i = 0; i < d.skills.length && i < SKILL_BTNS.length; i++) {
    const b = SKILL_BTNS[i];
    if (!buffered(w, f, b)) continue;
    const m = d.moves[d.skills[i]];
    if (canUse(f, m, air) && m.tier > minTier) { consume(f, b); return m; }
  }
  // 指令技
  for (const c of d.commands) {
    if (!buffered(w, f, c.button)) continue;
    const m = d.moves[c.move];
    if (canUse(f, m, air) && m.tier > minTier && hasMotion(f, c.motion, w.frame)) { consume(f, c.button); return m; }
  }
  // 普通技(重攻击优先于轻攻击)
  const table = air ? d.airNormals : d.normals;
  for (const b of ['HK', 'HP', 'LK', 'LP'] as BtnName[]) {
    if (!buffered(w, f, b)) continue;
    const m = d.moves[table[b] ?? ''];
    if (canUse(f, m, air) && m.tier > minTier) { consume(f, b); return m; }
  }
  return null;
}

function startJump(f: Fighter) {
  const sp = f.def.stats.speed;
  setState(f, 'jump');
  f.vy = f.def.stats.jump;
  f.y = 0.001;
  f.airActions = 0;
  const right = (f.input & Btn.RIGHT) !== 0, left = (f.input & Btn.LEFT) !== 0;
  f.vx = right === left ? 0 : (right ? sp : -sp) * 1.1;
  f.vz = (f.input & Btn.DOWN ? sp : f.input & Btn.UP ? -sp : 0) * SIM.Z_SPEED_MULT;
}

function tryGroundAction(w: World, f: Fighter): boolean {
  const m = pickMove(w, f, -1);
  if (m) { startMove(w, f, m); return true; }
  if (buffered(w, f, 'JUMP')) { consume(f, 'JUMP'); startJump(f); return true; }
  if (buffered(w, f, 'DODGE')) {
    consume(f, 'DODGE');
    turnToInput(f);
    setState(f, 'dodge');
    f.invuln = Math.max(f.invuln, SIM.DODGE_INVULN);
    // 按住后方向则后撤,否则向前翻滚
    const back = (relDir(f, f.input) & REL_B) !== 0;
    f.vx = f.facing * SIM.DODGE_SPEED * (back ? -1 : 1);
    f.vz = (f.input & Btn.DOWN ? 1 : f.input & Btn.UP ? -1 : 0) * SIM.DODGE_SPEED * 0.6;
    if (f.vz !== 0 && !(f.input & (Btn.LEFT | Btn.RIGHT))) f.vx = 0;
    return true;
  }
  return false;
}

/** 出手帧的附加效果:治疗、召唤、瞬移 */
function castEffects(w: World, f: Fighter, m: MoveDef) {
  if (m.teleport) {
    f.x = Math.min(w.room.width - 0.5, Math.max(0.5, f.x + f.facing * m.teleport));
  }
  if (m.heal) {
    for (const a of w.fighters) {
      if (a.team !== f.team || !isAlive(a)) continue;
      if (Math.abs(a.x - f.x) > 4 || Math.abs(a.z - f.z) > 2.5) continue;
      a.hp = Math.min(a.def.stats.hp, a.hp + m.heal);
    }
  }
  if (m.summon && w.roster[m.summon]) {
    const mine = w.fighters.filter(a => a.brain.owner === f.id && isAlive(a));
    if (mine.length < 2) {
      const s = spawnFighter(w, w.roster[m.summon], f.team, f.x + f.facing * 1.2, f.z, w.summonAI ?? w.defaultEnemyAI ?? undefined);
      s.facing = f.facing;
      s.brain.owner = f.id;
      s.brain.life = 60 * 20;
    }
  }
}

// ---------- 状态更新 ----------

function land(w: World, f: Fighter) {
  f.y = 0; f.vy = 0;
  w.events.push({ type: 'land', id: f.id });
}

function updateFighter(w: World, f: Fighter) {
  if (f.invuln > 0) f.invuln--;
  f.stateFrame++;
  const sp = f.def.stats.speed;

  switch (f.state) {
    case 'idle': case 'walk': case 'run': {
      if (tryGroundAction(w, f)) break;
      const right = (f.input & Btn.RIGHT) !== 0, left = (f.input & Btn.LEFT) !== 0;
      const dx = right === left ? 0 : right ? 1 : -1;
      const dz = f.input & Btn.DOWN ? 1 : f.input & Btn.UP ? -1 : 0;
      if (dx !== 0) f.facing = dx as 1 | -1;
      if (dx === 0 && dz === 0) { if (f.state !== 'idle') setState(f, 'idle'); f.vx = 0; f.vz = 0; break; }
      // →→ 冲刺
      if (f.state !== 'run' && dx !== 0 && (f.input & ~f.prevInput & (Btn.LEFT | Btn.RIGHT)) && hasMotion(f, 'FF', w.frame, 14)) {
        setState(f, 'run');
      } else if (f.state === 'idle') setState(f, 'walk');
      if (f.state === 'run' && dx === 0) setState(f, 'walk');
      const mult = f.state === 'run' ? SIM.RUN_MULT : 1;
      f.vx = dx * sp * mult;
      f.vz = dz * sp * SIM.Z_SPEED_MULT;
      break;
    }
    case 'jump': {
      f.vy -= SIM.GRAVITY;
      if (f.airActions < 3) {
        const m = pickMove(w, f, -1);
        if (m) { f.airActions++; startMove(w, f, m); }
      }
      break;
    }
    case 'attack': {
      const m = f.move!;
      // 抓取保持中:不推进招式帧,把对手锁在身前,计时结束后投出
      if (f.grabTarget) {
        const t = w.fighters.find(x => x.id === f.grabTarget);
        if (!t || t.state !== 'grabbed') { f.grabTarget = 0; f.grabTimer = 0; }
        else {
          f.vx = 0; f.vz = 0;
          t.x = f.x + f.facing * 0.75; t.z = f.z; t.y = 0; t.facing = (-f.facing) as 1 | -1;
          if (--f.grabTimer <= 0) doThrow(w, f);
          break;
        }
      }
      f.moveFrame++;
      const air = f.y > 0;
      if (air) f.vy -= SIM.GRAVITY * (m.selfLaunch ? 0.9 : 1);
      else if (m.moveX && f.moveFrame <= m.startup + m.active) f.vx = f.facing * m.moveX;
      else f.vx *= 0.7;
      if (!air) f.vz = 0;
      if (f.moveFrame === m.startup && m.projectile) {
        w.projectiles.push({
          id: w.nextId++, owner: f.id, team: f.team, move: m, def: m.projectile,
          x: f.x + f.facing * 0.6, y: f.y + m.projectile.y, z: f.z, dir: f.facing,
          life: m.projectile.life, hitIds: [],
        });
      }
      if (f.moveFrame === m.startup) castEffects(w, f, m);
      if (f.moveFrame === m.startup && !m.projectile) w.events.push({ type: 'whiff', id: f.id, heavy: m.tier >= Tier.HEAVY });
      // 取消:命中确认后(飞行道具出手后)才允许
      const confirmed = f.moveHit || (!!m.projectile && f.moveFrame > m.startup + 2 && m.tier < Tier.SKILL);
      if (confirmed && f.moveFrame >= m.startup) {
        let next: MoveDef | null = null;
        if (m.chain) {
          for (const b of ATTACK_BTNS) {
            const id = m.chain[b];
            if (id && buffered(w, f, b) && canUse(f, f.def.moves[id], air)) { consume(f, b); next = f.def.moves[id]; break; }
          }
        }
        if (!next) next = pickMove(w, f, m.tier);
        if (next) { if (air) f.airActions++; startMove(w, f, next); break; }
        if (m.jumpCancel && !air && buffered(w, f, 'JUMP')) { consume(f, 'JUMP'); startJump(f); break; }
      }
      if (f.moveFrame >= m.startup + m.active + m.recovery) {
        setState(f, f.y > 0 ? 'jump' : 'idle');
      }
      break;
    }
    case 'dodge': {
      if (f.stateFrame >= SIM.DODGE_FRAMES) { setState(f, 'idle'); f.vx = 0; f.vz = 0; }
      break;
    }
    case 'hitstun': {
      f.vx *= 0.82; f.vz = 0;
      if (--f.stun <= 0) { setState(f, 'idle'); resetCombo(f); f.vx = 0; }
      break;
    }
    case 'launched': {
      f.vy -= SIM.GRAVITY;
      break;
    }
    case 'knockdown': {
      f.vx *= 0.8; f.vz = 0;
      if (f.stateFrame >= SIM.KNOCKDOWN_FRAMES) {
        if (f.hp <= 0) { setState(f, 'dead'); f.deadFrame = w.frame; }
        else setState(f, 'getup');
      }
      break;
    }
    case 'getup': {
      f.vx = 0; f.vz = 0;
      f.invuln = Math.max(f.invuln, 2);
      if (f.stateFrame >= SIM.GETUP_FRAMES) { setState(f, 'idle'); resetCombo(f); f.invuln = SIM.GETUP_INVULN; }
      break;
    }
    case 'grabbed': {
      // 位置由抓取者控制;若抓取者已不在抓取状态则恢复自由
      f.vx = 0; f.vy = 0; f.vz = 0;
      const g = w.fighters.find(x => x.grabTarget === f.id);
      if (!g || g.state !== 'attack') { setState(f, 'idle'); resetCombo(f); }
      break;
    }
    case 'dead': f.vx = 0; f.vz = 0; break;
  }

  // 积分
  f.x += f.vx; f.z += f.vz;
  if (f.y > 0 || f.vy > 0) {
    f.y += f.vy;
    if (f.y <= 0) {
      land(w, f);
      if (f.state === 'launched') { setState(f, 'knockdown'); f.vx *= 0.5; }
      else if (f.state === 'jump' || f.state === 'attack') { setState(f, 'idle'); f.vx = 0; f.vz = 0; }
    }
  }
  const r = w.room;
  f.x = Math.min(r.width - 0.5, Math.max(0.5, f.x));
  f.z = Math.min(r.depth, Math.max(0, f.z));
}

// ---------- 命中 ----------

/** 目标是否受「连击保护」:Boss 与玩家方不能被无限连 */
function comboLimitOf(w: World, v: Fighter): number {
  if (v.def.role === 'boss') return SIM.COMBO_LIMIT_BOSS;
  if (v.team === 0 || w.protectAll) return SIM.COMBO_LIMIT_PLAYER;
  return Infinity; // 普通怪没有硬上限,只要不断换招就能一直连到死
}

/** 放开被抓的对手(抓取者被打断或投出后调用) */
function releaseGrab(w: World, f: Fighter) {
  if (!f.grabTarget) return;
  const t = w.fighters.find(x => x.id === f.grabTarget);
  f.grabTarget = 0; f.grabTimer = 0;
  if (t && t.state === 'grabbed') { setState(t, 'idle'); resetCombo(t); }
}

/** Boss 挣脱:原地进入无敌,并把周围的敌对角色震退 */
function bossBurst(w: World, v: Fighter) {
  setState(v, 'idle');
  v.vx = 0; v.vy = 0; v.y = 0;
  v.invuln = 90;
  v.brain.rage = 240; // 挣脱后一段时间内出招更快(脚本 AI 读取)
  resetCombo(v);
  for (const o of w.fighters) {
    if (o.team === v.team || !isAlive(o)) continue;
    if (Math.abs(o.x - v.x) > 3 || Math.abs(o.z - v.z) > 2) continue;
    if (o.state === 'knockdown' || o.state === 'getup' || o.invuln > 0) continue;
    releaseGrab(w, o);
    setState(o, 'hitstun');
    o.stun = 22;
    o.vx = (o.x >= v.x ? 1 : -1) * 0.22;
    o.hitstop = 6;
  }
}

/**
 * 结算一次命中。所有伤害(近战、飞行道具、投技)都走这里。
 *
 * 防无限连的规则(记录在受害者身上,回到自由状态时清零):
 *  1. 伤害补正:连击数越高单击伤害越低,下限 10%——连得再长收益也在下降。
 *  2. 僵直衰减:同一招在一套连段里每重复一次,僵直减少 35%;换新招不衰减。
 *     所以「同一套循环」会越来越接不上,而不断变招可以一直连。
 *  3. 同一招超过 MOVE_REUSE_LIMIT 次:对手强制挣脱。
 *  4. 普通怪没有硬上限,可以被连到死;Boss 和玩家方有连击值上限,
 *     达到后强制挣脱(Boss 原地震开周围敌人,玩家被击飞并获得无敌)。
 *  5. 空中追打每次浮空高度递减(JUGGLE_DECAY),浮空连段自然会落地。
 *
 * @param atk  攻击者(飞行道具的主人可能已不存在,传 null)
 * @param team 攻击方队伍
 * @param dir  击退方向
 * @param v    受害者
 * @param m    招式
 * @param hx,hy 命中点(特效用)
 * @returns 是否真的打中(无敌、倒地等情况返回 false)
 */
function applyHit(w: World, atk: Fighter | null, team: number, dir: 1 | -1, v: Fighter, m: MoveDef, hx: number, hy: number): boolean {
  if (v.team === team || v.invuln > 0) return false;
  if (v.state === 'knockdown' || v.state === 'getup' || v.state === 'dead' || v.state === 'grabbed') return false;
  const airborne = v.y > 0 || v.state === 'launched';
  if (m.grab && (airborne || !atk)) return false; // 抓不到空中的对手

  const inCombo = v.state === 'hitstun' || v.state === 'launched';
  if (!inCombo) resetCombo(v);
  v.comboCount++;
  v.comboValue += m.comboValue;
  const uses = (v.comboMoveUses[m.id] = (v.comboMoveUses[m.id] ?? 0) + 1);

  // 伤害补正
  let scale = Math.max(SIM.DAMAGE_SCALE_MIN, 1 - SIM.DAMAGE_SCALE_STEP * (v.comboCount - 1));
  const isBoss = v.def.role === 'boss';
  if (isBoss && v.comboDamage > v.def.stats.hp * SIM.BOSS_COMBO_DAMAGE_CAP) scale = SIM.DAMAGE_SCALE_MIN;
  let dmg = Math.max(1, Math.round(m.damage * scale));

  // 霸体:出招前摇与判定期间不被打断,只吃减免后的伤害。抓取无视霸体。
  const armored = !m.grab && v.state === 'attack' && !!v.move?.armor && v.moveFrame <= v.move.startup + v.move.active;
  if (armored) dmg = Math.max(1, Math.round(dmg * 0.6));
  v.hp -= dmg;
  v.comboDamage += dmg;
  v.energy = Math.min(v.def.stats.energyMax, v.energy + dmg * 0.25);
  if (atk) {
    atk.energy = Math.min(atk.def.stats.energyMax, atk.energy + (m.cost ? 0 : 1.5 + m.damage * 0.25));
    atk.moveHit = true;
    atk.hitstop = m.hitstop;
  }
  v.hitstop = m.hitstop;
  const heavy = m.tier >= Tier.HEAVY;
  w.events.push({ type: 'hit', x: hx, y: hy, z: v.z, heavy, attacker: atk?.id ?? -1, victim: v.id, damage: dmg, combo: v.comboCount });

  const wgt = 1 / v.def.stats.weight;

  // 击杀:无论什么招都打飞
  if (v.hp <= 0) {
    v.hp = 0;
    releaseGrab(w, v);
    setState(v, 'launched');
    v.y = Math.max(v.y, 0.001); v.vy = 0.26; v.vx = dir * 0.16; v.vz = 0;
    v.invuln = 9999;
    v.hitstop += 6; if (atk) atk.hitstop += 6; // 击杀顿帧
    w.events.push({ type: 'ko', id: v.id, team: v.team });
    return true;
  }
  if (armored) return true;
  releaseGrab(w, v); // 被打中的人如果正抓着别人,松手

  // 强制挣脱判定
  const forced = v.comboValue >= comboLimitOf(w, v) || uses > SIM.MOVE_REUSE_LIMIT;
  if (forced) {
    w.events.push({ type: 'comboBreak', victim: v.id });
    if (isBoss) { bossBurst(w, v); return true; }
    setState(v, 'launched');
    v.y = Math.max(v.y, 0.001); v.vy = 0.24; v.vx = dir * 0.2; v.vz = 0;
    v.invuln = 120;
    return true;
  }

  if (m.grab && atk) {
    // 抓住:受害者锁在抓取者身前,由抓取者的出招流程负责投出
    setState(v, 'grabbed');
    v.vx = 0; v.vy = 0; v.vz = 0;
    atk.grabTarget = v.id;
    atk.grabTimer = m.grab.hold;
    return true;
  }
  if (m.launch || airborne) {
    setState(v, 'launched');
    const base = m.launch ?? 0.17;
    v.vy = base * Math.pow(SIM.JUGGLE_DECAY, v.juggle) * Math.min(1.15, 0.6 + 0.4 * wgt);
    v.juggle++;
    v.y = Math.max(v.y, 0.001);
    v.vx = dir * m.pushX * 0.5 * wgt; v.vz = 0;
  } else if (m.knockdown) {
    setState(v, 'launched');
    v.y = 0.001; v.vy = 0.19; v.vx = dir * m.pushX * wgt; v.vz = 0;
  } else {
    setState(v, 'hitstun');
    // 同一招重复使用,僵直衰减
    v.stun = Math.max(5, Math.round(m.hitstun * (1 - SIM.STUN_DECAY_PER_REUSE * (uses - 1))));
    v.vx = dir * m.pushX * wgt; v.vz = 0;
  }
  return true;
}

/** 抓取保持结束:把对手投出去(按住后方向则向身后投) */
function doThrow(w: World, f: Fighter) {
  const m = f.move!;
  const t = w.fighters.find(x => x.id === f.grabTarget);
  f.grabTarget = 0; f.grabTimer = 0;
  if (!t || t.state !== 'grabbed' || !m.grab) return;
  const back = (relDir(f, f.input) & REL_B) !== 0;
  const dir = (back ? -f.facing : f.facing) as 1 | -1;
  if (back) t.x = f.x - f.facing * 0.5;
  // 投出也按一次命中结算(计入连击与伤害补正)
  setState(t, 'hitstun');
  const throwMove: MoveDef = { ...m, id: m.id + ':throw', grab: undefined, damage: m.grab.throwDamage, launch: m.grab.throwVy, pushX: m.grab.throwVx * 2, tier: Tier.HEAVY, hitstop: 8 };
  applyHit(w, f, f.team, dir, t, throwMove, t.x, t.y + 1);
}

function resolveHits(w: World) {
  for (const a of w.fighters) {
    const m = a.move;
    if (a.state !== 'attack' || !m || m.projectile || a.hitstop > 0) continue;
    if (a.moveFrame < m.startup || a.moveFrame >= m.startup + m.active) continue;
    if (m.rehit && a.moveFrame - a.lastRehitFrame >= m.rehit) { a.hitIds = []; a.lastRehitFrame = a.moveFrame; }
    const b = m.hitbox;
    const ax0 = a.x + (a.facing === 1 ? b.x0 : -b.x1), ax1 = a.x + (a.facing === 1 ? b.x1 : -b.x0);
    const ay0 = a.y + b.y0, ay1 = a.y + b.y1;
    for (const v of w.fighters) {
      if (v === a || v.team === a.team || a.hitIds.includes(v.id)) continue;
      if (Math.abs(v.z - a.z) > b.z) continue;
      const h = SIM.BODY_H * v.def.look.scale, hw = SIM.BODY_HALF_W * v.def.look.bulk;
      if (ax1 < v.x - hw || ax0 > v.x + hw || ay1 < v.y || ay0 > v.y + h) continue;
      const hx = Math.max(ax0, Math.min(ax1, v.x)), hy = Math.max(v.y + 0.3, Math.min(v.y + h, (ay0 + ay1) / 2));
      if (applyHit(w, a, a.team, a.facing, v, m, hx, hy)) a.hitIds.push(v.id);
    }
  }
}

function updateProjectiles(w: World) {
  for (const p of w.projectiles) {
    p.x += p.dir * p.def.speed;
    p.life--;
    if (p.x < 0 || p.x > w.room.width) p.life = 0;
    for (const v of w.fighters) {
      if (p.life <= 0) break;
      if (v.team === p.team || p.hitIds.includes(v.id)) continue;
      if (Math.abs(v.z - p.z) > p.move.hitbox.z) continue;
      const h = SIM.BODY_H * v.def.look.scale, hw = SIM.BODY_HALF_W * v.def.look.bulk + p.def.radius;
      if (Math.abs(v.x - p.x) > hw || p.y < v.y - p.def.radius || p.y > v.y + h + p.def.radius) continue;
      const owner = w.fighters.find(f => f.id === p.owner) ?? null;
      const ownerHitstop = owner?.hitstop ?? 0;
      if (applyHit(w, owner, p.team, p.dir, v, p.move, p.x, p.y)) {
        if (owner) owner.hitstop = ownerHitstop; // 飞行道具命中不冻结施放者
        p.hitIds.push(v.id);
        if (!p.def.pierce) p.life = 0;
      }
    }
  }
  w.projectiles = w.projectiles.filter(p => p.life > 0);
}

// ---------- 波次 ----------

function updateWaves(w: World) {
  if (!w.useWaves || w.cleared) return;
  const enemies = w.fighters.filter(f => f.team === 1 && f.state !== 'dead');
  if (enemies.length > 0) return;
  if (w.wave >= w.room.waves.length) { w.cleared = true; return; }
  if (--w.waveTimer > 0) return;
  const ids = w.room.waves[w.wave++];
  w.waveTimer = 70;
  const hero = w.fighters.find(f => f.team === 0 && isAlive(f));
  const hx = hero?.x ?? w.room.width / 2;
  ids.forEach((id, i) => {
    const def = w.roster[id];
    if (!def) return;
    // 大多数从右侧来,少数从左侧包抄
    const fromLeft = i % 3 === 2 && hx > 6;
    const x = fromLeft ? Math.max(0.6, hx - 7 - i * 0.5) : Math.min(w.room.width - 0.6, hx + 7 + i * 0.9);
    const z = w.rng.range(0.3, w.room.depth - 0.3);
    const f = spawnFighter(w, def, 1, x, z, w.defaultEnemyAI ?? undefined);
    f.facing = fromLeft ? 1 : -1;
    f.brain.cd = 30 + w.rng.int(60);
  });
}

// ---------- 主步进 ----------

/** 推进一帧。inputs 可为指定角色提供输入(玩家),其余走各自控制器。 */
export function step(w: World, inputs?: Map<number, number>) {
  w.events.length = 0;
  for (const f of w.fighters) {
    let inp = 0;
    if (isAlive(f)) {
      const ext = inputs?.get(f.id);
      inp = ext !== undefined ? ext : w.controllers.get(f.id)?.(w, f) ?? 0;
    }
    feedInput(w, f, inp);
  }
  for (const f of w.fighters) {
    if (f.brain.life !== undefined && isAlive(f) && --f.brain.life <= 0) {
      f.hp = 0; f.state = 'dead'; f.move = null; f.deadFrame = w.frame - 60;
      continue;
    }
    if (f.hitstop > 0) { f.hitstop--; continue; }
    updateFighter(w, f);
  }
  resolveHits(w);
  updateProjectiles(w);
  // 清理尸体
  if (w.frame % 30 === 0) w.fighters = w.fighters.filter(f => !(f.state === 'dead' && (f.team !== 0 || f.brain.owner !== undefined) && w.frame - f.deadFrame > 90));
  updateWaves(w);
  w.frame++;
}
