// 内容校验:纯函数,不依赖 DOM / Three.js,可在 Node(vitest)与浏览器中使用。
// 规则来源:docs/CHARACTER-AUTHORING.md 的「数值范围」表,所有区间统一放宽 20% 容差。
// 校验函数接收 unknown(导入的 JSON 不可信),内部先做类型收窄再检查,错误信息全部为中文。
import { ATTACK_BTNS, AnimKind, Motion } from '../sim/types';

// ---------- 常量与规则表 ----------

/** 数值区间的容差比例:下限 ×0.8,上限 ×1.2 */
export const TOLERANCE = 0.2;

/**
 * 「平衡预算」上限。
 * 预算 = 生命值 / 2 + 全部招式的总伤害(多段招按 ceil(active / rehit) 段计,抓取计入投掷伤害)。
 * 内置 10 名英雄的预算在 335 ~ 487 之间(最高为 odran),因此把上限定为 600:
 * 比最强的内置英雄再宽松约 23%,既留出创作空间,又防止「血厚且每招都爆炸伤害」的失衡角色。
 */
export const BUDGET_CAP = 600;

/** 一个角色最多可挂的技能键数(S1 ~ S8) */
export const MAX_SKILLS = 8;

const ANIMS: readonly AnimKind[] = [
  'punchL', 'punchR', 'kick', 'highKick', 'sweep', 'upper', 'slash', 'overhead', 'thrust', 'spin',
  'cast', 'shoot', 'slam', 'airKick', 'airSlash',
];
const WEAPONS = ['none', 'sword', 'hammer', 'staff', 'bow', 'daggers', 'axe', 'spear', 'mace', 'claws'] as const;
const MOTIONS: readonly Motion[] = ['DF', 'DB', 'DU', 'FF', 'BF', 'DD'];
const ROLES = ['warrior', 'tank', 'mage', 'archer', 'brawler', 'assassin', 'summoner', 'berserker', 'lancer', 'support', 'enemy', 'boss'] as const;
const KINDS = ['battle', 'elite', 'rest', 'boss'] as const;

/** 供编辑器下拉框使用的枚举(与校验保持同一来源) */
export const ENUMS = { ANIMS, WEAPONS, MOTIONS, ROLES, KINDS } as const;

type Field = 'startup' | 'active' | 'recovery' | 'damage' | 'hitstun' | 'hitstop';
type Range = [number, number];
type FieldRanges = Record<Field, Range>;

/** 各层级招式的帧数 / 伤害区间(取自作者规范表;tier 3 伤害取「多段每击 5」到「单段 24」的并集) */
const TIER_RANGE: Record<number, FieldRanges> = {
  0: { startup: [3, 6], active: [2, 4], recovery: [7, 13], damage: [4, 10], hitstun: [15, 20], hitstop: [3, 6] },
  1: { startup: [8, 14], active: [3, 5], recovery: [16, 24], damage: [11, 19], hitstun: [22, 26], hitstop: [7, 9] },
  2: { startup: [5, 12], active: [4, 10], recovery: [14, 22], damage: [12, 18], hitstun: [22, 26], hitstop: [8, 9] },
  3: { startup: [6, 16], active: [2, 24], recovery: [16, 26], damage: [5, 24], hitstun: [20, 26], hitstop: [3, 10] },
  4: { startup: [8, 14], active: [20, 36], recovery: [26, 34], damage: [7, 10], hitstun: [24, 24], hitstop: [4, 4] },
};
const TIER_NAME = ['轻攻击', '重攻击', '指令技', '技能', '奥义'];
const FIELD_NAME: Record<Field, string> = {
  startup: '起手帧', active: '持续帧', recovery: '收招帧', damage: '伤害', hitstun: '硬直', hitstop: '顿帧',
};

/** 空中招式在规范里没有单独的表,按内置英雄的实际写法放宽帧数区间(与层级区间取并集) */
const AIR_EXTRA: Partial<FieldRanges> = { startup: [3, 14], active: [2, 12], recovery: [7, 24] };
/** 敌人 / Boss 动作慢、前后摇长,放宽帧数区间 */
const ENEMY_EXTRA: Partial<FieldRanges> = { startup: [3, 40], active: [2, 12], recovery: [7, 40] };

