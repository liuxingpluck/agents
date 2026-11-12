// 编辑器的 DOM 小工具:创建元素与各类表单控件,所有控件都「直接读写」传入的数据对象。
// 约定:改动数据后调用 onChange(通常是保存 + 重新校验 + 刷新预览)。

/* eslint-disable @typescript-eslint/no-explicit-any */
/** 任意数据对象(编辑器直接改被编辑的 CharacterDef / RoomDef 等) */
export type Rec = Record<string, any>;
type Kid = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined> | null;

/**
 * 创建元素。attrs 中:`class` 设 className;`on*` 绑定事件;`value`/`checked`/`disabled`/`hidden` 作为属性赋值;
 * 其余走 setAttribute;值为 undefined/false 的属性被忽略。
 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') (e as any)[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c) e.append(c);
  return e;
}

/** 清空容器并放入新内容 */
export function fill(parent: HTMLElement, ...kids: Kid[]) {
  parent.replaceChildren(...(kids.filter(Boolean) as (Node | string)[]));
}

/** 带标签的表单行:`<label><span>标签</span>控件</label>` */
export function labeled(text: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  return el('label', { class: 'fld', title: hint }, el('span', null, text), control);
}

/** 数字输入框的选项 */
export interface NumOpts { min?: number; max?: number; step?: number; optional?: boolean; width?: string }

/**
 * 数字输入:绑定 obj[key]。optional 为 true 时,清空输入框会删除该字段(用于招式的可选属性)。
 */
export function numField(obj: Rec, key: string, onChange: () => void, o: NumOpts = {}): HTMLInputElement {
  const inp = el('input', { type: 'number', step: o.step ?? 'any', min: o.min, max: o.max, value: obj[key] === undefined ? '' : String(obj[key]) });
  if (o.width) inp.style.width = o.width;
  inp.addEventListener('input', () => {
    if (inp.value.trim() === '') { if (o.optional) { delete obj[key]; onChange(); } return; }
    const n = Number(inp.value);
    if (Number.isFinite(n)) { obj[key] = n; onChange(); }
  });
  return inp;
}

/** 文本输入:绑定 obj[key] */
export function textField(obj: Rec, key: string, onChange: () => void, placeholder = ''): HTMLInputElement {
  const inp = el('input', { type: 'text', value: obj[key] ?? '', placeholder });
  inp.addEventListener('input', () => { obj[key] = inp.value; onChange(); });
  return inp;
}

/** 多行文本:绑定 obj[key] */
export function areaField(obj: Rec, key: string, onChange: () => void, rows = 3): HTMLTextAreaElement {
  const ta = el('textarea', { rows });
  ta.value = obj[key] ?? '';
  ta.addEventListener('input', () => { obj[key] = ta.value; onChange(); });
  return ta;
}

/** 颜色选择:绑定 obj[key](#rrggbb)。原值若不是 6 位十六进制,显示为黑色但不改动数据,直到用户操作 */
export function colorField(obj: Rec, key: string, onChange: () => void): HTMLInputElement {
  const cur = typeof obj[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(obj[key]) ? obj[key] : '#000000';
  const inp = el('input', { type: 'color', value: cur });
  inp.addEventListener('input', () => { obj[key] = inp.value; onChange(); });
  return inp;
}

/**
 * 复选框:绑定 obj[key]。optional 为 true 时,取消勾选会删除字段(而不是写 false)。
 */
export function checkField(obj: Rec, key: string, onChange: () => void, optional = true): HTMLInputElement {
  const inp = el('input', { type: 'checkbox', checked: obj[key] === true });
  inp.addEventListener('change', () => {
    if (inp.checked) obj[key] = true; else if (optional) delete obj[key]; else obj[key] = false;
    onChange();
  });
  return inp;
}

/** 选项:[值, 显示文字] */
export type Opt = [string, string];

/** 下拉选择(单选),value 变化时回调新值 */
export function selectEl(opts: Opt[], current: string, onSet: (v: string) => void): HTMLSelectElement {
  const s = el('select', null, ...opts.map(([v, t]) => el('option', { value: v }, t)));
  // 当前值不在选项中(如引用了已删除的招式)时,补一个提示项,避免静默显示成别的值
  if (current !== '' && !opts.some(([v]) => v === current)) s.append(el('option', { value: current }, `${current}(不存在)`));
  s.value = current;
  s.addEventListener('change', () => onSet(s.value));
  return s;
}

/** 多选下拉(<select multiple>),变化时回调当前选中值数组 */
export function multiSelectEl(opts: Opt[], selected: string[], onSet: (v: string[]) => void, size = 4): HTMLSelectElement {
  const s = el('select', { multiple: true, size }, ...opts.map(([v, t]) => el('option', { value: v }, t)));
  for (const o of Array.from(s.options)) o.selected = selected.includes(o.value);
  s.addEventListener('change', () => onSet(Array.from(s.selectedOptions).map(o => o.value)));
  return s;
}

/** 校验错误面板:有错误时列出,没有时显示「全部通过」 */
export function renderErrors(box: HTMLElement, errs: string[], okText = '校验通过,可以放心使用') {
  box.className = `errs ${errs.length ? 'bad' : 'good'}`;
  if (!errs.length) { fill(box, el('div', { class: 'ok' }, `✔ ${okText}`)); return; }
  fill(box, el('div', { class: 'cnt' }, `发现 ${errs.length} 个问题`), el('ul', null, ...errs.map(e => el('li', null, e))));
}

/** 触发浏览器下载一个文本文件 */
export function download(filename: string, text: string, mime = 'application/json') {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 防抖:连续调用只在最后一次之后 ms 毫秒执行一次 */
export function debounce(fn: () => void, ms: number): () => void {
  let t: number | undefined;
  return () => { window.clearTimeout(t); t = window.setTimeout(fn, ms); };
}
