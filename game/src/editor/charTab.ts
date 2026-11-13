// 「角色」标签页:自制角色列表、基本信息 / 属性 / 外观表单、招式表(可展开行编辑器)、入口映射、
// 实时校验面板,以及对预览画布的联动(定义变化且有效时重建预览世界)。
import { BtnName, CharacterDef, MoveDef } from '../sim/types';
import { HEROES } from '../data/characters';
import { box } from '../data/build';
import { BUILTIN_CHAR_IDS, Ctx } from './ctx';
import { blankHero, uniqueId } from './templates';
import { ENUMS, isValidId, validateCharacter, characterBudget, BUDGET_CAP } from './validate';
import {
  Opt, Rec, areaField, checkField, colorField, debounce, el, fill, labeled, numField, renderErrors, selectEl, textField,
} from './ui';

/** 四个攻击键:轻拳 / 重拳 / 轻脚 / 重脚 */
const ATTACK: BtnName[] = ['LP', 'HP', 'LK', 'HK'];
/** 招式层级下拉:轻 < 重 < 指令 < 技能 < 奥义 */
const TIER_OPTS: Opt[] = [['0', '0 轻'], ['1', '1 重'], ['2', '2 指令'], ['3', '3 技能'], ['4', '4 奥义']];
/** 职业的中文名 */
const ROLE_NAMES: Record<string, string> = {
  warrior: '战士', tank: '坦克', mage: '法师', archer: '弓手', brawler: '格斗家', assassin: '刺客', summoner: '召唤师',
  berserker: '狂战士', lancer: '枪兵', support: '辅助', enemy: '敌人', boss: '首领',
};
/** 武器的中文名 */
const WEAPON_NAMES: Record<string, string> = {
  none: '无', sword: '剑', hammer: '锤', staff: '法杖', bow: '弓', daggers: '双匕首', axe: '斧', spear: '枪', mace: '钉头锤', claws: '利爪',
};
/** 搓招方向的显示文字(D=下 F=前 B=后 U=上) */
const MOTION_NAMES: Record<string, string> = { DF: '↓→ (DF)', DB: '↓← (DB)', DU: '↓↑ (DU)', FF: '→→ (FF)', BF: '←→ (BF)', DD: '↓↓ (DD)' };

/** 新招式的默认值(轻攻击,数值在规范内) */
function newMove(id: string): MoveDef {
  return {
    id, name: '新招式', tier: 0, anim: 'punchL', startup: 4, active: 3, recovery: 9, damage: 6, comboValue: 1,
    hitbox: box(0.2, 1.2, 0.9, 1.5), hitstun: 16, hitstop: 4, pushX: 0.05,
  };
}

/**
 * 创建角色标签页。
 * @returns root 为页面根节点,onShow 在切换到本页时调用(刷新下拉选项并让预览显示当前角色)
 */
