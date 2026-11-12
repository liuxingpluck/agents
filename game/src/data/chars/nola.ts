// 诺拉 Nola —— 圣职 / 辅助法师。
// 打法:生命偏低,但拥有两档治疗(小而快的「微光」、大范围的「圣域」)与超长的奥义治疗,
// 治疗对 4 米内队友生效。圣光弹与光柱提供中远距离控制,近身用权杖点打。
// 推荐连招:
//   1. 权杖(LP×3) → 光柱(↓↑+HP 挑空) → 空中权杖(LP)×2 → 圣锤坠击
//   2. 圣光弹(S3)牵制 → 突进 → 制裁(↓→+LP) → 光辉审判(S4)
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const nola: CharacterDef = {
  id: 'nola', name: '诺拉', title: '圣光祷者', role: 'support',
  lore: '泣骨修道院里唯一没有停止歌唱的修女。她的遗物是女王名字的第九个音节;每一次祈祷,她都会忘掉一位被自己治愈的人的脸,却仍记得要继续治愈下一个。',
  stats: { hp: 190, speed: 0.06, jump: 0.34, weight: 0.9, energyMax: 100 },
  look: { scale: 0.98, bulk: 0.9, skin: '#ecc9a8', primary: '#f0ead6', secondary: '#c9a227', accent: '#fff3a8', weapon: 'mace', hood: true, cape: true, glow: '#fff3a8' },
  moves: toMap([
    // ---------- 轻攻击:权杖点打 ----------
    mv('lp1', '权杖点', L, 'punchL', [4, 3, 9], 5, box(0.2, 1.4, 0.8, 1.6, 0.8), [16, 4, 0.05], { chain: { LP: 'lp2' } }),
    mv('lp2', '权杖挥', L, 'punchR', [5, 3, 10], 6, box(0.2, 1.5, 0.8, 1.6, 0.8), [17, 4, 0.05], { chain: { LP: 'lp3' } }),
    // 圣光重击:收尾
    mv('lp3', '圣光击', L, 'slash', [6, 4, 13], 9, box(0.2, 1.7, 0.6, 1.7, 0.9), [20, 6, 0.1], { moveX: 0.03 }),
    mv('lk1', '前踢', L, 'kick', [5, 3, 10], 6, box(0.2, 1.3, 0.3, 1.1, 0.8), [17, 4, 0.06], { chain: { LK: 'lk2' } }),
    mv('lk2', '回旋踢', L, 'highKick', [6, 4, 13], 8, box(0.2, 1.4, 0.8, 1.7, 0.8), [20, 6, 0.12]),

    // ---------- 重攻击 ----------
    // 圣锤:中继
    mv('hp1', '圣锤', H, 'overhead', [10, 4, 18], 12, box(0.2, 1.8, 0.3, 2.1, 0.9), [23, 8, 0.12], { chain: { HP: 'hp2' }, moveX: 0.03 }),
    // 圣锤·落:收尾,击倒
    mv('hp2', '裁决锤', H, 'slam', [12, 4, 22], 15, box(0.2, 1.9, 0, 2.0, 1.0), [24, 9, 0.16], { knockdown: true }),
    // 挑杖:挑空起手
    mv('hk1', '挑杖', H, 'upper', [9, 4, 18], 11, box(0.1, 1.3, 0.3, 2.2, 0.9), [24, 8, 0.03], { launch: 0.31, jumpCancel: true }),

    // ---------- 空中 ----------
    mv('jlp', '空中权杖', L, 'airSlash', [4, 6, 8], 7, box(0, 1.5, -0.3, 1.4, 0.8), [18, 5, 0.04], { air: true, chain: { LP: 'jlp2' } }),
    mv('jlp2', '空中权杖·二', L, 'airSlash', [4, 5, 8], 7, box(0, 1.5, -0.3, 1.5, 0.8), [18, 5, 0.04], { air: true }),
    mv('jhk', '圣锤坠击', H, 'airKick', [6, 10, 10], 12, box(0, 1.3, -0.8, 1.0, 0.9), [22, 8, 0.14], { air: true, knockdown: true }),

    // ---------- 抓取 ----------
    // 圣缚:以光链缚住对手后甩出
    mv('grab', '圣缚', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.0, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 22, throwDamage: 13, throwVx: 0.2, throwVy: 0.3 } }),

    // ---------- 指令技 ----------
    // 制裁(↓→+LP):前冲一击,起手 / 追击
    mv('smite', '制裁', C, 'slam', [7, 6, 16], 13, box(0.2, 1.8, 0.3, 1.9, 0.9), [22, 8, 0.12], { moveX: 0.12 }),
    // 光柱(↓↑+HP):脚下升起光柱,挑空,连段中继 / 浮空起手
    mv('pillar', '光柱', C, 'upper', [8, 8, 20], 14, box(0.3, 1.9, 0, 2.8, 0.9), [24, 9, 0.02], { launch: 0.36, invuln: 6 }),
    // 圣光闪避(↓←+LK):向后瞬移并留下光爆,脱身
    mv('blink', '光之跃', C, 'cast', [6, 4, 16], 12, box(0.2, 1.6, 0.3, 1.9, 0.9), [22, 8, 0.1], { teleport: -2.0, knockdown: true }),

    // ---------- 技能 ----------
    // 微光(S1):小治疗,快速,可在连段间隙插入
    mv('mend', '微光', S, 'cast', [6, 2, 16], 14, box(0.1, 1.2, 0.3, 1.8, 0.9), [20, 5, 0.06], { cost: 15, heal: 25 }),
    // 圣域(S2):大治疗,前摇长,周围爆发击倒
    mv('sanctuary', '圣域', S, 'cast', [14, 3, 26], 16, box(-1.6, 1.6, 0, 2.2, 1.2), [24, 8, 0.1], { cost: 35, heal: 65, knockdown: true }),
    // 圣光弹(S3):慢速弹体,中远距离牵制
    mv('holybolt', '圣光弹', S, 'cast', [12, 2, 20], 18, box(0, 0, 0, 0, 0.6), [22, 6, 0.12], { cost: 20, projectile: { speed: 0.28, life: 60, radius: 0.4, y: 1.1, color: '#fff3a8' } }),
    // 奥义·光辉审判(S4):大范围多段圣光,无敌,出手同时治疗全队,最后挑空
    mv('judgement', '光辉审判', U, 'cast', [10, 30, 30], 8, box(-2.6, 2.8, 0, 2.8, 1.8), [24, 4, 0.02], { cost: 60, rehit: 5, invuln: 44, heal: 45, launch: 0.2 }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jhk', LK: 'jlp', HK: 'jhk' },
  commands: [
    { motion: 'DF', button: 'LP', move: 'smite' },
    { motion: 'DU', button: 'HP', move: 'pillar' },
    { motion: 'DU', button: 'HK', move: 'pillar' },
    { motion: 'DB', button: 'LK', move: 'blink' },
  ],
  skills: ['mend', 'sanctuary', 'holybolt', 'judgement'],
};
