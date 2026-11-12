// 游戏入口:把模拟层、渲染、输入、界面、音效串起来,并管理整场战役的流程:
//   标题 → 选人 → 章节剧情 → 路线图(选下一站)→ 战斗 → 清场后向右走出房间 → 路线图 … → Boss → 下一章
import { createWorld, spawnFighter, step, World } from './sim/world';
import { ChapterDef, Fighter, MapNode, RoomDef } from './sim/types';
import { makeScriptAI } from './sim/ai/script';
import { HEROES, ROSTER } from './data/characters';
import { ROOMS } from './data/rooms';
import { CAMPAIGN_ROOMS, CHAPTERS, LANE_NAMES } from './data/chapters';
import { GameRenderer } from './render/renderer';
import { findArt, loadArtManifest } from './render/art';
import { InputManager } from './ui/input';
import { Hud } from './ui/hud';
import { Sfx } from './render/audio';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('game') as HTMLCanvasElement;
const gfx = new GameRenderer(canvas);
const input = new InputManager();
const hud = new Hud();
const sfx = new Sfx();

/** 游戏阶段 */
type Phase = 'title' | 'select' | 'story' | 'map' | 'play' | 'clear' | 'dead' | 'ending';
let phase: Phase = 'title';
let world: World;
let player: Fighter;
/** 选人界面当前选中的角色下标 */
let heroIndex = 0;
/** 本房间的战绩,用于结算评价 */
let stats = { maxCombo: 0, damageTaken: 0, frames: 0 };

/** 一次旅程的进度(会存进 localStorage,关掉页面可以继续) */
interface Run {
  hero: string;
  /** 当前章节下标 */
  chapter: number;
  /** 正在打的节点 id(在路线图上时为上一个打完的节点) */
  node: string | null;
  /** 路线图上当前可以前往的节点 */
  avail: string[];
  /** 本章已通过的节点 */
  cleared: string[];
  /** 生命值比例 0..1,跨房间继承 */
  hp: number;
}
let run: Run | null = null;
const SAVE_KEY = 'ashen-abyss.save.v1';

function saveRun() { try { if (run) localStorage.setItem(SAVE_KEY, JSON.stringify(run)); } catch { /* 存储不可用时忽略 */ } }
function loadRun(): Run | null {
  try {
    const r = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Run | null;
    return r && ROSTER[r.hero] && CHAPTERS[r.chapter] ? r : null;
  } catch { return null; }
}

const ROLE_NAME: Record<string, string> = {
  warrior: '战士', tank: '坦克', mage: '法师', archer: '弓箭手', brawler: '格斗家',
  assassin: '刺客', summoner: '死灵法师', berserker: '狂战士', lancer: '枪兵', support: '圣职',
};
const KIND_NAME: Record<MapNode['kind'], string> = { battle: '战斗', elite: '精英', rest: '篝火', boss: '首领' };

/** 所有房间(示例房间 + 战役自动生成的房间) */
const ALL_ROOMS: Record<string, RoomDef> = { ...ROOMS, ...CAMPAIGN_ROOMS };

// ---------- 通用小工具 ----------

/** 黑屏淡出 → 执行 fn → 淡入(房间切换时用) */
function fadeThen(fn: () => void) {
  const el = $('fade');
  el.classList.add('on');
  setTimeout(() => { fn(); el.classList.remove('on'); }, 420);
}

/** 剧情幕:显示标题与若干行文字,按 Enter 后执行 then */
let storyNext: (() => void) | null = null;
function story(title: string, lines: string[], then: () => void) {
  phase = 'story';
  storyNext = then;
  closeOverlays();
  hud.banner(title, `${lines.join('<br>')}<br><br>按 <b>Enter</b> 继续`);
  $('banner').classList.remove('art');
  $('banner-title').style.fontSize = 'clamp(28px, 4.5vw, 54px)';
}

function closeOverlays() {
  hud.hideBanner(); hud.go(false);
  $('select').classList.remove('show');
  $('map').classList.remove('show');
}

