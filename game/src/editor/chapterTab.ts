// 「章节」标签页:编辑 ChapterDef(名称 / 剧情 / 起点 / 节点表),并用 SVG 画出 3 路节点图,随编辑实时更新。
import { ChapterDef, MapNode } from '../sim/types';
import { Ctx } from './ctx';
import { blankChapter, uniqueId } from './templates';
import { ENUMS, isValidId, validateChapter } from './validate';
import { Opt, Rec, el, fill, labeled, multiSelectEl, numField, renderErrors, selectEl, textField } from './ui';

/** 节点类型的中文名 */
const KIND_NAMES: Record<string, string> = { battle: '战斗', elite: '精英', rest: '休整', boss: '首领' };
/** 三条路线的中文名(下标 = lane) */
const LANE_NAMES = ['上路', '中路', '下路'];
/** SVG 元素必须使用的命名空间 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 创建带命名空间的 SVG 元素 */
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: (Node | string)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}

/**
 * 画 3 路节点图。x = 列号,y = 路线;连线为平滑曲线 + 箭头;起点节点有「起」标记。
 * 引用了不存在节点的连线被忽略(由校验面板报告)。
 * @param ch 章节
 * @returns SVG 元素
 */
export function drawGraph(ch: ChapterDef): SVGSVGElement {
  // 路线图的尺寸参数:列宽、路线高、四周留白
  const colW = 96, laneH = 64, padX = 52, padY = 36;
  const maxCol = Math.max(1, ...ch.nodes.map(n => (Number.isFinite(n.col) ? n.col : 0)));
  const W = padX * 2 + maxCol * colW, H = padY * 2 + laneH * 2;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graph', role: 'img', 'aria-label': '章节路线图' });
  s.append(svg('defs', {}, svg('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, svg('path', { d: 'M0 0L10 5L0 10z', class: 'arrow' }))));
  // 路线底色条与标签
  for (let l = 0; l < 3; l++) {
    const y = padY + l * laneH;
    s.append(svg('rect', { x: 0, y: y - laneH / 2 + 4, width: W, height: laneH - 8, class: 'lane' }));
    s.append(svg('text', { x: 6, y: y - laneH / 2 + 16, class: 'lanelabel' }, LANE_NAMES[l]));
  }
  // 节点坐标:列号决定横向,路线决定纵向;非法值退回到第 0 列 / 中路,避免画崩
  const pos = (n: MapNode) => ({ x: padX + (Number.isFinite(n.col) ? n.col : 0) * colW, y: padY + (n.lane >= 0 && n.lane <= 2 ? n.lane : 1) * laneH });
  const byId = new Map(ch.nodes.map(n => [n.id, n]));
  // 连线
  for (const n of ch.nodes) {
    const a = pos(n);
    for (const t of n.next ?? []) {
      const m = byId.get(t);
      if (!m) continue;
      const b = pos(m);
      const dx = (b.x - a.x) / 2;
      // 起止点缩进节点半径,避免箭头被圆盖住
      const r = 15, ang = Math.atan2(b.y - a.y, b.x - a.x);
      const x1 = a.x + Math.cos(ang) * r, y1 = a.y + Math.sin(ang) * r, x2 = b.x - Math.cos(ang) * (r + 3), y2 = b.y - Math.sin(ang) * (r + 3);
      s.append(svg('path', { d: `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`, class: `edge${a.y !== b.y ? ' cross' : ''}`, 'marker-end': 'url(#arr)' }));
    }
  }
  // 节点
  for (const n of ch.nodes) {
    const p = pos(n);
    const isStart = ch.start.includes(n.id);
    s.append(
      svg('circle', { cx: p.x, cy: p.y, r: 15, class: `node k-${n.kind}${isStart ? ' start' : ''}` }),
      svg('text', { x: p.x, y: p.y + 4, class: 'nodeicon' }, n.kind === 'boss' ? '王' : n.kind === 'elite' ? '精' : n.kind === 'rest' ? '休' : '战'),
      svg('text', { x: p.x, y: p.y + 30, class: 'nodelabel' }, n.id),
    );
    if (isStart) s.append(svg('text', { x: p.x + 24, y: p.y - 12, class: 'startmark' }, '起'));
  }
  return s;
}

/**
 * 创建章节标签页。节点表中的「后续」是多选下拉(只列出其他节点)。
 */
export function createChapterTab(ctx: Ctx): { root: HTMLElement; onShow(): void } {
  const root = el('div', { class: 'tab' });
  // selId:当前选中的章节 id;cur() 取出该章节对象
  let selId: string | null = null;
  const cur = (): ChapterDef | undefined => ctx.pack.chapters.find(c => c.id === selId);
  // allIds:已用章节 id;roomIds:可选房间 id
  const allIds = () => ctx.pack.chapters.map(c => c.id);
  const roomIds = () => ctx.roomOptions().map(([v]) => v);

  const errBox = el('div', { class: 'errs' });
  const graphBox = el('div', { class: 'graphbox' });
  const listBox = el('div', { class: 'list' });
  const formBox = el('div');

  /** 任何改动:保存 + 校验 + 重画节点图(不重建表单) */
  const touch = () => { ctx.save(); refreshView(); };
  /** 刷新校验面板与节点图 */
  function refreshView() {
    const c = cur();
    if (!c) return;
    renderErrors(errBox, validateChapter(c, roomIds()));
    fill(graphBox, drawGraph(c));
  }

  const toolbar = el('div', { class: 'row' },
    el('button', {
      class: 'primary',
      onclick: () => {
        const room = ctx.roomOptions()[0]?.[0] ?? 'outpost';
        const c = blankChapter(uniqueId('chapter', allIds()), room);
        ctx.pack.chapters.push(c); selId = c.id; ctx.save(); renderAll();
      },
    }, '＋ 新建章节'),
    el('button', {
      class: 'danger',
      onclick: () => {
        const d = cur();
        if (!d || !confirm(`确定删除章节「${d.name}」吗?`)) return;
        ctx.pack.chapters = ctx.pack.chapters.filter(c => c !== d);
        selId = ctx.pack.chapters[0]?.id ?? null;
        ctx.save(); renderAll();
      },
    }, '删除选中'),
  );

  /** 重绘列表与整个表单 */
  function renderAll() {
    fill(listBox, ...(ctx.pack.chapters.length
      ? ctx.pack.chapters.map(c => el('button', { class: `item${c.id === selId ? ' on' : ''}`, onclick: () => { selId = c.id; renderAll(); } },
        c.name || '未命名', el('small', null, ` ${c.id} · ${c.nodes.length} 个节点`)))
      : [el('div', { class: 'empty' }, '还没有自制章节。点击「新建章节」会生成一张三路汇合到 Boss 的最小路线图。')]));
    const d = cur();
    if (!d) { fill(formBox, el('p', { class: 'hint' }, '选择或创建一个章节后在此编辑。')); fill(graphBox); renderErrors(errBox, []); return; }
    const c = d as unknown as Rec;

    const idBox = el('input', { type: 'text', value: d.id });
    idBox.addEventListener('change', () => {
      const nv = idBox.value.trim();
      if (nv === d.id) return;
      if (!isValidId(nv) || allIds().includes(nv)) { alert('id 不合法或已存在:需小写字母开头,仅小写字母/数字/下划线,2~24 字符,且不能重复。'); idBox.value = d.id; return; }
      d.id = nv; selId = nv; ctx.save(); renderAll();
    });
    // 把「一行一句」的文本框与剧情数组互相绑定
    const lines = (key: 'intro' | 'outro') => {
      const ta = el('textarea', { rows: 4 });
      ta.value = d[key].join('\n');
      ta.addEventListener('input', () => { d[key] = ta.value.split('\n'); touch(); });
      return ta;
    };
    const startBox = el('div');
    const nodesBox = el('div');
    renderStart(d, startBox);
    renderNodes(d, nodesBox, startBox);

    fill(formBox,
      el('section', null, el('h3', null, '基本信息'),
        el('div', { class: 'grid' }, labeled('id', idBox), labeled('章节名称', textField(c, 'name', () => { touch(); renderList(); }))),
        el('div', { class: 'grid g2' }, labeled('开场剧情(一行一句)', lines('intro')), labeled('结尾剧情(击败 Boss 后,一行一句)', lines('outro'))),
      ),
      el('section', null, el('h3', null, '路线图'), graphBox,
        el('p', { class: 'hint' }, '圆圈颜色:战斗(骨白)/ 精英(金)/ 休整(绿)/ 首领(红);带「起」的是开局可选起点;弯曲连线表示换路。')),
      el('section', null, el('h3', null, '起点'), el('p', { class: 'hint' }, '开局可选的节点(按住 Ctrl / Shift 多选)。'), startBox),
      el('section', null, el('h3', null, '节点表'), nodesBox),
    );
    refreshView();
  }
  /** 仅更新列表里的名称(改章节名时) */
  function renderList() {
    fill(listBox, ...ctx.pack.chapters.map(c => el('button', { class: `item${c.id === selId ? ' on' : ''}`, onclick: () => { selId = c.id; renderAll(); } },
      c.name || '未命名', el('small', null, ` ${c.id} · ${c.nodes.length} 个节点`))));
  }

  /** 起点多选 */
  function renderStart(d: ChapterDef, box: HTMLElement) {
    fill(box, multiSelectEl(d.nodes.map((n): Opt => [n.id, `${n.id}(${LANE_NAMES[n.lane] ?? '?'} 第${n.col}列)`]), d.start, v => { d.start = v; touch(); }, 4));
  }

  /** 节点表:id / 路线 / 列 / 房间 / 类型 / 后续(多选) / 删除 */
  function renderNodes(d: ChapterDef, box: HTMLElement, startBox: HTMLElement) {
    const rows = d.nodes.map(n => {
      const nr = n as unknown as Rec;
      const idIn = el('input', { type: 'text', value: n.id, class: 'w90' });
      idIn.addEventListener('change', () => {
        const nv = idIn.value.trim();
        if (nv === n.id) return;
        if (!nv || d.nodes.some(x => x.id === nv)) { alert('节点 id 不能为空或重复。'); idIn.value = n.id; return; }
        // 同步所有 next / start 引用
        for (const o of d.nodes) o.next = o.next.map(x => (x === n.id ? nv : x));
        d.start = d.start.map(x => (x === n.id ? nv : x));
        n.id = nv;
        touch(); renderStart(d, startBox); renderNodes(d, box, startBox);
      });
      const others = d.nodes.filter(o => o !== n).map((o): Opt => [o.id, o.id]);
      return el('tr', null,
        el('td', null, idIn),
        el('td', null, selectEl(LANE_NAMES.map((t, i): Opt => [String(i), t]), String(n.lane), v => { n.lane = Number(v) as 0 | 1 | 2; touch(); renderStart(d, startBox); })),
        el('td', null, numField(nr, 'col', () => { touch(); renderStart(d, startBox); }, { min: 0, step: 1, width: '58px' })),
        el('td', null, selectEl(ctx.roomOptions(), n.room, v => { n.room = v; touch(); })),
        el('td', null, selectEl(ENUMS.KINDS.map((k): Opt => [k, KIND_NAMES[k]]), n.kind, v => { n.kind = v as MapNode['kind']; touch(); })),
        el('td', null, multiSelectEl(others, n.next, v => { n.next = v; touch(); }, 3)),
        el('td', null, el('button', {
          class: 'sm danger',
          onclick: () => {
            d.nodes = d.nodes.filter(o => o !== n);
            for (const o of d.nodes) o.next = o.next.filter(x => x !== n.id);
            d.start = d.start.filter(x => x !== n.id);
            touch(); renderStart(d, startBox); renderNodes(d, box, startBox);
          },
        }, '删')),
      );
    });
    fill(box,
      el('div', { class: 'tablewrap' }, el('table', { class: 'moves' },
        el('thead', null, el('tr', null, ...['id', '路线', '列', '房间', '类型', '后续(可多选)', ''].map(t => el('th', null, t)))),
        el('tbody', null, ...rows))),
      el('div', { class: 'row' }, el('button', {
        onclick: () => {
          const id = uniqueId('node', d.nodes.map(x => x.id));
          const maxCol = Math.max(0, ...d.nodes.map(x => x.col));
          d.nodes.push({ id, lane: 1, col: maxCol, room: ctx.roomOptions()[0]?.[0] ?? 'outpost', kind: 'battle', next: [] });
          touch(); renderStart(d, startBox); renderNodes(d, box, startBox);
        },
      }, '＋ 添加节点')),
    );
  }

  root.append(toolbar, listBox, el('section', null, el('h3', null, '实时校验'), errBox), formBox);
  renderAll();

  return {
    root,
    onShow() { if (!cur()) selId = ctx.pack.chapters[0]?.id ?? null; renderAll(); },
  };
}