/** 英雄属性区间(规范:hp 150~320 speed 0.055~0.085 jump 0.33~0.38 weight 0.8~1.5 energyMax 100) */
const HERO_STATS: Record<string, Range> = {
  hp: [150, 320], speed: [0.055, 0.085], jump: [0.33, 0.38], weight: [0.8, 1.5], energyMax: [100, 100],
};
/** 敌人 / Boss 的属性区间(规范未约束,取宽松的合理范围,真正的上限由平衡预算把关) */
const ENEMY_STATS: Record<string, Range> = {
  hp: [10, 1000], speed: [0.02, 0.1], jump: [0.2, 0.45], weight: [0.5, 2.5], energyMax: [0, 200],
};
const STAT_NAME: Record<string, string> = { hp: '生命', speed: '移速', jump: '跳跃初速', weight: '体重', energyMax: '能量上限' };

// ---------- 小工具 ----------

type Obj = Record<string, unknown>;

/** 是否为普通对象(排除 null 与数组) */
function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
/** 是否为有限数 */
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
/** 是否为非空字符串(去空白后) */
function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
/** 是否为 #rgb / #rrggbb 颜色 */
function isColor(v: unknown): boolean {
  return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}
/** id 格式:小写字母开头,可含小写字母 / 数字 / 下划线,2~24 个字符 */
export function isValidId(v: unknown): boolean {
  return typeof v === 'string' && /^[a-z][a-z0-9_]{1,23}$/.test(v);
}
/** 数值是否落在区间内(带容差) */
function within(v: number, [lo, hi]: Range, tol = TOLERANCE): boolean {
  return v >= lo * (1 - tol) - 1e-9 && v <= hi * (1 + tol) + 1e-9;
}
/** 合并两个区间(取并集),用于给特殊招式放宽规则 */
function union(a: Range, b: Range | undefined): Range {
  return b ? [Math.min(a[0], b[0]), Math.max(a[1], b[1])] : a;
}
/** 区间的可读文本 */
function rangeText([lo, hi]: Range): string {
  return lo === hi ? `${lo}` : `${lo}~${hi}`;
}

/** 角色是否按「英雄」规则校验(敌人 / Boss 规则更宽松) */
export function isHeroRole(role: unknown): boolean {
  return role !== 'enemy' && role !== 'boss';
}

// ---------- 平衡预算 ----------

/**
 * 计算角色的平衡预算:生命 / 2 + 所有招式总伤害。
 * 多段招(rehit)按 ceil(active / rehit) 段计;抓取招额外计入 throwDamage。
 * 对残缺数据容错:非数字一律按 0。
 */
export function characterBudget(def: unknown): number {
  if (!isObj(def)) return 0;
  const stats = isObj(def.stats) ? def.stats : {};
  let total = isNum(stats.hp) ? stats.hp / 2 : 0;
  const moves = isObj(def.moves) ? def.moves : {};
  for (const m of Object.values(moves)) {
    if (!isObj(m)) continue;
    const dmg = isNum(m.damage) ? m.damage : 0;
    const hits = isNum(m.rehit) && m.rehit > 0 && isNum(m.active) ? Math.max(1, Math.ceil(m.active / m.rehit)) : 1;
    total += dmg * hits;
    if (isObj(m.grab) && isNum(m.grab.throwDamage)) total += m.grab.throwDamage;
  }
  return total;
}

// ---------- 招式校验 ----------

/**
 * 校验单个招式,错误追加到 errs。
 * @param m 招式(未可信)
 * @param key 它在 moves 表里的键
 * @param hero 是否按英雄规则
 * @param moveIds 本角色全部招式 id(检查 chain)
 * @param knownIds 已知角色 id(检查 summon),可能为 undefined
 * @param energyMax 角色能量上限(检查 cost)
 */
