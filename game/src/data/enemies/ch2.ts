// 第 2 章 泣骨修道院 —— 敌人与 Boss 数据。
//
// 敌人:
//  - monk    泣骨修士:速度快的近战连击,三段轻攻击后追加重击。
//  - chanter 诵经者:后排施法者,射出经文弹,并用 heal 治疗自己与附近盟友。
//
// Boss:千页主教(hp 900)
//  战斗节奏:主教喜欢拉开距离,用书页飞弹(远程)压制;被逼近时瞬移到另一侧,
//  并召唤泣骨修士(最多 2 只)围攻。能量够时放出「万卷坠落」大范围多段 AoE。
//  破绽:瞬移之后与 AoE 之后都有较长收招(26+ 帧);他本人很脆,无霸体的普通攻击,
//  优先解决召唤的修士,再抓住瞬移落地的瞬间输出。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S } = Tier;

export const monk: CharacterDef = {
  id: 'monk', name: '泣骨修士', title: '', role: 'enemy',
  lore: '为了记住每一句祷文而不肯入睡的修士,眼眶里流出的不是泪,是灰。',
  stats: { hp: 60, speed: 0.058, jump: 0.32, weight: 0.9, energyMax: 100 },
  look: { scale: 1, bulk: 0.9, skin: '#b8b2a4', primary: '#4a4038', secondary: '#2a2420', accent: '#9fd8c8', weapon: 'mace', hood: true, glow: '#9fd8c8' },
  moves: toMap([
    mv('lp1', '念珠击', L, 'punchL', [12, 3, 16], 5, box(0.2, 1.2, 0.7, 1.6, 0.6), [15, 4, 0.05], { chain: { LP: 'lp2' } }),
    mv('lp2', '连祷', L, 'punchR', [10, 3, 16], 6, box(0.2, 1.25, 0.7, 1.6, 0.6), [16, 4, 0.05], { chain: { LP: 'lp3' } }),
    mv('lp3', '终祷重击', L, 'overhead', [14, 4, 22], 8, box(0.2, 1.5, 0.4, 1.9, 0.7), [20, 6, 0.12], { knockdown: true }),
    mv('hp1', '祷杖突刺', H, 'thrust', [20, 4, 24], 11, box(0.2, 1.9, 0.6, 1.6, 0.6), [22, 7, 0.12], { moveX: 0.08 }),
  ]),
  // 玩家应对方法:修士出招快但每段前摇仍可见,三连之前的间隔就是打断窗口;
  // 在第一下轻击后立刻反打,或侧步躲开后踢飞。别让两只以上同时贴脸。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {}, commands: [], skills: [],
};

export const chanter: CharacterDef = {
  id: 'chanter', name: '诵经者', title: '', role: 'enemy',
  lore: '站在队伍最后低声吟诵的人。他念出的每个词都能让同伴的伤口多合上一寸,代价是他自己的名字又少了一个字。',
  stats: { hp: 50, speed: 0.04, jump: 0.3, weight: 0.8, energyMax: 100 },
  look: { scale: 0.98, bulk: 0.85, skin: '#a8a298', primary: '#3b3340', secondary: '#6a5a40', accent: '#c8f0a0', weapon: 'staff', hood: true, cape: true, glow: '#c8f0a0' },
  moves: toMap([
    mv('lp1', '杖击', L, 'slash', [14, 4, 22], 5, box(0.2, 1.6, 0.8, 1.7, 0.6), [16, 5, 0.08]),
    // 经文弹:远程骚扰
    mv('verse', '经文弹', H, 'cast', [22, 2, 26], 9, box(0, 0, 0, 0, 0.6), [20, 6, 0.1],
      { projectile: { speed: 0.26, life: 60, radius: 0.32, y: 1.2, color: '#c8f0a0' } }),
    // 治愈祷言:为自己与 4 米内盟友回血,AI 会在血量低时使用
    mv('mend', '治愈祷言', S, 'cast', [20, 2, 30], 0, box(0, 0, 0, 0, 0.6), [0, 0, 0], { cost: 20, heal: 22 }),
  ]),
  // 玩家应对方法:诵经者是优先击杀目标,它治疗会抵消你的输出;冲过去打断前摇(治疗前摇 20 帧),
  // 或者把它击飞到远离同伴的位置。经文弹慢,边走位边接近。
  normals: { LP: 'lp1', HP: 'verse' }, airNormals: {}, commands: [], skills: ['mend'],
};

