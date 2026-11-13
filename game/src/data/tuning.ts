// 各职业的手感差异集中在这里:每个按键能连打几下、抓取范围多远。
// 角色的招式本体写在 chars/*.ts;这个文件在游戏启动时对它们做统一加工,
// 这样想调整「谁的拳头多、谁的抓取远」只需要改下面这张表。
import { AnimKind, CharacterDef, MoveDef } from '../sim/types';

interface HeroTuning {
  /** 轻攻击(J)与重攻击(K)各能连打几下 */
  j: number; k: number;
  /** 连段变长时,新增招式的名字(按顺序取用) */
  jNames?: string[]; kNames?: string[];
  /** 抓取:范围(米)、出手前摇(帧)、招式名。范围越远出手越慢 */
  grabRange: number; grabStartup: number; grabName: string;
}

export const HERO_TUNING: Record<string, HeroTuning> = {
  kael:   { j: 3, k: 3, kNames: ['裂空斩'], grabRange: 1.2, grabStartup: 5, grabName: '缴械投' },
  brynn:  { j: 2, k: 4, kNames: ['震地锤', '破城击'], grabRange: 1.4, grabStartup: 6, grabName: '盾压投' },
  sera:   { j: 3, k: 2, grabRange: 2.4, grabStartup: 10, grabName: '烬火鞭' },
  ilex:   { j: 4, k: 2, jNames: ['追风箭'], grabRange: 2.7, grabStartup: 11, grabName: '缚索箭' },
  rook:   { j: 5, k: 2, jNames: ['碎岩拳'], grabRange: 1.6, grabStartup: 4, grabName: '过肩摔' },
  vesper: { j: 5, k: 3, jNames: ['逆刃', '绞杀'], kNames: ['断喉'], grabRange: 1.0, grabStartup: 3, grabName: '锁喉' },
  morgan: { j: 2, k: 3, kNames: ['葬骨击'], grabRange: 2.9, grabStartup: 12, grabName: '骸骨之手' },
  odran:  { j: 2, k: 4, kNames: ['断岳', '灭世斧'], grabRange: 1.5, grabStartup: 7, grabName: '碎颅摔' },
  li:     { j: 4, k: 3, jNames: ['点星'], kNames: ['崩山枪'], grabRange: 2.0, grabStartup: 8, grabName: '钩镰挑' },
  nola:   { j: 3, k: 2, grabRange: 1.9, grabStartup: 9, grabName: '圣光枷锁' },
};

type ChainBtn = 'LP' | 'HP';

/** 沿着连携一路走下去,列出一条连段里所有招式的 id */
export function chainIds(def: CharacterDef, start: string | undefined, btn: 'LP' | 'HP' | 'LK' | 'HK'): string[] {
  const ids: string[] = [];
  for (let id = start; id && def.moves[id] && ids.length < 9 && !ids.includes(id); id = def.moves[id].chain?.[btn]) ids.push(id);
  return ids;
}

/** 新增招式的动作:在同一类动作里轮换,免得连打时一直是同一个姿势 */
const NEXT_ANIM: Partial<Record<AnimKind, AnimKind>> = {
  punchL: 'punchR', punchR: 'kick', kick: 'highKick', highKick: 'punchL',
  slash: 'thrust', thrust: 'overhead', overhead: 'slash', slam: 'overhead', upper: 'slash',
};

/**
 * 把某个按键的连段调整到指定长度。
 * 变长:以最后一招为模板复制出新招(伤害略高),并把「击倒 / 挑空」这类收尾效果挪到新的最后一招上,
 *       中间的招改成普通硬直,保证能一路连下去。
 * 变短:断开多余的连携。
 * 最后统一处理收尾:轻攻击连段的最后一下是大硬直(还能接重攻击),
 * 重攻击连段的最后一下挑空,命中后可以跳起来接空中连招。
 * 于是最顺手的一套就是:轻…轻 → 重…重(挑空)→ 跳 → 空中轻 ×3 → 空中重(砸地)。
 */