function checkMove(errs: string[], m: unknown, key: string, hero: boolean, moveIds: Set<string>, knownIds: Set<string> | undefined, energyMax: number) {
  if (!isObj(m)) { errs.push(`招式「${key}」不是对象`); return; }
  const label = `招式「${isStr(m.name) ? m.name : key}」(${key})`;
  const e = (msg: string) => errs.push(`${label}:${msg}`);

  if (m.id !== key) e(`id「${String(m.id)}」必须与 moves 表中的键「${key}」一致`);
  if (!isStr(m.name)) e('缺少名称');
  if (!isNum(m.tier) || !Number.isInteger(m.tier) || m.tier < 0 || m.tier > 4) { e('tier 必须是 0~4 的整数(0 轻 1 重 2 指令 3 技能 4 奥义)'); return; }
  const tier = m.tier;
  if (typeof m.anim !== 'string' || !ANIMS.includes(m.anim as AnimKind)) e(`动画 anim「${String(m.anim)}」不合法,可选:${ANIMS.join(' / ')}`);

  // 数值字段:必须是数,且落在层级区间内(带容差)
  const air = m.air === true;
  const isGrab = isObj(m.grab);
  for (const f of Object.keys(FIELD_NAME) as Field[]) {
    const v = m[f];
    if (!isNum(v)) { e(`${FIELD_NAME[f]}(${f})必须是数字`); continue; }
    if (v < 0) { e(`${FIELD_NAME[f]}(${f})不能为负`); continue; }
    if ((f === 'startup' || f === 'active' || f === 'recovery') && !Number.isInteger(v)) { e(`${FIELD_NAME[f]}(${f})必须是整数帧`); continue; }
    let rg = TIER_RANGE[tier][f];
    if (air) rg = union(rg, AIR_EXTRA[f]);
    if (!hero) rg = union(rg, ENEMY_EXTRA[f]);
    // 抓取招有自己的节奏(抓住 → 保持 → 投出),不按层级表约束帧数 / 伤害 / 硬直
    if (isGrab) continue;
    if (!within(v, rg)) e(`${TIER_NAME[tier]}的${FIELD_NAME[f]}(${f})为 ${v},建议范围 ${rangeText(rg)}(容差 ±20%)`);
  }
  if (!isNum(m.comboValue) || m.comboValue < 0 || m.comboValue > 5) e('连击权重 comboValue 必须是 0~5 的数');
  if (!isNum(m.pushX)) e('击退 pushX 必须是数字');
  else if (!isGrab && !within(m.pushX, [0.02, 0.3])) e(`击退 pushX 为 ${m.pushX},建议范围 0.02~0.3(容差 ±20%)`);

  // 判定盒
  const proj = isObj(m.projectile);
  const hb = m.hitbox;
  if (!isObj(hb) || !['x0', 'x1', 'y0', 'y1', 'z'].every(k => isNum(hb[k]))) e('判定盒 hitbox 必须包含数字 x0 x1 y0 y1 z');
  else if (!proj) {
    const { x0, x1, y0, y1, z } = hb as Record<string, number>;
    if (!(x1 > x0)) e('判定盒需要 x1 > x0');
    if (!(y1 > y0)) e('判定盒需要 y1 > y0');
    if (x0 < -4 || x1 > 6) e('判定盒 x 范围需在 -4 ~ 6 米内(近战一般 0.2~1.8,长柄到 2.6,远程法术可更长)');
    if (y0 < -1 || y1 > 3.5) e('判定盒 y 范围需在 -1 ~ 3.5 米内');
    if (z < 0.4 || z > 2.2) e(`判定盒纵深容差 z 为 ${z},建议 0.6~1.3(允许 0.4~2.2)`);
  }

  // 可选字段
  const optNum = (k: string, lo: number, hi: number, name: string) => {
    const v = m[k];
    if (v === undefined) return;
    if (!isNum(v) || v < lo || v > hi) e(`${name}(${k})需为 ${lo}~${hi} 的数`);
  };
  optNum('launch', 0.05, 0.6, '挑空速度');
  optNum('moveX', -0.4, 0.4, '出招前移');
  optNum('selfLaunch', 0, 0.6, '自身上升');
  optNum('invuln', 0, 60, '无敌帧');
  optNum('rehit', 2, 30, '重复命中间隔');
  optNum('heal', 0, 80, '治疗量');
  optNum('teleport', -8, 8, '瞬移距离');
  for (const k of ['knockdown', 'jumpCancel', 'air', 'armor'] as const) {
    if (m[k] !== undefined && typeof m[k] !== 'boolean') e(`${k} 必须是布尔值`);
  }
  if (m.cost !== undefined) {
    if (!isNum(m.cost) || m.cost < 0) e('能量消耗 cost 必须是非负数');
    else if (m.cost > energyMax) e(`能量消耗 ${m.cost} 超过角色能量上限 ${energyMax}`);
  }
  // 技能 / 奥义必须有消耗,否则可以无限放;层级规范:技能 15~35,奥义 60
  if (hero && (tier === 3 || tier === 4)) {
    const c = isNum(m.cost) ? m.cost : 0;
    const rg: Range = tier === 3 ? [15, 35] : [60, 60];
    if (!within(c, rg)) e(`${TIER_NAME[tier]}的能量消耗 cost 为 ${c},建议 ${rangeText(rg)}(容差 ±20%)`);
  }

  // 飞行道具
  if (m.projectile !== undefined) {
    const p = m.projectile;
    if (!isObj(p)) e('projectile 必须是对象');
    else {
      const chk = (k: string, rg: Range, name: string) => {
        const v = p[k];
        if (!isNum(v) || !within(v, rg)) e(`飞行道具${name}(${k})需在 ${rangeText(rg)}(容差 ±20%)`);
      };
      chk('speed', [0.2, 0.4], '速度'); chk('life', [40, 80], '寿命帧'); chk('radius', [0.25, 0.45], '半径'); chk('y', [0.9, 1.3], '发射高度');
      if (!isColor(p.color)) e('飞行道具颜色 color 必须是 #rrggbb');
      if (p.pierce !== undefined && typeof p.pierce !== 'boolean') e('pierce 必须是布尔值');
    }
  }

  // 抓取
  if (m.grab !== undefined) {
    const g = m.grab;
    if (!isObj(g)) e('grab 必须是对象');
    else {
      if (!isNum(g.hold) || g.hold < 5 || g.hold > 60) e('抓取保持帧 grab.hold 需在 5~60');
      if (!isNum(g.throwDamage) || g.throwDamage < 0 || g.throwDamage > 40) e('投掷伤害 grab.throwDamage 需在 0~40');
      if (!isNum(g.throwVx) || Math.abs(g.throwVx) > 0.6) e('投掷水平速度 grab.throwVx 需在 -0.6~0.6');
      if (!isNum(g.throwVy) || g.throwVy < 0 || g.throwVy > 0.6) e('投掷上抛速度 grab.throwVy 需在 0~0.6');
    }
  }

  // 召唤
  if (m.summon !== undefined) {
    if (!isStr(m.summon)) e('summon 必须是角色 id');
    else if (knownIds && !knownIds.has(m.summon)) e(`召唤物「${m.summon}」不在已知角色中`);
  }

  // 连携
  if (m.chain !== undefined) {
    if (!isObj(m.chain)) e('chain 必须是对象');
    else {
      for (const [btn, target] of Object.entries(m.chain)) {
        if (!(ATTACK_BTNS as string[]).includes(btn)) e(`连携按键「${btn}」不合法,只能是 LP / HP / LK / HK`);
        if (typeof target !== 'string' || !moveIds.has(target)) e(`连携 ${btn} → 「${String(target)}」,该招式不存在`);
      }
    }
  }
}