// ---------- 选人界面 ----------

const cardsEl = $('cards');

/** 生成角色卡片(启动时调用一次;有头像图时用作卡片背景) */
function buildSelect() {
  HEROES.forEach((h, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--c', h.look.primary);
    card.style.setProperty('--c2', h.look.secondary);
    const portrait = findArt(`portraits/${h.id}`);
    if (portrait) { card.classList.add('art'); card.style.backgroundImage = `linear-gradient(transparent 40%, #000c), url(${portrait})`; }
    card.innerHTML = `<b>${h.name}</b><span>${ROLE_NAME[h.role] ?? h.role}</span>`;
    card.addEventListener('click', () => { if (heroIndex === i) newRun(); else { heroIndex = i; refreshSelect(); } });
    cardsEl.appendChild(card);
  });
}

/** 把指令动作代码转成箭头文字 */
function motionText(m: string): string {
  return ({ DF: '↓→', DB: '↓←', DU: '↓↑', FF: '→→', BF: '←→', DD: '↓↓' } as Record<string, string>)[m] ?? m;
}
/** 把内部按键名转成四键制的叫法 */
function btnText(b: string): string {
  return ({ LP: '轻', LK: '轻', HP: '重', HK: '重' } as Record<string, string>)[b] ?? b;
}

/** 根据当前选中项刷新高亮、详情与立绘 */
function refreshSelect() {
  [...cardsEl.children].forEach((c, i) => c.classList.toggle('on', i === heroIndex));
  const h = HEROES[heroIndex];
  const cmds = h.commands.map(c => `${motionText(c.motion)}+${btnText(c.button)} ${h.moves[c.move]?.name ?? ''}`);
  const dirs = ['L', '→+L', '↓+L', '↑+L'];
  const skills = h.skills.slice(0, 4).map((id, i) => `${dirs[i]} ${h.moves[id]?.name ?? ''}`);
  $('detail').innerHTML =
    `<h2>${h.name} <small>${h.title} · ${ROLE_NAME[h.role] ?? ''}</small></h2>` +
    `<p>${h.lore}</p>` +
    `<p class="mono">生命 ${h.stats.hp} · 速度 ${(h.stats.speed * 100).toFixed(1)} · 重量 ${h.stats.weight}</p>` +
    `<p class="mono">指令技:${[...new Set(cmds)].join(' / ')}</p>` +
    `<p class="mono">特殊技:${skills.join(' / ')}</p>`;
  const full = $('full') as HTMLImageElement;
  const url = findArt(`full/${h.id}`);
  full.style.display = url ? 'block' : 'none';
  if (url) full.src = url;
}

function openSelect() {
  phase = 'select';
  closeOverlays();
  $('select').classList.add('show');
  refreshSelect();
}

// ---------- 战役流程 ----------

const chapter = (): ChapterDef => CHAPTERS[run!.chapter];
const nodeOf = (id: string): MapNode => chapter().nodes.find(n => n.id === id)!;

/** 用选中的角色开始一段新旅程 */
function newRun() {
  const ch = CHAPTERS[0];
  run = { hero: HEROES[heroIndex].id, chapter: 0, node: null, avail: [...ch.start], cleared: [], hp: 1 };
  saveRun();
  story(ch.name, ch.intro, openMap);
}

/** 路线图上当前高亮的可选节点下标 */
let mapSel = 0;

/** 打开路线图 */
function openMap() {
  phase = 'map';
  closeOverlays();
  mapSel = Math.min(mapSel, run!.avail.length - 1);
  if (mapSel < 0) mapSel = 0;
  // 默认选中与上一个节点同一路线的那个
  const prev = run!.node ? nodeOf(run!.node) : null;
  if (prev) { const same = run!.avail.findIndex(id => nodeOf(id).lane === prev.lane); if (same >= 0) mapSel = same; }
  $('map').classList.add('show');
  drawMap();
}

