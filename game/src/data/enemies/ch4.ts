// 第 4 章 无王之都 —— 敌人与 Boss 数据。
//
// 敌人:
//  - kingsguard 无王卫士:持盾重甲兵,盾牌前压,霸体长枪刺击。
//  - shade      余影:瞬移刺客,从侧后方突然现身。
//
// Boss:守火女王的余影(hp 1200)
//  战斗节奏:最快、最优雅的 Boss。她以连续的火焰剑舞压制,随后瞬移到身后突刺,
//  拉开距离时发射火焰弹;能量攒满后释放「焰墙」,覆盖面极宽的多段火墙。
//  破绽:瞬移突刺有 12 帧以上前摇且落点固定在身前 3 米;焰墙前摇长(30 帧)、
//  收招 34 帧,是她最大的破绽。普通连段无霸体,可以抢攻打断。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S } = Tier;

export const kingsguard: CharacterDef = {
  id: 'kingsguard', name: '无王卫士', title: '', role: 'enemy',
  lore: '王都陷落之后仍在守卫空王座的近卫。他们认得王座,却想不起王的脸。',
  stats: { hp: 160, speed: 0.032, jump: 0.28, weight: 1.6, energyMax: 100 },
  look: { scale: 1.15, bulk: 1.45, skin: '#7a7a80', primary: '#58606e', secondary: '#2e3038', accent: '#6ac8ff', weapon: 'spear', shield: true, glow: '#6ac8ff' },
  moves: toMap([
    mv('lp1', '盾击', L, 'punchR', [16, 4, 22], 8, box(0.2, 1.4, 0.5, 1.8, 0.7), [18, 6, 0.14]),
    // 霸体长枪突刺:攻击距离长
    mv('hp1', '王庭突刺', H, 'thrust', [24, 5, 30], 15, box(0.2, 2.8, 0.6, 1.7, 0.7), [24, 9, 0.18], { armor: true, knockdown: true, moveX: 0.05 }),
  ]),
  // 玩家应对方法:正面硬打会被盾和霸体枪反杀;用闪避绕到侧后方,或在突刺收招(30 帧)时输出;
  // 抓取无视霸体,是对付它的好办法;优先用挑空/击倒组合打出伤害。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {}, commands: [], skills: [],
};

export const shade: CharacterDef = {
  id: 'shade', name: '余影', title: '', role: 'enemy',
  lore: '没能留下躯体的残影,只记得"必须刺出那一剑"。它在你背后站了很久。',
  stats: { hp: 55, speed: 0.052, jump: 0.34, weight: 0.8, energyMax: 100 },
  look: { scale: 1, bulk: 0.8, skin: '#3a3a48', primary: '#22222e', secondary: '#14141c', accent: '#b080ff', weapon: 'daggers', hood: true, cape: true, glow: '#b080ff' },
  moves: toMap([
    mv('lp1', '影刃', L, 'slash', [12, 3, 18], 7, box(0.2, 1.4, 0.6, 1.7, 0.6), [16, 4, 0.06]),
    // 瞬移刺击:AI 视为突进手段;瞬移 2.5 米并出刀
    mv('blink', '影遁刺', C, 'thrust', [14, 4, 26], 10, box(0.2, 1.6, 0.6, 1.7, 0.7), [20, 7, 0.1], { teleport: 2.5 }),
    mv('hp1', '背刺', H, 'thrust', [18, 4, 26], 11, box(0.2, 1.7, 0.6, 1.7, 0.7), [22, 7, 0.12], { knockdown: true }),
  ]),
  // 玩家应对方法:余影血少但会突然出现;听到/看到它消失(瞬移前摇 14 帧)就面向它的落点,
  // 它的瞬移后有 26 帧收招,转身后反击即可;保持面向敌人,别让它绕到背后。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {},
  commands: [{ motion: 'FF', button: 'LP', move: 'blink' }], skills: [],
};

export const queenshade: CharacterDef = {
  id: 'queenshade', name: '女王余影', title: '守火者', role: 'boss',
  lore: '守火女王劈开自己名字的那一夜,留在王座前的最后一道影子。她仍在守护那堆已经熄灭的火,并认定每个靠近的人都是来偷火的。',
  stats: { hp: 1200, speed: 0.065, jump: 0.34, weight: 1.5, energyMax: 100 },
  look: { scale: 1.3, bulk: 1.3, skin: '#b8a0a0', primary: '#6a1f2a', secondary: '#1c1218', accent: '#ff6a3a', weapon: 'sword', cape: true, horns: true, glow: '#ff6a3a' },
  moves: toMap([
    // ---------- 普通攻击 ----------
    // 焰剑三连:速度快,前摇 10~12
    mv('lp1', '焰剑·起', L, 'slash', [11, 3, 14], 7, box(0.2, 2.0, 0.6, 1.9, 0.8), [17, 4, 0.08], { chain: { LP: 'lp2' } }),
    mv('lp2', '焰剑·承', L, 'slash', [10, 3, 16], 8, box(0.2, 2.1, 0.5, 1.9, 0.8), [18, 5, 0.1], { chain: { LP: 'lp3' } }),
    mv('lp3', '焰剑·断', L, 'overhead', [14, 4, 24], 11, box(0.2, 2.3, 0.2, 2.2, 0.9), [22, 7, 0.14], { knockdown: true }),
    mv('hp1', '落焰斩', H, 'overhead', [18, 4, 26], 14, box(0.2, 2.4, 0.2, 2.3, 0.9), [24, 8, 0.14], { knockdown: true }),
    // ---------- 指令技 ----------
    // 瞬移突刺:瞬移到身前并突刺
    mv('flash', '烬影突', C, 'thrust', [12, 5, 26], 14, box(0.2, 2.6, 0.5, 1.8, 0.8), [22, 8, 0.14], { teleport: 3.0, invuln: 10 }),
    // 冲刺挑斩:快速突进挑空
    mv('dash', '焰舞挑', C, 'upper', [12, 6, 26], 12, box(0.2, 2.0, 0.2, 2.4, 0.8), [24, 8, 0.04], { moveX: 0.16, launch: 0.32 }),
    // ---------- 技能 ----------
    // 火焰弹:远程
    mv('fireball', '焰弹', S, 'cast', [16, 2, 24], 13, box(0, 0, 0, 0, 0.6), [22, 6, 0.12], { cost: 25, projectile: { speed: 0.34, life: 60, radius: 0.4, y: 1.2, color: '#ff7a3a' } }),
    // 焰墙:覆盖前方大范围的多段火墙,霸体
    mv('flamewall', '焰墙', S, 'cast', [30, 28, 34], 7, box(0.0, 4.2, 0, 2.6, 1.8), [22, 4, 0.04], { cost: 45, rehit: 5, armor: true, launch: 0.2 }),
    // 追魂斩:单段高伤
    mv('rend', '熄火一斩', S, 'slash', [24, 4, 34], 20, box(0.2, 3.0, 0.2, 2.4, 1.0), [26, 10, 0.2], { cost: 35, armor: true, knockdown: true }),
  ]),
  // 玩家应对方法:不要和她拼速度;焰剑三连在第二段之后留有间隙,可以闪避;瞬移落点固定,
  // 提前横向移动;焰墙前摇 30 帧——提前拉开 4 米以上或从前方闪过;收招阶段全力输出。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {},
  commands: [
    { motion: 'FF', button: 'LP', move: 'flash' },
    { motion: 'DF', button: 'HP', move: 'dash' },
  ],
  skills: ['fireball', 'flamewall', 'rend'],
};

export const enemies: CharacterDef[] = [kingsguard, shade, queenshade];