// ---------- 角色校验 ----------

/**
 * 校验角色定义,返回中文错误列表(空数组表示通过)。
 * 检查项:必填字段;属性 / 招式数值区间(规范 ±20%);引用的招式 id 均存在;
 * anim / weapon / motion 枚举合法;技能数 ≤ 8;平衡预算 ≤ BUDGET_CAP;
 * 英雄角色另需满足规范的结构要求(四个普通技入口、抓取、3 个指令技、挑空 / 击倒等)。
 * @param def 待校验的角色(来自表单或导入的 JSON,不可信)
 * @param knownIds 其他已存在的角色 id(内置 + 其他自制):用于检查 id 冲突与召唤物引用;不传则跳过这两项
 */
export function validateCharacter(def: unknown, knownIds?: Iterable<string>): string[] {
  const errs: string[] = [];
  if (!isObj(def)) return ['角色数据不是对象'];
  const known = knownIds ? new Set(knownIds) : undefined;

  // --- 基本信息 ---
  if (!isValidId(def.id)) errs.push('id 必须以小写字母开头,只含小写字母 / 数字 / 下划线,长度 2~24');
  else if (known?.has(def.id as string)) errs.push(`id「${def.id}」与已有角色重复`);
  if (!isStr(def.name)) errs.push('缺少名称 name');
  if (typeof def.title !== 'string') errs.push('称号 title 必须是字符串(可为空)');
  if (typeof def.role !== 'string' || !(ROLES as readonly string[]).includes(def.role)) errs.push(`职业 role「${String(def.role)}」不合法`);
  if (typeof def.lore !== 'string') errs.push('背景 lore 必须是字符串');
  const hero = isHeroRole(def.role);
  if (hero) {
    if (!isStr(def.title)) errs.push('英雄需要一个四字左右的称号 title');
    if (!isStr(def.lore)) errs.push('英雄需要 2~3 句背景 lore');
  }

  // --- 属性 ---
  let energyMax = 100;
  if (!isObj(def.stats)) errs.push('缺少属性 stats');
  else {
    const table = hero ? HERO_STATS : ENEMY_STATS;
    for (const k of Object.keys(table)) {
      const v = def.stats[k];
      if (!isNum(v)) { errs.push(`${STAT_NAME[k]}(stats.${k})必须是数字`); continue; }
      if (!within(v, table[k])) errs.push(`${STAT_NAME[k]}(stats.${k})为 ${v},建议范围 ${rangeText(table[k])}(容差 ±20%)`);
    }
    if (isNum(def.stats.energyMax)) energyMax = def.stats.energyMax;
  }

  // --- 外观 ---
  if (!isObj(def.look)) errs.push('缺少外观 look');
  else {
    const l = def.look;
    if (!isNum(l.scale) || l.scale < 0.6 || l.scale > 1.6) errs.push('身高倍率 look.scale 需在 0.6~1.6');
    if (!isNum(l.bulk) || l.bulk < 0.6 || l.bulk > 2) errs.push('肩宽倍率 look.bulk 需在 0.6~2');
    for (const k of ['skin', 'primary', 'secondary', 'accent']) if (!isColor(l[k])) errs.push(`颜色 look.${k} 必须是 #rrggbb`);
    if (l.glow !== undefined && !isColor(l.glow)) errs.push('光效色 look.glow 必须是 #rrggbb');
    if (typeof l.weapon !== 'string' || !(WEAPONS as readonly string[]).includes(l.weapon)) errs.push(`武器 look.weapon「${String(l.weapon)}」不合法,可选:${WEAPONS.join(' / ')}`);
    for (const k of ['shield', 'hood', 'horns', 'cape']) if (l[k] !== undefined && typeof l[k] !== 'boolean') errs.push(`look.${k} 必须是布尔值`);
  }

  // --- 招式表 ---
  if (!isObj(def.moves)) { errs.push('缺少招式表 moves'); return errs; }
  const moves = def.moves as Record<string, Obj>;
  const moveIds = new Set(Object.keys(moves));
  if (moveIds.size === 0) errs.push('至少需要一个招式');
  for (const key of moveIds) checkMove(errs, moves[key], key, hero, moveIds, known, energyMax);

  // --- 入口映射 ---
  const refMap = (field: 'normals' | 'airNormals', wantAir: boolean) => {
    const t = def[field];
    if (!isObj(t)) { errs.push(`缺少 ${field}`); return; }
    for (const [btn, id] of Object.entries(t)) {
      if (!(ATTACK_BTNS as string[]).includes(btn)) errs.push(`${field} 的按键「${btn}」不合法,只能是 LP / HP / LK / HK`);
      const m = typeof id === 'string' ? moves[id] : undefined;
      if (!m) { errs.push(`${field}.${btn} 引用的招式「${String(id)}」不存在`); continue; }
      if (isObj(m) && (m.air === true) !== wantAir) errs.push(`${field}.${btn} 的招式「${String(id)}」${wantAir ? '必须是空中招式(air: true)' : '必须是地面招式(不能设 air)'}`);
    }
  };
  refMap('normals', false);
  refMap('airNormals', true);

  if (!Array.isArray(def.commands)) errs.push('缺少指令技列表 commands');
  else {
    def.commands.forEach((c, i) => {
      if (!isObj(c)) { errs.push(`指令技 #${i + 1} 不是对象`); return; }
      if (typeof c.motion !== 'string' || !(MOTIONS as readonly string[]).includes(c.motion)) errs.push(`指令技 #${i + 1} 的搓招 motion「${String(c.motion)}」不合法,可选:${MOTIONS.join(' / ')}`);
      if (typeof c.button !== 'string' || !(ATTACK_BTNS as string[]).includes(c.button)) errs.push(`指令技 #${i + 1} 的按键「${String(c.button)}」不合法,只能是 LP / HP / LK / HK`);
      const m = typeof c.move === 'string' ? moves[c.move] : undefined;
      if (!m) errs.push(`指令技 #${i + 1} 引用的招式「${String(c.move)}」不存在`);
      else if (isObj(m) && m.tier !== 2) errs.push(`指令技 #${i + 1} 的招式「${String(c.move)}」层级应为 2(指令技)`);
    });
  }

  if (!Array.isArray(def.skills)) errs.push('缺少技能列表 skills');
  else {
    if (def.skills.length > MAX_SKILLS) errs.push(`技能最多 ${MAX_SKILLS} 个(S1~S8),当前 ${def.skills.length} 个`);
    def.skills.forEach((id, i) => {
      const m = typeof id === 'string' ? moves[id] : undefined;
      if (!m) errs.push(`技能 S${i + 1} 引用的招式「${String(id)}」不存在`);
      else if (isObj(m) && m.tier !== 3 && m.tier !== 4) errs.push(`技能 S${i + 1} 的招式「${String(id)}」层级应为 3(技能)或 4(奥义)`);
    });
  }

  // --- 结构要求 ---
  const normals = isObj(def.normals) ? def.normals : {};
  const airNormals = isObj(def.airNormals) ? def.airNormals : {};
  if (hero) {
    for (const b of ATTACK_BTNS) if (!normals[b]) errs.push(`英雄必须设置地面普通技入口 ${b}`);
    const airIds = new Set(Object.values(airNormals).filter(v => typeof v === 'string' && moves[v as string]));
    if (airIds.size < 2) errs.push('英雄至少需要 2 个不同的空中招式(airNormals)');
    if (!isObj(moves.grab) || !isObj(moves.grab.grab)) errs.push('英雄必须有 id 为 grab 且带 grab 字段的抓取招');
    if (Array.isArray(def.commands) && def.commands.length < 3) errs.push('英雄至少需要 3 个指令技(commands)');
    if (Array.isArray(def.skills) && def.skills.length < 1) errs.push('英雄至少需要 1 个技能(推荐 4 个:3 技能 + 1 奥义)');
    const chainLen = (start: unknown, btn: string): number => {
      const seen = new Set<string>();
      let cur = start;
      while (typeof cur === 'string' && moves[cur] && !seen.has(cur)) {
        seen.add(cur);
        const ch = isObj(moves[cur].chain) ? (moves[cur].chain as Obj)[btn] : undefined;
        cur = ch;
      }
      return seen.size;
    };
    if (chainLen(normals.LP, 'LP') < 2) errs.push('轻拳 LP 至少需要 2 段连携(用 chain: { LP: 下一招 })');
    if (chainLen(normals.LK, 'LK') < 2) errs.push('轻脚 LK 至少需要 2 段连携(用 chain: { LK: 下一招 })');
    const all = Object.values(moves).filter(isObj);
    const launches = all.filter(m => isNum(m.launch) && within(m.launch, [0.3, 0.38]));
    if (launches.length === 0) errs.push('至少需要一个挑空招(launch 0.30~0.38)');
    if (!all.some(m => m.knockdown === true)) errs.push('至少需要一个击倒招(knockdown: true)');
  } else if (Object.keys(normals).length === 0) {
    errs.push('敌人 / Boss 至少需要一个地面普通技入口');
  }

  // --- 平衡预算 ---
  const budget = characterBudget(def);
  if (budget > BUDGET_CAP) errs.push(`平衡预算 ${Math.round(budget)} 超过上限 ${BUDGET_CAP}(预算 = 生命/2 + 全部招式总伤害;请降低生命或招式伤害)`);

  return errs;
}

