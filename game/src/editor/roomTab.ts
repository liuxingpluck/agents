// 「房间」标签页:编辑 RoomDef(名称 / 尺寸 / 主题 / 剧情 / 波次),并可在预览画布里「试玩」。
import { RoomDef } from '../sim/types';
import { ROSTER } from '../data/characters';
import { BUILTIN_ROOM_IDS, Ctx } from './ctx';
import { blankRoom, uniqueId } from './templates';
import { isValidId, validateRoom } from './validate';
import { Opt, Rec, areaField, el, fill, labeled, numField, renderErrors, selectEl, textField } from './ui';

/**
 * 创建房间标签页。
 * 波次编辑:每一波是一行「敌人标签」(可重复,如两个空烬者)+ 一个下拉用来追加敌人,
 * 敌人候选是全部已知角色(内置 + 自制)。
 */
export function createRoomTab(ctx: Ctx): { root: HTMLElement; onShow(): void } {
  const root = el('div', { class: 'tab' });
  // selId:当前选中的房间 id;cur() 取出该房间对象
  let selId: string | null = null;
  const cur = (): RoomDef | undefined => ctx.pack.rooms.find(r => r.id === selId);
  // allIds:所有已用房间 id(内置 + 自制),用来防重名;charIds:所有可选角色 id
  const allIds = () => [...BUILTIN_ROOM_IDS, ...ctx.pack.rooms.map(r => r.id)];
  const charIds = () => ctx.charOptions().map(([v]) => v);

  const errBox = el('div', { class: 'errs' });
  /** 任何改动后调用:保存并重新校验 */
  const touch = () => { ctx.save(); updateErrors(); };
  /** 刷新校验面板(房间 id 与内置重复也算问题) */
  function updateErrors() {
    const r = cur();
    if (!r) return;
    const errs = validateRoom(r, charIds());
    if (BUILTIN_ROOM_IDS.includes(r.id)) errs.push(`id「${r.id}」与内置房间重复`);
    renderErrors(errBox, errs);
  }

  const listBox = el('div', { class: 'list' });
  const formBox = el('div');
  const heroSel = el('select');
  const playNote = el('span', { class: 'note' });

  // 顶部按钮:新建 / 复制 / 删除房间
  const toolbar = el('div', { class: 'row' },
    el('button', {
      class: 'primary',
      onclick: () => { const r = blankRoom(uniqueId('room', allIds())); ctx.pack.rooms.push(r); selId = r.id; ctx.save(); renderAll(); },
    }, '＋ 新建房间'),
    el('button', {
      onclick: () => { const d = cur(); if (d) { const r = structuredClone(d); r.id = uniqueId(d.id.replace(/_\d+$/, ''), allIds()); r.name = `${d.name}(副本)`; ctx.pack.rooms.push(r); selId = r.id; ctx.save(); renderAll(); } },
    }, '复制选中'),
    el('button', {
      class: 'danger',
      onclick: () => {
        const d = cur();
        if (!d || !confirm(`确定删除房间「${d.name}」吗?章节里使用它的节点需要重新选择房间。`)) return;
        ctx.pack.rooms = ctx.pack.rooms.filter(r => r !== d);
        selId = ctx.pack.rooms[0]?.id ?? null;
        ctx.save(); renderAll();
      },
    }, '删除选中'),
  );

  /** 重绘列表与表单 */
  function renderAll() {
    fill(listBox, ...(ctx.pack.rooms.length
      ? ctx.pack.rooms.map(r => el('button', { class: `item${r.id === selId ? ' on' : ''}`, onclick: () => { selId = r.id; renderAll(); } },
        r.name || '未命名', el('small', null, ` ${r.id} · ${r.waves.length} 波`)))
      : [el('div', { class: 'empty' }, '还没有自制房间。点击「新建房间」开始。')]));
    const d = cur();
    if (!d) { fill(formBox, el('p', { class: 'hint' }, '选择或创建一个房间后在此编辑。')); renderErrors(errBox, []); return; }

    // 改 id 时要求合法且不重复,并同步章节里的引用
    const idBox = el('input', { type: 'text', value: d.id });
    idBox.addEventListener('change', () => {
      const nv = idBox.value.trim();
      if (nv === d.id) return;
      if (!isValidId(nv) || allIds().includes(nv)) { alert('id 不合法或已存在:需小写字母开头,仅小写字母/数字/下划线,2~24 字符,且不能重复。'); idBox.value = d.id; return; }
      // 同步章节里对该房间的引用
      for (const ch of ctx.pack.chapters) for (const n of ch.nodes) if (n.room === d.id) n.room = nv;
      d.id = nv; selId = nv; ctx.save(); renderAll();
    });
    const r = d as unknown as Rec;
    const wavesBox = el('div');
    renderWaves(d, wavesBox);

    fill(formBox,
      el('section', null, el('h3', null, '基本信息'),
        el('div', { class: 'grid' },
          labeled('id', idBox),
          labeled('名称', textField(r, 'name', () => { touch(); }, '房间名称')),
          labeled('宽度 width(10~120 米)', numField(r, 'width', touch, { step: 1 })),
          labeled('纵深 depth(3~8 米)', numField(r, 'depth', touch, { step: 0.5 })),
          labeled('主题 theme', textField(r, 'theme', touch, 'ashsnow')),
        ),
        labeled('进入房间时的剧情(可选)', areaField(r, 'story', touch, 2)),
      ),
      el('section', null, el('h3', null, '波次'),
        el('p', { class: 'hint' }, '每一波是一排敌人,清完一波才会刷下一波。同一种敌人可重复添加。最多 12 波、每波 8 个。'),
        wavesBox,
      ),
      el('section', null, el('h3', null, '试玩'),
        el('div', { class: 'row' }, labeled('试玩角色', heroSel),
          el('button', { class: 'primary', onclick: () => play() }, '试玩'), playNote)),
    );
    updateErrors();
  }

  /** 重绘波次行 */
  function renderWaves(d: RoomDef, box: HTMLElement) {
    // 波次里显示角色名;找不到时标注「不存在」
    const nameOf = (id: string) => ctx.roster()[id]?.name ?? `${id}(不存在)`;
    const rows = d.waves.map((w, i) => {
      const add = selectEl([['', '＋ 添加敌人…'], ...ctx.charOptions()] as Opt[], '', v => { if (v) { w.push(v); touch(); renderWaves(d, box); } });
      return el('div', { class: 'wave' },
        el('span', { class: 'tag' }, `第 ${i + 1} 波`),
        el('span', { class: 'chips' }, ...w.map((id, k) => el('span', { class: 'chip' }, nameOf(id),
          el('button', { class: 'x', title: '移除', onclick: () => { w.splice(k, 1); touch(); renderWaves(d, box); } }, '×')))),
        add,
        el('button', { class: 'sm danger', onclick: () => { d.waves.splice(i, 1); touch(); renderWaves(d, box); } }, '删除此波'),
      );
    });
    fill(box, ...rows, el('div', { class: 'row' }, el('button', { onclick: () => { d.waves.push(['husk']); touch(); renderWaves(d, box); } }, '＋ 添加一波')));
  }

  /** 在预览画布里试玩当前房间(无效时提示而不是开始) */
  function play() {
    const d = cur();
    if (!d) return;
    const errs = validateRoom(d, charIds());
    if (errs.length) { playNote.textContent = '房间无效,请先修复上面的问题'; return; }
    const hero = ctx.roster()[heroSel.value];
    if (!hero) { playNote.textContent = '请选择试玩角色'; return; }
    ctx.preview.setRoster(ctx.roster());
    ctx.preview.playRoom(d, hero);
    playNote.textContent = `正在试玩「${d.name}」,点击右侧画面后用键盘操作`;
  }

  root.append(toolbar, listBox, el('section', null, el('h3', null, '实时校验'), errBox), formBox);
  renderAll();

  return {
    root,
    onShow() {
      if (!cur()) selId = ctx.pack.rooms[0]?.id ?? null;
      const keep = heroSel.value;
      renderAll();
      // 试玩角色下拉:在 renderAll 之后(heroSel 已被放进表单)填充
      fill(heroSel, ...ctx.playableOptions().map(([v, t]) => el('option', { value: v }, t)));
      heroSel.value = ctx.playableOptions().some(([v]) => v === keep) ? keep : (ctx.pack.characters[0]?.id ?? ROSTER.kael.id);
    },
  };
}