/** 用 SVG 画出本章的 3 路路线图 */
function drawMap() {
  const ch = chapter(), r = run!;
  $('map-title').textContent = ch.name;
  const X = (n: MapNode) => 150 + n.col * 190, Y = (n: MapNode) => 80 + n.lane * 120;
  let svg = '';
  LANE_NAMES.forEach((name, i) => { svg += `<text x="14" y="${84 + i * 120}" fill="#e8e2d6" opacity=".45" font-size="12">${name.split(' · ')[0]}</text>`; });
  for (const n of ch.nodes) for (const id of n.next) {
    const m = ch.nodes.find(x => x.id === id); if (!m) continue;
    const walked = r.cleared.includes(n.id) && (r.cleared.includes(m.id) || r.avail.includes(m.id));
    svg += `<line x1="${X(n)}" y1="${Y(n)}" x2="${X(m)}" y2="${Y(m)}" stroke="${walked ? '#ff6a2a' : '#5b5560'}" stroke-width="${walked ? 2.5 : 1.2}" opacity="${walked ? 0.9 : 0.5}"/>`;
  }
  for (const n of ch.nodes) {
    const cleared = r.cleared.includes(n.id), ai = r.avail.indexOf(n.id), sel = ai === mapSel && ai >= 0;
    const fill = cleared ? '#3a3642' : n.kind === 'boss' ? '#5a1410' : n.kind === 'rest' ? '#3a2a12' : n.kind === 'elite' ? '#2a1838' : '#1c1926';
    const stroke = sel ? '#ff6a2a' : ai >= 0 ? '#e8e2d6' : '#5b5560';
    const rad = n.kind === 'boss' ? 30 : 23;
    svg += `<g data-node="${n.id}" style="cursor:${ai >= 0 ? 'pointer' : 'default'}" opacity="${cleared || ai >= 0 ? 1 : 0.55}">` +
      `<circle cx="${X(n)}" cy="${Y(n)}" r="${rad}" fill="${fill}" stroke="${stroke}" stroke-width="${sel ? 4 : ai >= 0 ? 2 : 1}"/>` +
      `<text x="${X(n)}" y="${Y(n) + 6}" text-anchor="middle" fill="${cleared ? '#8a8490' : '#e8e2d6'}" font-size="${n.kind === 'boss' ? 20 : 16}">${cleared ? '✓' : KIND_NAME[n.kind][0]}</text></g>`;
  }
  const el = $('map-svg');
  el.innerHTML = svg;
  el.querySelectorAll<SVGGElement>('g[data-node]').forEach(g => g.addEventListener('click', () => {
    const i = r.avail.indexOf(g.dataset.node!);
    if (i < 0) return;
    if (i === mapSel) enterNode(r.avail[i]); else { mapSel = i; drawMap(); }
  }));
  const cur = nodeOf(r.avail[mapSel]);
  const room = ALL_ROOMS[cur.room];
  $('map-info').innerHTML = `<b>${KIND_NAME[cur.kind]}</b> · ${LANE_NAMES[cur.lane]}<br>${room?.name ?? ''}　生命 ${Math.round(r.hp * 100)}%`;
}

/** 进入一个节点对应的房间 */
function enterNode(id: string) {
  fadeThen(() => startNode(id));
}

function startNode(id: string) {
  const r = run!, node = nodeOf(id), room = ALL_ROOMS[node.room];
  r.node = id;
  const hero = ROSTER[r.hero];
  world = createWorld(room, ROSTER, (Date.now() & 0xffff) | 1);
  world.defaultEnemyAI = makeScriptAI(0.5 + r.chapter * 0.07);
  world.summonAI = makeScriptAI(0.8);
  player = spawnFighter(world, hero, 0, 3, room.depth / 2);
  if (node.kind === 'rest') r.hp = Math.min(1, r.hp + 0.6); // 篝火:回复 60% 生命
  player.hp = Math.max(1, Math.round(hero.stats.hp * r.hp));
  gfx.buildRoom(room, 7 + r.chapter * 13 + node.col * 5 + node.lane);
  hud.setPlayer(player);
  closeOverlays();
  stats = { maxCombo: 0, damageTaken: 0, frames: 0 };
  phase = 'play';
  hud.flash(room.story ?? room.name);
}

