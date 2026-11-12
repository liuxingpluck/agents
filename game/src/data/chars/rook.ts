// 洛克 Rook —— 近战格斗家。
// 打法:赤手空拳,全员最长的拳脚连段(LP 四连、LK 三连),帧数极快,压制与近身抓投并重。
// 有两种抓取:普通抓(轻拳+轻脚)与指令抓(↓← + 重拳,更痛但出手慢);升龙拳挑空后可跳跃取消追击。
// 推荐连招 1:LP → LP → LP → LP(第四拳击倒)收尾,近身压制。
// 推荐连招 2:HK 挑空 → 跳跃取消 → 空中 LP → 空中 LK 坠击;或 ↓↑+HP 升龙 → 乱打(S1)。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const rook: CharacterDef = {
  id: 'rook', name: '洛克', title: '无名拳士', role: 'brawler',
  lore: '灰雪路上的赏金拳手,遗物是女王名字里的一个鼻音——每挥出一拳,他就忘掉一场擂台上的败仗,却唯独记得疼。他不信神明,只信拳头能把名字砸回深渊。',
  stats: { hp: 200, speed: 0.075, jump: 0.35, weight: 1.05, energyMax: 100 },
  look: { scale: 1.02, bulk: 1.1, skin: '#c58b66', primary: '#b8442a', secondary: '#2f3a4a', accent: '#f2c14e', weapon: 'none' },
  moves: toMap([
    // ---------- 轻拳链:四连(起手 / 中继 / 收尾) ----------
    // 起手刺拳:最快的起手,可接 LP 或转抓
    mv('lp1', '直拳', L, 'punchL', [3, 2, 7], 4, box(0.2, 1.1, 0.9, 1.6), [15, 3, 0.04], { chain: { LP: 'lp2' } }),
    // 中继:右勾拳
    mv('lp2', '勾拳', L, 'punchR', [3, 2, 8], 5, box(0.2, 1.15, 0.9, 1.6), [15, 3, 0.04], { chain: { LP: 'lp3' } }),
    // 中继:追击拳,带轻微前冲
    mv('lp3', '连环拳', L, 'punchL', [4, 3, 8], 6, box(0.2, 1.2, 0.8, 1.6), [16, 4, 0.05], { chain: { LP: 'lp4' }, moveX: 0.02 }),
    // 收尾:重击右拳,击倒
    mv('lp4', '崩拳', L, 'punchR', [5, 4, 13], 10, box(0.2, 1.4, 0.8, 1.7), [20, 6, 0.14], { knockdown: true, moveX: 0.04 }),
    // ---------- 轻脚链:三连 ----------
    mv('lk1', '低扫腿', L, 'kick', [4, 3, 8], 5, box(0.2, 1.2, 0.2, 0.9), [16, 3, 0.05], { chain: { LK: 'lk2' } }),
    mv('lk2', '膝撞', L, 'kick', [4, 3, 9], 6, box(0.2, 1.1, 0.5, 1.3), [17, 4, 0.05], { chain: { LK: 'lk3' } }),
    // 收尾:高踢
    mv('lk3', '回旋高踢', L, 'highKick', [5, 4, 12], 9, box(0.2, 1.5, 0.9, 1.8), [20, 6, 0.12]),
    // ---------- 重攻击 ----------
    // 重拳:中继,可接第二段
    mv('hp1', '贯拳', H, 'thrust', [8, 4, 17], 12, box(0.2, 1.5, 0.8, 1.7), [22, 7, 0.1], { chain: { HP: 'hp2' }, moveX: 0.04 }),
    // 收尾:肘击击倒
    mv('hp2', '碎肘', H, 'overhead', [9, 4, 20], 15, box(0.2, 1.6, 0.5, 1.9), [24, 9, 0.16], { knockdown: true }),
    // 挑空:升龙拳,命中后可跳跃取消接空中连段
    mv('hk1', '升龙拳', H, 'upper', [8, 4, 17], 12, box(0.1, 1.2, 0.3, 2.3), [24, 8, 0.03], { launch: 0.34, jumpCancel: true }),
    // ---------- 空中普通技 ----------
    mv('jlp', '空中连拳', L, 'airSlash', [3, 5, 8], 6, box(0, 1.3, -0.2, 1.5), [17, 4, 0.04], { air: true, chain: { LP: 'jlp2' } }),
    mv('jlp2', '空中重拳', L, 'airSlash', [4, 5, 8], 7, box(0, 1.4, -0.2, 1.5), [18, 5, 0.05], { air: true }),
    // 收尾:踩踏坠击,击倒
    mv('jlk', '坠踢', H, 'airKick', [6, 10, 10], 12, box(0, 1.2, -0.8, 1.0), [22, 8, 0.14], { air: true, knockdown: true }),
    // ---------- 抓取 ----------
    // 普通抓(轻拳+轻脚):近身起手,抓后摔出
    mv('grab', '过肩摔', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.0, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 20, throwDamage: 15, throwVx: 0.2, throwVy: 0.3 } }),
    // ---------- 指令技 ----------
    // ↓→ + LP:突进直拳,中继接 LP 追击
    mv('dash', '冲拳', C, 'thrust', [6, 5, 15], 13, box(0.2, 1.9, 0.7, 1.6), [22, 8, 0.12], { moveX: 0.18 }),
    // ↓↑ + HP:升龙拳(带短暂无敌的反击挑空)
    mv('rise', '升龙·改', C, 'upper', [5, 8, 20], 15, box(0, 1.3, 0.2, 2.5), [24, 9, 0.02], { launch: 0.36, selfLaunch: 0.28, invuln: 7, jumpCancel: true }),
    // ↓← + HP:指令抓,慢但伤害高,抓后重摔
    mv('cgrab', '裂地摔', C, 'slam', [9, 3, 22], 4, box(0.1, 1.1, 0.3, 1.7, 0.5), [10, 4, 0], { grab: { hold: 26, throwDamage: 22, throwVx: 0.12, throwVy: 0.36 } }),
    // ---------- 技能 ----------
    // 技能1:乱打,多段拳雨(中继 / 压制)
    mv('barrage', '百裂乱打', S, 'punchL', [5, 18, 18], 5, box(0.2, 1.5, 0.7, 1.7, 0.9), [20, 3, 0.03], { cost: 20, rehit: 3, moveX: 0.02 }),
    // 技能2:铁山靠,霸体单段击倒(收尾 / 反击)
    mv('ram', '铁山靠', S, 'slam', [10, 4, 20], 20, box(0.2, 1.7, 0.3, 1.9), [24, 9, 0.22], { cost: 25, knockdown: true, armor: true, moveX: 0.12 }),
    // 技能3:冲天拳,强挑空(起手 / 空战启动)
    mv('sky', '冲天拳', S, 'upper', [7, 6, 22], 18, box(0, 1.4, 0.2, 2.6), [24, 8, 0.02], { cost: 30, launch: 0.38, selfLaunch: 0.3, invuln: 6, jumpCancel: true }),
    // 奥义:千拳,长时间多段并带无敌
    mv('titan', '无名千拳', U, 'punchR', [10, 30, 30], 8, box(-0.2, 2.2, 0.3, 2.2, 1.3), [24, 4, 0.03], { cost: 60, rehit: 4, invuln: 40, knockdown: true }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jlk', LK: 'jlk', HK: 'jlk' },
  commands: [
    { motion: 'DF', button: 'LP', move: 'dash' },
    { motion: 'DU', button: 'HP', move: 'rise' },
    { motion: 'DB', button: 'HP', move: 'cgrab' },
  ],
  skills: ['barrage', 'ram', 'sky', 'titan'],
};
