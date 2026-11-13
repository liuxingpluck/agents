// 「导入/导出」标签页:导出整个内容包为 .json、导入 .json(先校验,有错误只显示不应用)、清空。
import { ContentPack } from '../sim/types';
import { emptyPack } from '../data/custom';
import { BUILTIN_CHAR_IDS, BUILTIN_ROOM_IDS, Ctx } from './ctx';
import { validatePack } from './validate';
import { download, el, fill, renderErrors } from './ui';

/**
 * 创建导入/导出标签页。
 * 导入有两种方式:「覆盖」整个当前内容包,或「合并」(同 id 以导入的为准)。
 */
export function createIoTab(ctx: Ctx): { root: HTMLElement; onShow(): void } {
  const root = el('div', { class: 'tab' });
  const summary = el('div', { class: 'note' });
  const packErrs = el('div', { class: 'errs' });
  const importErrs = el('div', { class: 'errs' });
  const status = el('div', { class: 'note', id: 'io-status' });
  // 隐藏的文件选择框,由「导入」按钮触发
  const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  // 导入方式单选:默认「合并」
  const mergeRadio = el('input', { type: 'radio', name: 'impmode', value: 'merge', checked: true });
  const replaceRadio = el('input', { type: 'radio', name: 'impmode', value: 'replace' });

  /** 刷新计数与整包校验 */
  function refresh() {
    const p = ctx.pack;
    summary.textContent = `当前内容包:${p.characters.length} 个角色 · ${p.rooms.length} 个房间 · ${p.chapters.length} 个章节(自动保存在本机浏览器)`;
    renderErrors(packErrs, validatePack(p, BUILTIN_CHAR_IDS, BUILTIN_ROOM_IDS), '整个内容包校验通过,可以导出分享');
  }

  /** 导出:即使有校验问题也允许导出(草稿备份),但会在状态里提醒 */
  function doExport() {
    const errs = validatePack(ctx.pack, BUILTIN_CHAR_IDS, BUILTIN_ROOM_IDS);
    download('ashen-abyss-pack.json', JSON.stringify(ctx.pack, null, 2));
    status.textContent = errs.length ? `已导出(注意:内容包仍有 ${errs.length} 个校验问题,游戏可能拒绝加载)` : '已导出 ashen-abyss-pack.json';
  }

  /** 按 id 合并两个数组:导入的覆盖同 id 的旧项,其余保留 */
  function mergeById<T extends { id: string }>(oldList: T[], incoming: T[]): T[] {
    const map = new Map(oldList.map(x => [x.id, x]));
    for (const x of incoming) map.set(x.id, x);
    return [...map.values()];
  }

  /** 读取并导入文件:JSON 解析 → validatePack → 无错误才应用 */
  async function doImport(f: File) {
    let data: unknown;
    try { data = JSON.parse(await f.text()); } catch (e) {
      renderErrors(importErrs, [`文件不是合法的 JSON:${(e as Error).message}`]);
      status.textContent = '导入失败';
      return;
    }
    const errs = validatePack(data, BUILTIN_CHAR_IDS, BUILTIN_ROOM_IDS);
    if (errs.length) { renderErrors(importErrs, errs); status.textContent = `导入失败:发现 ${errs.length} 个问题,未做任何改动`; return; }
    const inc = data as ContentPack;
    if (replaceRadio.checked) {
      ctx.pack.characters = inc.characters; ctx.pack.rooms = inc.rooms; ctx.pack.chapters = inc.chapters;
    } else {
      ctx.pack.characters = mergeById(ctx.pack.characters, inc.characters);
      ctx.pack.rooms = mergeById(ctx.pack.rooms, inc.rooms);
      ctx.pack.chapters = mergeById(ctx.pack.chapters, inc.chapters);
    }
    // 合并后可能出现跨包引用问题,再整体校验一次
    const after = validatePack(ctx.pack, BUILTIN_CHAR_IDS, BUILTIN_ROOM_IDS);
    ctx.save();
    ctx.refreshAll();
    fill(importErrs);
    importErrs.className = 'errs';
    status.textContent = `已导入 ${inc.characters.length} 个角色 · ${inc.rooms.length} 个房间 · ${inc.chapters.length} 个章节${after.length ? `(合并后有 ${after.length} 个问题,见下方)` : ''}`;
  }

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (f) await doImport(f);
    file.value = ''; // 允许重复选同一个文件
  });

  root.append(
    el('section', null, el('h3', null, '内容包'), summary, packErrs,
      el('div', { class: 'row' },
        el('button', { class: 'primary', id: 'btn-export', onclick: doExport }, '导出 .json'),
        el('button', { id: 'btn-import', onclick: () => file.click() }, '导入 .json…'), file,
        el('label', { class: 'inline' }, mergeRadio, ' 合并(同 id 以导入为准)'),
        el('label', { class: 'inline' }, replaceRadio, ' 覆盖当前内容'),
        el('button', {
          class: 'danger', id: 'btn-clear',
          onclick: () => {
            if (!confirm('确定清空所有自制角色、房间和章节吗?此操作不可撤销(建议先导出备份)。')) return;
            const e = emptyPack();
            ctx.pack.characters = e.characters; ctx.pack.rooms = e.rooms; ctx.pack.chapters = e.chapters;
            ctx.save(); ctx.refreshAll(); status.textContent = '已清空';
          },
        }, '清空'),
      ), status),
    el('section', null, el('h3', null, '导入检查结果'), el('p', { class: 'hint' }, '导入前会按规则校验整个文件,有任何问题就不会应用,并在这里列出。'), importErrs),
  );
  refresh();
  return { root, onShow: refresh };
}
