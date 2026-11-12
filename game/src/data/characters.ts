import { CharacterDef, Tier } from '../sim/types';
import { box, mv, toMap } from './build';
import { brynn } from './chars/brynn';
import { sera } from './chars/sera';
import { ilex } from './chars/ilex';
import { rook } from './chars/rook';
import { vesper } from './chars/vesper';
import { morgan, extras as morganExtras } from './chars/morgan';
import { odran } from './chars/odran';
import { li } from './chars/li';
import { nola } from './chars/nola';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

export const kael: CharacterDef = {
  id: 'kael', name: '凯尔', title: '持誓之刃', role: 'warrior',
  lore: '边境哨站最后的守卫。他的遗物是女王名字的第一个音节——他记得誓言,却已想不起是向谁立下的。',
  stats: { hp: 220, speed: 0.07, jump: 0.36, weight: 1, energyMax: 100 },
  look: { scale: 1, bulk: 1, skin: '#c9a184', primary: '#5d6b85', secondary: '#a02a2a', accent: '#dfe3ea', weapon: 'sword', shield: true, cape: true },
  moves: toMap([
    mv('lp1', '刺拳', L, 'punchL', [4, 3, 8], 6, box(0.2, 1.2, 0.9, 1.5), [16, 4, 0.05], { chain: { LP: 'lp2' } }),
    mv('lp2', '盾拳', L, 'punchR', [4, 3, 9], 6, box(0.2, 1.25, 0.9, 1.5), [17, 4, 0.05], { chain: { LP: 'lp3' } }),
    mv('lp3', '横斩', L, 'slash', [6, 4, 13], 10, box(0.2, 1.7, 0.7, 1.6), [20, 6, 0.1], { moveX: 0.03 }),
    mv('lk1', '前踢', L, 'kick', [5, 3, 10], 7, box(0.2, 1.3, 0.4, 1.1), [17, 4, 0.06], { chain: { LK: 'lk2' } }),
    mv('lk2', '回旋踢', L, 'highKick', [6, 4, 13], 9, box(0.2, 1.4, 0.9, 1.7), [20, 6, 0.12]),
    mv('hp1', '重斩', H, 'overhead', [10, 4, 18], 15, box(0.2, 1.8, 0.3, 2.1), [24, 8, 0.12], { chain: { HP: 'hp2' }, moveX: 0.03 }),
    mv('hp2', '断名', H, 'slam', [12, 4, 22], 18, box(0.2, 1.8, 0, 2.0), [24, 9, 0.16], { knockdown: true }),
    mv('hk1', '挑空踢', H, 'upper', [9, 4, 18], 12, box(0.1, 1.3, 0.3, 2.2), [24, 8, 0.03], { launch: 0.34, jumpCancel: true }),
    mv('jlp', '空斩', L, 'airSlash', [4, 6, 8], 8, box(0, 1.5, -0.3, 1.4), [18, 5, 0.04], { air: true, chain: { LP: 'jlp2' } }),
    mv('jlp2', '空中二段', L, 'airSlash', [4, 5, 8], 8, box(0, 1.5, -0.3, 1.5), [18, 5, 0.04], { air: true }),
    mv('jhk', '坠击', H, 'airKick', [6, 10, 10], 13, box(0, 1.3, -0.8, 1.0), [22, 8, 0.14], { air: true, knockdown: true }),
    mv('rush', '冲锋斩', C, 'thrust', [7, 8, 16], 14, box(0.2, 1.9, 0.6, 1.5), [22, 8, 0.12], { moveX: 0.2 }),
    mv('rise', '升天斩', C, 'upper', [5, 10, 20], 16, box(0, 1.4, 0.2, 2.6), [24, 9, 0.02], { launch: 0.36, selfLaunch: 0.3, invuln: 8 }),
    mv('bash', '盾击', C, 'punchR', [8, 5, 18], 13, box(0.2, 1.4, 0.4, 1.7), [26, 9, 0.3], { knockdown: true, moveX: 0.08, armor: true }),
    mv('grab', '缴械投', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.0, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 22, throwDamage: 16, throwVx: 0.2, throwVy: 0.3 } }),
    mv('wave', '烬刃波', S, 'cast', [12, 2, 20], 16, box(0, 0, 0, 0, 0.6), [22, 6, 0.12], { cost: 20, projectile: { speed: 0.26, life: 50, radius: 0.35, y: 1.1, color: '#ff6a2a' } }),
    mv('whirl', '旋风斩', S, 'spin', [6, 24, 16], 7, box(-1.6, 1.6, 0.4, 1.6, 1.0), [20, 3, 0.02], { cost: 25, rehit: 6, armor: true }),
    mv('quake', '裂地', S, 'slam', [14, 5, 24], 22, box(-0.4, 2.4, 0, 1.2, 1.3), [26, 10, 0.05], { cost: 30, launch: 0.33 }),
    mv('oath', '名之誓', U, 'spin', [10, 30, 30], 9, box(-2.2, 2.6, 0, 2.6, 1.6), [24, 4, 0.02], { cost: 60, rehit: 5, invuln: 44, launch: 0.2 }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
  airNormals: { LP: 'jlp', HP: 'jlp', LK: 'jhk', HK: 'jhk' },
  commands: [
    { motion: 'DU', button: 'HK', move: 'rise' },
    { motion: 'DU', button: 'HP', move: 'rise' },
    { motion: 'DF', button: 'LP', move: 'rush' },
    { motion: 'DF', button: 'HP', move: 'bash' },
  ],
  skills: ['wave', 'whirl', 'quake', 'oath'],
};

export const husk: CharacterDef = {
  id: 'husk', name: '空烬者', title: '', role: 'enemy',
  lore: '被烬渊夺去名字的人。',
  stats: { hp: 55, speed: 0.04, jump: 0.3, weight: 1, energyMax: 100 },
  look: { scale: 0.95, bulk: 0.95, skin: '#7d7d84', primary: '#3d3b44', secondary: '#4f4038', accent: '#ff5a1f', weapon: 'claws', hood: true, glow: '#ff5a1f' },
  moves: toMap([
    mv('lp1', '抓挠', L, 'punchR', [14, 4, 20], 6, box(0.2, 1.2, 0.7, 1.5, 0.6), [16, 5, 0.06]),
    mv('hp1', '扑击', H, 'slam', [24, 5, 26], 11, box(0.2, 1.5, 0.2, 1.8, 0.6), [20, 8, 0.14], { knockdown: true, moveX: 0.07 }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {}, commands: [], skills: [],
};

export const brute: CharacterDef = {
  id: 'brute', name: '烬骸重卒', title: '', role: 'enemy',
  lore: '披着旧王国重甲的空烬者,甲胄里只剩余烬。',
  stats: { hp: 150, speed: 0.032, jump: 0.28, weight: 1.6, energyMax: 100 },
  look: { scale: 1.2, bulk: 1.45, skin: '#6a6a72', primary: '#4a4540', secondary: '#77593f', accent: '#ff7b2f', weapon: 'hammer', horns: true, glow: '#ff7b2f' },
  moves: toMap([
    mv('lp1', '挥击', L, 'slash', [18, 5, 24], 10, box(0.2, 1.8, 0.5, 1.8, 0.7), [18, 6, 0.12]),
    mv('hp1', '碎地锤', H, 'slam', [30, 6, 34], 20, box(0.2, 2.2, 0, 2.2, 0.9), [24, 10, 0.2], { knockdown: true, armor: true }),
  ]),
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {}, commands: [], skills: [],
};

/** 可选角色,按选人界面的显示顺序排列 */
export const HEROES: CharacterDef[] = [kael, brynn, sera, ilex, rook, vesper, morgan, odran, li, nola];

/** 全部角色表(可选角色 + 敌人 + 召唤物),模拟层按 id 查找 */
export const ROSTER: Record<string, CharacterDef> = {};
for (const c of [...HEROES, husk, brute, ...morganExtras]) ROSTER[c.id] = c;

/** 可选角色的 id 列表 */
export const PLAYABLE = HEROES.map(c => c.id);
