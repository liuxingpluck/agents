// 游戏入口:把模拟层、渲染、输入、界面、音效串起来,并管理整场战役的流程:
//   标题 → 选人 → 章节剧情 → 路线图(选下一站)→ 战斗 → 清场后向右走出房间 → 路线图 … → Boss → 下一章
// 另外这里还有主循环(每秒 60 次推进模拟,再画一帧)和启动流程。
import { createWorld, spawnFighter, step, World } from './sim/world';
import { ChapterDef, CharacterDef, Fighter, MapNode, RoomDef } from './sim/types';
import { makeScriptAI } from './sim/ai/script';
import { HEROES, ROSTER } from './data/characters';
import { ROOMS } from './data/rooms';
import { CAMPAIGN_ROOMS, CHAPTERS, enemyAggression, LANE_NAMES } from './data/chapters';
import { GameRenderer } from './render/renderer';
import { findArt, loadArtManifest } from './render/art';
import { InputManager } from './ui/input';
import { Hud } from './ui/hud';
import { Sfx } from './render/audio';
import { loadPack } from './data/custom';
import { setupTouch, wantsTouch } from './ui/touch';
import { isSettingsOpen, setupSettings } from './ui/settings';
import { isHeroRole, validateChapter, validateCharacter, validateRoom } from './editor/validate';

/** 按 id 取页面元素的简写。 */
const $ = (id: string) => document.getElementById(id)!;
// 下面四个是全局单例:画面、输入、界面、音效
const canvas = $('game') as HTMLCanvasElement;
const gfx = new GameRenderer(canvas);
const input = new InputManager();
const hud = new Hud();
const sfx = new Sfx();

/** 游戏阶段 */
type Phase = 'title' | 'select' | 'story' | 'map' | 'play' | 'clear' | 'dead' | 'ending' | 'replay';
// phase = 当前处于哪个阶段,各处按它决定按键含义;world / player = 当前战斗世界与玩家角色
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
  /** 本次旅程的累计得分(旧存档没有这一项,读取时按 0 处理) */
  score?: number;
}
let run: Run | null = null;
const SAVE_KEY = 'ashen-abyss.save.v1';

/** 把旅程进度存进浏览器,下次可「继续上次的旅程」。 */
function saveRun() { try { if (run) localStorage.setItem(SAVE_KEY, JSON.stringify(run)); } catch { /* 存储不可用时忽略 */ } }
/** 读取存档;存档里的角色或章节已不存在(比如自制内容被删)时当作没有存档。 */
function loadRun(): Run | null {
  try {
    const r = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Run | null;
    return r && ROSTER[r.hero] && CHAPTERS[r.chapter] ? r : null;
  } catch { return null; }
}

/** 职业的中文名,用在选人卡片上。 */
const ROLE_NAME: Record<string, string> = {
  warrior: '战士', tank: '坦克', mage: '法师', archer: '弓箭手', brawler: '格斗家',
  assassin: '刺客', summoner: '死灵法师', berserker: '狂战士', lancer: '枪兵', support: '圣职',
};
/** 路线图节点类型的中文名。 */
const KIND_NAME: Record<MapNode['kind'], string> = { battle: '战斗', elite: '精英', rest: '篝火', boss: '首领' };

/** 所有房间(示例房间 + 战役自动生成的房间 + 自制房间) */
const ALL_ROOMS: Record<string, RoomDef> = { ...ROOMS, ...CAMPAIGN_ROOMS };
/** 内置章节的数量;下标 ≥ 它的是玩家自制章节 */
const BUILTIN_CHAPTERS = CHAPTERS.length;
/** 新旅程从第几章开始(标题画面按 M 可切到自制章节) */
let startChapter = 0;

/**
 * 读取编辑器保存的自制内容包,把通过校验的角色 / 房间 / 章节并入游戏。
 * 没通过校验的条目直接跳过,不影响其余内容。
 */
function loadCustomContent() {
  const pack = loadPack();
  for (const c of pack.characters) {
    if (validateCharacter(c, Object.keys(ROSTER)).length) continue;
    ROSTER[c.id] = c;
    if (isHeroRole(c.role)) HEROES.push(c);
  }
  for (const r of pack.rooms) if (!ALL_ROOMS[r.id] && !validateRoom(r, Object.keys(ROSTER)).length) ALL_ROOMS[r.id] = r;
  for (const ch of pack.chapters) if (!validateChapter(ch, Object.keys(ALL_ROOMS)).length) CHAPTERS.push(ch);
}

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

