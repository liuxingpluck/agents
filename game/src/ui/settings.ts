// 设置面板:改键、音量。键位保存在浏览器本地。
import { BtnName } from '../sim/types';
import { InputManager } from './input';
import { Sfx } from '../render/audio';

/** 面板里列出的动作:[内部名, 显示名]。SPECIAL 是四键制的特殊技键。 */
const ACTIONS: Array<[BtnName | 'SPECIAL', string]> = [
  ['UP', '上(向内)'], ['DOWN', '下(向外)'], ['LEFT', '左'], ['RIGHT', '右'],
  ['LP', '轻攻击'], ['HP', '重攻击'], ['JUMP', '跳跃'], ['SPECIAL', '特殊技'], ['DODGE', '闪避'],
];

/** 把 KeyboardEvent.code 变成好读的名字 */
export function keyName(code: string): string {
  const fixed: Record<string, string> = {
    Space: '空格', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: '左 Shift', ShiftRight: '右 Shift', ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl', Enter: '回车',
  };
  return fixed[code] ?? code.replace(/^Key|^Digit/, '').replace(/^Numpad/, '小键盘 ');
}

let open = false;
/** 设置面板是否打开(打开时游戏暂停、菜单不响应按键) */
export const isSettingsOpen = () => open;

/**
 * 创建设置面板,并把页面上的「设置」链接接上。
 * @param link 点击后打开面板的元素
 */
export function setupSettings(input: InputManager, sfx: Sfx, link: HTMLElement) {
  const el = document.createElement('div');
  el.id = 'settings';
  document.getElementById('hud')!.appendChild(el);

  const codesOf = (a: BtnName | 'SPECIAL') => (a === 'SPECIAL' ? input.specialCodes : input.bindings[a]);

  /** 重画面板内容 */
  const draw = (waiting?: string) => {
    el.innerHTML = `<div class="box"><h1>设置</h1>` +
      ACTIONS.map(([a, label]) =>
        `<label>${label}<button data-a="${a}">${waiting === a ? '请按下新按键…' : codesOf(a).map(keyName).join(' / ')}</button></label>`).join('') +
      `<label>音量<input id="vol" type="range" min="0" max="1" step="0.05" value="${sfx.volume}"></label>` +
      `<div class="row"><button id="set-reset">恢复默认键位</button><button id="set-close" class="primary">完成</button></div>` +
      `<p>点击某一项后按下新按键即可修改。手柄可直接使用:A 跳 · X 轻 · Y 重 · B 特殊技 · RB 闪避。</p></div>`;
    el.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a as BtnName | 'SPECIAL';
      draw(a);
      input.captureNext = code => {
        if (code !== 'Escape') { if (a === 'SPECIAL') input.setSpecial([code]); else input.setBinding(a, [code]); }
        draw();
      };
    }));
    el.querySelector<HTMLInputElement>('#vol')!.addEventListener('input', e => sfx.setVolume(Number((e.target as HTMLInputElement).value)));
    el.querySelector('#set-reset')!.addEventListener('click', () => { input.resetBindings(); draw(); });
    el.querySelector('#set-close')!.addEventListener('click', close);
  };

  const close = () => { open = false; input.captureNext = null; el.classList.remove('show'); };
  link.addEventListener('click', e => { e.preventDefault(); open = true; el.classList.add('show'); draw(); });
  window.addEventListener('keydown', e => { if (open && e.code === 'Escape' && !input.captureNext) close(); });
}
