// 第 1 章 灰雪边境 —— 敌人与 Boss 数据。
//
// 敌人:
//  - emberbow 烬弓手:远程飞行道具兵,近身只有一记笨拙的挥砍。
//  - hound    灰雪猎犬:体型小、血少、速度快,靠扑咬突进。
//
// Boss:忘名骑士长 加雷斯(hp 750)
//  战斗节奏:加雷斯以「剑盾二连」试探,距离拉开后会用盾冲(霸体、突进)贴脸,
//  接着是横扫斩。能量满后会放出「裂地重斩」(大范围、霸体、前摇长)和「誓约回旋」。
//  破绽:盾冲与裂地重斩后的收招都很长(26 帧以上),闪避后立刻反击即可;
//  他的普通攻击无霸体,可以直接打断;不要在他举盾前摇时贴脸站桩。
import { CharacterDef, Tier } from '../../sim/types';
import { box, mv, toMap } from '../build';

const { LIGHT: L, HEAVY: H, COMMAND: C, SKILL: S } = Tier;

export const emberbow: CharacterDef = {
  id: 'emberbow', name: '烬弓手', title: '', role: 'enemy',
  lore: '哨站的弓箭手,忘了自己在守卫什么,却还记得拉弦的动作。箭簇上跳动着不灭的余烬。',
  stats: { hp: 45, speed: 0.04, jump: 0.3, weight: 0.9, energyMax: 100 },
  look: { scale: 1, bulk: 0.85, skin: '#8a8480', primary: '#3a3f4a', secondary: '#5a4636', accent: '#ff8a2a', weapon: 'bow', hood: true, glow: '#ff8a2a' },
  moves: toMap([
    // 近身自保:用弓身抽打,前摇较长
    mv('lp1', '弓身抽打', L, 'punchR', [14, 4, 22], 6, box(0.2, 1.3, 0.7, 1.6, 0.6), [16, 5, 0.08]),
    // 主力:余烬箭,慢速直线飞行道具
    mv('arrow', '余烬箭', H, 'shoot', [22, 2, 26], 9, box(0, 0, 0, 0, 0.6), [20, 6, 0.1],
      { projectile: { speed: 0.24, life: 60, radius: 0.3, y: 1.2, color: '#ff9a3a' } }),
  ]),
  // 玩家应对方法:箭速慢,横向(纵深)移动或闪避即可躲开;贴近后它只会弓身抽打,优先突进击杀;
  // 在远处时被其他敌人遮挡箭路也可以利用。
  normals: { LP: 'lp1', HP: 'arrow' }, airNormals: {}, commands: [], skills: [],
};

export const hound: CharacterDef = {
  id: 'hound', name: '灰雪猎犬', title: '', role: 'enemy',
  lore: '被烬渊唤醒的守卫犬,主人的名字早已烧成灰,它仍在雪地里追逐一切活物。',
  stats: { hp: 32, speed: 0.06, jump: 0.34, weight: 0.7, energyMax: 100 },
  look: { scale: 0.7, bulk: 0.9, skin: '#6e6a68', primary: '#3b3836', secondary: '#55504c', accent: '#ff5a3a', weapon: 'claws', glow: '#ff5a3a' },
  moves: toMap([
    mv('lp1', '撕咬', L, 'punchR', [10, 3, 18], 5, box(0.2, 1.1, 0.2, 1.1, 0.6), [15, 4, 0.05]),
    // 扑咬:向前高速位移,命中把人扑倒
    mv('pounce', '飞扑', H, 'slam', [18, 8, 24], 9, box(0.1, 1.4, 0.1, 1.3, 0.6), [20, 7, 0.12], { moveX: 0.14, knockdown: true }),
  ]),
  // 玩家应对方法:猎犬血少,一两下就能打死,但扑咬很快;看到它蹲伏(前摇)就闪避或后撤,
  // 它落地后有长硬直,此时反击。成群出现时优先清掉。
  normals: { LP: 'lp1', HP: 'pounce' }, airNormals: {}, commands: [], skills: [],
};