/** 结算评价:连击越高、受伤越少、用时越短越好 */
function rank(): string {
  const score = stats.maxCombo * 4 - stats.damageTaken * 0.5 - stats.frames / 120;
  return score > 40 ? 'S' : score > 15 ? 'A' : score > -10 ? 'B' : 'C';
}

/** 房间清场:记录进度,提示向右前进 */
function onRoomCleared() {
  const r = run!, node = nodeOf(r.node!);
  phase = 'clear';
  if (!r.cleared.includes(node.id)) r.cleared.push(node.id);
  if (node.kind !== 'rest') {
    player.hp = Math.min(player.def.stats.hp, player.hp + player.def.stats.hp * 0.15); // 清场奖励:回复 15%
    hud.flash(`区域净化 · 评价 ${rank()}`);
  }
  r.hp = player.hp / player.def.stats.hp;
  r.avail = [...node.next];
  saveRun();
  hud.go(true);
}

/** 走出房间(过关转场) */
let leaving = false;
function leaveRoom() {
  if (leaving) return;
  leaving = true;
  const r = run!, node = nodeOf(r.node!), ch = chapter();
  fadeThen(() => {
    leaving = false;
    hud.go(false);
    if (node.kind !== 'boss') { openMap(); return; }
    // 击败 Boss:章节结语 → 下一章,或通关
    const last = r.chapter >= CHAPTERS.length - 1;
    story(ch.name, ch.outro, () => {
      if (last) { ending(); return; }
      r.chapter++; r.node = null; r.cleared = []; r.avail = [...CHAPTERS[r.chapter].start]; r.hp = 1;
      saveRun();
      story(CHAPTERS[r.chapter].name, CHAPTERS[r.chapter].intro, openMap);
    });
  });
}

function ending() {
  phase = 'ending';
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  hud.banner('烬渊', '名字回到了深渊。<br>感谢游玩。<br><br>按 <b>Enter</b> 回到标题');
  $('banner-title').style.fontSize = '';
}

function showTitle() {
  phase = 'title';
  closeOverlays();
  const saved = loadRun();
  hud.banner('烬渊', `<em>ASHEN ABYSS</em><br><br>十位持名者,向无王之都进发。<br><br>按 <b>Enter</b> 开始新的旅程` +
    (saved ? `<br>按 <b>C</b> 继续上次的旅程(${ROSTER[saved.hero].name} · ${CHAPTERS[saved.chapter].name})` : ''));
  $('banner-title').style.fontSize = '';
  const title = findArt('ui/title');
  $('banner').classList.toggle('art', !!title);
  $('banner').style.backgroundImage = title ? `linear-gradient(#0008, #000c), url(${title})` : '';
}

// ---------- 菜单按键(战斗中的按键由 input.read() 每帧读取,不走这里) ----------

input.onKey = code => {
  sfx.unlock();
  const enter = code === 'Enter' || code === 'NumpadEnter';
  const ok = enter || code === 'KeyJ';
  switch (phase) {
    case 'title':
      if (ok) openSelect();
      else if (code === 'KeyC') { const s = loadRun(); if (s) { run = s; heroIndex = Math.max(0, HEROES.findIndex(h => h.id === s.hero)); openMap(); } }
      break;
    case 'select': {
      const n = HEROES.length;
      if (code === 'KeyA' || code === 'ArrowLeft') heroIndex = (heroIndex + n - 1) % n;
      else if (code === 'KeyD' || code === 'ArrowRight') heroIndex = (heroIndex + 1) % n;
      else if (['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown'].includes(code)) heroIndex = (heroIndex + 5) % n;
      else if (ok) { newRun(); return; }
      else if (code === 'Escape') { showTitle(); return; }
      refreshSelect();
      break;
    }
    case 'story': if (enter) { const f = storyNext; storyNext = null; f?.(); } break;
    case 'map': {
      const n = run!.avail.length;
      if (['KeyW', 'ArrowUp', 'KeyA', 'ArrowLeft'].includes(code)) mapSel = (mapSel + n - 1) % n;
      else if (['KeyS', 'ArrowDown', 'KeyD', 'ArrowRight'].includes(code)) mapSel = (mapSel + 1) % n;
      else if (ok) { enterNode(run!.avail[mapSel]); return; }
      else if (code === 'Escape') { showTitle(); return; }
      drawMap();
      break;
    }
    case 'play': if (code === 'Escape') { run!.node = null; showTitle(); } break;
    case 'clear': if (enter) leaveRoom(); break;
    case 'dead': if (enter) { run!.hp = 1; enterNode(run!.node!); } break; // 原地续关,生命回满
    case 'ending': if (enter) showTitle(); break;
  }
};

