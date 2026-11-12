// 莫甘 Morgan —— 死灵法师。
// 打法:法杖近身自保,靠召唤骸骨(最多 2 只)牵制,吸血续航,骨矛远程消耗;
// 奥义灵魂爆裂是大范围多段。血量低,适合躲在骷髅身后打。
// 推荐连招 1:LP → LP → LP → S2 汲魂(吸血收尾)。
// 推荐连招 2:HK 挑空 → 跳跃取消 → 空中 LP → 落地 S3 骨矛。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const morgan: CharacterDef = {
  id: 'morgan', name: '莫甘', title: '唤骨者', role: 'summoner',
  lore: '修道院地窖里的守墓人,遗物是女王名字里一个沉在泥土中的音节。每唤醒一具骸骨,她就忘掉一位亲人的名字——如今身边只剩死者还愿意回应她。',
  stats: { hp: 165, speed: 0.06, jump: 0.34, weight: 0.9, energyMax: 100 },
  look: { scale: 1, bulk: 0.9, skin: '#b9b5a8', primary: '#2d4a3e', secondary: '#1c1c26', accent: '#7dffb0', weapon: 'staff', hood: true, cape: true, glow: '#7dffb0' },
  moves: toMap([
    // ---------- 轻拳链:法杖三连 ----------
    mv('lp1', '杖击', L, 'slash', [4, 3, 8], 5, box(0.2, 1.6, 0.8, 1.7), [16, 4, 0.05], { chain: { LP: 'lp2' } }),
    mv('lp2', '反挑', L, 'slash', [4, 3, 9], 6, box(0.2, 1.7, 0.6, 1.7), [17, 4, 0.05], { chain: { LP: 'lp3' } }),
    // 收尾:杖尖戳刺,把人推远
    mv('lp3', '骨杖贯', L, 'thrust', [6, 4, 13], 9, box(0.2, 2.0, 0.8, 1.7), [20, 6, 0.14]),
    // ---------- 轻脚链 ----------
    mv('lk1', '踢开', L, 'kick', [5, 3, 10], 5, box(0.2, 1.2, 0.3, 1.1), [16, 4, 0.06], { chain: { LK: 'lk2' } }),
    mv('lk2', '杖扫', L, 'sweep', [6, 4, 13], 8, box(0.2, 1.9, 0.0, 0.8), [20, 6, 0.1], { knockdown: true }),
    // ---------- 重攻击 ----------
    // 中继:重劈,可接第二段
    mv('hp1', '重杖劈', H, 'overhead', [10, 4, 18], 12, box(0.2, 1.9, 0.3, 2.1), [24, 8, 0.1], { chain: { HP: 'hp2' } }),
    // 收尾:地面震击,击倒
    mv('hp2', '震魂杖', H, 'slam', [12, 4, 22], 16, box(0.2, 2.0, 0, 1.8), [24, 9, 0.14], { knockdown: true }),
    // 挑空:骨刺上挑,命中后可跳跃取消
    mv('hk1', '挑骨', H, 'upper', [9, 4, 18], 11, box(0.1, 1.4, 0.3, 2.3), [24, 8, 0.03], { launch: 0.33, jumpCancel: true }),
    // ---------- 空中普通技 ----------
    mv('jlp', '空中杖击', L, 'airSlash', [4, 6, 9], 7, box(0, 1.6, -0.3, 1.5), [18, 5, 0.04], { air: true, chain: { LP: 'jlp2' } }),
    mv('jlp2', '空中重击', L, 'airSlash', [5, 5, 9], 8, box(0, 1.7, -0.3, 1.5), [18, 5, 0.04], { air: true }),
    mv('jhk', '坠杖', H, 'airKick', [7, 10, 11], 12, box(0, 1.3, -0.8, 1.0), [22, 8, 0.14], { air: true, knockdown: true }),
    // ---------- 抓取 ----------
    // 抓取(轻拳+轻脚):骨手缠住对手后掼出
    mv('grab', '骨手缠', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.1, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 22, throwDamage: 14, throwVx: 0.18, throwVy: 0.3 } }),
    // ---------- 指令技 ----------
    // ↓→ + LP:短距骨刺突进,中继 / 起手
    mv('thorn', '骨刺突', C, 'thrust', [7, 6, 16], 13, box(0.2, 2.1, 0.4, 1.6), [22, 8, 0.12], { moveX: 0.12 }),
    // ↓↑ + HP:骨浪上冲,带无敌的反击挑空
    mv('geyser', '骨浪', C, 'upper', [6, 8, 20], 14, box(0, 1.6, 0.0, 2.6), [24, 9, 0.02], { launch: 0.35, invuln: 8, jumpCancel: true }),
    // ←→ + HP:杖尾重砸,霸体击倒(反击)
    mv('smash', '碎骨击', C, 'slam', [9, 5, 18], 15, box(0.2, 1.8, 0.2, 1.9), [26, 9, 0.2], { knockdown: true, armor: true }),
    // ---------- 技能 ----------
    // 技能1:唤骨,召唤骷髅并在身前爆出小范围伤害(起手 / 开场)
    mv('summon', '唤骨', S, 'cast', [10, 4, 22], 14, box(0.2, 1.4, 0.0, 1.6, 0.9), [22, 6, 0.1], { cost: 30, summon: 'skeleton' }),
    // 技能2:汲魂,单段伤害并为自己与队友回血(收尾)
    mv('drain', '汲魂', S, 'cast', [10, 5, 22], 16, box(0.2, 2.2, 0.3, 1.9, 1.0), [24, 7, 0.08], { cost: 25, heal: 12, knockdown: true }),
    // 技能3:骨矛,飞行道具(中远距离消耗)
    mv('spear', '骨矛', S, 'cast', [12, 2, 20], 16, box(0, 0, 0, 0, 0.6), [22, 6, 0.12], { cost: 20, projectile: { speed: 0.3, life: 60, radius: 0.35, y: 1.1, color: '#d8e8c8' } }),
    // 奥义:灵魂爆裂,身周大范围多段
    mv('burst', '灵魂爆裂', U, 'cast', [10, 30, 30], 8, box(-2.4, 2.8, 0, 2.6, 1.6), [24, 4, 0.02], { cost: 60, rehit: 5, invuln: 44, launch: 0.2 }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jhk', LK: 'jlp', HK: 'jhk' },
  commands: [
    { motion: 'DF', button: 'LP', move: 'thorn' },
    { motion: 'DU', button: 'HP', move: 'geyser' },
    { motion: 'BF', button: 'HP', move: 'smash' },
  ],
  skills: ['summon', 'drain', 'spear', 'burst'],
};

export const extras: CharacterDef[] = [
  {
    id: 'skeleton', name: '骸骨兵', title: '', role: 'enemy',
    lore: '被莫甘唤醒的无名骸骨,只会执行最简单的命令。',
    stats: { hp: 40, speed: 0.045, jump: 0.3, weight: 0.9, energyMax: 100 },
    look: { scale: 0.95, bulk: 0.8, skin: '#d8d4c4', primary: '#8a8a78', secondary: '#4a4a40', accent: '#7dffb0', weapon: 'claws', glow: '#7dffb0' },
    moves: toMap([
      mv('lp1', '骨爪', L, 'punchR', [12, 4, 18], 5, box(0.2, 1.2, 0.7, 1.5, 0.6), [16, 5, 0.06]),
      mv('hp1', '扑咬', H, 'slam', [20, 5, 24], 10, box(0.2, 1.5, 0.2, 1.8, 0.6), [20, 8, 0.14], { knockdown: true, moveX: 0.06 }),
    ]),
    normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {}, commands: [], skills: [],
  },
];
