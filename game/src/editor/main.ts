// 角色 / 地图编辑器入口:加载内容包、搭建标签页与预览、自动保存。
import { loadPack, savePack } from '../data/custom';
import { Ctx, derive } from './ctx';
import { Preview } from './preview';
import { createCharTab } from './charTab';
import { createRoomTab } from './roomTab';
import { createChapterTab } from './chapterTab';
import { createIoTab } from './ioTab';
import { el } from './ui';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

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
  refreshAll() { tabs.forEach(t => t.page.onShow()); },
  preview: new Preview($('arena'), $('arena-info')),
} as Ctx;
// 注意:derive 闭包捕获的是 pack 对象本身;各标签页只「原地改字段」而不替换 ctx.pack,所以两者始终一致

const tabs = [
  { id: 'chars', label: '角色', page: createCharTab(ctx) },
  { id: 'rooms', label: '房间', page: createRoomTab(ctx) },
  { id: 'chapters', label: '章节', page: createChapterTab(ctx) },
  { id: 'io', label: '导入/导出', page: createIoTab(ctx) },
];

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

let start = 'chars';
try { start = sessionStorage.getItem('ashen-abyss.editor.tab') ?? start; } catch { /* ignore */ }
show(tabs.some(t => t.id === start) ? start : 'chars');

// 供自动化测试使用
(window as unknown as Record<string, unknown>).__editor = { ctx, show };
