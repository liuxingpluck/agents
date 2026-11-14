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

/** 按钮名(Btn 的键名) */
export type BtnName = keyof typeof Btn;
/** 四个攻击键、八个技能键、以及方向键的位掩码 */
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

/** 招式的动作类型:决定方块人摆什么姿势(渲染用,不影响判定) */
export type AnimKind =
  | 'punchL' | 'punchR' | 'kick' | 'highKick' | 'sweep' | 'upper'
  | 'slash' | 'overhead' | 'thrust' | 'spin' | 'cast' | 'shoot' | 'slam' | 'airKick' | 'airSlash';

/** 判定框:一招能打到的范围 */
export interface Box {
  /** 相对角色原点,x 以朝向为正方向 */
  x0: number; x1: number;
  y0: number; y1: number;
  /** 纵深容差(±) */
  z: number;
}

/** 飞行道具的参数(火球、箭矢等) */
export interface ProjectileDef {
  speed: number;
  life: number; // 帧
  radius: number;
  y: number; // 发射高度
  color: string;
  pierce?: boolean;
}

/**
 * 一招的完整定义。帧数按 60 帧 / 秒计:
 * startup 前摇(出手前)→ active 判定(能打到人)→ recovery 收招(打完的硬直)
 */
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
  /** 空中砸地技:打中浮空的对手会把他猛砸向地面,落地后弹起一次,可以继续追打 */
  spike?: boolean;
  /** 地面招式也允许在空中使用(多为飞行道具类技能) */
  airOk?: boolean;
  /** 破防:无视对手的格挡并直接打破他的防御 */
  guardBreak?: boolean;
  /** 蓄力招:出手前只要还按着重攻击键就一直蓄力,松手才打出(只用于专门的蓄力重击) */
  chargeable?: boolean;
}

/** 指令技的出法:方向动作 + 按键 → 招式 id */
export interface CommandDef {
  motion: Motion;
  button: BtnName;
  move: string;
}

/** 职业 / 定位。enemy 普通敌人,boss 首领(受连击保护),prop 场景物件 */
export type Role = 'warrior' | 'tank' | 'mage' | 'archer' | 'brawler' | 'assassin' | 'summoner' | 'berserker' | 'lancer' | 'support' | 'enemy' | 'boss'
  /** 场景物件(木桶等):不会动,谁都能打,打碎掉道具 */
  | 'prop';

/** 外观参数:程序绘制的方块人按这些参数生成 */
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
  /** 发型与发色(不写则不画头发) */
  hair?: 'short' | 'long' | 'ponytail' | 'braid';
  hairColor?: string;
  /** 女性体型:腿更长、肩腰更窄,并可配短裙 */
  feminine?: boolean;
  skirt?: boolean;
  /** 腿部颜色(长袜 / 护腿);不写则用 secondary */
  legColor?: string;
}

/** 角色定义:纯数据。主角、敌人、Boss、召唤物、木桶都用这一种结构。 */
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
  /** 实心障碍物(只对场景物件有意义):挡住走路和飞行道具。hx / hz 是半宽与半深,h 是高度(跳得比它高就能越过) */
  solid?: { hx: number; hz: number; h: number };
}

/**
 * 角色状态:idle 站立 / walk 走 / run 跑 / jump 空中 / attack 出招中 / hitstun 受击硬直 /
 * launched 被打飞 / knockdown 倒地 / getup 起身 / dodge 闪避 / grabbed 被抓住 / guard 格挡 / dead 死亡
 */
export type FState =
  | 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'hitstun' | 'launched'
  | 'knockdown' | 'getup' | 'dodge' | 'grabbed' | 'guard' | 'dead';

/** 场上的一个角色(运行时状态) */
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
  /** 重攻击已经蓄力的帧数(按住重攻击键不放) */
  charge: number;
  /** 重攻击键已经连续按住多少帧(松开归零) */
  heavyHeld: number;
  /** 朝同一个方向连续走了多少帧(走一小会儿就自动跑起来) */
  walkFrames: number;
  /** 防御值:格挡会消耗它,耗尽则被破防;不格挡时慢慢恢复 */
  guard: number;
  /** 正在用哪个键维持格挡(闪避键,或 ↓↓+重 进入时的重键);松开就收起 */
  guardHold: number;
  /** 正被砸向地面(落地时弹起);本套连击是否已经砸地反弹过 */
  spiked: boolean;
  bounced: boolean;
  /** 本次连击中是否已经撞墙反弹过(每套连击只弹一次) */
  wallBounced: boolean;
  /**
   * 被投出后在空中飞行时,会砸到同队的其他角色。这里记录投掷者的队伍 + 1(0 表示不是被投出的)。
   */
  thrownBy: number;
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

/** 飞行中的道具(运行时状态) */
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

/** 掉落在地上的道具:走过去自动拾取 */
export interface Pickup {
  id: number;
  /** food 回复生命 / ember 回复能量 */
  kind: 'food' | 'ember';
  x: number; z: number;
  /** 剩余存在帧数,归零消失 */
  life: number;
}

