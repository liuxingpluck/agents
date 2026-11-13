// 确定性战斗模拟:固定 60Hz 步进,无渲染依赖,不使用 Math.random。
import {
  ATTACK_BTNS, Btn, BtnName, CharacterDef, DIR_MASK, Fighter, Hazard, Motion, MoveDef, Pickup, Projectile,
  RoomDef, SIM, SimEvent, SKILL_BTNS, Tier,
} from './types';

/** 可复现的随机数发生器:同一个种子永远产生同一串数字(回放、训练、测试都靠它) */
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

/** 一局游戏的全部状态。把它存下来就能完整还原这一帧。 */
export interface World {
  frame: number;
  rng: Rng;
  room: RoomDef;
  roster: Record<string, CharacterDef>;
  fighters: Fighter[];
  projectiles: Projectile[];
  /** 地上的道具 */
  pickups: Pickup[];
  /** 场景机关 */
  hazards: Hazard[];
  /** 双人合作:两名玩家之间允许的最大横向距离(0 表示不限制),防止各跑各的跑出画面 */
  tether: number;
  /** 双人合作:每一波额外多出的敌人数量(Boss 波不加) */
  extraPerWave: number;
  /** 是否允许敌人掉落道具(训练 / 对战模式关闭) */
  drops: boolean;
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

/** 各主题自动生成的喷火口数量(没列出的主题没有机关) */
const THEME_HAZARDS: Record<string, number> = { mine: 2, city: 1, abyss: 3 };

/**
 * 创建一个空世界(还没有角色)。
 * @param room 房间  @param roster 角色表(按 id 查找)  @param seed 随机种子
 */
export function createWorld(room: RoomDef, roster: Record<string, CharacterDef>, seed = 1): World {
  const w: World = {
    frame: 0, rng: new Rng(seed), room, roster, fighters: [], projectiles: [], pickups: [], hazards: [], tether: 0, extraPerWave: 0, drops: true, events: [],
    controllers: new Map(), nextId: 1, wave: 0, waveTimer: 30, cleared: false, useWaves: true,
    defaultEnemyAI: null, summonAI: null, protectAll: false,
  };
  // 机关:房间自己写了就用房间的;否则有敌人的房间按主题自动摆几个喷火口
  const auto = room.waves.length ? THEME_HAZARDS[room.theme] ?? 0 : 0;
  const defs = room.hazards ?? Array.from({ length: auto }, (_v, i) => ({
    x: 7 + ((room.width - 12) * (i + 0.5)) / auto + w.rng.range(-1.5, 1.5),
    z: w.rng.range(0.8, room.depth - 0.8), radius: 1.1, period: 300, damage: 12,
  }));
  defs.forEach((d, i) => w.hazards.push({ ...d, id: w.nextId++, offset: i * 97, hitIds: [] }));
  return w;
}

/**
 * 机关当前处于周期的哪个位置。
 * @returns 距离下次喷发还有多少帧(warn,0 表示正在喷)以及是否正在喷发
 */
export function hazardState(w: World, h: Hazard): { untilBurst: number; active: boolean } {
  const phase = (w.frame + h.offset) % h.period;
  return { untilBurst: phase < SIM.HAZARD_ACTIVE ? 0 : h.period - phase, active: phase < SIM.HAZARD_ACTIVE };
}

/**
 * 往世界里放一个角色。
 * @param team 队伍:0 玩家方 / 1 敌方 / 2 场景物件
 * @param ctrl 控制器(不传则只接受外部输入,比如玩家)
 */
export function spawnFighter(w: World, def: CharacterDef, team: number, x: number, z: number, ctrl?: Controller): Fighter {
  const f: Fighter = {
    id: w.nextId++, team, def, x, y: 0, z, vx: 0, vy: 0, vz: 0,
    facing: team === 0 ? 1 : -1, state: 'idle', stateFrame: 0,
    hp: def.stats.hp, energy: 0,
    move: null, moveFrame: 0, moveHit: false, hitIds: [], lastRehitFrame: 0,
    stun: 0, hitstop: 0, comboCount: 0, comboValue: 0, comboDamage: 0, comboMoveUses: {}, juggle: 0, invuln: 0,
    input: 0, prevInput: 0, dirHist: [], buffer: {}, airActions: 0, wallBounced: false, thrownBy: 0, grabTarget: 0, grabTimer: 0, brain: {}, deadFrame: 0,
  };
  w.fighters.push(f);
  if (ctrl) w.controllers.set(f.id, ctrl);
  w.events.push({ type: 'spawn', id: f.id });
  return f;
}

export const isAlive = (f: Fighter) => f.state !== 'dead' && f.hp > 0;
export const isAirborne = (f: Fighter) => f.y > 0 || f.state === 'jump' || f.state === 'launched';

/** 切换角色状态并把状态计时归零;离开攻击状态时清掉当前招式 */
function setState(f: Fighter, s: Fighter['state']) {
  f.state = s;
  f.stateFrame = 0;
  if (s !== 'attack') f.move = null;
}

/** 清空「被连击」的记录(角色恢复自由行动时调用) */
function resetCombo(f: Fighter) {
  f.comboCount = 0; f.comboValue = 0; f.comboDamage = 0; f.comboMoveUses = {}; f.juggle = 0;
  f.wallBounced = false; f.thrownBy = 0;
}

// ---------- 输入 ----------

// 相对朝向的方向位:前 / 后 / 下 / 上。指令技按「相对朝向」判断,所以面朝左时 ←↓ 也算 ↓→
const REL_F = 1, REL_B = 2, REL_D = 4, REL_U = 8;

/** 把输入里的方向键换算成相对朝向的方向位 */
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

/** 每种指令动作对应的方向序列(0 表示中间要松开一下,比如 →→) */
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

/** 接收这一帧的输入:记录方向变化(给指令技用)和按键按下的时刻(给输入缓冲用) */
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

/** 这个键是否在缓冲时间内按下过(提前按的键不会被吞掉) */
function buffered(w: World, f: Fighter, b: BtnName): boolean {
  const t = f.buffer[b];
  return t !== undefined && w.frame - t <= SIM.INPUT_BUFFER;
}
const consume = (f: Fighter, b: BtnName) => { delete f.buffer[b]; };

// ---------- 出招 ----------

/** 按当前按住的左右方向转身 */
function turnToInput(f: Fighter) {
  const right = (f.input & Btn.RIGHT) !== 0, left = (f.input & Btn.LEFT) !== 0;
  if (right && !left) f.facing = 1;
  else if (left && !right) f.facing = -1;
}

/** 开始出一招:扣能量、清空命中记录,带突进 / 升空 / 无敌的招在这里生效 */
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

/** 同强度的另一个攻击键 */
const SIBLING: Partial<Record<BtnName, BtnName>> = { LP: 'LK', LK: 'LP', HP: 'HK', HK: 'HP' };

/** 这一招现在能不能出:地面 / 空中是否匹配、能量够不够 */
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
  // 指令技。第一轮要求按键完全一致;第二轮允许同强度的另一个键代替
  // (轻拳≈轻脚、重拳≈重脚),这样「轻 / 重」两键的简易操作也能搓出所有指令技。
  for (let pass = 0; pass < 2; pass++) {
    for (const c of d.commands) {
      const btn = pass === 0 ? c.button : SIBLING[c.button];
      if (!btn || !buffered(w, f, btn)) continue;
      const m = d.moves[c.move];
      if (canUse(f, m, air) && m.tier > minTier && hasMotion(f, c.motion, w.frame)) { consume(f, btn); return m; }
    }
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

/** 起跳:按住方向则带着水平速度跳出去 */
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

/** 每个角色的冲刺攻击招式缓存(没有合适的招则为 null) */
const dashCache = new Map<CharacterDef, MoveDef | null>();

/** 找出角色用作「冲刺攻击」的招:指令技中自身前冲速度最大的地面招 */
function dashMoveOf(def: CharacterDef): MoveDef | null {
  let m = dashCache.get(def);
  if (m === undefined) {
    m = null;
    for (const c of def.commands) {
      const cand = def.moves[c.move];
      if (cand && !cand.air && !cand.cost && (cand.moveX ?? 0) > (m?.moveX ?? 0)) m = cand;
    }
    dashCache.set(def, m);
  }
  return m;
}

/** 站在地面且可以行动时,按优先级尝试:AI 直接出招 → 冲刺攻击 → 出招 → 跳 → 闪避。成功返回 true。 */
function tryGroundAction(w: World, f: Fighter): boolean {
  // 脚本 AI 的直接出招请求
  if (f.aiMove) {
    const am = f.def.moves[f.aiMove];
    f.aiMove = undefined;
    if (canUse(f, am, false)) { startMove(w, f, am); return true; }
  }
  // 冲刺攻击:跑动中按攻击键,自动使出角色的突进技(指令技里前冲最快的那一招)
  if (f.state === 'run') {
    const dash = dashMoveOf(f.def);
    for (const b of ATTACK_BTNS) {
      if (dash && buffered(w, f, b) && canUse(f, dash, false)) { consume(f, b); startMove(w, f, dash); return true; }
    }
  }
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

/** 落地 */
function land(w: World, f: Fighter) {
  f.y = 0; f.vy = 0;
  w.events.push({ type: 'land', id: f.id });
}

/** 推进一个角色一帧:按状态处理行动与受击,再做位移、落地、版边与撞墙判定 */
function updateFighter(w: World, f: Fighter) {
  if (f.def.role === 'prop') { f.stateFrame++; return; } // 物件不会动
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
      // 抓投抢招:普通技刚起手的头几帧里,如果轻拳 + 轻脚 都按住了,改出抓投。
      // (两个键很难同一帧按下,先到的那个键会先出一下普通技,这里把它顶掉。)
      if (f.moveFrame <= 4 && !m.grab && m.tier <= Tier.HEAVY && f.y <= 0 && f.def.moves.grab
        && (f.input & Btn.LP) && (f.input & Btn.LK) && (buffered(w, f, 'LP') || buffered(w, f, 'LK'))
        && canUse(f, f.def.moves.grab, false)) {
        consume(f, 'LP'); consume(f, 'LK');
        startMove(w, f, f.def.moves.grab);
        break;
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
      // 空中受身:被打飞一小段时间后按跳跃键,在空中恢复平衡并短暂无敌,脱离对方的追打。
      // 被强制击飞(已处于无敌)和被击杀时不能受身。
      if (f.hp > 0 && f.invuln <= 0 && f.stateFrame >= SIM.RECOVER_MIN_FRAMES && f.y > 0.4 && buffered(w, f, 'JUMP')) {
        consume(f, 'JUMP');
        setState(f, 'jump');
        resetCombo(f);
        f.vy = 0.16; f.vx = -f.facing * 0.05; f.airActions = 2;
        f.invuln = 24;
        w.events.push({ type: 'recover', id: f.id });
      }
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
  // 撞墙反弹:被打飞的角色高速撞到版边会弹回来,给进攻方一次追打机会(每套连击只弹一次)
  if (f.state === 'launched' && f.hp > 0 && !f.wallBounced && Math.abs(f.vx) >= SIM.WALL_BOUNCE_MIN_VX
    && (f.x <= 0.5 || f.x >= r.width - 0.5)) {
    f.wallBounced = true;
    f.vx = -f.vx * SIM.WALL_BOUNCE_KEEP;
    f.vy = Math.max(f.vy, 0.16);
    f.hitstop = 5;
    w.events.push({ type: 'wallBounce', id: f.id, x: f.x, y: f.y + 0.9, z: f.z });
  }
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
    if (o.team === v.team || !isAlive(o) || o.def.role === 'prop') continue;
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
  if (m.grab && (airborne || !atk || v.def.role === 'prop')) return false; // 抓不到空中的对手,也抓不了物件

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

  // 场景物件:不会被击退或击飞,血量归零直接碎掉并可能掉道具
  if (v.def.role === 'prop') {
    if (v.hp <= 0) {
      v.hp = 0;
      setState(v, 'dead');
      v.deadFrame = w.frame - 91; // 下次清理时立刻从场上移除
      w.events.push({ type: 'break', id: v.id, x: v.x, z: v.z });
      if (w.drops && w.rng.next() < SIM.PROP_DROP_CHANCE) {
        w.pickups.push({ id: w.nextId++, kind: w.rng.next() < 0.7 ? 'food' : 'ember', x: v.x, z: v.z, life: SIM.PICKUP_LIFE });
      }
    }
    return true;
  }

  // 击杀:无论什么招都打飞
  if (v.hp <= 0) {
    v.hp = 0;
    releaseGrab(w, v);
    setState(v, 'launched');
    v.y = Math.max(v.y, 0.001); v.vy = 0.26; v.vx = dir * 0.16; v.vz = 0;
    v.invuln = 9999;
    v.hitstop += 6; if (atk) atk.hitstop += 6; // 击杀顿帧
    w.events.push({ type: 'ko', id: v.id, team: v.team });
    // 敌人(非召唤物)被击倒时有概率掉落道具:多数是食物,少数是余烬
    if (w.drops && v.team !== 0 && v.brain.owner === undefined && w.rng.next() < SIM.DROP_CHANCE) {
      w.pickups.push({ id: w.nextId++, kind: w.rng.next() < 0.7 ? 'food' : 'ember', x: v.x, z: v.z, life: SIM.PICKUP_LIFE });
    }
    return true;
  }
  // Boss 第二阶段:血量降到一半时挣脱一次,此后出手间隔缩短(由脚本 AI 读取 brain.phase2)
  if (isBoss && !v.brain.phase2 && v.hp <= v.def.stats.hp * 0.5) {
    v.brain.phase2 = 1;
    bossBurst(w, v);
    w.events.push({ type: 'bossPhase', id: v.id });
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
  // applyHit 会改写状态,TypeScript 推断不到,这里按字符串比较
  if ((t.state as string) === 'launched') { t.thrownBy = f.team + 1; t.hitIds = []; }
}

/** 被投出的角色砸到同伴时使用的「招式」(只用来结算伤害与击倒) */
const THROW_COLLIDE: MoveDef = {
  id: ':collide', name: '砸中', tier: Tier.HEAVY, anim: 'slam', startup: 0, active: 1, recovery: 0,
  damage: SIM.THROW_COLLIDE_DAMAGE, comboValue: 2, hitbox: { x0: 0, x1: 0, y0: 0, y1: 0, z: 0 },
  hitstun: 20, hitstop: 5, pushX: 0.12, knockdown: true,
};

/**
 * 投掷砸人:被投出、还在空中飞的角色,碰到同队的其他角色时把对方一起砸倒(每个目标只砸一次)。
 * 这是清版游戏里「抓一个扔向一群」的经典打法。
 */
function resolveThrownBodies(w: World) {
  for (const t of w.fighters) {
    if (!t.thrownBy || t.state !== 'launched') continue;
    const dir = (t.vx >= 0 ? 1 : -1) as 1 | -1;
    for (const o of w.fighters) {
      if (o === t || o.team !== t.team || t.hitIds.includes(o.id)) continue;
      if (Math.abs(o.x - t.x) > 0.75 || Math.abs(o.z - t.z) > 0.6 || Math.abs(o.y - t.y) > 1.4) continue;
      if (applyHit(w, null, t.thrownBy - 1, dir, o, THROW_COLLIDE, o.x, o.y + 1)) t.hitIds.push(o.id);
    }
  }
}

/** 近战命中判定:出招判定框与对方身体重叠即命中(同一招对同一目标只中一次,多段招除外) */
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

/** 飞行道具:向前飞,碰到敌方就结算命中;不带穿透的命中后消失 */
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

// ---------- 机关 ----------

/** 喷火口喷发时使用的「招式」(只用来结算伤害与击飞) */
const HAZARD_HIT: MoveDef = {
  id: ':hazard', name: '喷火', tier: Tier.HEAVY, anim: 'slam', startup: 0, active: 1, recovery: 0,
  damage: 12, comboValue: 2, hitbox: { x0: 0, x1: 0, y0: 0, y1: 0, z: 0 },
  hitstun: 22, hitstop: 4, pushX: 0.1, launch: 0.3,
};

/** 喷火口:喷发期间烧到范围内贴近地面的所有角色,不分敌我 */
function updateHazards(w: World) {
  for (const h of w.hazards) {
    const phase = (w.frame + h.offset) % h.period;
    if (phase === 0) { h.hitIds = []; w.events.push({ type: 'hazard', x: h.x, z: h.z }); }
    if (phase >= SIM.HAZARD_ACTIVE) continue;
    for (const f of w.fighters) {
      if (h.hitIds.includes(f.id) || f.y > 1.2) continue;
      const dx = f.x - h.x, dz = (f.z - h.z) * 1.4;
      if (dx * dx + dz * dz > h.radius * h.radius) continue;
      // 队伍传 -1(不属于任何一方),所以谁站在上面都会中
      if (applyHit(w, null, -1, dx >= 0 ? 1 : -1, f, { ...HAZARD_HIT, damage: h.damage }, f.x, f.y + 0.5)) h.hitIds.push(f.id);
    }
  }
}

// ---------- 道具 ----------

/** 道具计时,以及玩家方角色走到道具上时自动拾取 */
function updatePickups(w: World) {
  if (!w.pickups.length) return;
  for (const p of w.pickups) {
    p.life--;
    for (const f of w.fighters) {
      if (p.life <= 0) break;
      if (f.team !== 0 || !isAlive(f) || f.brain.owner !== undefined || f.y > 0.6) continue;
      if (Math.abs(f.x - p.x) > 0.6 || Math.abs(f.z - p.z) > 0.5) continue;
      if (p.kind === 'food') f.hp = Math.min(f.def.stats.hp, f.hp + f.def.stats.hp * SIM.FOOD_HEAL);
      else f.energy = Math.min(f.def.stats.energyMax, f.energy + SIM.EMBER_ENERGY);
      w.events.push({ type: 'pickup', id: f.id, kind: p.kind });
      p.life = 0;
    }
  }
  w.pickups = w.pickups.filter(p => p.life > 0);
}

// ---------- 波次 ----------

/** 波次推进:场上敌人清光后,隔一会儿放出下一波;全部打完则标记房间已清 */
function updateWaves(w: World) {
  if (!w.useWaves || w.cleared) return;
  const enemies = w.fighters.filter(f => f.team === 1 && f.state !== 'dead');
  if (enemies.length > 0) return;
  if (w.wave >= w.room.waves.length) { w.cleared = true; return; }
  if (--w.waveTimer > 0) return;
  // 清完一波的奖励:玩家方(不含召唤物)回一点血
  if (w.wave > 0) {
    for (const f of w.fighters) {
      if (f.team === 0 && isAlive(f) && f.brain.owner === undefined) f.hp = Math.min(f.def.stats.hp, f.hp + f.def.stats.hp * SIM.WAVE_HEAL);
    }
  }
  let ids = w.room.waves[w.wave++];
  // 合作模式加人:把这一波的第一种敌人多放几个(有 Boss 的波次不加)
  if (w.extraPerWave && !ids.some(id => w.roster[id]?.role === 'boss')) ids = [...ids, ...Array(w.extraPerWave).fill(ids[0])];
  w.waveTimer = 70;
  const hero = w.fighters.find(f => f.team === 0 && isAlive(f));
  const hx = hero?.x ?? w.room.width / 2;
  // 第一波出现时,在房间里摆几个木桶(打碎可能掉道具)
  if (w.wave === 1 && w.roster.barrel) {
    const n = 2 + w.rng.int(3);
    for (let i = 0; i < n; i++) {
      const x = w.rng.range(5, w.room.width - 3);
      if (Math.abs(x - hx) < 2) continue; // 不压在玩家身上
      spawnFighter(w, w.roster.barrel, SIM.PROP_TEAM, x, w.rng.range(0.4, w.room.depth - 0.4));
    }
  }
  ids.forEach((id, i) => {
    const def = w.roster[id];
    if (!def) return;
    // 入场方式:大多数从右侧走来,少数从左侧包抄;从第二波起,偶尔有敌人从空中跳入
    const fromLeft = i % 3 === 2 && hx > 6;
    const dropIn = w.wave >= 2 && i % 4 === 1 && def.role !== 'boss' && def.stats.weight < 1.4;
    let x = fromLeft ? Math.max(0.6, hx - 7 - i * 0.5) : Math.min(w.room.width - 0.6, hx + 7 + i * 0.9);
    if (dropIn) x = Math.min(w.room.width - 0.6, Math.max(0.6, hx + (fromLeft ? -3.5 : 3.5)));
    const z = w.rng.range(0.3, w.room.depth - 0.3);
    const f = spawnFighter(w, def, 1, x, z, w.defaultEnemyAI ?? undefined);
    f.facing = fromLeft ? 1 : -1;
    f.brain.cd = 30 + w.rng.int(60);
    if (dropIn) { f.state = 'jump'; f.y = 6; f.vy = -0.05; f.brain.cd += 30; }
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
    if (f.hitstop > 0) {
      f.hitstop--;
      // 顿帧期间不消耗输入缓冲:命中定格时按下的键,等定格结束后仍然有效(否则连按太快会吞招)
      for (const k in f.buffer) f.buffer[k as BtnName]!++;
      continue;
    }
    updateFighter(w, f);
  }
  // 合作牵引:两名玩家离得太远时,把他们都拉回到彼此的可视范围内
  if (w.tether > 0) {
    const ps = w.fighters.filter(f => f.team === 0 && f.brain.owner === undefined && isAlive(f));
    if (ps.length === 2 && Math.abs(ps[0].x - ps[1].x) > w.tether) {
      const mid = (ps[0].x + ps[1].x) / 2, half = w.tether / 2;
      for (const f of ps) f.x = Math.min(mid + half, Math.max(mid - half, f.x));
    }
  }
  resolveHits(w);
  resolveThrownBodies(w);
  updateProjectiles(w);
  updatePickups(w);
  updateHazards(w);
  // 清理尸体
  if (w.frame % 30 === 0) w.fighters = w.fighters.filter(f => !(f.state === 'dead' && (f.team !== 0 || f.brain.owner !== undefined) && w.frame - f.deadFrame > 90));
  updateWaves(w);
  w.frame++;
}