// ---------- 房间校验 ----------

/**
 * 校验房间定义。
 * @param room 待校验房间
 * @param knownCharIds 全部已知角色 id(波次里的敌人必须在其中)
 */
export function validateRoom(room: unknown, knownCharIds: Iterable<string>): string[] {
  const errs: string[] = [];
  if (!isObj(room)) return ['房间数据不是对象'];
  const known = new Set(knownCharIds);
  if (!isValidId(room.id)) errs.push('房间 id 必须以小写字母开头,只含小写字母 / 数字 / 下划线,长度 2~24');
  if (!isStr(room.name)) errs.push('缺少房间名称 name');
  if (!isNum(room.width) || room.width < 10 || room.width > 120) errs.push('房间宽度 width 需在 10~120 米');
  if (!isNum(room.depth) || room.depth < 3 || room.depth > 8) errs.push('房间纵深 depth 需在 3~8 米');
  if (!isStr(room.theme)) errs.push('缺少主题 theme');
  if (room.story !== undefined && typeof room.story !== 'string') errs.push('剧情 story 必须是字符串');
  if (!Array.isArray(room.waves)) errs.push('缺少波次 waves');
  else {
    if (room.waves.length > 12) errs.push('波次最多 12 波');
    room.waves.forEach((w, i) => {
      if (!Array.isArray(w)) { errs.push(`第 ${i + 1} 波不是数组`); return; }
      if (w.length === 0) errs.push(`第 ${i + 1} 波没有敌人`);
      if (w.length > 8) errs.push(`第 ${i + 1} 波敌人超过 8 个`);
      for (const id of w) if (typeof id !== 'string' || !known.has(id)) errs.push(`第 ${i + 1} 波的敌人「${String(id)}」不存在`);
    });
  }
  return errs;
}