export const bishop: CharacterDef = {
  id: 'bishop', name: '千页主教', title: '典籍之主', role: 'boss',
  lore: '他把每一个逝者的名字抄进书页,直到书比修道院还要重。如今他是唯一还记得全部名字的人——除了他自己的。',
  stats: { hp: 900, speed: 0.05, jump: 0.3, weight: 1.5, energyMax: 100 },
  look: { scale: 1.35, bulk: 1.3, skin: '#bcb6a8', primary: '#5a2f4f', secondary: '#1f1a26', accent: '#f0e2a0', weapon: 'staff', hood: true, cape: true, glow: '#f0e2a0' },
  moves: toMap([
    // ---------- 普通攻击 ----------
    mv('lp1', '书脊敲击', L, 'slash', [14, 4, 20], 8, box(0.2, 1.9, 0.6, 2.0, 0.8), [18, 5, 0.1], { chain: { LP: 'lp2' } }),
    mv('lp2', '翻页扫', L, 'slash', [12, 4, 24], 10, box(-0.2, 2.2, 0.5, 2.0, 1.0), [20, 6, 0.14]),
    mv('hp1', '镇纸重击', H, 'overhead', [20, 4, 26], 14, box(0.2, 2.2, 0.2, 2.3, 0.9), [24, 8, 0.14], { knockdown: true }),
    // ---------- 指令技 ----------
    // 页影步:向前瞬移后接杖击(突进手段)
    mv('pageStep', '页影步', C, 'cast', [10, 5, 24], 12, box(0.2, 1.8, 0.4, 2.0, 0.9), [22, 7, 0.12], { teleport: 3.5, invuln: 10 }),
    // 后撤步:向后瞬移,拉开距离
    mv('retreat', '遁页', C, 'cast', [8, 2, 20], 0, box(0, 0, 0, 0, 0.6), [0, 0, 0], { teleport: -3.5, invuln: 10 }),
    // ---------- 技能 ----------
    // 书页飞弹:远程
    mv('pages', '书页飞弹', S, 'cast', [20, 2, 26], 14, box(0, 0, 0, 0, 0.6), [22, 6, 0.12], { cost: 25, projectile: { speed: 0.3, life: 70, radius: 0.4, y: 1.2, color: '#f6ecc0' } }),
    // 召唤修士:最多 2 只
    mv('callmonk', '唤起修士', S, 'cast', [24, 3, 30], 8, box(0.2, 1.4, 0, 1.8, 0.9), [20, 6, 0.1], { cost: 30, summon: 'monk' }),
    // 万卷坠落:大范围多段,霸体,伤害高,收招长
    mv('fall', '万卷坠落', S, 'cast', [32, 30, 36], 7, box(-3.0, 3.0, 0, 2.6, 1.8), [22, 4, 0.04], { cost: 50, rehit: 6, armor: true, launch: 0.2 }),
  ]),
  // 玩家应对方法:主教很脆,先杀召唤的修士再追他;他瞬移后落点在你面前 3.5 米,提前准备;
  // 万卷坠落前摇 32 帧、范围极大——看见他举书就远离或在 AoE 末段闪避,收招 36 帧是最佳输出时机。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {},
  commands: [
    { motion: 'FF', button: 'LP', move: 'pageStep' },
    { motion: 'BF', button: 'LP', move: 'retreat' },
  ],
  skills: ['pages', 'callmonk', 'fall'],
};

export const enemies: CharacterDef[] = [monk, chanter, bishop];
