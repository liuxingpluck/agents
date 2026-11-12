// 键盘 / 手柄输入 → 模拟层位掩码。按键绑定可自定义并存入 localStorage。
//
// 默认是「四键制」简易操作:轻攻击 / 重攻击 / 跳跃 / 职业特殊技。
// 模拟层内部仍然是 轻拳·重拳·轻脚·重脚 + 多个技能键,这里负责把四个键翻译过去:
//   轻攻击:默认出轻拳;按下瞬间按着 ↓ 则出轻脚
//   重攻击:默认出重拳;按下瞬间按着 ↓ 则出重脚(多数角色是挑空技)
//   轻 + 重 同时按:抓投
//   特殊技:不按方向 = 技能 1;按着 ← 或 → = 技能 2;按着 ↓ = 技能 3;按着 ↑ = 技能 4(奥义)
// 经典的独立按键(U/I 出脚、数字键放技能)依然有效,老玩家可以直接用。
import { Btn, BtnName } from '../sim/types';

export type Bindings = Record<BtnName, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  UP: ['KeyW', 'ArrowUp'], DOWN: ['KeyS', 'ArrowDown'], LEFT: ['KeyA', 'ArrowLeft'], RIGHT: ['KeyD', 'ArrowRight'],
  LP: ['KeyJ'], HP: ['KeyK'], LK: ['KeyU'], HK: ['KeyI'],
  JUMP: ['Space'], DODGE: ['ShiftLeft', 'ShiftRight'],
  S1: ['Digit1', 'KeyH'], S2: ['Digit2', 'KeyY'], S3: ['Digit3', 'KeyO'], S4: ['Digit4', 'KeyP'],
  S5: ['Digit5'], S6: ['Digit6'], S7: ['Digit7'], S8: ['Digit8'],
};

/** 特殊技键(四键制专用,不属于模拟层按钮) */
export const DEFAULT_SPECIAL = ['KeyL'];

const KEY = 'ashen-abyss.bindings.v2';

export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) };
  } catch { /* 无痕模式等情况下忽略 */ }
  return structuredClone(DEFAULT_BINDINGS);
}
export function saveBindings(b: Bindings) {
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

// 标准手柄映射:A 跳 X 轻攻击 Y 重攻击 B 特殊技 RB/RT 闪避 LB/LT/摇杆按下 直接放技能
const PAD: Array<[number, BtnName]> = [
  [0, 'JUMP'], [2, 'LP'], [3, 'HP'], [5, 'DODGE'], [7, 'DODGE'], [4, 'S1'], [6, 'S2'], [10, 'S3'], [11, 'S4'],
  [12, 'UP'], [13, 'DOWN'], [14, 'LEFT'], [15, 'RIGHT'],
];

export class InputManager {
  private down = new Set<string>();
  /** 特殊技键的键位 */
  specialCodes: string[] = [...DEFAULT_SPECIAL];
  /** 上一次 read 时 轻 / 重 / 特殊 三个键是否按着(用来检测「刚按下」) */
  private prevLight = false; private prevHeavy = false; private prevSpecial = false;
  /** 三个键本次按下期间被翻译成的模拟层按钮(按下瞬间锁定,松开清零) */
  private latchLight = 0; private latchHeavy = 0; private latchSpecial = 0;
  /** 轻 / 重键已经按住了多少帧(没按时为 99) */
  private lightAge = 99; private heavyAge = 99;
  private codeToBtn = new Map<string, number>();
  bindings: Bindings;
  /** 任意键按下的回调(菜单用) */
  onKey: ((code: string) => void) | null = null;

  constructor() {
    this.bindings = loadBindings();
    this.rebuild();
    window.addEventListener('keydown', e => {
      if (this.codeToBtn.has(e.code) || this.specialCodes.includes(e.code) || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.onKey?.(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  rebuild() {
    this.codeToBtn.clear();
    for (const k of Object.keys(this.bindings) as BtnName[]) {
      for (const code of this.bindings[k]) this.codeToBtn.set(code, (this.codeToBtn.get(code) ?? 0) | Btn[k]);
    }
  }

  setBinding(btn: BtnName, codes: string[]) {
    this.bindings[btn] = codes;
    saveBindings(this.bindings);
    this.rebuild();
  }

  /**
   * 读取当前输入,返回模拟层位掩码。每个模拟帧调用一次(内部依赖逐帧的按下检测)。
   */
  read(): number {
    let m = 0;
    for (const code of this.down) m |= this.codeToBtn.get(code) ?? 0;
    let special = this.specialCodes.some(c => this.down.has(c));
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      for (const [i, b] of PAD) if (pad.buttons[i]?.pressed) m |= Btn[b];
      if (pad.buttons[1]?.pressed) special = true; // 手柄 B 键 = 特殊技
      const [ax, ay] = pad.axes;
      if (ax < -0.4) m |= Btn.LEFT; else if (ax > 0.4) m |= Btn.RIGHT;
      if (ay < -0.4) m |= Btn.UP; else if (ay > 0.4) m |= Btn.DOWN;
    }
    return this.translate(m, special);
  }

  /**
   * 四键制翻译:把「轻 / 重 / 特殊」三个键按当时的方向换成具体的模拟层按钮。
   * @param m       原始位掩码(其中 LP 位代表轻攻击键,HP 位代表重攻击键)
   * @param special 特殊技键是否按着
   */
  private translate(m: number, special: boolean): number {
    const light = (m & Btn.LP) !== 0, heavy = (m & Btn.HP) !== 0;
    const down = (m & Btn.DOWN) !== 0;
    this.lightAge = light ? (this.prevLight ? this.lightAge + 1 : 0) : 99;
    this.heavyAge = heavy ? (this.prevHeavy ? this.heavyAge + 1 : 0) : 99;
    if (light && !this.prevLight) this.latchLight = down ? Btn.LK : Btn.LP;
    if (heavy && !this.prevHeavy) this.latchHeavy = down ? Btn.HK : Btn.HP;
    // 轻 + 重 在 5 帧内先后按下 → 抓投(模拟层的抓投指令是 轻拳+轻脚 同时按住)。
    // 人手不可能真的同一帧按下两个键,所以留出容错窗口;先出的那一下普通技会被抓投顶掉。
    if (light && heavy && ((this.heavyAge === 0 && this.lightAge <= 5) || (this.lightAge === 0 && this.heavyAge <= 5))) {
      this.latchLight = Btn.LP | Btn.LK; this.latchHeavy = 0;
    }
    if (!light) this.latchLight = 0;
    if (!heavy) this.latchHeavy = 0;
    if (special && !this.prevSpecial) {
      this.latchSpecial = m & Btn.UP ? Btn.S4 : down ? Btn.S3 : m & (Btn.LEFT | Btn.RIGHT) ? Btn.S2 : Btn.S1;
    }
    if (!special) this.latchSpecial = 0;
    this.prevLight = light; this.prevHeavy = heavy; this.prevSpecial = special;
    return (m & ~(Btn.LP | Btn.HP)) | this.latchLight | this.latchHeavy | this.latchSpecial;
  }
}
