// 战役数据:5 章,每章一张 3 路路线图(上 / 中 / 下),中途可在相邻路线间换路,最后汇合到 Boss。
// 房间由本文件按「章节敌人池 + 路线特色 + 进度」生成,保证三条路打起来不一样:
//   上路 · 誓约之路 —— 远程敌人多,考验走位
//   中路 · 灰雪之路 —— 均衡
//   下路 · 深根之路 —— 重装敌人多,考验破霸体与抓投
import { ChapterDef, MapNode, RoomDef } from '../sim/types';

/** 三条路线的名字,下标 0/1/2 = 上/中/下 */
export const LANE_NAMES = ['上路 · 誓约之路', '中路 · 灰雪之路', '下路 · 深根之路'] as const;

/** 第 chapterIndex 章(0 起)敌人的攻击欲望:越往后出手越频繁 */
export const enemyAggression = (chapterIndex: number) => 0.4 + chapterIndex * 0.05;

/** 一章的敌人池 */
/** 一章的敌人池(各类敌人的角色 id)。light 近战杂兵,ranged 远程,heavy 重装,boss 本章首领 */
interface Pool { light: string[]; ranged: string[]; heavy: string[]; boss: string }

/** 章节的基础信息(房间与节点由 build 生成) */
interface ChapterSeed {
  /** theme = 场景主题(决定背景外观);intro / outro = 章节开场与结束的剧情文字,一句一行 */
  id: string; name: string; theme: string; pool: Pool;
  intro: string[]; outro: string[];
  /** 三条路各自的地名 */
  places: [string, string, string];
  /** Boss 房间的名字与进场时的一句剧情 */
  bossRoom: string; bossStory: string;
}

/** 5 章的原始设定;改剧情、敌人搭配、地名都在这里改 */
const SEEDS: ChapterSeed[] = [
  {
    id: 'ch1', name: '第一章 · 灰雪边境', theme: 'ashsnow',
    pool: { light: ['husk', 'hound'], ranged: ['emberbow'], heavy: ['brute'], boss: 'gareth' },
    places: ['瞭望残垣', '弃置哨站', '冻土壕沟'],
    bossRoom: '边境关门', bossStory: '关门前站着一个骑士。他仍在守门,却早已忘了门后是什么。',
    intro: [
      '三百年前,艾瑟兰的贤者凿穿大地,唤醒了烬渊。',
      '它不燃烧木石,只燃烧记忆。被它触碰的人忘记自己是谁,化为空烬者。',
      '守火女王将自己的名字劈成十片,封入十件遗物。',
      '如今,十位持名者踏上灰雪——在被彻底遗忘之前,把名字还给深渊。',
    ],
    outro: ['加雷斯倒下时,终于想起了自己的名字。', '他把关门的钥匙放在你手里,然后安静地化为灰烬。'],
  },
  {
    id: 'ch2', name: '第二章 · 泣骨修道院', theme: 'abbey',
    pool: { light: ['monk', 'husk'], ranged: ['chanter'], heavy: ['brute'], boss: 'bishop' },
    places: ['抄经回廊', '中庭墓园', '地下骨堂'],
    bossRoom: '千页圣堂', bossStory: '主教把所有人的记忆抄在纸上。纸页漫天飞舞,没有一页写着他自己。',
    intro: ['修士们相信,只要不停诵念,就不会被遗忘。', '他们把名字刻在自己的骨头上。', '后来,只剩骨头还记得。'],
    outro: ['千页散尽。最后一页飘落在你脚边,上面只有一行字:', '「请替我们记住。」'],
  },
  {
    id: 'ch3', name: '第三章 · 深根矿道', theme: 'mine',
    pool: { light: ['crawler'], ranged: ['emberbow'], heavy: ['miner'], boss: 'colossus' },
    places: ['悬空栈道', '主矿井', '根须暗河'],
    bossRoom: '贤者凿井', bossStory: '这里是贤者们凿穿大地的地方。守在井口的巨像,还在执行三百年前的命令。',
    intro: ['越往下,灰雪越暖。', '矿工们早就不挖矿了。他们在挖别的东西——', '挖那些从深处长上来的、像根须一样的余烬。'],
    outro: ['巨像崩塌,井口洞开。', '下面没有黑暗。下面是一座倒悬的城。'],
  },
  {
    id: 'ch4', name: '第四章 · 无王之都', theme: 'city',
    pool: { light: ['shade', 'husk'], ranged: ['chanter'], heavy: ['kingsguard'], boss: 'queenshade' },
    places: ['钟楼长街', '王座大道', '下城水渠'],
    bossRoom: '守火王座', bossStory: '王座上坐着一团人形的火。她抬起头,像是在等一个名字。',
    intro: ['王都还在。街道、钟楼、王座,都在。', '只是没有人记得这里曾经有过王。', '卫士们仍在巡逻,守护着一个空位。'],
    outro: ['余影消散前,向你行了一个礼。', '「我只是她留下的影子。真正的她,在更深处。」'],
  },
  {
    id: 'ch5', name: '终章 · 烬渊之心', theme: 'abyss',
    pool: { light: ['ashling', 'shade'], ranged: ['emberbow', 'chanter'], heavy: ['kingsguard', 'miner'], boss: 'nameless' },
    places: ['遗忘之阶', '余烬回廊', '无名之根'],
    bossRoom: '烬渊之心', bossStory: '它没有名字。它吞下了所有的名字,却没有一个属于它自己。',
    intro: ['你已经想不起故乡的样子了。', '也想不起是谁教你握住武器。', '但你还记得一件事:手里的这片名字,必须送到。'],
    outro: [
      '十片名字合而为一。',
      '烬渊第一次听见有人呼唤它——用的是女王的名字。',
      '灰雪停了。',
      '你不记得自己是谁。但没关系,会有人记得你。',
    ],
  },
];

