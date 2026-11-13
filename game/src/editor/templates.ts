// 新建角色/房间/章节时的空白模板,以及生成不重复 id 的小工具。
// 模板本身必须通过 validateCharacter 校验(见 tests/validate.test.ts),改数值时要小心。
import { CharacterDef, ChapterDef, RoomDef, Tier } from '../sim/types';
import { box, mv, toMap } from '../data/build';

// 招式档位的简写:轻 / 重 / 指令技 / 技能 / 奥义
const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S, SUPER: U } = Tier;

/**
 * 空白英雄模板:一套结构完整、数值合规的基础招式(轻拳 2 段、轻脚 2 段、重击、挑空、击倒、
 * 空中招式、抓取、3 个指令技、3 个技能 + 1 个奥义),玩家在此基础上改名改数值即可。
 * @param id 新角色 id
 */
export function blankHero(id: string): CharacterDef {
  return {
    id, name: '新角色', title: '无名之人', role: 'brawler',
    lore: '一个尚未被命名的持名者。请在这里写下他的故事。',
    stats: { hp: 200, speed: 0.07, jump: 0.35, weight: 1, energyMax: 100 },
    look: { scale: 1, bulk: 1, skin: '#c9a184', primary: '#4a6b5a', secondary: '#8a4b2a', accent: '#e8e2d6', weapon: 'none' },
    moves: toMap([
      mv('lp1', '直拳', L, 'punchL', [4, 3, 8], 6, box(0.2, 1.2, 0.9, 1.5), [16, 4, 0.05], { chain: { LP: 'lp2' } }),
      mv('lp2', '勾拳', L, 'punchR', [5, 3, 10], 7, box(0.2, 1.3, 0.9, 1.6), [18, 5, 0.06]),
      mv('lk1', '前踢', L, 'kick', [5, 3, 10], 7, box(0.2, 1.3, 0.4, 1.1), [17, 4, 0.06], { chain: { LK: 'lk2' } }),
      mv('lk2', '回旋踢', L, 'highKick', [6, 4, 13], 9, box(0.2, 1.4, 0.9, 1.7), [20, 6, 0.12]),
      mv('hp1', '重拳', H, 'overhead', [10, 4, 18], 15, box(0.2, 1.8, 0.3, 2.1), [24, 8, 0.12], { knockdown: true }),
      mv('hk1', '挑空踢', H, 'upper', [9, 4, 18], 12, box(0.1, 1.3, 0.3, 2.2), [24, 8, 0.03], { launch: 0.34, jumpCancel: true }),
      mv('jlp', '空拳', L, 'airSlash', [4, 6, 8], 8, box(0, 1.5, -0.3, 1.4), [18, 5, 0.04], { air: true }),
      mv('jhk', '坠击', H, 'airKick', [6, 10, 10], 13, box(0, 1.3, -0.8, 1.0), [22, 8, 0.14], { air: true, knockdown: true }),
      mv('grab', '擒拿', C, 'punchL', [5, 3, 22], 4, box(0.1, 1.0, 0.4, 1.6, 0.5), [10, 4, 0], { grab: { hold: 22, throwDamage: 16, throwVx: 0.2, throwVy: 0.3 } }),
      mv('rush', '突进拳', C, 'thrust', [7, 8, 16], 14, box(0.2, 1.9, 0.6, 1.5), [22, 8, 0.12], { moveX: 0.2 }),
      mv('rise', '升龙拳', C, 'upper', [5, 10, 20], 16, box(0, 1.4, 0.2, 2.6), [24, 9, 0.02], { launch: 0.36, selfLaunch: 0.3, invuln: 8 }),
      mv('bash', '肩撞', C, 'punchR', [8, 5, 18], 13, box(0.2, 1.4, 0.4, 1.7), [26, 9, 0.3], { knockdown: true, moveX: 0.08, armor: true }),
      mv('wave', '气功波', S, 'cast', [12, 2, 20], 16, box(0, 0, 0, 0, 0.6), [22, 6, 0.12], { cost: 20, projectile: { speed: 0.26, life: 50, radius: 0.35, y: 1.1, color: '#ffb347' } }),
      mv('whirl', '旋身', S, 'spin', [6, 24, 16], 7, box(-1.6, 1.6, 0.4, 1.6, 1.0), [20, 3, 0.02], { cost: 25, rehit: 6, armor: true }),
      mv('quake', '震地', S, 'slam', [14, 5, 24], 22, box(-0.4, 2.4, 0, 1.2, 1.3), [26, 10, 0.05], { cost: 30, launch: 0.33 }),
      mv('ult', '无名奥义', U, 'spin', [10, 30, 30], 9, box(-2.2, 2.6, 0, 2.6, 1.6), [24, 4, 0.02], { cost: 60, rehit: 5, invuln: 44, launch: 0.2 }),
    ]),
    normals: { LP: 'lp1', HP: 'hp1', LK: 'lk1', HK: 'hk1' },
    airNormals: { LP: 'jlp', HP: 'jlp', LK: 'jhk', HK: 'jhk' },
    commands: [
      { motion: 'DU', button: 'HK', move: 'rise' },
      { motion: 'DF', button: 'LP', move: 'rush' },
      { motion: 'DF', button: 'HP', move: 'bash' },
    ],
    skills: ['wave', 'whirl', 'quake', 'ult'],
  };
}

/** 空白房间:2 波空烬者 + 重卒 */
export function blankRoom(id: string): RoomDef {
  return { id, name: '新房间', width: 30, depth: 4.5, theme: 'ashsnow', waves: [['husk', 'husk'], ['husk', 'brute']], story: '' };
}

/**
 * 空白章节:三路各一个起点,汇合到 Boss(一个最小的合法图)。
 * @param id 章节 id
 * @param room 节点使用的房间 id
 */
export function blankChapter(id: string, room: string): ChapterDef {
  return {
    id, name: '新章节', intro: ['请在这里写下开场剧情。'], outro: ['请在这里写下结尾剧情。'],
    start: ['n_top', 'n_mid', 'n_bot'],
    nodes: [
      { id: 'n_top', lane: 0, col: 0, room, kind: 'battle', next: ['n_boss'] },
      { id: 'n_mid', lane: 1, col: 0, room, kind: 'elite', next: ['n_boss'] },
      { id: 'n_bot', lane: 2, col: 0, room, kind: 'rest', next: ['n_boss'] },
      { id: 'n_boss', lane: 1, col: 1, room, kind: 'boss', next: [] },
    ],
  };
}

/** 生成一个不与 used 冲突的 id:prefix_1, prefix_2, ... */
export function uniqueId(prefix: string, used: Iterable<string>): string {
  const set = new Set(used);
  for (let i = 1; ; i++) if (!set.has(`${prefix}_${i}`)) return `${prefix}_${i}`;
}
