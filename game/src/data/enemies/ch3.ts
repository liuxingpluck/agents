// 第 3 章 深根矿道 —— 敌人与 Boss 数据。
//
// 敌人:
//  - miner   掘根工:持镐重型步兵,重击带霸体。
//  - crawler 根须爬行者:体型小、速度快的蜂拥型敌人,单个很弱。
//
// Boss:掘墓巨像(hp 1050)
//  战斗节奏:巨像移动极慢,但几乎所有招式都有霸体。节奏是「慢步逼近 -> 砸地 -> 长收招」,
//  能量攒满后用地震冲击波(远程地面冲击)封路,再接「崩塌」大范围多段。
//  破绽:每次砸地后收招 36 帧以上,绕到侧面(纵深方向)输出两三下就撤;
//  不要在它霸体招的 startup 内硬拼,它的普通攻击不会追击。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S } = Tier;

export const miner: CharacterDef = {
  id: 'miner', name: '掘根工', title: '', role: 'enemy',
  lore: '为贤者们挖了三百年的矿工。他们不记得为什么挖,只知道镐头停下来的那一刻,自己也会跟着消失。',
  stats: { hp: 130, speed: 0.033, jump: 0.28, weight: 1.5, energyMax: 100 },
  look: { scale: 1.15, bulk: 1.4, skin: '#7a6a5a', primary: '#5a4a32', secondary: '#33291d', accent: '#c8a050', weapon: 'axe', glow: '#e0b040' },
  moves: toMap([
    mv('lp1', '镐头横抡', L, 'slash', [16, 4, 24], 9, box(0.2, 1.9, 0.4, 1.9, 0.7), [18, 6, 0.1]),
    // 重击:霸体,前摇长
    mv('hp1', '开山劈', H, 'overhead', [28, 5, 34], 18, box(0.2, 2.3, 0, 2.3, 0.9), [24, 10, 0.18], { armor: true, knockdown: true }),
  ]),
  // 玩家应对方法:开山劈带霸体,不要在前摇里硬打;看见它举镐就绕到侧面或闪避,
  // 劈完后 34 帧的收招里打一套连段。普通横抡无霸体,可以用快攻打断。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {}, commands: [], skills: [],
};

export const crawler: CharacterDef = {
  id: 'crawler', name: '根须爬行者', title: '', role: 'enemy',
  lore: '从矿脉里长出来的根须缠住了倒下的矿工,拼凑出一个会爬的东西。它没有记忆可烧,所以烬渊也懒得理它。',
  stats: { hp: 28, speed: 0.062, jump: 0.3, weight: 0.7, energyMax: 100 },
  look: { scale: 0.65, bulk: 0.8, skin: '#5a6a48', primary: '#3a4a2a', secondary: '#2a2218', accent: '#a8e060', weapon: 'claws', glow: '#a8e060' },
  moves: toMap([
    mv('lp1', '缠抓', L, 'punchR', [9, 3, 16], 4, box(0.2, 1.0, 0.1, 1.0, 0.6), [14, 4, 0.04]),
    mv('hp1', '蹿咬', H, 'slam', [14, 5, 22], 7, box(0.1, 1.2, 0.1, 1.2, 0.6), [18, 6, 0.08], { moveX: 0.1 }),
  ]),
  // 玩家应对方法:单只几乎无威胁,危险在于成群缠身;用范围攻击(旋风、AoE)一次清理,
  // 站在墙边避免被包围。别被它们逼到连击受限(玩家被连击到上限会被强制击飞)。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {}, commands: [], skills: [],
};

export const colossus: CharacterDef = {
  id: 'colossus', name: '掘墓巨像', title: '无字碑', role: 'boss',
  lore: '贤者们用整座矿山的岩石与三百具矿工的遗骸拼成的守墓者。它的额头刻着一行被磨平的字,没人记得那是谁的墓。',
  stats: { hp: 860, speed: 0.03, jump: 0.2, weight: 2.1, energyMax: 100 },
  look: { scale: 1.7, bulk: 1.8, skin: '#6a6a66', primary: '#4a4a48', secondary: '#2c2a28', accent: '#ffb23a', weapon: 'hammer', horns: true, glow: '#ffb23a' },
  moves: toMap([
    // ---------- 普通攻击 ----------
    mv('lp1', '岩拳', L, 'punchR', [18, 4, 24], 10, box(0.2, 2.2, 0.4, 2.4, 1.0), [20, 6, 0.14]),
    mv('hp1', '碎石锤', H, 'overhead', [26, 5, 32], 16, box(0.2, 2.6, 0, 2.8, 1.0), [24, 9, 0.18], { armor: true, knockdown: true }),
    // ---------- 指令技 ----------
    // 碾压前冲:霸体慢速突进(突进手段)
    mv('crush', '碾压', C, 'thrust', [20, 14, 34], 15, box(0.2, 2.4, 0.2, 2.6, 1.1), [24, 9, 0.2], { moveX: 0.1, armor: true, knockdown: true }),
    // 回扫:大范围横扫
    mv('backsweep', '岩臂回扫', C, 'sweep', [24, 6, 32], 11, box(-1.4, 2.6, 0, 1.6, 1.3), [22, 8, 0.16], { armor: true, knockdown: true }),
    // ---------- 技能 ----------
    // 地震冲击:地面冲击波,远程,穿透,把人挑起
    mv('shock', '地震冲击', S, 'slam', [24, 2, 32], 14, box(0, 0, 0, 0, 0.8), [24, 8, 0.1],
      { cost: 30, armor: true, launch: 0.3, projectile: { speed: 0.2, life: 70, radius: 0.5, y: 0.5, color: '#ffb23a', pierce: true } }),
    // 崩塌:大范围多段,霸体,收招极长
    mv('collapse', '崩塌', S, 'slam', [34, 24, 40], 8, box(-3.2, 3.2, 0, 2.4, 1.8), [24, 4, 0.05], { cost: 45, rehit: 6, armor: true, launch: 0.2 }),
    // 重击砸地:单段高伤
    mv('grave', '掘墓重砸', S, 'slam', [36, 5, 42], 24, box(0.2, 3.0, 0, 2.8, 1.3), [26, 10, 0.2], { cost: 35, armor: true, knockdown: true }),
  ]),
  // 玩家应对方法:巨像很慢,所以永远不要站在它面前贪刀;绕到纵深侧面打,
  // 地震冲击波贴地飞行但很慢,跳起或闪避;崩塌范围最大,听到前摇立刻拉开 3.5 米以上。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {},
  commands: [
    { motion: 'FF', button: 'HP', move: 'crush' },
    { motion: 'BF', button: 'LP', move: 'backsweep' },
  ],
  skills: ['shock', 'collapse', 'grave'],
};

export const enemies: CharacterDef[] = [miner, crawler, colossus];