/** 从数组里按下标循环取一个 */
const at = (arr: string[], i: number) => arr[i % arr.length];

/**
 * 生成一个战斗房间的敌人波次。
 * 每波是一组敌人 id,打完一波才刷下一波。
 * @param lane  路线(决定敌人类型的偏向)
 * @param level 难度等级:章节序号 + 列号,越大敌人越多
 * @param elite 精英房:波次更多、重装更多
 */
function makeWaves(pool: Pool, lane: number, level: number, elite: boolean): string[][] {
  // L/R/H 分别从近战 / 远程 / 重装名单里循环取第 i 个敌人
  const L = (i: number) => at(pool.light, i), R = (i: number) => at(pool.ranged, i), H = (i: number) => at(pool.heavy, i);
  // 每条路的「主力」与「副手」不同
  const main = lane === 0 ? R : lane === 2 ? H : L;
  const side = lane === 0 ? L : lane === 2 ? L : R;
  const waves: string[][] = [
    [L(0), side(0)],
    [main(0), L(1), side(1)],
  ];
  // 难度越高波数越多、每波人越多
  if (level >= 1) waves.push([main(1), main(0), L(0)]);
  // 精英房用一波重装压轴;普通房到后期才加第四波
  // 前两章的精英房只放一个重装(level 为 章节序号 + 列号,精英房在第 3 列),之后才是双重装
  if (elite) waves.push(level >= 4 ? [H(0), H(1), main(0)] : [H(0), main(0), L(0)]);
  else if (level >= 3) waves.push([H(0), side(0), L(1), main(0)]);
  // 后期最后一波再多加一个杂兵
  if (level >= 5) waves[waves.length - 1].push(L(0));
  return waves;
}

/** 全部自动生成的房间(按 id 索引),供世界创建时查找 */
export const CAMPAIGN_ROOMS: Record<string, RoomDef> = {};

/**
 * 根据种子生成一章:3 列 × 3 路 = 9 个房间,再加一个 Boss 房。
 * @param index 章节序号(0 起),影响难度
 */
function build(seed: ChapterSeed, index: number): ChapterDef {
  // nodes = 路线图上的各个节点;room() 登记一个房间并返回它的 id
  const nodes: MapNode[] = [];
  const room = (id: string, name: string, waves: string[][], width: number, story?: string) => {
    CAMPAIGN_ROOMS[id] = { id, name: `${seed.name.split(' · ')[1]} · ${name}`, width, depth: 4.5, theme: seed.theme, waves, story };
    return id;
  };
  // 节点 id 形如 ch1-a0:章节-列(a/b/c)-路线
  const nid = (col: number, lane: number) => `${seed.id}-${'abc'[col]}${lane}`;
  // 相邻路线可以互通:这就是「野区」换路
  const neighbors = (lane: number) => [lane - 1, lane, lane + 1].filter(l => l >= 0 && l <= 2);

  for (let col = 0; col < 3; col++) {
    for (let lane = 0 as 0 | 1 | 2; lane <= 2; lane++) {
      const id = nid(col, lane);
      // 第三列:中路是篝火休整点,上下两路是精英房
      const kind: MapNode['kind'] = col === 2 ? (lane === 1 ? 'rest' : 'elite') : 'battle';
      const place = `${seed.places[lane]}${['外围', '深处', '尽头'][col]}`;
      const waves = kind === 'rest' ? [] : makeWaves(seed.pool, lane, index + col, kind === 'elite');
      room(id, kind === 'rest' ? '余烬篝火' : place, waves, kind === 'rest' ? 16 : 26 + col * 2,
        kind === 'rest' ? '篝火还没有熄。你坐下来,把还记得的事默念了一遍。' : undefined);
      // 前两列可以走到下一列相邻的路线;第三列全部通向 Boss
      const next = col < 2 ? neighbors(lane).map(l => nid(col + 1, l)) : [`${seed.id}-boss`];
      nodes.push({ id, lane: lane as 0 | 1 | 2, col, room: id, kind, next });
    }
  }
  // Boss 房:先打两个杂兵,再打首领
  const bossId = `${seed.id}-boss`;
  room(bossId, seed.bossRoom, [[at(seed.pool.light, 0), at(seed.pool.light, 1)], [seed.pool.boss]], 24, seed.bossStory);
  nodes.push({ id: bossId, lane: 1, col: 3, room: bossId, kind: 'boss', next: [] });

  return { id: seed.id, name: seed.name, intro: seed.intro, outro: seed.outro, nodes, start: [nid(0, 0), nid(0, 1), nid(0, 2)] };
}

/** 内置的 5 章战役 */
export const CHAPTERS: ChapterDef[] = SEEDS.map(build);
