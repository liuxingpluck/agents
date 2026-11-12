// 模拟层数据结构。此目录不得依赖 DOM / Three.js,保证可在 Worker 与 Node 中运行。

/** 输入位掩码。玩家、脚本 AI、神经网络都通过同一个掩码驱动角色。 */
export const Btn = {
  UP: 1 << 0, // 纵深向内 (z-)
  DOWN: 1 << 1, // 纵深向外 (z+)
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  LP: 1 << 4,
  HP: 1 << 5,
  LK: 1 << 6,
  HK: 1 << 7,
  JUMP: 1 << 8,
  DODGE: 1 << 9,
  S1: 1 << 10,
  S2: 1 << 11,
  S3: 1 << 12,
  S4: 1 << 13,
  S5: 1 << 14,
  S6: 1 << 15,
  S7: 1 << 16,
  S8: 1 << 17,
} as const;

export type BtnName = keyof typeof Btn;
export const ATTACK_BTNS: BtnName[] = ['LP', 'HP', 'LK', 'HK'];
export const SKILL_BTNS: BtnName[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
export const DIR_MASK = Btn.UP | Btn.DOWN | Btn.LEFT | Btn.RIGHT;

/** 取消层级:只能向更高层级取消(同级需显式 chain)。 */
export const Tier = { LIGHT: 0, HEAVY: 1, COMMAND: 2, SKILL: 3, SUPER: 4 } as const;

/**
 * 指令动作(相对朝向):
 * F 前 B 后 D 下 U 上。例:'DF' = ↓→,'DU' = ↓↑,'FF' = →→,'BF' = ←→
 */
export type Motion = 'DF' | 'DB' | 'DU' | 'FF' | 'BF' | 'DD';

export type AnimKind =
  | 'punchL' | 'punchR' | 'kick' | 'highKick' | 'sweep' | 'upper'
  | 'slash' | 'overhead' | 'thrust' | 'spin' | 'cast' | 'shoot' | 'slam' | 'airKick' | 'airSlash';

export interface Box {
  /** 相对角色原点,x 以朝向为正方向 */
  x0: number; x1: number;
  y0: number; y1: number;
  /** 纵深容差(±) */
  z: number;
}

export interface ProjectileDef {
  speed: number;
  life: number; // 帧
  radius: number;
  y: number; // 发射高度
  color: string;
  pierce?: boolean;
}

export interface MoveDef {
  id: string;
  name: string;
  tier: number;
  anim: AnimKind;
  startup: number; // 帧 @60Hz
  active: number;
  recovery: number;
  damage: number;
  /** 计入连击上限的权重 */
  comboValue: number;
  hitbox: Box;
  hitstun: number;
  hitstop: number;
  /** 地面击退速度(沿攻击者朝向) */
  pushX: number;
  /** >0 时挑空,数值为初始上升速度 */
  launch?: number;
  /** 击倒(小浮空后倒地) */
  knockdown?: boolean;
  /** 出招期间自身前移速度(每帧,米) */
  moveX?: number;
  /** 出招时给自己一个向上速度(升龙类) */
  selfLaunch?: number;
  /** 命中后可用跳跃取消 */
  jumpCancel?: boolean;
  /** 只能在空中 / 只能在地面,缺省为地面 */
  air?: boolean;
  /** 显式连携:按下某键时接哪一招(可同级) */
  chain?: Partial<Record<BtnName, string>>;
  /** 能量消耗 */
  cost?: number;
  /** startup 到 active 结束期间霸体 */
  armor?: boolean;
  /** 全程无敌帧数(从第 0 帧起) */
  invuln?: number;
  projectile?: ProjectileDef;
  /** 可多段命中:每隔多少帧重新允许命中 */
  rehit?: number;
  /** 出手帧为自己与附近队友(4 米内)回复生命 */
  heal?: number;
  /** 出手帧召唤一个友方单位(roster 中的角色 id),同一施放者最多 2 个 */
  summon?: string;
  /** 出手帧沿朝向瞬移的距离(米),负值为后撤 */
  teleport?: number;
  /**
   * 强制抓取:命中后把对手锁在身前 hold 帧,然后投出。
   * 抓取无视霸体,但抓不到空中、倒地的对手。按住后方向可向身后投。
   */
  grab?: { hold: number; throwDamage: number; throwVx: number; throwVy: number };
}

export interface CommandDef {
  motion: Motion;
  button: BtnName;
  move: string;
}

export type Role = 'warrior' | 'tank' | 'mage' | 'archer' | 'brawler' | 'assassin' | 'summoner' | 'berserker' | 'lancer' | 'support' | 'enemy' | 'boss';

export interface Look {
  /** 身高倍率 */
  scale: number;
  /** 肩宽倍率 */
  bulk: number;
  skin: string;
  primary: string;
  secondary: string;
  accent: string;
  weapon: 'none' | 'sword' | 'hammer' | 'staff' | 'bow' | 'daggers' | 'axe' | 'spear' | 'mace' | 'claws';
  shield?: boolean;
  hood?: boolean;
  horns?: boolean;
  cape?: boolean;
  glow?: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  role: Role;
  lore: string;
  stats: {
    hp: number;
    speed: number; // 米/帧
    jump: number; // 初速度
    /** 受击击退与浮空倍率,越重越小 */
    weight: number;
    energyMax: number;
  };
  look: Look;
  moves: Record<string, MoveDef>;
  /** 地面普通技入口 */
  normals: Partial<Record<BtnName, string>>;
  /** 空中普通技入口 */
  airNormals: Partial<Record<BtnName, string>>;
  commands: CommandDef[];
  /** 技能键 S1.. 对应的招式 */
  skills: string[];
}

export type FState =
  | 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'hitstun' | 'launched'
  | 'knockdown' | 'getup' | 'dodge' | 'grabbed' | 'dead';

export interface Fighter {
  id: number;
  team: number; // 0 玩家方 1 敌方
  def: CharacterDef;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  facing: 1 | -1;
  state: FState;
  stateFrame: number;
  hp: number;
  energy: number;
  // 攻击
  move: MoveDef | null;
  moveFrame: number;
  moveHit: boolean;
  hitIds: number[];
  lastRehitFrame: number;
  // 受击与连击(记录在受害者身上)
  stun: number;
  hitstop: number;
  comboCount: number;
  comboValue: number;
  comboDamage: number;
  comboMoveUses: Record<string, number>;
  juggle: number;
  invuln: number;
  // 输入
  input: number;
  prevInput: number;
  /** 方向变化历史:[帧, 相对方向位] F=1 B=2 D=4 U=8 */
  dirHist: Array<[number, number]>;
  /** 按键缓冲:按钮名 -> 按下的帧 */
  buffer: Partial<Record<BtnName, number>>;
  airActions: number;
  /** 正在抓着的对手 id(0 表示没有) */
  grabTarget: number;
  /** 抓取保持的剩余帧数,归零时投出 */
  grabTimer: number;
  /**
   * AI 专用的直接出招请求:填入招式 id,角色在下一次可行动时直接使出(仍受能量限制),然后清空。
   * 脚本 AI 用它来放指令技和技能,省去模拟搓招。玩家与神经网络不使用这个字段。
   */
  aiMove?: string;
  /** 控制器私有状态(脚本 AI 用) */
  brain: Record<string, number>;
  deadFrame: number;
}

export interface Projectile {
  id: number;
  owner: number;
  team: number;
  move: MoveDef;
  def: ProjectileDef;
  x: number; y: number; z: number;
  dir: 1 | -1;
  life: number;
  hitIds: number[];
}

export type SimEvent =
  | { type: 'hit'; x: number; y: number; z: number; heavy: boolean; attacker: number; victim: number; damage: number; combo: number }
  | { type: 'ko'; id: number; team: number }
  | { type: 'whiff'; id: number; heavy: boolean }
  | { type: 'land'; id: number }
  | { type: 'comboBreak'; victim: number }
  | { type: 'spawn'; id: number }
  | { type: 'cast'; id: number };

export interface RoomDef {
  id: string;
  name: string;
  width: number;
  depth: number;
  theme: string;
  /** 每一波的敌人:角色 id 列表 */
  waves: string[][];
  /** 进入房间时显示的一句剧情(可选) */
  story?: string;
}

/** 路线图上的一个节点(对应一个房间) */
export interface MapNode {
  id: string;
  /** 所在路线:0 上路 / 1 中路 / 2 下路 */
  lane: 0 | 1 | 2;
  /** 从左到右的列号(0 起),同一列的节点互为分支 */
  col: number;
  /** 房间 id */
  room: string;
  /** battle 普通战斗 / elite 精英 / rest 休整(回血,无敌人) / boss 首领 */
  kind: 'battle' | 'elite' | 'rest' | 'boss';
  /** 通关后可前往的节点 id(可跨路线,形成「野区」换路) */
  next: string[];
}

/** 一章:一张 3 路路线图,最后汇合到 Boss */
export interface ChapterDef {
  id: string;
  name: string;
  /** 章节开场剧情(逐行显示) */
  intro: string[];
  /** 击败 Boss 后的剧情 */
  outro: string[];
  nodes: MapNode[];
  /** 开局可选的起点节点 id(通常是三路各一个) */
  start: string[];
}

/** 用户自制内容包(编辑器导出 / 导入的格式,也是存在 localStorage 里的格式) */
export interface ContentPack {
  format: 'ashen-abyss-pack';
  version: 1;
  characters: CharacterDef[];
  rooms: RoomDef[];
  chapters: ChapterDef[];
}

export const SIM = {
  HZ: 60,
  GRAVITY: 0.022,
  INPUT_BUFFER: 8,
  MOTION_WINDOW: 20,
  /** 受保护目标(Boss)的连击值上限:达到后强制挣脱并震开周围敌人 */
  COMBO_LIMIT_BOSS: 14,
  /** 玩家方被连击的上限:达到后强制击飞脱离并获得无敌,防止被小怪围殴致死 */
  COMBO_LIMIT_PLAYER: 9,
  /** 同一招在一套连段里最多用几次;超过则对手强制挣脱 */
  MOVE_REUSE_LIMIT: 3,
  /** 同一招每多用一次,造成的僵直减少的比例(换新招不受影响) */
  STUN_DECAY_PER_REUSE: 0.35,
  /** 连击伤害补正:每多一击伤害降低的比例,以及下限 */
  DAMAGE_SCALE_STEP: 0.07,
  DAMAGE_SCALE_MIN: 0.1,
  /** Boss 在一套连段中受到的伤害超过最大生命的这个比例后,伤害压到下限 */
  BOSS_COMBO_DAMAGE_CAP: 0.25,
  JUGGLE_DECAY: 0.86,
  KNOCKDOWN_FRAMES: 40,
  GETUP_FRAMES: 22,
  GETUP_INVULN: 40,
  DODGE_FRAMES: 20,
  DODGE_INVULN: 14,
  DODGE_SPEED: 0.16,
  RUN_MULT: 1.8,
  Z_SPEED_MULT: 0.7,
  /** 每清完一波,玩家方回复的生命比例(相当于街机里掉落的食物) */
  WAVE_HEAL: 0.1,
  BODY_HALF_W: 0.38,
  BODY_H: 1.8,
} as const;