function setChain(def: CharacterDef, btn: ChainBtn, count: number, names: string[] = []) {
  const ids = chainIds(def, def.normals[btn], btn);
  if (!ids.length) return;
  if (ids.length > count) {
    const last = def.moves[ids[count - 1]];
    if (last.chain) delete last.chain[btn];
    ids.length = count;
  }
  let k = 0;
  while (ids.length < count) {
    const prev = def.moves[ids[ids.length - 1]];
    let id = `${btn.toLowerCase()}${ids.length + 1}`;
    while (def.moves[id]) id += 'x';
    const next: MoveDef = {
      ...prev, id, name: names[k++] ?? `${prev.name}·续`, chain: undefined,
      // 伤害逐段略增,但不超过该类攻击的上限(轻 11 / 重 21),免得长连段数值失控
      damage: Math.min(prev.tier === 0 ? 11 : 21, Math.round(prev.damage * 1.12)), anim: NEXT_ANIM[prev.anim] ?? prev.anim,
    };
    // 收尾效果交给新招;原来的最后一招变成中继
    prev.knockdown = undefined; prev.launch = undefined;
    prev.hitstun = Math.max(prev.hitstun, 18); prev.pushX = Math.min(prev.pushX, 0.08);
    prev.chain = { ...prev.chain, [btn]: id };
    def.moves[id] = next;
    ids.push(id);
  }
  // 中间的招不能把人打倒 / 打飞,否则后面接不上
  for (const id of ids.slice(0, -1)) { const m = def.moves[id]; m.knockdown = undefined; m.launch = undefined; }
  const last = def.moves[ids[ids.length - 1]];
  if (btn === 'LP') { last.launch = undefined; last.knockdown = undefined; last.hitstun = Math.max(last.hitstun, 22); last.pushX = Math.min(last.pushX, 0.1); }
  else { last.knockdown = undefined; last.launch = last.launch ?? 0.31; last.jumpCancel = true; last.hitstop = Math.max(last.hitstop, 9); }
}

/** 按上面的表加工一个主角(只在启动时调用一次) */
export function applyHeroTuning(def: CharacterDef) {
  const t = HERO_TUNING[def.id];
  if (!t) return;
  setChain(def, 'LP', t.j, t.jNames);
  setChain(def, 'HP', t.k, t.kNames);

  // 重攻击提速:原来从按下到打出要 8~14 帧、后续几下更慢,按起来发闷。
  // 现在按角色快慢分三档,每一下都带一小步前移,保证够得着。
  const cls = def.stats.speed >= 0.075 ? 0 : def.stats.speed >= 0.062 ? 1 : 2; // 0 灵巧 / 1 均衡 / 2 厚重
  const heavyIds = chainIds(def, def.normals.HP, 'HP');
  heavyIds.forEach((id, i) => {
    const m = def.moves[id];
    m.startup = Math.min(m.startup, [6, 7, 9][cls] + (i > 0 ? 1 : 0));
    m.recovery = Math.min(m.recovery, [14, 16, 19][cls]);
    if (!m.projectile) m.moveX = Math.max(m.moveX ?? 0, 0.045);
    m.hitstop = Math.max(m.hitstop, 8);
  });
  const hk = def.moves[def.normals.HK ?? ''];
  if (hk) { hk.startup = Math.min(hk.startup, [7, 8, 9][cls]); hk.recovery = Math.min(hk.recovery, 17); }

  // 蓄力重击:按住重攻击不放,第一下打完后自动转入这一招(见 world.ts)。以重攻击第一下为蓝本,更狠、带霸体。
  const h1 = def.moves[heavyIds[0] ?? ''];
  if (h1 && !h1.projectile && !def.moves.charge) {
    def.moves.charge = {
      ...h1, id: 'charge', name: '蓄力重击', chain: undefined, chargeable: true, armor: true,
      startup: 7, active: Math.max(4, h1.active), recovery: 20,
      damage: Math.round(h1.damage * 1.35), hitstun: 26, hitstop: 11, pushX: 0.2, moveX: 0.07,
      hitbox: { ...h1.hitbox, x1: h1.hitbox.x1 + 0.3 }, anim: 'slam', knockdown: true, launch: undefined,
    };
  }

  // 抓取范围与出手速度
  const g = def.moves.grab;
  if (g) { g.hitbox = { ...g.hitbox, x1: t.grabRange }; g.startup = t.grabStartup; g.name = t.grabName; }

  // 空中:轻攻击统一能连 3 下;空中的重击是「砸地技」,能把浮空的对手砸下去再弹起来
  const airStart = def.airNormals.LP;
  if (airStart) {
    const ids = chainIds(def, airStart, 'LP');
    while (ids.length < 3) {
      const prev = def.moves[ids[ids.length - 1]];
      const id = `jlp${ids.length + 1}`;
      if (def.moves[id]) break;
      def.moves[id] = { ...prev, id, name: `${prev.name}·${['', '', '二', '三'][ids.length + 1] ?? '续'}段`, chain: undefined, damage: prev.damage + 1 };
      prev.knockdown = undefined;
      prev.chain = { ...prev.chain, LP: id };
      ids.push(id);
    }
  }
  for (const b of ['HP', 'HK', 'LK'] as const) {
    const m = def.moves[def.airNormals[b] ?? ''];
    if (m && m.knockdown && !m.projectile) m.spike = true;
  }
  // 地面挑空技(↓+重)命中后都能跳起来追击
  const launcher = def.moves[def.normals.HK ?? ''];
  if (launcher?.launch) launcher.jumpCancel = true;
  // 飞行道具类的技能在空中也能放
  for (const id of def.skills) { const m = def.moves[id]; if (m?.projectile) m.airOk = true; }
}
