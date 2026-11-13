// 塞拉 Sera —— 法师(火 / 烬)
// 打法:血薄但射程长,靠火球、烬枪与火墙压制距离;被近身时用「闪焰」瞬移拉开,
// 「升炎」把对手挑起后用空中火球或普通技接续浮空连段。
// 推荐连招 1:升炎(HK)挑空 → 空中 HP 火球 → 空中 LK 坠击收尾。
// 推荐连招 2:LP → LP → LP(杖击三连)→ 火墙(S3)困住对手 → 火球(S1)补伤害。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const sera: CharacterDef = {
  id: 'sera', name: '塞拉', title: '余烬歌者', role: 'mage',
  lore: '修道院里唯一没被烬渊带走的歌者。她的遗物是女王名字里的一段旋律,每唱一次火焰,就有一首童年的歌从她记忆里熄灭。',
  stats: { hp: 160, speed: 0.06, jump: 0.35, weight: 0.8, energyMax: 100 },
  look: { scale: 0.98, bulk: 0.85, skin: '#d8b090', primary: '#b8341e', secondary: '#3a2a38', accent: '#ffb347', weapon: 'staff', hood: false, glow: '#ff7a2a', hair: 'long', hairColor: '#c2281c', feminine: true, skirt: true, legColor: '#15131a' },
  moves: toMap([
    // ===== 地面轻攻击:杖击链 =====
    // 起手:杖尖戳刺
    mv('lp1', '杖戳', L, 'punchL', [4, 3, 8], 5, box(0.2, 1.4, 0.9, 1.6), [16, 4, 0.05], { chain: { LP: 'lp2' } }),
    // 中继:杖横扫
    mv('lp2', '杖扫', L, 'punchR', [4, 3, 9], 6, box(0.2, 1.5, 0.9, 1.6), [17, 4, 0.05], { chain: { LP: 'lp3' } }),
    // 收尾:近身烬爆,把对手震开
    mv('lp3', '烬爆', L, 'cast', [6, 4, 13], 9, box(0.2, 1.9, 0.6, 1.8, 0.9), [20, 6, 0.12]),
    // 起手:前踢
    mv('lk1', '前踢', L, 'kick', [5, 3, 10], 6, box(0.2, 1.3, 0.4, 1.1), [17, 4, 0.06], { chain: { LK: 'lk2' } }),
    // 收尾:转身踢
    mv('lk2', '旋踢', L, 'highKick', [6, 4, 13], 8, box(0.2, 1.4, 0.9, 1.7), [20, 6, 0.12]),

    // ===== 地面重攻击 =====
    // 中继 / 远程:小火球,可接 HP
    mv('hp1', '火星弹', H, 'cast', [9, 3, 18], 11, box(0, 0, 0, 0, 0.6), [22, 7, 0.1], { chain: { HP: 'hp2' }, projectile: { speed: 0.3, life: 55, radius: 0.3, y: 1.2, color: '#ff8a3a' } }),
    // 收尾:近身火柱爆发,击倒
    mv('hp2', '烈焰迸发', H, 'slam', [12, 4, 22], 16, box(0.2, 2.1, 0, 2.0, 1.0), [24, 9, 0.14], { knockdown: true }),
    // 挑空:杖尖火焰上挑,开启浮空连段
    mv('hk1', '升焰', H, 'upper', [9, 4, 18], 12, box(0.1, 1.4, 0.3, 2.3), [24, 8, 0.03], { launch: 0.34, jumpCancel: true }),

    // ===== 空中普通技 =====
    // 空中火星:向前吐出小火球
    mv('jlp', '空中火星', L, 'cast', [5, 3, 10], 6, box(0, 0, 0, 0, 0.6), [18, 4, 0.04], { air: true, projectile: { speed: 0.3, life: 45, radius: 0.28, y: 1.0, color: '#ff9a4a' } }),
    // 空中火球:稍重的火球
    mv('jhp', '空中火球', H, 'cast', [8, 3, 14], 11, box(0, 0, 0, 0, 0.6), [22, 7, 0.06], { air: true, projectile: { speed: 0.32, life: 50, radius: 0.35, y: 1.0, color: '#ff6a2a' } }),
    // 空中收尾:俯冲踢击倒
    mv('jlk', '坠星踢', H, 'airKick', [6, 10, 10], 13, box(0, 1.3, -0.8, 1.0), [22, 8, 0.14], { air: true, knockdown: true }),

    // ===== 抓取 =====
    mv('grab', '灼烧擒拿', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.0, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 22, throwDamage: 15, throwVx: 0.22, throwVy: 0.3 } }),

    // ===== 指令技 =====
    // 闪焰(←→+LK):向前瞬移并在落点爆出火花,突进 / 穿越对手
    mv('blink', '闪焰', C, 'cast', [5, 4, 16], 12, box(0, 1.5, 0.3, 1.9, 0.9), [22, 8, 0.12], { teleport: 3.0, invuln: 8, knockdown: true }),
    // 升炎(↓↑+HP):自身火柱上冲,无敌起手挑空,浮空连段入口
    mv('rise', '升炎', C, 'upper', [6, 6, 20], 14, box(0, 1.4, 0.2, 2.6), [24, 9, 0.02], { launch: 0.36, selfLaunch: 0.25, invuln: 8 }),
    // 烬弹(↓→+LP):快速中速火弹,中远距离牵制
    mv('ember', '烬弹', C, 'cast', [8, 4, 16], 13, box(0, 0, 0, 0, 0.6), [22, 8, 0.1], { projectile: { speed: 0.28, life: 60, radius: 0.34, y: 1.2, color: '#ff7a2a' } }),

    // ===== 技能 =====
    // 火球(S1):标准大火球,远程起手 / 收尾
    mv('fireball', '炽焰火球', S, 'cast', [11, 3, 20], 18, box(0, 0, 0, 0, 0.6), [22, 7, 0.14], { cost: 20, knockdown: true, projectile: { speed: 0.26, life: 70, radius: 0.45, y: 1.2, color: '#ff5a1a' } }),
    // 烬枪(S2):贯穿型长矛,可同时命中一排敌人
    mv('lance', '余烬长枪', S, 'thrust', [12, 3, 22], 16, box(0, 0, 0, 0, 0.6), [22, 6, 0.1], { cost: 25, projectile: { speed: 0.4, life: 70, radius: 0.3, y: 1.1, color: '#ffc04a', pierce: true } }),
    // 火墙(S3):地面火墙,持续多段,困住对手,配合后续火球
    mv('wall', '地炎火墙', S, 'slam', [12, 24, 22], 6, box(1.0, 3.4, 0, 1.4, 1.0), [20, 3, 0.02], { cost: 30, rehit: 6 }),
    // 奥义(S4):陨火风暴,全屏多段并无敌
    mv('inferno', '烬灭之歌', U, 'cast', [10, 30, 30], 8, box(-1.0, 5.0, 0, 2.6, 1.6), [24, 4, 0.02], { cost: 60, rehit: 5, invuln: 44, launch: 0.2 }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jhp', LK: 'jlk', HK: 'jlk' },
  commands: [
    { motion: 'BF', button: 'LK', move: 'blink' },
    { motion: 'BF', button: 'HK', move: 'blink' },
    { motion: 'DU', button: 'HP', move: 'rise' },
    { motion: 'DU', button: 'HK', move: 'rise' },
    { motion: 'DF', button: 'LP', move: 'ember' },
  ],
  skills: ['fireball', 'lance', 'wall', 'inferno'],
};

export const extras: CharacterDef[] = [];
