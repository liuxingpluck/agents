// 薇丝 Vesper —— 刺客。
// 打法:双匕、最快移速、低血量。靠瞬身穿越拉开/贴近,多段快斩叠连击数,背后打出爆发。
// 瞬身类招式在出手帧位移,判定框按位移后的位置书写(穿越类的框在身后)。
// 推荐连招 1:LP → LP → LP → ↓→+LP(穿越斩收尾)→ S1 影缝闪。
// 推荐连招 2:HK 挑空 → 跳跃取消 → 空中 HK 俯冲 → 落地 S3 无声终结。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const vesper: CharacterDef = {
  id: 'vesper', name: '薇丝', title: '无声之影', role: 'assassin',
  lore: '深根矿道里替人收债的杀手,遗物是女王名字里最轻的一个气音。她每次瞬身都会忘掉一张脸,如今已认不出自己的雇主,只记得刀该落在哪里。',
  stats: { hp: 170, speed: 0.085, jump: 0.38, weight: 0.85, energyMax: 100 },
  look: { scale: 0.96, bulk: 0.85, skin: '#d9b8a0', primary: '#3a2a55', secondary: '#7a2f8f', accent: '#c8f06a', weapon: 'daggers', hood: true, cape: true },
  moves: toMap([
    // ---------- 轻拳链:三段快斩 ----------
    mv('lp1', '划刺', L, 'slash', [3, 3, 7], 4, box(0.2, 1.3, 0.8, 1.6), [15, 3, 0.04], { chain: { LP: 'lp2' } }),
    mv('lp2', '反手斩', L, 'slash', [3, 3, 8], 5, box(0.2, 1.35, 0.8, 1.6), [15, 3, 0.04], { chain: { LP: 'lp3' } }),
    // 收尾:交叉斩,轻微前冲
    mv('lp3', '交叉斩', L, 'slash', [5, 4, 12], 9, box(0.2, 1.6, 0.7, 1.7), [20, 5, 0.1], { moveX: 0.04 }),
    // ---------- 轻脚链 ----------
    mv('lk1', '踢膝', L, 'kick', [4, 3, 8], 5, box(0.2, 1.2, 0.3, 1.1), [16, 3, 0.05], { chain: { LK: 'lk2' } }),
    // 收尾:回旋刃
    mv('lk2', '回旋切', L, 'spin', [5, 4, 12], 8, box(-0.5, 1.5, 0.7, 1.6), [20, 5, 0.1]),
    // ---------- 重攻击 ----------
    // 中继:突刺,可接第二段
    mv('hp1', '穿喉刺', H, 'thrust', [8, 4, 16], 12, box(0.2, 1.9, 0.9, 1.7), [22, 7, 0.1], { chain: { HP: 'hp2' }, moveX: 0.06 }),
    // 收尾:下劈击倒
    mv('hp2', '断筋', H, 'overhead', [9, 4, 18], 14, box(0.2, 1.6, 0.2, 1.8), [24, 9, 0.14], { knockdown: true }),
    // 挑空:上撩,命中后可跳跃取消
    mv('hk1', '上撩斩', H, 'upper', [8, 4, 17], 11, box(0.1, 1.3, 0.3, 2.3), [24, 8, 0.03], { launch: 0.32, jumpCancel: true }),
    // ---------- 空中普通技 ----------
    mv('jlp', '空中双刃', L, 'airSlash', [3, 6, 8], 6, box(0, 1.5, -0.3, 1.5), [17, 4, 0.04], { air: true, chain: { LP: 'jlp2' } }),
    mv('jlp2', '空中回斩', L, 'airSlash', [4, 5, 8], 7, box(0, 1.6, -0.3, 1.5), [18, 5, 0.05], { air: true }),
    // 空中俯冲:斜向下冲刺击倒(收尾)
    mv('jdive', '坠影俯冲', H, 'airKick', [7, 12, 10], 14, box(0, 1.4, -1.0, 0.9), [22, 8, 0.16], { air: true, knockdown: true, moveX: 0.1 }),
    // ---------- 抓取 ----------
    // 抓取(轻拳+轻脚):按肩割喉后甩出
    mv('grab', '绞颈甩', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.0, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 18, throwDamage: 14, throwVx: 0.22, throwVy: 0.28 } }),
    // ---------- 指令技 ----------
    // ↓→ + LP:穿越斩,瞬身 1.8 米穿过对手,判定在身后(起手 / 换位)
    mv('thru', '穿影斩', C, 'slash', [5, 5, 14], 12, box(-2.0, 0.4, 0.5, 1.7, 0.9), [22, 8, 0.1], { teleport: 1.8 }),
    // ←→ + LK:后侧瞬身回刺,先瞬到前方再扫回(中继 / 骗招)
    mv('flick', '回影刺', C, 'thrust', [6, 5, 16], 13, box(-1.4, 0.3, 0.4, 1.6, 0.9), [22, 8, 0.12], { teleport: 1.2 }),
    // ↓↑ + HP:升空斩,带无敌的反击挑空
    mv('rise', '逆影升斩', C, 'upper', [5, 8, 20], 14, box(0, 1.3, 0.2, 2.5), [24, 9, 0.02], { launch: 0.34, selfLaunch: 0.3, invuln: 7, jumpCancel: true }),
    // ---------- 技能 ----------
    // 技能1:影缝闪,多段快斩(连段中继)
    mv('flurry', '影缝闪', S, 'slash', [6, 14, 16], 5, box(0.2, 1.7, 0.5, 1.7, 0.9), [20, 3, 0.03], { cost: 20, rehit: 3, moveX: 0.06 }),
    // 技能2:瞬杀·背袭,瞬身 2.2 米穿到对手身后再斩(起手 / 突进)
    mv('blink', '瞬身背袭', S, 'slash', [8, 5, 20], 20, box(-1.2, 1.0, 0.4, 1.8, 1.0), [24, 8, 0.1], { cost: 25, teleport: 2.2, knockdown: true }),
    // 技能3:无声终结,单段高伤击倒(收尾)
    mv('silent', '无声终结', S, 'thrust', [12, 4, 24], 24, box(0.2, 2.0, 0.6, 1.8), [26, 10, 0.2], { cost: 30, knockdown: true, moveX: 0.14 }),
    // 奥义:千影乱舞,长时间无敌多段
    mv('dance', '千影乱舞', U, 'spin', [10, 30, 30], 7, box(-2.0, 2.4, 0.2, 2.2, 1.4), [24, 4, 0.02], { cost: 60, rehit: 4, invuln: 44, knockdown: true }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jdive', LK: 'jlp', HK: 'jdive' },
  commands: [
    { motion: 'DF', button: 'LP', move: 'thru' },
    { motion: 'BF', button: 'LK', move: 'flick' },
    { motion: 'DU', button: 'HP', move: 'rise' },
  ],
  skills: ['flurry', 'blink', 'silent', 'dance'],
};