// ---------- 章节校验 ----------

/**
 * 校验章节(3 路路线图)。
 * 规则:节点 id 唯一;lane 为 0/1/2;col 为非负整数;room 必须存在;kind 合法;
 * next / start 引用的节点存在;无环;所有节点都能从起点到达;
 * 全图恰好一个 boss 节点,它没有后续;其余所有节点都有后续(没有死路),因此每条路线最终都汇合到 boss。
 * @param ch 待校验章节
 * @param knownRoomIds 全部已知房间 id
 */
export function validateChapter(ch: unknown, knownRoomIds: Iterable<string>): string[] {
  const errs: string[] = [];
  if (!isObj(ch)) return ['章节数据不是对象'];
  const rooms = new Set(knownRoomIds);
  if (!isValidId(ch.id)) errs.push('章节 id 必须以小写字母开头,只含小写字母 / 数字 / 下划线,长度 2~24');
  if (!isStr(ch.name)) errs.push('缺少章节名称 name');
  for (const k of ['intro', 'outro'] as const) {
    if (!Array.isArray(ch[k]) || !(ch[k] as unknown[]).every(s => typeof s === 'string')) errs.push(`${k === 'intro' ? '开场剧情 intro' : '结尾剧情 outro'} 必须是字符串数组`);
  }
  if (!Array.isArray(ch.nodes) || ch.nodes.length === 0) { errs.push('至少需要一个节点 nodes'); return errs; }

  // 节点逐个检查
  const byId = new Map<string, Obj>();
  ch.nodes.forEach((n, i) => {
    if (!isObj(n)) { errs.push(`节点 #${i + 1} 不是对象`); return; }
    const tag = `节点「${String(n.id)}」`;
    if (!isStr(n.id)) { errs.push(`节点 #${i + 1} 缺少 id`); return; }
    if (byId.has(n.id)) errs.push(`节点 id「${n.id}」重复`);
    byId.set(n.id, n);
    if (n.lane !== 0 && n.lane !== 1 && n.lane !== 2) errs.push(`${tag}的路线 lane 必须是 0 / 1 / 2`);
    if (!isNum(n.col) || !Number.isInteger(n.col) || n.col < 0) errs.push(`${tag}的列号 col 必须是非负整数`);
    if (typeof n.room !== 'string' || !rooms.has(n.room)) errs.push(`${tag}的房间「${String(n.room)}」不存在`);
    if (typeof n.kind !== 'string' || !(KINDS as readonly string[]).includes(n.kind)) errs.push(`${tag}的类型 kind「${String(n.kind)}」不合法`);
    if (!Array.isArray(n.next) || !n.next.every(x => typeof x === 'string')) errs.push(`${tag}的 next 必须是字符串数组`);
  });
  const nextOf = (id: string): string[] => {
    const n = byId.get(id);
    return n && Array.isArray(n.next) ? (n.next as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  };
  for (const id of byId.keys()) {
    for (const t of nextOf(id)) {
      if (!byId.has(t)) errs.push(`节点「${id}」的后续「${t}」不存在`);
      if (t === id) errs.push(`节点「${id}」的后续不能指向自己`);
    }
    // 同一节点的 next 不应重复
    const nx = nextOf(id);
    if (new Set(nx).size !== nx.length) errs.push(`节点「${id}」的后续有重复项`);
  }

  // 起点
  const start = Array.isArray(ch.start) ? (ch.start as unknown[]) : [];
  if (!Array.isArray(ch.start) || start.length === 0) errs.push('至少需要一个起点 start');
  for (const s of start) if (typeof s !== 'string' || !byId.has(s)) errs.push(`起点「${String(s)}」不存在`);

  // 可达性(从所有起点出发 BFS)
  const reach = new Set<string>();
  const queue: string[] = start.filter((s): s is string => typeof s === 'string' && byId.has(s));
  while (queue.length) {
    const id = queue.pop()!;
    if (reach.has(id)) continue;
    reach.add(id);
    for (const t of nextOf(id)) if (byId.has(t)) queue.push(t);
  }
  for (const id of byId.keys()) if (!reach.has(id)) errs.push(`节点「${id}」无法从任何起点到达`);

  // 环检测(三色 DFS)
  const color = new Map<string, number>();
  let cyc = false;
  const dfs = (id: string) => {
    color.set(id, 1);
    for (const t of nextOf(id)) {
      if (!byId.has(t)) continue;
      const c = color.get(t) ?? 0;
      if (c === 1) cyc = true;
      else if (c === 0) dfs(t);
    }
    color.set(id, 2);
  };
  for (const id of byId.keys()) if ((color.get(id) ?? 0) === 0) dfs(id);
  if (cyc) errs.push('路线图中存在环(节点绕回了之前的节点)');

  // boss:恰好一个,且可达,且没有后续;其余节点必须有后续
  const bosses = [...byId.values()].filter(n => n.kind === 'boss').map(n => n.id as string);
  if (bosses.length === 0) errs.push('必须有且仅有一个 boss 节点(当前没有)');
  else if (bosses.length > 1) errs.push(`必须有且仅有一个 boss 节点(当前 ${bosses.length} 个:${bosses.join('、')})`);
  for (const b of bosses) {
    if (!reach.has(b)) errs.push(`boss 节点「${b}」无法从起点到达`);
    if (nextOf(b).length > 0) errs.push(`boss 节点「${b}」是终点,不应再有后续`);
  }
  for (const [id, n] of byId) {
    if (n.kind !== 'boss' && reach.has(id) && nextOf(id).length === 0) errs.push(`节点「${id}」是死路:它没有后续,也不是 boss`);
  }
  return errs;
}

// ---------- 内容包校验 ----------

/**
 * 校验整个内容包(导入 / 导出前使用)。
 * 自制内容的 id 不得与内置内容重复;角色可引用内置 + 自制角色,房间 / 章节同理。
 * @param pack 待校验内容包
 * @param builtinCharIds 内置角色 id(含敌人、召唤物)
 * @param builtinRoomIds 内置房间 id
 */
export function validatePack(pack: unknown, builtinCharIds: Iterable<string>, builtinRoomIds: Iterable<string>): string[] {
  if (!isObj(pack)) return ['内容包不是对象'];
  const errs: string[] = [];
  if (pack.format !== 'ashen-abyss-pack') errs.push('format 必须是 "ashen-abyss-pack"(这不是烬渊内容包?)');
  if (pack.version !== 1) errs.push('version 必须是 1');
  const chars = Array.isArray(pack.characters) ? pack.characters : (errs.push('characters 必须是数组'), []);
  const rooms = Array.isArray(pack.rooms) ? pack.rooms : (errs.push('rooms 必须是数组'), []);
  const chaps = Array.isArray(pack.chapters) ? pack.chapters : (errs.push('chapters 必须是数组'), []);

  const bChars = new Set(builtinCharIds), bRooms = new Set(builtinRoomIds);
  const idOf = (x: unknown) => (isObj(x) && typeof x.id === 'string' ? x.id : '');
  const customChars = chars.map(idOf), customRooms = rooms.map(idOf);
  const allChars = new Set([...bChars, ...customChars]);
  const allRooms = new Set([...bRooms, ...customRooms]);

  const dup = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (id && seen.has(id)) errs.push(`${what} id「${id}」在内容包内重复`);
      seen.add(id);
    }
  };
  dup(customChars, '角色'); dup(customRooms, '房间'); dup(chaps.map(idOf), '章节');

  chars.forEach((c, i) => {
    // 其他角色的 id 集合:内置 + 除自己外的自制
    const others = new Set([...bChars, ...customChars.filter((_, j) => j !== i)]);
    for (const e of validateCharacter(c, others)) errs.push(`角色「${idOf(c) || `#${i + 1}`}」:${e}`);
  });
  rooms.forEach((r, i) => {
    if (bRooms.has(idOf(r))) errs.push(`房间「${idOf(r)}」与内置房间 id 重复`);
    for (const e of validateRoom(r, allChars)) errs.push(`房间「${idOf(r) || `#${i + 1}`}」:${e}`);
  });
  chaps.forEach((ch, i) => {
    for (const e of validateChapter(ch, allRooms)) errs.push(`章节「${idOf(ch) || `#${i + 1}`}」:${e}`);
  });
  return errs;
}
