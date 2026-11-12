// 键盘 / 手柄输入 → 模拟层位掩码。按键绑定可自定义并存入 localStorage。
import { Btn, BtnName } from '../sim/types';

export type Bindings = Record<BtnName, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  UP: ['KeyW', 'ArrowUp'], DOWN: ['KeyS', 'ArrowDown'], LEFT: ['KeyA', 'ArrowLeft'], RIGHT: ['KeyD', 'ArrowRight'],
  LP: ['KeyJ'], HP: ['KeyK'], LK: ['KeyU'], HK: ['KeyI'],
  JUMP: ['Space'], DODGE: ['KeyL', 'ShiftLeft'],
  S1: ['Digit1', 'KeyH'], S2: ['Digit2', 'KeyY'], S3: ['Digit3', 'KeyO'], S4: ['Digit4', 'KeyP'],
  S5: ['Digit5'], S6: ['Digit6'], S7: ['Digit7'], S8: ['Digit8'],
};

const KEY = 'ashen-abyss.bindings.v1';

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

// 标准手柄映射:A 跳 X 轻拳 Y 重拳 B 轻脚 RB 重脚 RT 闪避 LB/LT/… 技能
const PAD: Array<[number, BtnName]> = [
  [0, 'JUMP'], [2, 'LP'], [3, 'HP'], [1, 'LK'], [5, 'HK'], [7, 'DODGE'], [4, 'S1'], [6, 'S2'], [10, 'S3'], [11, 'S4'],
  [12, 'UP'], [13, 'DOWN'], [14, 'LEFT'], [15, 'RIGHT'],
];

export class InputManager {
  private down = new Set<string>();
  private codeToBtn = new Map<string, number>();
  bindings: Bindings;
  /** 任意键按下的回调(菜单用) */
  onKey: ((code: string) => void) | null = null;

  constructor() {
    this.bindings = loadBindings();
    this.rebuild();
    window.addEventListener('keydown', e => {
      if (this.codeToBtn.has(e.code) || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
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

  read(): number {
    let m = 0;
    for (const code of this.down) m |= this.codeToBtn.get(code) ?? 0;
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      for (const [i, b] of PAD) if (pad.buttons[i]?.pressed) m |= Btn[b];
      const [ax, ay] = pad.axes;
      if (ax < -0.4) m |= Btn.LEFT; else if (ax > 0.4) m |= Btn.RIGHT;
      if (ay < -0.4) m |= Btn.UP; else if (ay > 0.4) m |= Btn.DOWN;
    }
    return m;
  }
}
