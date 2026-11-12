// 手机 / 平板的触屏操作:左边虚拟摇杆,右边五个按钮(轻 / 重 / 跳 / 技 / 闪)。
// 只在触屏设备上显示(或网址带 ?touch=1 时强制显示,方便在电脑上测试)。
import { Btn } from '../sim/types';
import { InputManager } from './input';

/** 当前设备是否应该显示触屏按键 */
export function wantsTouch(): boolean {
  return matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
}

/**
 * 创建触屏按键并接到输入管理器上。
 * @param input 输入管理器(虚拟按键的状态写进它的 virtualMask / virtualSpecial)
 */
export function setupTouch(input: InputManager) {
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML =
    `<div id="stick"><i></i></div>` +
    `<div id="pad">` +
    `<button data-b="DODGE" class="s">闪</button><button data-b="SPECIAL" class="s sp">技</button>` +
    `<button data-b="JUMP">跳</button><button data-b="HP">重</button><button data-b="LP" class="l">轻</button></div>`;
  document.body.appendChild(root);
  document.body.classList.add('touch');

  // ----- 虚拟摇杆:按下的位置是中心,拖动超过一小段距离算推了方向 -----
  const stick = root.querySelector<HTMLElement>('#stick')!, knob = stick.querySelector<HTMLElement>('i')!;
  const DIRS = Btn.UP | Btn.DOWN | Btn.LEFT | Btn.RIGHT;
  let sx = 0, sy = 0, active = -1;
  const setDir = (dx: number, dy: number) => {
    let m = 0;
    if (dx < -18) m |= Btn.LEFT; else if (dx > 18) m |= Btn.RIGHT;
    if (dy < -18) m |= Btn.UP; else if (dy > 18) m |= Btn.DOWN;
    input.virtualMask = (input.virtualMask & ~DIRS) | m;
    const len = Math.hypot(dx, dy) || 1, k = Math.min(1, 46 / len);
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  stick.addEventListener('pointerdown', e => { active = e.pointerId; sx = e.clientX; sy = e.clientY; stick.setPointerCapture(e.pointerId); setDir(0, 0); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === active) setDir(e.clientX - sx, e.clientY - sy); });
  const end = (e: PointerEvent) => { if (e.pointerId === active) { active = -1; setDir(0, 0); } };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  // ----- 按钮 -----
  root.querySelectorAll<HTMLButtonElement>('#pad button').forEach(btn => {
    const name = btn.dataset.b!;
    const bit = name === 'SPECIAL' ? 'SPECIAL' as const : Btn[name as 'LP' | 'HP' | 'JUMP' | 'DODGE'];
    const set = (on: boolean) => {
      btn.classList.toggle('on', on);
      if (on) input.pressVirtual(bit); else input.releaseVirtual(bit);
    };
    btn.addEventListener('pointerdown', e => { btn.setPointerCapture(e.pointerId); set(true); e.preventDefault(); });
    btn.addEventListener('pointerup', () => set(false));
    btn.addEventListener('pointercancel', () => set(false));
  });
  // 禁止长按弹出菜单、双指缩放
  root.addEventListener('contextmenu', e => e.preventDefault());
}
