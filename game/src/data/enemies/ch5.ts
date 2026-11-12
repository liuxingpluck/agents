// 第 5 章 烬渊之心 —— 敌人与 Boss 数据。
//
// 敌人:
//  - ashling 烬生体:自爆式突进者。冲刺很快,命中后爆出大范围慢速 AoE。
//
// Boss:无名者(最终 Boss,hp 1400)
//  战斗节奏:烬渊本体借用了所有被它吞掉之人的招式:近战连击、远程余烬弹、瞬移、召唤烬生体、
//  霸体重砸,以及终极的「忘却」大范围多段。节奏是「试探 -> 召唤压制 -> 瞬移近身 -> 大招」。
//  破绽:忘却前摇 36 帧、收招 40 帧;召唤只有在场上烬生体不足 2 只时才会再次施放,
//  所以先清小怪、再输出;瞬移落点固定,提前走位。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S } = Tier;

export const ashling: CharacterDef = {
  id: 'ashling', name: '烬生体', title: '', role: 'enemy',
  lore: '烬渊凝出的、尚未长成人形的东西。它只有一个念头:靠近你,然后燃尽。',
  stats: { hp: 50, speed: 0.058, jump: 0.3, weight: 0.8, energyMax: 100 },
  look: { scale: 0.9, bulk: 0.9, skin: '#4a3a38', primary: '#2a2022', secondary: '#1a1214', accent: '#ff4a1a', weapon: 'none', glow: '#ff4a1a' },
  moves: toMap([
    // 冲撞:高速突进
    mv('lp1', '余烬冲撞', L, 'punchR', [12, 8, 20], 7, box(0.2, 1.3, 0.3, 1.7, 0.6), [16, 5, 0.1], { moveX: 0.12 }),
    // 自爆:前摇长、霸体、范围大、慢
    mv('hp1', '烬爆', H, 'slam', [28, 6, 34], 14, box(-1.8, 1.8, 0, 2.0, 1.4), [24, 9, 0.2], { armor: true, knockdown: true }),
  ]),
  // 玩家应对方法:看见它身体变亮(烬爆前摇 28 帧)就立刻拉开 2 米以上或闪避穿过;
  // 爆后它有 34 帧硬直,是反击窗口。远程或快速攻击在它起爆前先击杀。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {}, commands: [], skills: [],
};

export const nameless: CharacterDef = {
  id: 'nameless', name: '无名者', title: '烬渊本体', role: 'boss',
  lore: '烬渊吞下的每一个名字汇成的一个没有名字的东西。它没有恶意,只是在寻找一个能让它被叫出名字的人。',
  stats: { hp: 1400, speed: 0.055, jump: 0.32, weight: 1.8, energyMax: 100 },
  look: { scale: 1.6, bulk: 1.6, skin: '#2a1f22', primary: '#1c1418', secondary: '#3a1c1c', accent: '#ff3a1a', weapon: 'none', horns: true, cape: true, glow: '#ff3a1a' },
  moves: toMap([
    // ---------- 普通攻击 ----------
    mv('lp1', '余烬抓', L, 'punchR', [12, 4, 18], 9, box(0.2, 2.0, 0.5, 2.1, 0.9), [18, 5, 0.1], { chain: { LP: 'lp2' } }),
    mv('lp2', '灰烬撕', L, 'punchL', [12, 4, 22], 11, box(0.2, 2.2, 0.5, 2.2, 0.9), [20, 6, 0.12]),
    mv('hp1', '湮灭拳', H, 'slam', [20, 5, 28], 16, box(0.2, 2.5, 0, 2.5, 1.0), [24, 9, 0.16], { knockdown: true, armor: true }),
    // ---------- 指令技 ----------
    // 瞬移:近身后追击
    mv('warp', '虚空步', C, 'thrust', [12, 5, 26], 13, box(0.2, 2.4, 0.4, 2.2, 0.9), [22, 8, 0.12], { teleport: 3.5, invuln: 10 }),
    // 突进冲撞
    mv('lunge', '焚魂突', C, 'thrust', [14, 8, 28], 15, box(0.2, 2.4, 0.3, 2.3, 1.0), [24, 9, 0.18], { moveX: 0.15, armor: true, knockdown: true }),
    // ---------- 技能 ----------
    // 余烬弹:远程
    mv('ember', '余烬弹', S, 'cast', [18, 2, 26], 14, box(0, 0, 0, 0, 0.6), [22, 6, 0.12], { cost: 25, projectile: { speed: 0.32, life: 70, radius: 0.45, y: 1.2, color: '#ff4a1a' } }),
    // 召唤烬生体(最多 2 只)
    mv('spawn', '唤烬', S, 'cast', [24, 3, 30], 8, box(0.2, 1.4, 0, 1.8, 0.9), [20, 6, 0.1], { cost: 30, summon: 'ashling' }),
    // 终极大招:忘却,身周巨大范围多段
    mv('oblivion', '忘却', S, 'cast', [36, 32, 40], 7, box(-3.4, 3.4, 0, 2.8, 2.0), [24, 4, 0.05], { cost: 50, rehit: 5, armor: true, launch: 0.2 }),
  ]),
  // 玩家应对方法:先杀烬生体再输出本体;余烬弹慢,横向移动躲开;
  // 瞬移落点在面前 3.5 米,提前面向并准备反击;忘却前摇 36 帧、收招 40 帧,拉远躲开然后爆发输出。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {},
  commands: [
    { motion: 'FF', button: 'LP', move: 'warp' },
    { motion: 'DF', button: 'HP', move: 'lunge' },
  ],
  skills: ['ember', 'spawn', 'oblivion'],
};

export const enemies: CharacterDef[] = [ashling, nameless];
