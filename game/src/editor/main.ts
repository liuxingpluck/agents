// 编辑器入口:读取本机保存的自制内容包,搭建「角色/房间/章节/导入导出」四个标签页和右侧预览,
// 并负责自动保存与记住上次打开的标签页。
import { loadPack, savePack } from '../data/custom';
import { Ctx, derive } from './ctx';
import { Preview } from './preview';
import { createCharTab } from './charTab';
import { createRoomTab } from './roomTab';
import { createChapterTab } from './chapterTab';
import { createIoTab } from './ioTab';
import { el } from './ui';

/** 按 id 取页面元素的简写 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// 从本机浏览器读出自制内容包(没有则为空包)
const pack = loadPack();
const saveNote = $('save-note');

/** 上下文:tab 之间共享内容包与预览 */
const ctx = {
  pack,
  ...derive(pack),
  /** 保存到 localStorage 并更新状态栏 */
  save() {
    const ok = savePack(ctx.pack);
    const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    saveNote.textContent = ok ? `已自动保存 ${t}` : '保存失败(浏览器禁用了本地存储?)';
    saveNote.className = ok ? 'note' : 'note warn';
  },
  /** 让所有标签页重新渲染(导入/清空后用) */
  refreshAll() { tabs.forEach(t => t.page.onShow()); },
  preview: new Preview($('arena'), $('arena-info')),
} as Ctx;
// 注意:derive 闭包捕获的是 pack 对象本身;各标签页只「原地改字段」而不替换 ctx.pack,所以两者始终一致

// 标签页清单:id 用于记忆当前页,label 是按钮文字
const tabs = [
  { id: 'chars', label: '角色', page: createCharTab(ctx) },
  { id: 'rooms', label: '房间', page: createRoomTab(ctx) },
  { id: 'chapters', label: '章节', page: createChapterTab(ctx) },
  { id: 'io', label: '导入/导出', page: createIoTab(ctx) },
];

// 把各页面挂进页面,并生成顶部标签按钮
const bar = $('tabbar'), content = $('content');
for (const t of tabs) content.append(t.page.root);

/** 切换到某个标签页 */
function show(id: string) {
  for (const t of tabs) {
    t.page.root.hidden = t.id !== id;
    bar.querySelector<HTMLElement>(`[data-tab="${t.id}"]`)!.classList.toggle('on', t.id === id);
    if (t.id === id) t.page.onShow();
  }
  try { sessionStorage.setItem('ashen-abyss.editor.tab', id); } catch { /* ignore */ }
}
for (const t of tabs) bar.append(el('button', { class: 'tab-btn', 'data-tab': t.id, onclick: () => show(t.id) }, t.label));

// 恢复上次所在标签页;读不到或无效时回到「角色」
let start = 'chars';
try { start = sessionStorage.getItem('ashen-abyss.editor.tab') ?? start; } catch { /* ignore */ }
show(tabs.some(t => t.id === start) ? start : 'chars');

// 供自动化测试使用
(window as unknown as Record<string, unknown>).__editor = { ctx, show };
