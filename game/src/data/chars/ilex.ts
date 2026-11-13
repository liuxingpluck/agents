// 伊莱 Ilex —— 弓箭手
// 打法:移速快、血量低,靠重攻击与技能射出的箭保持距离;被逼近时用「后跳射击」拉开并回击,
// LK / HK 的近身踢击用来脱身与挑空。奥义「万箭坠」是大范围多段输出。
// 推荐连招 1:踢击挑空 HK → 空中 LP 射击 → 空中 LK 坠击收尾。
// 推荐连招 2:LP → LP → LP(弓击三连)→ 后跳射击(↓←+HP)拉开并追射 → 蓄力穿云箭(S2)。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const ilex: CharacterDef = {
  id: 'ilex', name: '伊莱', title: '追风之矢', role: 'archer',
  lore: '深根矿道里的斥候。他的遗物是女王名字的尾音,弓弦每响一次,他就忘掉一条曾走过的路,于是只能把每一箭都射向前方。',
  stats: { hp: 170, speed: 0.082, jump: 0.38, weight: 0.9, energyMax: 100 },
  look: { scale: 1.02, bulk: 0.9, skin: '#c4a27e', primary: '#3f6a43', secondary: '#6b4a2e', accent: '#d9e6a0', weapon: 'bow', hood: false, cape: true, hair: 'ponytail', hairColor: '#cdbf8e' },
  moves: toMap([
    // ===== 地面轻攻击:弓身近战链 =====
    // 起手:弓身快速击打
    mv('lp1', '弓击', L, 'punchL', [4, 3, 8], 5, box(0.2, 1.3, 0.9, 1.6), [16, 4, 0.05], { chain: { LP: 'lp2' } }),
    // 中继:反手弓击
    mv('lp2', '反手击', L, 'punchR', [4, 3, 9], 6, box(0.2, 1.3, 0.9, 1.6), [17, 4, 0.05], { chain: { LP: 'lp3' } }),
    // 收尾:近距离抵身射出一箭
    mv('lp3', '抵射', L, 'shoot', [6, 3, 13], 9, box(0, 0, 0, 0, 0.6), [20, 5, 0.1], { projectile: { speed: 0.38, life: 40, radius: 0.25, y: 1.2, color: '#d9e6a0' } }),
    // 起手:快踢,LK 近战
    mv('lk1', '疾踢', L, 'kick', [4, 3, 9], 6, box(0.2, 1.3, 0.4, 1.1), [17, 4, 0.06], { chain: { LK: 'lk2' } }),
    // 收尾:回旋高踢
    mv('lk2', '回旋踢', L, 'highKick', [6, 4, 12], 9, box(0.2, 1.5, 0.9, 1.8), [20, 6, 0.12]),

    // ===== 地面重攻击 =====
    // 中继:速射箭,可接 HP
    mv('hp1', '速射', H, 'shoot', [9, 3, 17], 12, box(0, 0, 0, 0, 0.6), [22, 7, 0.1], { chain: { HP: 'hp2' }, projectile: { speed: 0.4, life: 60, radius: 0.25, y: 1.25, color: '#d9e6a0' } }),
    // 收尾:重箭,击倒
    mv('hp2', '破甲箭', H, 'shoot', [12, 3, 22], 16, box(0, 0, 0, 0, 0.6), [24, 9, 0.16], { knockdown: true, projectile: { speed: 0.38, life: 60, radius: 0.3, y: 1.25, color: '#f2f7c0' } }),
    // 挑空:上踢,挑空起手
    mv('hk1', '挑踢', H, 'upper', [9, 4, 18], 12, box(0.1, 1.3, 0.3, 2.3), [24, 8, 0.03], { launch: 0.33, jumpCancel: true }),

    // ===== 空中普通技 =====
    // 空中射击:向前一箭
    mv('jlp', '空中点射', L, 'shoot', [5, 3, 9], 6, box(0, 0, 0, 0, 0.6), [18, 4, 0.04], { air: true, projectile: { speed: 0.4, life: 45, radius: 0.25, y: 1.0, color: '#d9e6a0' } }),
    // 空中收尾:俯冲踢击倒
    mv('jlk', '坠踢', H, 'airKick', [6, 10, 10], 13, box(0, 1.3, -0.8, 1.0), [22, 8, 0.14], { air: true, knockdown: true }),

    // ===== 抓取 =====
    mv('grab', '弦缚投', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.0, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 22, throwDamage: 14, throwVx: 0.22, throwVy: 0.3 } }),

    // ===== 指令技 =====
    // 后跳射击(↓←+HP):向后瞬移并立刻回射,拉开距离的核心招
    mv('backshot', '后跳射击', C, 'shoot', [6, 4, 18], 13, box(0, 0, 0, 0, 0.6), [22, 8, 0.1], { teleport: -2.6, invuln: 6, projectile: { speed: 0.4, life: 55, radius: 0.28, y: 1.2, color: '#d9e6a0' } }),
    // 突进踢(↓→+LK):向前滑步踢,击倒,近身起手
    mv('dashkick', '追风踢', C, 'kick', [6, 6, 16], 13, box(0.2, 1.7, 0.3, 1.3), [22, 8, 0.12], { moveX: 0.16, knockdown: true }),
    // 升踢(↓↑+HK):无敌升龙脚,挑空,浮空连段入口
    mv('risekick', '升空踢', C, 'upper', [5, 7, 20], 13, box(0, 1.3, 0.2, 2.5), [24, 9, 0.02], { launch: 0.35, selfLaunch: 0.28, invuln: 8 }),

    // ===== 技能 =====
    // 疾风箭(S1):快速中伤害箭,远程牵制与连段收尾
    mv('galearrow', '疾风箭', S, 'shoot', [8, 3, 18], 15, box(0, 0, 0, 0, 0.6), [22, 7, 0.12], { cost: 15, projectile: { speed: 0.4, life: 60, radius: 0.3, y: 1.25, color: '#9be08a' } }),
    // 穿云箭(S2):蓄力贯穿箭,可一次射穿一排敌人
    mv('pierce', '蓄力穿云箭', S, 'shoot', [16, 3, 26], 22, box(0, 0, 0, 0, 0.6), [24, 10, 0.18], { cost: 30, knockdown: true, projectile: { speed: 0.4, life: 80, radius: 0.4, y: 1.2, color: '#f2f7a0', pierce: true } }),
    // 爆裂箭(S3):命中炸开挑空,浮空连段起手
    mv('burst', '爆裂箭', S, 'shoot', [12, 3, 22], 18, box(0, 0, 0, 0, 0.6), [24, 8, 0.05], { cost: 25, launch: 0.32, projectile: { speed: 0.34, life: 60, radius: 0.4, y: 1.2, color: '#ff9a3a' } }),
    // 奥义(S4):万箭坠,大范围箭雨多段,出招无敌
    mv('rain', '万箭坠', U, 'shoot', [10, 30, 30], 8, box(0.5, 5.5, 0, 2.6, 1.6), [24, 4, 0.02], { cost: 60, rehit: 5, invuln: 44, launch: 0.2 }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jlp', LK: 'jlk', HK: 'jlk' },
  commands: [
    { motion: 'DB', button: 'HP', move: 'backshot' },
    { motion: 'DB', button: 'LP', move: 'backshot' },
    { motion: 'DF', button: 'LK', move: 'dashkick' },
    { motion: 'DU', button: 'HK', move: 'risekick' },
  ],
  skills: ['galearrow', 'pierce', 'burst', 'rain'],
};

export const extras: CharacterDef[] = [];
