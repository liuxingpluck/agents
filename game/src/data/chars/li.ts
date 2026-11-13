// 璃 Li —— 枪兵 / 武僧。
// 打法:长枪中距离牵制,判定最长(x 可达 2.6),用点刺与退步突保持距离;
// 一旦挑空便有升龙枪、乱舞突、撑杆坠击等丰富的浮空追击。伤害偏低,靠连段累积。
// 推荐连招:
//   1. 扫枪(HK 挑空) → 跳跃取消 → 空刺(LP)×2 → 撑杆坠击(空中HK)
//   2. 点刺(LP×3) → 升龙枪(↓↑+HP) → 乱舞突(S1)
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const li: CharacterDef = {
  id: 'li', name: '璃', title: '寒枪游龙', role: 'lancer',
  lore: '灰雪之路上的巡礼武僧,以一杆白枪护送难民。她的遗物是女王名字的第七个音节;每出一枪,她便忘掉一段曾走过的路,但枪势反而愈发清明。',
  stats: { hp: 200, speed: 0.078, jump: 0.37, weight: 0.95, energyMax: 100 },
  look: { scale: 1.02, bulk: 0.9, skin: '#e0b896', primary: '#2f7f8c', secondary: '#e8e2d0', accent: '#6fd3e0', weapon: 'spear', hood: false, cape: false, hair: 'ponytail', hairColor: '#17151c', feminine: true, skirt: true, legColor: '#ecebf2' },
  moves: toMap([
    // ---------- 轻攻击:长距离点刺 ----------
    // 点刺:起手,枪尖长判定
    mv('lp1', '点刺', L, 'thrust', [4, 3, 8], 5, box(0.3, 2.3, 1.0, 1.6, 0.7), [16, 4, 0.05], { chain: { LP: 'lp2' } }),
    // 连刺:中继
    mv('lp2', '连刺', L, 'thrust', [4, 3, 9], 6, box(0.3, 2.4, 0.9, 1.6, 0.7), [17, 4, 0.05], { chain: { LP: 'lp3' } }),
    // 贯枪:收尾,最远判定
    mv('lp3', '贯枪', L, 'thrust', [6, 4, 13], 9, box(0.3, 2.6, 0.9, 1.6, 0.7), [20, 6, 0.1], { moveX: 0.03 }),
    // 低踢:下段起手
    mv('lk1', '低踢', L, 'kick', [5, 3, 10], 6, box(0.2, 1.4, 0.2, 1.0, 0.8), [17, 4, 0.06], { chain: { LK: 'lk2' } }),
    // 回旋踢:收尾
    mv('lk2', '回旋踢', L, 'highKick', [6, 4, 13], 8, box(0.2, 1.5, 0.8, 1.7, 0.8), [20, 6, 0.12]),

    // ---------- 重攻击 ----------
    // 破阵枪:中继,中距离强力突刺
    mv('hp1', '破阵枪', H, 'thrust', [9, 4, 17], 12, box(0.3, 2.6, 0.7, 1.7, 0.8), [23, 8, 0.12], { chain: { HP: 'hp2' }, moveX: 0.05 }),
    // 回马枪:收尾,击倒
    mv('hp2', '回马枪', H, 'overhead', [11, 4, 20], 14, box(0.2, 2.5, 0.3, 2.0, 0.9), [24, 8, 0.16], { knockdown: true }),
    // 扫枪:挑空起手(launcher sweep),可跳跃取消追击
    mv('hk1', '扫枪', H, 'sweep', [9, 4, 18], 11, box(0.1, 2.4, 0, 1.0, 1.0), [24, 8, 0.03], { launch: 0.34, jumpCancel: true }),

    // ---------- 空中 ----------
    mv('jlp', '空刺', L, 'thrust', [4, 6, 8], 7, box(0, 2.2, -0.3, 1.3, 0.8), [18, 5, 0.04], { air: true, chain: { LP: 'jlp2' } }),
    mv('jlp2', '空刺·二', L, 'thrust', [4, 5, 8], 7, box(0, 2.3, -0.4, 1.3, 0.8), [18, 5, 0.04], { air: true }),
    // 撑杆坠击:撑杆借力斜向踢落,空中收尾,击倒
    mv('jhk', '撑杆坠击', H, 'airKick', [6, 10, 10], 13, box(0, 1.6, -1.0, 1.0, 0.9), [22, 8, 0.14], { air: true, knockdown: true, moveX: 0.1 }),

    // ---------- 抓取 ----------
    mv('grab', '擒龙手', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.0, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 20, throwDamage: 14, throwVx: 0.22, throwVy: 0.32 } }),

    // ---------- 指令技 ----------
    // 突进枪(↓→+LP):前冲长突,起手 / 追击
    mv('dash', '突进枪', C, 'thrust', [6, 8, 16], 13, box(0.3, 2.6, 0.6, 1.7, 0.8), [22, 8, 0.12], { moveX: 0.2 }),
    // 升龙枪(↓↑+HP):无敌升空挑空,中继 / 反击
    mv('rise', '升龙枪', C, 'upper', [5, 10, 20], 14, box(0, 1.6, 0.2, 2.8, 0.8), [24, 9, 0.02], { launch: 0.36, selfLaunch: 0.28, invuln: 7 }),
    // 退步突(↓←+HP):后撤同时回刺,拉开距离
    mv('backstab', '退步突', C, 'thrust', [7, 5, 16], 12, box(0.3, 2.6, 0.7, 1.7, 0.8), [22, 8, 0.1], { teleport: -1.2 }),

    // ---------- 技能 ----------
    // 乱舞突(S1):多段连刺,rehit,用于压制与挑空后追击
    mv('flurry', '乱舞突', S, 'thrust', [8, 20, 18], 6, box(0.3, 2.6, 0.6, 1.8, 0.8), [20, 3, 0.03], { cost: 25, rehit: 4 }),
    // 寒枪波(S2):穿透枪气,中远距离牵制
    mv('wave', '寒枪波', S, 'cast', [12, 2, 20], 16, box(0, 0, 0, 0, 0.6), [22, 6, 0.12], { cost: 20, projectile: { speed: 0.34, life: 50, radius: 0.3, y: 1.1, color: '#6fd3e0', pierce: true } }),
    // 龙卷枪(S3):旋枪大范围挑空,收尾 / 浮空起手
    mv('twister', '龙卷枪', S, 'spin', [9, 6, 22], 20, box(-1.8, 2.5, 0, 2.2, 1.2), [24, 9, 0.04], { cost: 30, launch: 0.35 }),
    // 奥义·千影枪(S4):长时间无敌的多段连刺,最后挑空
    mv('storm', '千影枪', U, 'thrust', [10, 28, 28], 8, box(-0.4, 2.6, 0.2, 2.4, 1.2), [24, 4, 0.02], { cost: 60, rehit: 4, invuln: 40, launch: 0.2 }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jhk', LK: 'jlp', HK: 'jhk' },
  commands: [
    { motion: 'DF', button: 'LP', move: 'dash' },
    { motion: 'DU', button: 'HP', move: 'rise' },
    { motion: 'DU', button: 'HK', move: 'rise' },
    { motion: 'DB', button: 'HP', move: 'backstab' },
  ],
  skills: ['flurry', 'wave', 'twister', 'storm'],
};