/** 关闭所有覆盖层(横幅、选人、路线图),切换阶段前先清场。 */
function closeOverlays() {
  hud.hideBanner(); hud.go(false); hud.hideResult();
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

/** 打开选人界面。 */
/** 招式表是否打开(打开时游戏暂停) */
let movesOpen = false;

/** 生成某个角色的招式表(战斗中按 Tab 查看) */
function movesHtml(h: CharacterDef): string {
  /** 从入口招沿着连携一路走下去,拼出「刺拳 → 盾拳 → 横斩」这样的文字 */
  const chainText = (start: string | undefined, btn: 'LP' | 'LK' | 'HP' | 'HK') => {
    const names: string[] = [];
    for (let id = start, n = 0; id && h.moves[id] && n < 6; id = h.moves[id].chain?.[btn], n++) names.push(h.moves[id].name);
    return names.join(' → ') || '—';
  };
  const dirs = ['L', '→ + L', '↓ + L', '↑ + L'];
  const cmds = [...new Map(h.commands.map(c => [`${c.motion}${btnText(c.button)}`, c])).values()];
  const row = (k: string, v: string) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  return `<h1>${h.name} · 招式表</h1><table>` +
    row('J 连按', chainText(h.normals.LP, 'LP')) +
    row('↓ + J 连按', chainText(h.normals.LK, 'LK')) +
    row('K', chainText(h.normals.HP, 'HP')) +
    row('↓ + K', `${h.moves[h.normals.HK ?? '']?.name ?? '—'}${h.moves[h.normals.HK ?? '']?.launch ? '(挑空)' : ''}`) +
    row('J + K', `${h.moves.grab?.name ?? '抓投'}(抓投,无视霸体;按住 ← 向身后投)`) +
    cmds.map(c => row(`${motionText(c.motion)} + ${btnText(c.button) === '轻' ? 'J' : 'K'}`, h.moves[c.move]?.name ?? '')).join('') +
    h.skills.slice(0, 4).map((id, i) => row(dirs[i], `${h.moves[id]?.name ?? ''} <small>能量 ${h.moves[id]?.cost ?? 0}</small>`)).join('') +
    row('→→ 后按 J', '冲刺攻击') + row('被打飞时按 空格', '空中受身') + row('Shift', '闪避(短暂无敌)') +
    `</table><p>连段规则:轻 → 重 → 指令技 → 特殊技,只能往后接。同一招反复用,对手会越来越快恢复。<br>按 <b>Tab</b> 关闭</p>`;
}

function toggleMoves(show: boolean) {
  movesOpen = show;
  $('moves').classList.toggle('show', show);
  if (show) $('moves').innerHTML = `<div class="box">${movesHtml(player.def)}</div>`;
}

function openSelect() {
  phase = 'select';
  closeOverlays();
  $('select').classList.add('show');
  refreshSelect();
}

// ---------- 战役流程 ----------

/** 当前章节;nodeOf = 按 id 找本章的节点。 */
const chapter = (): ChapterDef => CHAPTERS[run!.chapter];
const nodeOf = (id: string): MapNode => chapter().nodes.find(n => n.id === id)!;

/** 用选中的角色开始一段新旅程 */
function newRun() {
  const ch = CHAPTERS[startChapter];
  run = { hero: HEROES[heroIndex].id, chapter: startChapter, node: null, avail: [...ch.start], cleared: [], hp: 1 };
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
  $('map-info').innerHTML = `<b>${KIND_NAME[cur.kind]}</b> · ${LANE_NAMES[cur.lane]}<br>${room?.name ?? ''}　生命 ${Math.round(r.hp * 100)}%　得分 ${r.score ?? 0}`;
}

/** 进入一个节点对应的房间 */
function enterNode(id: string) {
  fadeThen(() => startNode(id));
}

/** 真正开始一场战斗:建世界、放玩家(继承上个房间剩下的血量)、搭场景。 */
// ---------- 回放 ----------
// 模拟是确定性的:同样的房间、角色、随机种子,加上同样的逐帧按键,结果一定一模一样。
// 所以回放只需要记下「种子 + 每帧按键」,不用录画面。

/** 一场战斗的录像 */
interface Replay {
  hero: string; chapter: number; node: string;
  seed: number;
  /** 进房间时的生命值 */
  hp: number;
  /** 逐帧按键,做了游程压缩:[按键, 连续帧数, 按键, 连续帧数, …] */
  inputs: number[];
  /** 录制结束时的校验信息:帧数、玩家位置与生命。回放结束时应当完全一致。 */
  end: { frame: number; x: number; hp: number };
}
const REPLAY_KEY = 'ashen-abyss.replay.v1';
/** 正在录制的录像(战斗中) */
let rec: Replay | null = null;
/** 正在播放的录像,以及播放进度 */
let playing: Replay | null = null;
let playIndex = 0, playLeft = 0;

/** 把这一帧的按键记进录像(与上一帧相同就只加计数) */
function recordInput(mask: number) {
  if (!rec) return;
  const a = rec.inputs, n = a.length;
  if (n && a[n - 2] === mask) a[n - 1]++; else a.push(mask, 1);
}

/** 结束录制并保存(清场或阵亡时调用)。只保留最近的一场。 */
function saveReplay() {
  if (!rec) return;
  rec.end = { frame: world.frame, x: player.x, hp: player.hp };
  try { localStorage.setItem(REPLAY_KEY, JSON.stringify(rec)); } catch { /* 存不下就算了 */ }
  rec = null;
}

function loadReplay(): Replay | null {
  try {
    const r = JSON.parse(localStorage.getItem(REPLAY_KEY) ?? 'null') as Replay | null;
    return r && ROSTER[r.hero] && CHAPTERS[r.chapter]?.nodes.some(n => n.id === r.node) ? r : null;
  } catch { return null; }
}

/** 搭建一场战斗的世界(正式游戏与回放共用,保证两边完全一致) */
function buildBattle(heroId: string, chapterIndex: number, nodeId: string, seed: number, hp: number) {
  const node = CHAPTERS[chapterIndex].nodes.find(n => n.id === nodeId)!, room = ALL_ROOMS[node.room];
  const hero = ROSTER[heroId];
  world = createWorld(room, ROSTER, seed);
  world.defaultEnemyAI = makeScriptAI(enemyAggression(chapterIndex));
  world.summonAI = makeScriptAI(0.8);
  player = spawnFighter(world, hero, 0, 3, room.depth / 2);
  player.hp = hp;
  gfx.buildRoom(room, 7 + chapterIndex * 13 + node.col * 5 + node.lane);
  hud.setPlayer(player);
  return room;
}

/** 播放最近一场录像 */
function startReplay() {
  const r = loadReplay();
  if (!r) return;
  closeOverlays();
  buildBattle(r.hero, r.chapter, r.node, r.seed, r.hp);
  playing = r; playIndex = 0; playLeft = r.inputs[1] ?? 0;
  phase = 'replay';
  hud.flash('回放 · 按 Enter 退出');
}

/** 取出回放的下一帧按键;播完返回 null */
function nextReplayInput(): number | null {
  const a = playing!.inputs;
  while (playLeft <= 0) {
    playIndex += 2;
    if (playIndex >= a.length) return null;
    playLeft = a[playIndex + 1];
  }
  playLeft--;
  return a[playIndex];
}

/** 回放播完:核对结果是否与录制时一致,然后回标题 */
function endReplay() {
  const e = playing!.end;
  const same = world.frame === e.frame && Math.abs(player.x - e.x) < 1e-9 && player.hp === e.hp;
  lastReplayCheck = same;
  playing = null;
  showTitle();
  hud.flash(same ? '回放结束 · 与原战斗完全一致' : '回放结束 · 结果与录制不一致(版本可能已更新)');
}
/** 最近一次回放的校验结果(测试用) */
let lastReplayCheck: boolean | null = null;

function startNode(id: string) {
  const r = run!, node = nodeOf(id);
  r.node = id;
  if (node.kind === 'rest') r.hp = Math.min(1, r.hp + 0.6); // 篝火:回复 60% 生命
  const seed = (Date.now() & 0xffff) | 1;
  const hp = Math.max(1, Math.round(ROSTER[r.hero].stats.hp * r.hp));
  const room = buildBattle(r.hero, r.chapter, id, seed, hp);
  // 有敌人的房间才录像
  rec = room.waves.length ? { hero: r.hero, chapter: r.chapter, node: id, seed, hp, inputs: [], end: { frame: 0, x: 0, hp: 0 } } : null;
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
    // 本房间得分:连击加分,受伤与拖时间扣分;精英房 ×1.5,Boss 房 ×3
    const secs = stats.frames / 60;
    const base = Math.max(50, Math.round(300 + stats.maxCombo * 25 - stats.damageTaken * 2 - secs * 2));
    const gained = Math.round(base * (node.kind === 'boss' ? 3 : node.kind === 'elite' ? 1.5 : 1));
    r.score = (r.score ?? 0) + gained;
    hud.result(rank(), [
      ['最高连击', String(stats.maxCombo)], ['受到伤害', String(Math.round(stats.damageTaken))],
      ['用时', `${secs.toFixed(1)} 秒`], ['得分', `+${gained}`], ['累计', String(r.score)],
    ]);
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
    // 内置最后一章,或任何自制章节,打完就结束
    const last = r.chapter >= BUILTIN_CHAPTERS - 1;
    story(ch.name, ch.outro, () => {
      if (last) { ending(); return; }
      r.chapter++; r.node = null; r.cleared = []; r.avail = [...CHAPTERS[r.chapter].start]; r.hp = 1;
      saveRun();
      story(CHAPTERS[r.chapter].name, CHAPTERS[r.chapter].intro, openMap);
    });
  });
}

