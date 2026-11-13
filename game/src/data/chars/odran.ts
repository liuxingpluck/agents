// 奥丁 Odran —— 狂战士。
// 打法:双手巨斧,移动慢、出手慢,但每一击都是赛场最高的伤害。重攻击与技能大多带霸体,
// 可以硬吃小怪的攻击强行换血;判定宽大,适合在人群中站桩清场。靠跃斩与抓取拉近距离。
// 推荐连招:
//   1. 挑斧(HK) → 落地后 裂颅(↓→+HP) 收尾,打出高额击倒
//   2. 劈斩(HP) → 碎颅(HP) → 断头斩(S1) 霸体压制到底
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const odran: CharacterDef = {
  id: 'odran', name: '奥丁', title: '狂怒巨斧', role: 'berserker',
  lore: '北境山地部族最后的战吼者。他的遗物是女王名字的第四个音节,每挥一次斧,他就忘掉一个曾被他保护的人——现在他只记得要不停地挥下去。',
  stats: { hp: 260, speed: 0.058, jump: 0.33, weight: 1.3, energyMax: 100 },
  look: { scale: 1.1, bulk: 1.3, skin: '#b98b6a', primary: '#8a2f1e', secondary: '#4a3a2c', accent: '#e8b04a', weapon: 'axe', horns: true, cape: false, hair: 'long', hairColor: '#a8431f' },
  moves: toMap([
    // ---------- 轻攻击:起手与短连段 ----------
    // 斧柄击:起手,快速打断
    mv('lp1', '斧柄击', L, 'punchL', [5, 3, 10], 8, box(0.2, 1.5, 0.8, 1.6, 0.9), [17, 4, 0.06], { chain: { LP: 'lp2' } }),
    // 肘击:中继
    mv('lp2', '肘击', L, 'punchR', [5, 3, 11], 9, box(0.2, 1.5, 0.8, 1.6, 0.9), [18, 4, 0.06], { chain: { LP: 'lp3' } }),
    // 横劈:收尾,宽判定,击退稍大
    mv('lp3', '横劈', L, 'slash', [6, 4, 13], 10, box(0.2, 1.9, 0.5, 1.8, 1.1), [20, 6, 0.12], { moveX: 0.03 }),
    // 踢击:下段起手
    mv('lk1', '蛮踢', L, 'kick', [5, 3, 10], 7, box(0.2, 1.4, 0.3, 1.1, 0.9), [17, 4, 0.06], { chain: { LK: 'lk2' } }),
    // 膝撞:收尾
    mv('lk2', '顶膝', L, 'highKick', [6, 4, 13], 9, box(0.2, 1.4, 0.7, 1.7, 0.9), [20, 6, 0.12]),

    // ---------- 重攻击:霸体、高伤害 ----------
    // 劈斩:中继,带霸体
    mv('hp1', '劈斩', H, 'overhead', [12, 4, 22], 18, box(0.2, 2.0, 0.2, 2.2, 1.2), [25, 8, 0.12], { chain: { HP: 'hp2' }, moveX: 0.03, armor: true }),
    // 碎颅:收尾,击倒
    mv('hp2', '碎颅', H, 'slam', [14, 5, 24], 19, box(0.2, 2.1, 0, 2.1, 1.2), [26, 9, 0.18], { knockdown: true, armor: true }),
    // 挑斧:挑空起手,可跳跃取消追击
    mv('hk1', '挑斧', H, 'upper', [11, 4, 20], 14, box(0.1, 1.7, 0.2, 2.3, 1.1), [24, 8, 0.03], { launch: 0.32, jumpCancel: true, armor: true }),

    // ---------- 空中 ----------
    mv('jlp', '空劈', L, 'airSlash', [5, 6, 9], 9, box(0, 1.7, -0.3, 1.6, 1.0), [18, 5, 0.04], { air: true, chain: { LP: 'jlp2' } }),
    mv('jlp2', '回旋空劈', L, 'airSlash', [5, 5, 9], 9, box(-0.6, 1.7, -0.3, 1.6, 1.0), [18, 5, 0.04], { air: true }),
    // 坠击:空中下砸,击倒
    mv('jhk', '陨斧', H, 'airKick', [8, 10, 12], 15, box(0, 1.6, -0.9, 1.1, 1.1), [23, 8, 0.14], { air: true, knockdown: true }),

    // ---------- 抓取 ----------
    // 抓取:无视霸体,拎起后猛掼
    mv('grab', '断骨摔', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.1, 0.4, 1.7, 0.6), [10, 4, 0], { grab: { hold: 24, throwDamage: 20, throwVx: 0.18, throwVy: 0.3 } }),

    // ---------- 指令技 ----------
    // 跃斩(↓↑+HP):跳起后砸下,拉近距离的起手技,击倒
    mv('leap', '跃斩', C, 'slam', [10, 8, 22], 18, box(0.2, 2.2, -0.3, 1.8, 1.2), [26, 9, 0.16], { selfLaunch: 0.3, moveX: 0.1, knockdown: true }),
    // 蛮牛冲(↓→+LP):霸体前冲,中继 / 起手
    mv('charge', '蛮牛冲', C, 'thrust', [7, 8, 18], 13, box(0.2, 1.9, 0.3, 1.9, 1.1), [23, 8, 0.14], { moveX: 0.16, armor: true }),
    // 裂颅(↓→+HP):高伤害收尾,击倒
    mv('cleave', '裂颅', C, 'overhead', [12, 5, 22], 18, box(0.2, 2.2, 0, 2.2, 1.2), [26, 9, 0.18], { knockdown: true, armor: true }),
    // 扫堂(←→+LK,BF 即后接前):下段扫击,击倒,用于抢起身
    mv('sweepAxe', '扫堂', C, 'sweep', [8, 5, 17], 14, box(0.1, 2.0, 0, 0.8, 1.2), [24, 8, 0.12], { knockdown: true }),

    // ---------- 技能 ----------
    // 断头斩(S1):霸体单段重击,挑空,可接空中追击
    mv('maul', '断头斩', S, 'upper', [10, 5, 20], 24, box(0.1, 2.0, 0.1, 2.4, 1.2), [25, 9, 0.05], { cost: 20, armor: true, launch: 0.33 }),
    // 狂旋斧(S2):旋转多段,霸体,清场与压制
    mv('whirl', '狂旋斧', S, 'spin', [8, 24, 18], 8, box(-2.0, 2.0, 0.2, 1.9, 1.3), [20, 3, 0.02], { cost: 25, rehit: 6, armor: true }),
    // 裂地击(S3):巨大范围砸地,击倒
    mv('quake', '裂地击', S, 'slam', [14, 6, 26], 24, box(-0.5, 2.6, 0, 1.3, 1.3), [26, 10, 0.06], { cost: 30, knockdown: true, armor: true }),
    // 奥义·血怒乱舞(S4):长时间无敌 + 霸体的多段旋斩,最后挑空
    mv('rage', '血怒乱舞', U, 'spin', [10, 32, 32], 9, box(-2.4, 2.6, 0, 2.6, 1.6), [24, 4, 0.02], { cost: 60, rehit: 5, invuln: 46, armor: true, launch: 0.2 }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jhk', LK: 'jlp', HK: 'jhk' },
  commands: [
    { motion: 'DU', button: 'HP', move: 'leap' },
    { motion: 'DF', button: 'LP', move: 'charge' },
    { motion: 'DF', button: 'HP', move: 'cleave' },
    { motion: 'BF', button: 'LK', move: 'sweepAxe' },
  ],
  skills: ['maul', 'whirl', 'quake', 'rage'],
};