/** 模拟层每帧产生的事件:渲染、音效、界面只读这些事件来做反馈,不反过来影响规则 */
export type SimEvent =
  | { type: 'hit'; x: number; y: number; z: number; heavy: boolean; attacker: number; victim: number; damage: number; combo: number }
  | { type: 'ko'; id: number; team: number }
  | { type: 'whiff'; id: number; heavy: boolean; again?: boolean } // again = 多段招式的后续几段(只画特效,不重复出声)
  | { type: 'dashCancel'; id: number }
  | { type: 'land'; id: number }
  | { type: 'comboBreak'; victim: number }
  /** 格挡住了一次攻击 / 完美格挡(弹反) / 被破防 */
  | { type: 'block'; x: number; y: number; z: number; victim: number }
  | { type: 'parry'; x: number; y: number; z: number; victim: number; attacker: number }
  | { type: 'guardBreak'; id: number }
  /** 蓄力重击出手(level 0..1 为蓄力程度) */
  | { type: 'chargeRelease'; id: number; level: number }
  /** 发动奥义 */
  | { type: 'super'; id: number }
  /** 被砸向地面后弹起 */
  | { type: 'groundBounce'; id: number; x: number; z: number }
  /** 被打飞的角色撞到版边反弹 */
  | { type: 'wallBounce'; id: number; x: number; y: number; z: number }
  /** 机关喷发 */
  | { type: 'hazard'; x: number; z: number }
  /** 场景物件被打碎 */
  | { type: 'break'; id: number; x: number; z: number }
  /** Boss 血量过半,进入狂暴阶段 */
  | { type: 'bossPhase'; id: number }
  /** 拾取道具 */
  | { type: 'pickup'; id: number; kind: Pickup['kind'] }
  /** 被打飞的角色在空中受身(恢复平衡) */
  | { type: 'recover'; id: number }
  | { type: 'spawn'; id: number }
  | { type: 'cast'; id: number };

/** 房间(一个战斗场景)的定义 */
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
  /** 场景机关(可选)。不写时按主题自动生成:矿道 / 王都 / 烬渊会有地面喷火口 */
  hazards?: HazardDef[];
}

/** 地面喷火口:每隔一段时间喷发一次,站在上面的角色(不分敌我)都会被烧伤并击飞 */
export interface HazardDef {
  x: number; z: number;
  /** 作用半径(米) */
  radius: number;
  /** 喷发周期(帧) */
  period: number;
  /** 伤害 */
  damage: number;
}

/** 运行中的机关 */
export interface Hazard extends HazardDef {
  id: number;
  /** 周期偏移,让各个喷火口错开喷发 */
  offset: number;
  /** 本次喷发已经烧到的角色(每次喷发每人只中一次) */
  hitIds: number[];
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

/** 全局规则参数:改这里的数字就能调整体手感 */
export const SIM = {
  HZ: 60,
  GRAVITY: 0.022,
  /** 输入缓冲(帧):提前按下的键在这段时间内仍然有效。顿帧期间不计时。 */
  INPUT_BUFFER: 10,
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
  RUN_MULT: 1.75,
  Z_SPEED_MULT: 0.7,
  /** 朝一个方向连续走这么多帧后自动转为奔跑(也可以快速按两下方向立刻跑) */
  AUTO_RUN_FRAMES: 16,
  /** 蓄力重击:按住至少多少帧才算蓄力、最多蓄多少帧;蓄满时的伤害加成 */
  CHARGE_MIN: 8,
  CHARGE_MAX: 45,
  CHARGE_BONUS: 0.9,
  /** 格挡:防御值上限、每帧恢复量、完美格挡(弹反)的时间窗口、被破防后的硬直、格挡时仍会受到的伤害比例 */
  GUARD_MAX: 100,
  GUARD_REGEN: 0.3,
  PARRY_WINDOW: 7,
  GUARD_BREAK_STUN: 55,
  BLOCK_CHIP: 0.15,
  /** 空中连招:空对空命中时自己获得的上浮速度(能在空中多停一会儿继续打) */
  AIR_HIT_FLOAT: 0.055,
  /** 撞墙反弹:水平速度超过这个值才会弹,弹回时保留的速度比例 */
  WALL_BOUNCE_MIN_VX: 0.09,
  WALL_BOUNCE_KEEP: 0.55,
  /** 被投出的角色砸到同伴时造成的伤害 */
  THROW_COLLIDE_DAMAGE: 9,
  /** 空中受身:被打飞至少多少帧后才能按跳跃键恢复 */
  RECOVER_MIN_FRAMES: 16,
  /** 机关:喷发前的预警帧数、喷发持续帧数 */
  HAZARD_WARN: 70,
  HAZARD_ACTIVE: 14,
  /** 场景物件所在的队伍编号(既不是玩家方 0 也不是敌方 1,所以双方都能打) */
  PROP_TEAM: 2,
  /** 打碎物件后掉落道具的概率 */
  PROP_DROP_CHANCE: 0.6,
  /** 敌人被击倒时掉落道具的概率;食物回复的生命比例;余烬回复的能量 */
  DROP_CHANCE: 0.16,
  FOOD_HEAL: 0.18,
  EMBER_ENERGY: 35,
  PICKUP_LIFE: 60 * 12,
  /** 每清完一波,玩家方回复的生命比例(相当于街机里掉落的食物) */
  WAVE_HEAL: 0.07,
  BODY_HALF_W: 0.38,
  BODY_H: 1.8,
} as const;