/** 通关结局:清除存档,显示结语。 */
function ending() {
  phase = 'ending';
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  hud.banner('烬渊', `名字回到了深渊。<br>感谢游玩。<br><br>最终得分 <b>${run?.score ?? 0}</b><br><br>按 <b>Enter</b> 回到标题`);
  $('banner-title').style.fontSize = '';
}

/** 显示标题画面(有存档时多一个「继续」选项)。 */
function showTitle() {
  phase = 'title';
  closeOverlays();
  const saved = loadRun();
  hud.banner('烬渊', `<em>ASHEN ABYSS</em><br><br>十位持名者,向无王之都进发。<br><br>按 <b>Enter</b> 开始新的旅程` +
    (loadReplay() ? `<br>按 <b>R</b> 观看上一场战斗的回放` : '') +
    (saved ? `<br>按 <b>C</b> 继续上次的旅程(${ROSTER[saved.hero].name} · ${CHAPTERS[saved.chapter].name})` : '') +
    (CHAPTERS.length > BUILTIN_CHAPTERS ? `<br>按 <b>M</b> 切换章节:<b>${CHAPTERS[startChapter].name}</b>` : ''));
  $('banner-title').style.fontSize = '';
  const title = findArt('ui/title');
  $('banner').classList.toggle('art', !!title);
  $('banner').style.backgroundImage = title ? `linear-gradient(#0008, #000c), url(${title})` : '';
}