export function createCharTab(ctx: Ctx): { root: HTMLElement; onShow(): void } {
  const root = el('div', { class: 'tab' });
  // selId:当前选中的自制角色 id
  let selId: string | null = null;
  /** 展开了详情行的招式 id */
  const expanded = new Set<string>();

  /** 当前选中的自制角色 */
  const cur = (): CharacterDef | undefined => ctx.pack.characters.find(c => c.id === selId);
  /** 除自身外的已知角色 id(用于 id 冲突与召唤检查) */
  const othersOf = (d: CharacterDef) => [...BUILTIN_CHAR_IDS, ...ctx.pack.characters.filter(c => c !== d).map(c => c.id)];

  // 预览联动:防抖后,若定义有效则重建预览
  const pushPreview = debounce(() => {
    const d = cur();
    if (!d) return;
    if (validateCharacter(d, othersOf(d)).length === 0) {
      ctx.preview.setRoster(ctx.roster());
      ctx.preview.showCharacter(d);
      previewNote.textContent = '预览已更新为当前定义';
    } else previewNote.textContent = '定义暂时无效:预览保持上一个有效版本';
  }, 300);
  // 预览区下方的状态提示
  const previewNote = el('span', { class: 'note' });

  /** 任何改动后:保存、刷新校验面板、预览(不重建表单,避免输入框失焦) */
  const touch = () => { ctx.save(); updateErrors(); pushPreview(); };

  const errBox = el('div', { class: 'errs' });
  const budgetEl = el('div', { class: 'note' });
  /** 重新计算校验结果与预算 */
  function updateErrors() {
    const d = cur();
    if (!d) return;
    renderErrors(errBox, validateCharacter(d, othersOf(d)));
    const b = characterBudget(d);
    budgetEl.textContent = `平衡预算:${Math.round(b)} / ${BUDGET_CAP}(生命/2 + 全部招式总伤害)`;
    budgetEl.className = `note${b > BUDGET_CAP ? ' warn' : ''}`;
  }

  // ---------- 顶部工具栏与列表 ----------
  const listBox = el('div', { class: 'list' });
  // 「复制内置英雄」用的下拉
  const heroSel = el('select', null, ...HEROES.map(h => el('option', { value: h.id }, `${h.name} · ${h.title}`)));
  const toolbar = el('div', { class: 'row' },
    el('button', { class: 'primary', onclick: () => addChar(blankHero(uniqueId('hero', allIds()))) }, '＋ 新建角色'),
    heroSel,
    el('button', {
      onclick: () => {
        const src = HEROES.find(h => h.id === heroSel.value)!;
        const c = structuredClone(src);
        c.id = uniqueId(src.id, allIds());
        c.name = `${src.name}(副本)`;
        addChar(c);
      },
    }, '复制内置英雄'),
    el('button', { onclick: () => { const d = cur(); if (d) { const c = structuredClone(d); c.id = uniqueId(d.id.replace(/_\d+$/, ''), allIds()); c.name = `${d.name}(副本)`; addChar(c); } } }, '复制选中'),
    el('button', { class: 'danger', onclick: () => deleteChar() }, '删除选中'),
  );
  const allIds = () => [...BUILTIN_CHAR_IDS, ...ctx.pack.characters.map(c => c.id)];

  /** 加入新角色并选中 */
  function addChar(c: CharacterDef) {
    ctx.pack.characters.push(c);
    selId = c.id;
    ctx.save();
    renderAll();
    ctx.preview.setRoster(ctx.roster());
    ctx.preview.showCharacter(c);
  }
  /** 删除选中角色(同时从所有房间的波次里移除对它的引用) */
  function deleteChar() {
    const d = cur();
    if (!d || !confirm(`确定删除角色「${d.name}」吗?房间中对它的引用也会被移除。`)) return;
    ctx.pack.characters = ctx.pack.characters.filter(c => c !== d);
    for (const r of ctx.pack.rooms) r.waves = r.waves.map(w => w.filter(id => id !== d.id)).filter(w => w.length > 0);
    selId = ctx.pack.characters[0]?.id ?? null;
    ctx.save();
    renderAll();
  }
  /** 重绘左侧角色列表 */
  function renderList() {
    fill(listBox, ...(ctx.pack.characters.length
      ? ctx.pack.characters.map(c => el('button', {
        class: `item${c.id === selId ? ' on' : ''}`,
        onclick: () => { selId = c.id; renderAll(); ctx.preview.setRoster(ctx.roster()); ctx.preview.showCharacter(c); },
      }, `${c.name || '未命名'}`, el('small', null, ` ${c.id} · ${ROLE_NAMES[c.role] ?? c.role}`)))
      : [el('div', { class: 'empty' }, '还没有自制角色。点击「新建角色」或「复制内置英雄」开始。')]));
  }

  // ---------- 表单 ----------
  const formBox = el('div');

  /** 重绘整个标签页(切换角色、增删角色时用) */
  function renderAll() {
    renderList();
    const d = cur();
    if (!d) { fill(formBox, el('p', { class: 'hint' }, '选择或创建一个角色后在此编辑。')); return; }
    fill(formBox, basicSection(d), statsSection(d), lookSection(d), movesSection(d), mapSection(d));
    updateErrors();
  }

  /** 基本信息:id / 名称 / 称号 / 职业 / 背景 */
  function basicSection(d: CharacterDef): HTMLElement {
    // id 改名需要同步房间引用,所以不实时写入,而是 change 时校验后再改
    const idBox = el('input', { type: 'text', value: d.id });
    idBox.addEventListener('change', () => {
      const nv = idBox.value.trim();
      if (nv === d.id) return;
      if (!isValidId(nv) || allIds().includes(nv)) { alert('id 不合法或已存在:需小写字母开头,仅小写字母/数字/下划线,2~24 字符,且不能重复。'); idBox.value = d.id; return; }
      for (const r of ctx.pack.rooms) r.waves = r.waves.map(w => w.map(x => (x === d.id ? nv : x)));
      d.id = nv; selId = nv;
      ctx.save(); renderList(); updateErrors(); pushPreview();
    });
    const role = selectEl(ENUMS.ROLES.map((r): Opt => [r, `${ROLE_NAMES[r]} (${r})`]), d.role, v => { d.role = v as CharacterDef['role']; touch(); });
    return el('section', null,
      el('h3', null, '基本信息'),
      el('div', { class: 'grid' },
        labeled('id(唯一标识)', idBox, '小写字母开头,仅含小写字母/数字/下划线'),
        labeled('名称', textField(d as unknown as Rec, 'name', () => { touch(); renderList(); }), ),
        labeled('称号(四字左右)', textField(d as unknown as Rec, 'title', touch)),
        labeled('职业', role),
      ),
      labeled('背景故事(2~3 句)', areaField(d as unknown as Rec, 'lore', touch, 3)),
    );
  }

  /** 属性:生命 / 移速 / 跳跃 / 体重 / 能量 */
  function statsSection(d: CharacterDef): HTMLElement {
    const s = d.stats as unknown as Rec;
    return el('section', null,
      el('h3', null, '属性'),
      el('div', { class: 'grid' },
        labeled('生命 hp(150~320)', numField(s, 'hp', touch, { step: 5 })),
        labeled('移速 speed(0.055~0.085)', numField(s, 'speed', touch, { step: 0.001 })),
        labeled('跳跃初速 jump(0.33~0.38)', numField(s, 'jump', touch, { step: 0.005 })),
        labeled('体重 weight(0.8~1.5)', numField(s, 'weight', touch, { step: 0.05 })),
        labeled('能量上限 energyMax(100)', numField(s, 'energyMax', touch, { step: 5 })),
      ),
      budgetEl,
    );
  }

  /** 外观:体型、四种颜色、武器、装饰开关、光效色 */
  function lookSection(d: CharacterDef): HTMLElement {
    const l = d.look as unknown as Rec;
    // 光效色是可选字段:复选框控制有无,颜色框控制颜色(下面手动同步)
    const glowOn = checkField(l, 'glow', () => { /* 见下 */ }, true);
    glowOn.checked = typeof l.glow === 'string';
    const glowColor = colorField({ glow: l.glow ?? '#ff6a2a' }, 'glow', () => { /* 由下方监听处理 */ });
    glowColor.value = typeof l.glow === 'string' && /^#[0-9a-f]{6}$/i.test(l.glow) ? l.glow : '#ff6a2a';
    // 光效色:勾选才写入字段
    const syncGlow = () => { if (glowOn.checked) l.glow = glowColor.value; else delete l.glow; touch(); };
    glowOn.onchange = syncGlow; glowColor.oninput = () => { if (glowOn.checked) syncGlow(); };
    return el('section', null,
      el('h3', null, '外观'),
      el('div', { class: 'grid' },
        labeled('身高倍率 scale', numField(l, 'scale', touch, { step: 0.05 })),
        labeled('肩宽倍率 bulk', numField(l, 'bulk', touch, { step: 0.05 })),
        labeled('肤色', colorField(l, 'skin', touch)),
        labeled('主色', colorField(l, 'primary', touch)),
        labeled('副色', colorField(l, 'secondary', touch)),
        labeled('点缀色', colorField(l, 'accent', touch)),
        labeled('武器', selectEl(ENUMS.WEAPONS.map((w): Opt => [w, `${WEAPON_NAMES[w]} (${w})`]), d.look.weapon, v => { d.look.weapon = v as CharacterDef['look']['weapon']; touch(); })),
        labeled('光效色', el('span', { class: 'inline' }, glowOn, glowColor)),
      ),
      el('div', { class: 'checks' },
        el('label', null, checkField(l, 'shield', touch), ' 盾牌'),
        el('label', null, checkField(l, 'hood', touch), ' 兜帽'),
        el('label', null, checkField(l, 'horns', touch), ' 角'),
        el('label', null, checkField(l, 'cape', touch), ' 披风'),
      ),
    );
  }

  // ---------- 招式表 ----------
  // 招式表与出招映射两块区域的容器
  const movesBox = el('div');
  const mapBox = el('div');
  /** 招式选择下拉的选项:空项 + 全部招式 */
  const moveOpts = (d: CharacterDef, withNone = true): Opt[] => [
    ...(withNone ? [['', '(无)'] as Opt] : []),
    ...Object.values(d.moves).map((m): Opt => [m.id, `${m.name}(${m.id}) · T${m.tier}${m.air ? ' 空' : ''}`]),
  ];

  /** 招式区:表格 + 新增按钮 */
  function movesSection(d: CharacterDef): HTMLElement {
    renderMoves(d);
    return el('section', null,
      el('h3', null, '招式表'),
      el('p', { class: 'hint' }, '帧数单位为 1/60 秒。点「展开」编辑判定盒与全部可选字段(挑空、击倒、飞行道具、抓取、召唤……)。'),
      movesBox,
      el('div', { class: 'row' }, el('button', {
        onclick: () => {
          const id = uniqueId('move', Object.keys(d.moves));
          d.moves[id] = newMove(id);
          expanded.add(id);
          touch(); renderMoves(d); renderMaps(d);
        },
      }, '＋ 添加招式')),
    );
  }

  /** 重绘招式表(每个招式一个主行 + 一个可展开的详情行) */
  function renderMoves(d: CharacterDef) {
    const head = el('tr', null, ...['id', '名称', '层级', '动画', '起手', '持续', '收招', '伤害', ''].map(t => el('th', null, t)));
    const rows: HTMLElement[] = [];
    for (const m of Object.values(d.moves)) {
      const mr = m as unknown as Rec;
      const idIn = el('input', { type: 'text', value: m.id, class: 'w90' });
      idIn.addEventListener('change', () => {
        const nv = idIn.value.trim();
        if (nv === m.id) return;
        if (!/^[a-z][a-z0-9_]{0,23}$/.test(nv) || d.moves[nv]) { alert('招式 id 不合法或已存在(小写字母开头,仅小写字母/数字/下划线)。'); idIn.value = m.id; return; }
        renameMove(d, m.id, nv);
        if (expanded.delete(m.id)) expanded.add(nv);
        touch(); renderMoves(d); renderMaps(d);
      });
      const open = expanded.has(m.id);
      const detail = el('tr', { class: 'detail', hidden: !open }, el('td', { colspan: 9 }, buildDetail(d, m)));
      const toggle = el('button', { class: 'sm' }, open ? '收起' : '展开');
      toggle.addEventListener('click', () => {
        const show = detail.hidden;
        detail.hidden = !show;
        toggle.textContent = show ? '收起' : '展开';
        if (show) expanded.add(m.id); else expanded.delete(m.id);
      });
      rows.push(el('tr', { class: m.tier === 4 ? 'tier4' : '' },
        el('td', null, idIn),
        el('td', null, textField(mr, 'name', () => { touch(); renderMaps(d); }, '名称')),
        el('td', null, selectEl(TIER_OPTS, String(m.tier), v => { m.tier = Number(v); touch(); renderMaps(d); })),
        el('td', null, selectEl(ENUMS.ANIMS.map((a): Opt => [a, a]), m.anim, v => { m.anim = v as MoveDef['anim']; touch(); })),
        el('td', null, numField(mr, 'startup', touch, { min: 0, step: 1, width: '58px' })),
        el('td', null, numField(mr, 'active', touch, { min: 0, step: 1, width: '58px' })),
        el('td', null, numField(mr, 'recovery', touch, { min: 0, step: 1, width: '58px' })),
        el('td', null, numField(mr, 'damage', touch, { min: 0, step: 1, width: '58px' })),
        el('td', { class: 'acts' }, toggle, el('button', {
          class: 'sm danger',
          onclick: () => { removeMove(d, m.id); expanded.delete(m.id); touch(); renderMoves(d); renderMaps(d); },
        }, '删')),
      ), detail);
    }
    fill(movesBox, el('div', { class: 'tablewrap' }, el('table', { class: 'moves' }, el('thead', null, head), el('tbody', null, ...rows))));
  }

  /** 招式详情行:判定盒、硬直、可选字段、开关、连携、飞行道具、抓取、召唤 */
  function buildDetail(d: CharacterDef, m: MoveDef): HTMLElement {
    const mr = m as unknown as Rec;
    const hb = m.hitbox as unknown as Rec;
    const wrap = el('div', { class: 'detailwrap' });
    // 可选数字字段:留空 = 该字段不存在
    const optNum = (label: string, key: string, o = {}) => labeled(label, numField(mr, key, touch, { optional: true, ...o }));

    // 连携:命中后按某键可接的下一招;清空时顺手删掉空的 chain
    const chainSel = ATTACK.map(b => labeled(`连携 ${b} →`, selectEl(moveOpts(d), m.chain?.[b] ?? '', v => {
      if (v) { m.chain = { ...(m.chain ?? {}), [b]: v }; } else if (m.chain) { delete m.chain[b]; if (!Object.keys(m.chain).length) delete m.chain; }
      touch();
    })));

    // 飞行道具与抓取:开关 + 子字段,开关变化时重建本详情区
    const projOn = el('input', { type: 'checkbox', checked: !!m.projectile });
    projOn.addEventListener('change', () => {
      if (projOn.checked) m.projectile = { speed: 0.26, life: 50, radius: 0.35, y: 1.1, color: '#ff6a2a' };
      else delete m.projectile;
      touch(); fill(wrap, ...buildDetail(d, m).childNodes);
    });
    const grabOn = el('input', { type: 'checkbox', checked: !!m.grab });
    grabOn.addEventListener('change', () => {
      if (grabOn.checked) m.grab = { hold: 22, throwDamage: 16, throwVx: 0.2, throwVy: 0.3 };
      else delete m.grab;
      touch(); fill(wrap, ...buildDetail(d, m).childNodes);
    });
    const proj = m.projectile as unknown as Rec | undefined;
    const grab = m.grab as unknown as Rec | undefined;

    // 召唤:从所有角色里选
    const summonSel = selectEl([['', '(无)'], ...ctx.charOptions()], m.summon ?? '', v => { if (v) m.summon = v; else delete m.summon; touch(); });

    wrap.append(
      el('div', { class: 'grid g5' },
        labeled('连击权重 comboValue', numField(mr, 'comboValue', touch, { min: 0, step: 1 })),
        labeled('硬直 hitstun', numField(mr, 'hitstun', touch, { min: 0, step: 1 })),
        labeled('顿帧 hitstop', numField(mr, 'hitstop', touch, { min: 0, step: 1 })),
        labeled('击退 pushX', numField(mr, 'pushX', touch, { step: 0.01 })),
      ),
      el('h4', null, '判定盒 hitbox(米,x 以朝向为正)'),
      el('div', { class: 'grid g5' },
        labeled('x0', numField(hb, 'x0', touch, { step: 0.1 })), labeled('x1', numField(hb, 'x1', touch, { step: 0.1 })),
        labeled('y0', numField(hb, 'y0', touch, { step: 0.1 })), labeled('y1', numField(hb, 'y1', touch, { step: 0.1 })),
        labeled('z 容差', numField(hb, 'z', touch, { step: 0.1 })),
      ),
      el('h4', null, '可选字段(留空 = 不使用)'),
      el('div', { class: 'grid g5' },
        optNum('挑空 launch', 'launch', { step: 0.01 }), optNum('前移 moveX', 'moveX', { step: 0.01 }),
        optNum('自身上升 selfLaunch', 'selfLaunch', { step: 0.01 }), optNum('无敌帧 invuln', 'invuln', { step: 1 }),
        optNum('能量消耗 cost', 'cost', { step: 5 }), optNum('重复命中 rehit', 'rehit', { step: 1 }),
        optNum('治疗 heal', 'heal', { step: 1 }), optNum('瞬移 teleport', 'teleport', { step: 0.5 }),
        labeled('召唤 summon', summonSel),
      ),
      el('div', { class: 'checks' },
        el('label', null, checkField(mr, 'knockdown', touch), ' 击倒 knockdown'),
        el('label', null, checkField(mr, 'jumpCancel', touch), ' 跳跃取消 jumpCancel'),
        el('label', null, checkField(mr, 'air', () => { touch(); renderMaps(d); }), ' 空中招式 air'),
        el('label', null, checkField(mr, 'armor', touch), ' 霸体 armor'),
      ),
      el('h4', null, '连携 chain(命中后按键接下一招)'),
      el('div', { class: 'grid g4' }, ...chainSel),
      el('h4', null, el('label', null, projOn, ' 飞行道具 projectile')),
      proj ? el('div', { class: 'grid g5' },
        labeled('速度', numField(proj, 'speed', touch, { step: 0.01 })), labeled('寿命(帧)', numField(proj, 'life', touch, { step: 1 })),
        labeled('半径', numField(proj, 'radius', touch, { step: 0.01 })), labeled('发射高度', numField(proj, 'y', touch, { step: 0.05 })),
        labeled('颜色', colorField(proj, 'color', touch)),
        el('label', { class: 'fld' }, el('span', null, '穿透'), checkField(proj, 'pierce', touch)),
      ) : '',
      el('h4', null, el('label', null, grabOn, ' 抓取 grab(命中后锁住对手再投出)')),
      grab ? el('div', { class: 'grid g5' },
        labeled('保持帧 hold', numField(grab, 'hold', touch, { step: 1 })), labeled('投掷伤害', numField(grab, 'throwDamage', touch, { step: 1 })),
        labeled('投掷水平速度', numField(grab, 'throwVx', touch, { step: 0.01 })), labeled('投掷上抛速度', numField(grab, 'throwVy', touch, { step: 0.01 })),
      ) : '',
    );
    return wrap;
  }

  /** 招式改 id:同步更新所有引用(入口、指令技、技能、连携) */
  function renameMove(d: CharacterDef, from: string, to: string) {
    const entries = Object.entries(d.moves).map(([k, m]) => (k === from ? [to, { ...m, id: to }] as const : [k, m] as const));
    d.moves = Object.fromEntries(entries);
    mapRefs(d, id => (id === from ? to : id));
  }
  /** 删除招式并清理所有引用 */
  function removeMove(d: CharacterDef, id: string) {
    delete d.moves[id];
    for (const k of ATTACK) { if (d.normals[k] === id) delete d.normals[k]; if (d.airNormals[k] === id) delete d.airNormals[k]; }
    d.commands = d.commands.filter(c => c.move !== id);
    d.skills = d.skills.filter(s => s !== id);
    for (const m of Object.values(d.moves)) if (m.chain) {
      for (const k of Object.keys(m.chain) as BtnName[]) if (m.chain[k] === id) delete m.chain[k];
      if (!Object.keys(m.chain).length) delete m.chain;
    }
  }
  /** 对所有招式 id 引用应用映射函数 */
  function mapRefs(d: CharacterDef, f: (id: string) => string) {
    for (const k of ATTACK) { if (d.normals[k]) d.normals[k] = f(d.normals[k]!); if (d.airNormals[k]) d.airNormals[k] = f(d.airNormals[k]!); }
    for (const c of d.commands) c.move = f(c.move);
    d.skills = d.skills.map(f);
    for (const m of Object.values(d.moves)) if (m.chain) for (const k of Object.keys(m.chain) as BtnName[]) m.chain[k] = f(m.chain[k]!);
  }

  // ---------- 入口映射 ----------
  /** 映射区:地面 / 空中普通技、指令技、技能 */
  function mapSection(d: CharacterDef): HTMLElement {
    renderMaps(d);
    return el('section', null, el('h3', null, '出招映射'), mapBox);
  }

  /** 重绘映射区(招式增删改名后调用,保证下拉选项是最新的) */
  function renderMaps(d: CharacterDef) {
    const normalSel = (field: 'normals' | 'airNormals', b: BtnName) =>
      labeled(b, selectEl(moveOpts(d), d[field][b] ?? '', v => { if (v) d[field][b] = v; else delete d[field][b]; touch(); }));
    const cmdRows = d.commands.map((c, i) => el('div', { class: 'maprow' },
      selectEl(ENUMS.MOTIONS.map((m): Opt => [m, MOTION_NAMES[m]]), c.motion, v => { c.motion = v as typeof c.motion; touch(); }),
      el('span', null, '+'),
      selectEl(ATTACK.map((b): Opt => [b, b]), c.button, v => { c.button = v as BtnName; touch(); }),
      el('span', null, '→'),
      selectEl(moveOpts(d, false), c.move, v => { c.move = v; touch(); }),
      el('button', { class: 'sm danger', onclick: () => { d.commands.splice(i, 1); touch(); renderMaps(d); } }, '删'),
    ));
    const skillRows = d.skills.map((s, i) => el('div', { class: 'maprow' },
      el('span', { class: 'tag' }, `S${i + 1}`),
      selectEl(moveOpts(d, false), s, v => { d.skills[i] = v; touch(); }),
      el('button', { class: 'sm danger', onclick: () => { d.skills.splice(i, 1); touch(); renderMaps(d); } }, '删'),
    ));
    const first = (t: number) => Object.values(d.moves).find(m => m.tier === t)?.id ?? Object.keys(d.moves)[0] ?? '';
    fill(mapBox,
      el('h4', null, '地面普通技(轻拳 / 重拳 / 轻脚 / 重脚)'), el('div', { class: 'grid g4' }, ...ATTACK.map(b => normalSel('normals', b))),
      el('h4', null, '空中普通技'), el('div', { class: 'grid g4' }, ...ATTACK.map(b => normalSel('airNormals', b))),
      el('h4', null, '指令技(搓招 + 按键)'), ...cmdRows,
      el('div', { class: 'row' }, el('button', { onclick: () => { d.commands.push({ motion: 'DF', button: 'LP', move: first(2) }); touch(); renderMaps(d); } }, '＋ 添加指令技')),
      el('h4', null, `技能(S1~S8,最多 8 个;当前 ${d.skills.length} 个)`), ...skillRows,
      el('div', { class: 'row' }, el('button', { onclick: () => { d.skills.push(first(3)); touch(); renderMaps(d); } }, '＋ 添加技能')),
    );
  }

  // ---------- 页面骨架 ----------
  root.append(
    toolbar, listBox,
    el('div', { class: 'row' }, el('button', { onclick: () => ctx.preview.restart() }, '重置预览'),
      el('span', { class: 'note' }, '键位:WASD 移动 · J 轻拳 K 重拳 U 轻脚 I 重脚 · 空格 跳 · L 闪避 · 1~8 技能 · 先点击右侧画面获得焦点'), previewNote),
    el('section', null, el('h3', null, '实时校验'), errBox),
    formBox,
  );
  renderAll();

  return {
    root,
    onShow() {
      if (!cur()) selId = ctx.pack.characters[0]?.id ?? null;
      renderAll();
      const d = cur();
      ctx.preview.setRoster(ctx.roster());
      ctx.preview.showCharacter(d && validateCharacter(d, othersOf(d)).length === 0 ? d : HEROES[0]);
    },
  };
}