function resize() { gfx.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize);

// ---------- 主循环 ----------

/** 模拟固定 60Hz;渲染跟随显示器刷新率。用累加器把两者解耦。 */
const STEP = 1 / 60;
let acc = 0, last = performance.now();
/** 帧时间统计(供自动化测试检查是否卡顿) */
const perf = { frames: 0, long: 0, worst: 0, simMs: 0 };

function frame(now: number) {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.1, rawDt);
  last = now;
  perf.frames++;
  if (rawDt > 0.034) perf.long++;
  if (rawDt > perf.worst) perf.worst = rawDt;
  acc += dt;
  let steps = 0;
  const t0 = performance.now();
  const active = phase === 'play' || phase === 'clear';
  while (acc >= STEP && steps < 5) {
    const inputs = new Map<number, number>();
    inputs.set(player.id, active ? input.read() : 0);
    const hpBefore = player.hp;
    step(world, inputs);
    gfx.handleEvents(world.events);
    sfx.handle(world.events);
    hud.update(world, player, STEP);
    if (phase === 'play') {
      stats.frames++;
      stats.damageTaken += Math.max(0, hpBefore - player.hp);
      for (const e of world.events) if (e.type === 'hit' && e.attacker === player.id) stats.maxCombo = Math.max(stats.maxCombo, e.combo);
      if (world.cleared) onRoomCleared();
      else if (player.state === 'dead') {
        phase = 'dead';
        hud.banner('你被遗忘了', '余烬夺走了你的名字。<br><br>按 <b>Enter</b> 从这个房间重来');
        $('banner-title').style.fontSize = '';
      }
    } else if (phase === 'clear' && player.x > world.room.width - 1.4) leaveRoom(); // 走到房间右端 → 过关
    acc -= STEP; steps++;
  }
  if (steps === 5) acc = 0; // 掉帧太严重时丢弃积压,避免「死亡螺旋」
  perf.simMs += performance.now() - t0;
  gfx.render(world, player.id, dt);
  requestAnimationFrame(frame);
}

// ---------- 启动 ----------

/** 读取美术清单后再搭界面(清单为空也没关系) */
async function boot() {
  await loadArtManifest();
  resize();
  buildSelect();
  // 标题画面:背后渲染一个只有主角站着的场景
  world = createWorld(ROOMS.outpost, ROSTER, 1);
  world.useWaves = false;
  player = spawnFighter(world, HEROES[0], 0, 6, 2.2);
  gfx.buildRoom(ROOMS.outpost, 11);
  hud.setPlayer(player);
  showTitle();
  requestAnimationFrame(frame);
}
void boot();

// 供自动化测试与调试使用
(window as unknown as Record<string, unknown>).__game = {
  get world() { return world; }, get player() { return player; }, get phase() { return phase; }, get run() { return run; },
  perf,
  /** 跳过菜单,直接用第 i 个角色进入示例房间(测试用) */
  pick(i: number) {
    heroIndex = i;
    run = { hero: HEROES[i].id, chapter: 0, node: null, avail: [...CHAPTERS[0].start], cleared: [], hp: 1 };
    startNode(CHAPTERS[0].start[1]);
  },
  startNode,
};
