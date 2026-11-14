// 布琳 Brynn —— 坦克(塔盾 + 战锤)
// 打法:速度慢、体型大、血厚,大量招式带霸体,可以顶着对手的攻击硬换伤害。
// 靠「盾冲」贴脸,用挑锤 / 震地把对手打起来,「鼓舞」可在近身缠斗中回血。
// 推荐连招 1:LP → LP → LP(盾拳 盾拳 锤挥)→ 轻转重 HP → HP(战锤劈 碎颅)击倒收尾。
// 推荐连招 2:盾冲(↓→+LP)命中 → 挑锤(HK)挑空 → 空中 LP → 坠击 JHK 收尾。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const brynn: CharacterDef = {
  id: 'brynn', name: '布琳', title: '不动之盾', role: 'tank',
  lore: '王都外城最后一道城门的守卫长。她的遗物是女王名字里「守」的那一笔——每挡下一击,她就忘掉一张曾被她守护过的脸。',
  stats: { hp: 320, speed: 0.055, jump: 0.33, weight: 1.5, energyMax: 100 },
  look: { scale: 1.1, bulk: 1.4, skin: '#b88a6e', primary: '#3f6b8c', secondary: '#c8a24a', accent: '#e8e2d0', weapon: 'hammer', shield: true, horns: false, cape: false, hair: 'braid', hairColor: '#e0b860', feminine: true, skirt: true, legColor: '#17171e' },
  moves: toMap([
    // ===== 地面轻攻击:盾拳链(起手 / 中继) =====
    // 起手:盾牌前顶,可接 LP
    mv('lp1', '盾顶', L, 'punchL', [5, 3, 10], 6, box(0.2, 1.2, 0.8, 1.6), [16, 4, 0.05], { chain: { LP: 'lp2' } }),
    // 中继:另一侧盾拳,可接 LP
    mv('lp2', '盾拳', L, 'punchR', [5, 3, 11], 7, box(0.2, 1.25, 0.8, 1.6), [17, 4, 0.05], { chain: { LP: 'lp3' } }),
    // 收尾:战锤横挥,带霸体
    mv('lp3', '锤挥', L, 'slash', [6, 4, 13], 10, box(0.2, 1.8, 0.6, 1.7, 0.9), [20, 6, 0.12], { armor: true, moveX: 0.02 }),
    // 起手:前踢
    mv('lk1', '重靴踢', L, 'kick', [5, 3, 10], 6, box(0.2, 1.3, 0.3, 1.1), [17, 4, 0.06], { chain: { LK: 'lk2' } }),
    // 收尾:盾踢,带霸体
    mv('lk2', '盾踢', L, 'highKick', [6, 4, 13], 9, box(0.2, 1.4, 0.7, 1.7), [20, 6, 0.1], { armor: true }),

    // ===== 地面重攻击(全部带霸体) =====
    // 中继:战锤下劈,可接 HP
    mv('hp1', '战锤劈', H, 'overhead', [12, 4, 22], 15, box(0.2, 2.0, 0.2, 2.2, 1.0), [24, 8, 0.1], { armor: true, chain: { HP: 'hp2' }, moveX: 0.03 }),
    // 收尾:碎颅重砸,击倒
    mv('hp2', '碎颅', H, 'slam', [14, 4, 24], 18, box(0.2, 2.0, 0, 2.1, 1.0), [24, 9, 0.16], { armor: true, knockdown: true }),
    // 挑空:战锤自下向上挑,开启空中追击
    mv('hk1', '挑锤', H, 'upper', [11, 4, 22], 13, box(0.1, 1.5, 0.2, 2.3), [24, 8, 0.03], { armor: true, launch: 0.32, jumpCancel: true }),

    // ===== 空中普通技 =====
    mv('jlp', '空中锤击', L, 'airSlash', [5, 5, 9], 8, box(0, 1.5, -0.3, 1.4), [18, 5, 0.04], { air: true, chain: { LP: 'jlp2' } }),
    mv('jlp2', '空中盾砸', L, 'airSlash', [5, 5, 9], 8, box(0, 1.5, -0.3, 1.5), [18, 5, 0.04], { air: true }),
    // 空中收尾:坠击击倒
    mv('jhk', '千钧坠', H, 'airKick', [8, 10, 12], 14, box(0, 1.4, -0.9, 1.0), [22, 8, 0.14], { air: true, knockdown: true }),

    // ===== 抓取 =====
    mv('grab', '盾抛', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.0, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 22, throwDamage: 17, throwVx: 0.18, throwVy: 0.28 } }),

    // ===== 指令技 =====
    // 盾冲(↓→+LP):霸体前冲撞飞,起手 / 突进用,击倒
    mv('charge', '盾冲', C, 'thrust', [8, 8, 18], 14, box(0.2, 1.9, 0.3, 1.9, 1.0), [24, 8, 0.2], { armor: true, moveX: 0.16, knockdown: true }),
    // 震地(↓↑+HP;↓↓+重 已经是通用的格挡指令):战锤砸地,近身挑空,中继 / 挑空起手
    mv('pound', '震地锤', C, 'slam', [11, 5, 22], 15, box(0, 2.2, 0, 1.2, 1.2), [24, 9, 0.04], { armor: true, launch: 0.34 }),
    // 反击(↓←+HP):霸体回旋锤,吃一下打一下,击倒
    mv('counter', '铁壁反击', C, 'spin', [9, 6, 20], 14, box(-1.5, 1.7, 0.2, 1.9, 1.1), [24, 9, 0.18], { armor: true, knockdown: true }),

    // ===== 技能 =====
    // 鼓舞(S1):嘲讽式怒吼,霸体并为自己与附近队友回血
    mv('roar', '不屈怒吼', S, 'cast', [8, 3, 22], 14, box(-1.4, 1.4, 0, 2.0, 1.2), [20, 5, 0.1], { cost: 30, armor: true, heal: 45 }),
    // 裂地(S2):重锤砸地,大范围挑空,连段起手
    mv('quake', '裂地', S, 'slam', [14, 5, 24], 20, box(-0.4, 2.6, 0, 1.2, 1.3), [26, 10, 0.05], { cost: 25, armor: true, launch: 0.33 }),
    // 盾墙旋击(S3):霸体多段回旋,压制围攻
    mv('bulwark', '壁垒旋击', S, 'spin', [8, 20, 18], 6, box(-1.7, 1.7, 0.3, 1.7, 1.1), [20, 3, 0.03], { cost: 20, armor: true, rehit: 5 }),
    // 奥义(S4):无敌多段重锤,最后击飞
    mv('bastion', '不动如山', U, 'slam', [10, 30, 30], 8, box(-2.3, 2.5, 0, 2.5, 1.6), [24, 4, 0.02], { cost: 60, rehit: 6, invuln: 40, armor: true, launch: 0.2 }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jlp', LK: 'jhk', HK: 'jhk' },
  commands: [
    { motion: 'DF', button: 'LP', move: 'charge' },
    { motion: 'DF', button: 'HP', move: 'charge' },
    { motion: 'DU', button: 'HP', move: 'pound' },
    { motion: 'DB', button: 'HP', move: 'counter' },
  ],
  skills: ['roar', 'quake', 'bulwark', 'bastion'],
};

export const extras: CharacterDef[] = [];
