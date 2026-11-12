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
  | 'knockdown' | 'getup' | 'dodge' | 'dead';

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
}

export const SIM = {
  HZ: 60,
  GRAVITY: 0.022,
  INPUT_BUFFER: 8,
  MOTION_WINDOW: 20,
  COMBO_LIMIT: 30,
  MOVE_REUSE_LIMIT: 2,
  DAMAGE_SCALE_STEP: 0.08,
  DAMAGE_SCALE_MIN: 0.2,
  JUGGLE_DECAY: 0.86,
  KNOCKDOWN_FRAMES: 40,
  GETUP_FRAMES: 22,
  GETUP_INVULN: 40,
  DODGE_FRAMES: 20,
  DODGE_INVULN: 14,
  DODGE_SPEED: 0.16,
  RUN_MULT: 1.8,
  Z_SPEED_MULT: 0.7,
  BODY_HALF_W: 0.38,
  BODY_H: 1.8,
} as const;
