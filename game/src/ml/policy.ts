// 策略控制器:观测 → 网络 → 动作 → 输入位掩码。
// 网络输出两个「头」:移动(7 选 1)和按键(15 选 1),各自取最大值。
// 每 DECISION_INTERVAL 帧决策一次,期间由本文件把动作展开成逐帧的按键
// (包括指令技的「↓→ + 键」这种多帧输入),这样网络不需要自己学会搓招。
import { Btn, BtnName, Fighter, Motion } from '../sim/types';
import { Controller, World } from '../sim/world';
import { Layout, Mlp } from './mlp';
import { encodeObs, OBS_DIM } from './obs';

/** 每隔多少帧做一次决策(6 帧 = 每秒 10 次,接近人类的反应节奏) */
export const DECISION_INTERVAL = 6;

/** 移动头的选项数:不动 / 靠近 / 远离 / 上 / 下 / 靠近+上 / 靠近+下 */
export const N_MOVE = 7;
/** 按键头的选项:无、四个攻击键、跳、闪避、抓取、4 个技能、3 个指令技 */
export const BUTTON_ACTIONS = ['NONE', 'LP', 'HP', 'LK', 'HK', 'JUMP', 'DODGE', 'GRAB', 'S1', 'S2', 'S3', 'S4', 'C1', 'C2', 'C3'] as const;
export const N_BUTTON = BUTTON_ACTIONS.length;
/** 网络输出总长度 */
export const ACT_DIM = N_MOVE + N_BUTTON;
/** 默认网络结构 */
export const DEFAULT_LAYOUT: Layout = [OBS_DIM, 48, 48, ACT_DIM];

/** 指令动作拆成 3 个阶段的方向:F 前 B 后 D 下 U 上 N 松开 */
const MOTION_STEPS: Record<Motion, [string, string, string]> = {
  DF: ['D', 'DF', 'F'], DB: ['D', 'DB', 'B'], DU: ['D', 'U', 'U'],
  BF: ['B', 'F', 'F'], FF: ['F', 'N', 'F'], DD: ['D', 'N', 'D'],
};

/** 把相对方向字符串(如 'DF')换算成实际按键,dir 为对手所在方向 */
function dirMask(rel: string, facing: 1 | -1): number {
  let m = 0;
  if (rel.includes('F')) m |= facing === 1 ? Btn.RIGHT : Btn.LEFT;
  if (rel.includes('B')) m |= facing === 1 ? Btn.LEFT : Btn.RIGHT;
  if (rel.includes('D')) m |= Btn.DOWN;
  if (rel.includes('U')) m |= Btn.UP;
  return m;
}

/** 在 arr[from, from+n) 里找最大值的下标 */
function argmax(arr: Float32Array, from: number, n: number): number {
  let best = 0, bv = -Infinity;
  for (let i = 0; i < n; i++) if (arr[from + i] > bv) { bv = arr[from + i]; best = i; }
  return best;
}

/**
 * 用一组网络参数创建控制器。每个角色需要各自独立的控制器实例(内部有决策状态)。
 * @param params 网络参数
 * @param layout 网络结构,须与参数长度匹配
 */
export function makePolicyController(params: Float32Array, layout: Layout = DEFAULT_LAYOUT): Controller {
  const net = new Mlp(layout);
  const obs = new Float32Array(OBS_DIM);
  let move = 0, button = 0, phase = 0, toward: 1 | -1 = 1, lockedFacing: 1 | -1 = 1;

  return (w: World, self: Fighter): number => {
    if (phase === 0) {
      const opp = encodeObs(w, self, obs);
      if (!opp) return 0;
      const out = net.forward(params, obs);
      move = argmax(out, 0, N_MOVE);
      button = argmax(out, N_MOVE, N_BUTTON);
      toward = opp.x >= self.x ? 1 : -1;
      lockedFacing = self.facing; // 指令技按出招瞬间的朝向来搓
    }
    const t = phase;
    phase = (phase + 1) % DECISION_INTERVAL;

    // --- 移动头 ---
    let mask = 0;
    const towardBtn = toward === 1 ? Btn.RIGHT : Btn.LEFT, awayBtn = toward === 1 ? Btn.LEFT : Btn.RIGHT;
    switch (move) {
      case 1: mask |= towardBtn; break;
      case 2: mask |= awayBtn; break;
      case 3: mask |= Btn.UP; break;
      case 4: mask |= Btn.DOWN; break;
      case 5: mask |= towardBtn | Btn.UP; break;
      case 6: mask |= towardBtn | Btn.DOWN; break;
    }

    // --- 按键头 ---
    const act = BUTTON_ACTIONS[button];
    const press = t < 2; // 只在决策周期的前 2 帧按下,之后松开,形成「按下」边沿
    if (act === 'NONE') return mask;
    if (act === 'GRAB') return press ? mask | Btn.LP | Btn.LK : mask;
    if (act[0] === 'C') {
      // 指令技:6 帧拆成 3 段方向,最后一段同时按键;这期间覆盖移动头
      const cmd = self.def.commands[Number(act[1]) - 1];
      if (!cmd) return mask;
      const steps = MOTION_STEPS[cmd.motion];
      const seg = Math.min(2, Math.floor(t / 2));
      let m = dirMask(steps[seg], lockedFacing);
      if (seg === 2) m |= Btn[cmd.button];
      return m;
    }
    return press ? mask | Btn[act as BtnName] : mask;
  };
}