// ---------- 菜单按键(战斗中的按键由 input.read() 每帧读取,不走这里) ----------

input.onKey = code => {
  sfx.unlock();
  if (isSettingsOpen()) return;
  if (code === 'Tab' && (phase === 'play' || phase === 'clear' || movesOpen)) { toggleMoves(!movesOpen); return; }
  if (movesOpen) { if (code === 'Escape') toggleMoves(false); return; }
  const enter = code === 'Enter' || code === 'NumpadEnter';
  const ok = enter || code === 'KeyJ';
  switch (phase) {
    case 'title':
      if (ok) openSelect();
      else if (code === 'KeyR') startReplay();
      else if (code === 'KeyM' && CHAPTERS.length > BUILTIN_CHAPTERS) {
        // 在「第一章」和各个自制章节之间循环
        startChapter = startChapter === 0 ? BUILTIN_CHAPTERS : startChapter + 1 >= CHAPTERS.length ? 0 : startChapter + 1;
        showTitle();
      }
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
    case 'replay': if (enter || code === 'Escape') { playing = null; showTitle(); } break;
  }
};

/** 窗口变化时让画面跟着调整。 */
function resize() { gfx.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize);

// ---------- 主循环 ----------

/** 模拟固定 60Hz;渲染跟随显示器刷新率。用累加器把两者解耦。 */
const STEP = 1 / 60;
let acc = 0, last = performance.now();
/** 帧时间统计(供自动化测试检查是否卡顿) */
const perf = { frames: 0, long: 0, worst: 0, simMs: 0 };
/** 慢动作剩余时间(秒) */
let slowmo = 0;