export const gareth: CharacterDef = {
  id: 'gareth', name: '加雷斯', title: '忘名骑士长', role: 'boss',
  lore: '边境哨站的骑士长,曾为女王亲自执旗。他忘了誓言的内容,只记得必须挡住所有来者——哪怕来者是自己的同袍。',
  stats: { hp: 750, speed: 0.045, jump: 0.3, weight: 1.6, energyMax: 100 },
  look: { scale: 1.4, bulk: 1.5, skin: '#8d8a88', primary: '#4b525f', secondary: '#2a2d36', accent: '#e8d9b0', weapon: 'sword', shield: true, horns: true, cape: true, glow: '#ffb04a' },
  moves: toMap([
    // ---------- 普通攻击 ----------
    // 剑盾二连:盾击起手,可接斩击
    mv('lp1', '盾击', L, 'punchR', [14, 4, 18], 8, box(0.2, 1.5, 0.6, 1.8, 0.8), [18, 5, 0.1], { chain: { LP: 'lp2' } }),
    mv('lp2', '追斩', L, 'slash', [12, 4, 22], 10, box(0.2, 2.1, 0.5, 1.9, 0.9), [20, 6, 0.12]),
    // 重斩:大幅度下劈,击倒
    mv('hp1', '重斩', H, 'overhead', [20, 4, 26], 14, box(0.2, 2.2, 0.2, 2.3, 0.9), [24, 8, 0.14], { knockdown: true, moveX: 0.04 }),
    // ---------- 指令技 ----------
    // 盾冲:霸体突进,距离远时使用
    mv('shieldcharge', '盾冲', C, 'punchR', [16, 12, 30], 14, box(0.2, 1.8, 0.3, 2.0, 1.0), [24, 9, 0.22], { moveX: 0.14, armor: true, knockdown: true }),
    // 横扫斩:大范围,带小位移
    mv('sweepslash', '横扫斩', C, 'slash', [14, 6, 26], 13, box(-0.6, 2.4, 0.3, 2.0, 1.2), [22, 8, 0.16], { moveX: 0.05 }),
    // ---------- 技能 ----------
    // 誓约回旋:自身周围多段,无霸体但范围大(能量 25)
    mv('whirl', '誓约回旋', S, 'spin', [16, 20, 28], 6, box(-1.9, 1.9, 0.3, 2.1, 1.3), [20, 4, 0.04], { cost: 25, rehit: 6 }),
    // 裂地重斩:霸体、前摇长、伤害高,大招(能量 40)
    mv('cleave', '裂地重斩', S, 'slam', [30, 5, 38], 20, box(0.2, 2.8, 0, 2.2, 1.3), [26, 10, 0.2], { cost: 40, armor: true, knockdown: true }),
    // 烬刃波:远程骚扰
    mv('wave', '烬刃波', S, 'cast', [20, 2, 28], 14, box(0, 0, 0, 0, 0.6), [22, 6, 0.12], { cost: 25, projectile: { speed: 0.26, life: 60, radius: 0.4, y: 1.1, color: '#ffb04a' } }),
  ]),
  // 玩家应对方法:看到盾冲(举盾前摇)侧向闪避,收招时输出;裂地重斩前摇最长,提前离开地面范围;
  // 不要被霸体招式硬换血,霸体只出现在盾冲、重斩的 startup 之后。
  normals: { LP: 'lp1', HP: 'hp1' }, airNormals: {},
  commands: [
    { motion: 'FF', button: 'HP', move: 'shieldcharge' },
    { motion: 'DF', button: 'LP', move: 'sweepslash' },
  ],
  skills: ['whirl', 'cleave', 'wave'],
};

export const enemies: CharacterDef[] = [emberbow, hound, gareth];