/** 每个显示帧调用一次:按真实流逝时间推进若干个固定步长的模拟,再绘制画面。 */
function frame(now: number) {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.1, rawDt);
  last = now;
  perf.frames++;
  if (rawDt > 0.034) perf.long++;
  if (rawDt > perf.worst) perf.worst = rawDt;
  // 慢动作:只放慢模拟推进的速度,渲染照常
  if (slowmo > 0) slowmo -= dt;
  acc += dt * (slowmo > 0 ? 0.3 : 1);
  if (isSettingsOpen() || movesOpen) acc = 0; // 设置面板或招式表打开时暂停
  let steps = 0;
  const t0 = performance.now();
  const active = phase === 'play' || phase === 'clear';
  document.body.classList.toggle('playing', active); // 触屏按键只在战斗中显示
  while (acc >= STEP && steps < 5) {
    // 本步的输入:玩家用键盘/手柄(回放时取录像里的按键),其他角色由 AI 自己决定
    const inputs = new Map<number, number>();
    let mask = active ? input.read() : 0;
    if (phase === 'replay') {
      const m = nextReplayInput();
      if (m === null) { endReplay(); break; }
      mask = m;
    }
    if (phase === 'play') recordInput(mask);
    inputs.set(player.id, mask);
    const hpBefore = player.hp;
    step(world, inputs);
    gfx.handleEvents(world.events, world);
    sfx.handle(world.events);
    for (const e of world.events) {
      if (e.type === 'hit') {
        const at = gfx.project(e.x, e.y + 0.4, e.z);
        hud.damageNumber(at.x, at.y, e.damage, e.heavy || e.damage >= 14, e.victim === player.id);
      } else if (e.type === 'ko' && e.team !== player.team) {
        // 打倒 Boss,或打倒场上最后一个敌人:慢动作收尾
        const left = world.fighters.filter(f => f.team !== player.team && f.hp > 0).length;
        const boss = world.fighters.find(f => f.id === e.id)?.def.role === 'boss';
        if (boss) slowmo = 1.2; else if (left === 0) slowmo = 0.45;
      }
    }
    hud.update(world, player, STEP);
    if (phase === 'play') {
      stats.frames++;
      stats.damageTaken += Math.max(0, hpBefore - player.hp);
      for (const e of world.events) if (e.type === 'hit' && e.attacker === player.id) stats.maxCombo = Math.max(stats.maxCombo, e.combo);
      if (world.cleared) { saveReplay(); onRoomCleared(); }
      else if (player.state === 'dead') {
        saveReplay();
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
  loadCustomContent();
  setupSettings(input, sfx, $('open-settings'));
  if (wantsTouch()) setupTouch(input);
  // 点击 / 轻触剧情幕与「GO」提示,等同于按 Enter(触屏没有键盘)
  for (const id of ['banner', 'go']) $(id).addEventListener('click', () => input.onKey?.('Enter'));
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
  perf, gfx,
  get replayCheck() { return lastReplayCheck; },
  /** 立刻结束录制并回到标题(测试回放用) */
  stopRecording() { saveReplay(); showTitle(); },
  /** 跳过菜单,直接用第 i 个角色进入示例房间(测试用) */
  pick(i: number) {
    heroIndex = i;
    run = { hero: HEROES[i].id, chapter: 0, node: null, avail: [...CHAPTERS[0].start], cleared: [], hp: 1 };
    startNode(CHAPTERS[0].start[1]);
  },
  startNode,
  /** 直接跳到第 ci 章(0 起)的某个节点(测试用) */
  goto(ci: number, id: string) {
    run = { hero: HEROES[heroIndex].id, chapter: ci, node: null, avail: [...CHAPTERS[ci].start], cleared: [], hp: 1 };
    startNode(id);
  },
};
