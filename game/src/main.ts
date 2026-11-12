// 游戏入口:把模拟层、渲染、输入、界面、音效串起来,并管理「标题 → 选人 → 战斗 → 结算」流程。
import { createWorld, spawnFighter, step, World } from './sim/world';
import { CharacterDef, Fighter } from './sim/types';
import { makeScriptAI } from './sim/ai/script';
import { HEROES, ROSTER } from './data/characters';
import { ROOMS } from './data/rooms';
import { GameRenderer } from './render/renderer';
import { InputManager } from './ui/input';
import { Hud } from './ui/hud';
import { Sfx } from './render/audio';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const gfx = new GameRenderer(canvas);
const input = new InputManager();
const hud = new Hud();
const sfx = new Sfx();

/** 游戏阶段 */
type Phase = 'title' | 'select' | 'play' | 'clear' | 'dead';
let phase: Phase = 'title';
let world: World;
let player: Fighter;
/** 当前选中的角色下标 */
let heroIndex = 0;
/** 本房间的战绩,用于结算评价 */
let stats = { maxCombo: 0, damageTaken: 0, frames: 0 };

const ROLE_NAME: Record<string, string> = {
  warrior: '战士', tank: '坦克', mage: '法师', archer: '弓箭手', brawler: '格斗家',
  assassin: '刺客', summoner: '死灵法师', berserker: '狂战士', lancer: '枪兵', support: '圣职',
};

// ---------- 选人界面 ----------

const selectEl = document.getElementById('select')!;
const cardsEl = document.getElementById('cards')!;
const detailEl = document.getElementById('detail')!;

/** 生成角色卡片(只在启动时调用一次) */
function buildSelect() {
  HEROES.forEach((h, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--c', h.look.primary);
    card.style.setProperty('--c2', h.look.secondary);
    card.innerHTML = `<b>${h.name}</b><span>${ROLE_NAME[h.role] ?? h.role}</span>`;
    card.addEventListener('click', () => { if (heroIndex === i) startRoom(); else { heroIndex = i; refreshSelect(); } });
    cardsEl.appendChild(card);
  });
}

/** 根据当前选中项刷新高亮与详情 */
function refreshSelect() {
  [...cardsEl.children].forEach((c, i) => c.classList.toggle('on', i === heroIndex));
  const h = HEROES[heroIndex];
  const cmds = h.commands.map(c => `${motionText(c.motion)}+${c.button} ${h.moves[c.move]?.name ?? ''}`);
  const skills = h.skills.map((id, i) => `${i + 1}:${h.moves[id]?.name ?? ''}`);
  detailEl.innerHTML =
    `<h2>${h.name} <small>${h.title} · ${ROLE_NAME[h.role] ?? ''}</small></h2>` +
    `<p>${h.lore}</p>` +
    `<p class="mono">生命 ${h.stats.hp} · 速度 ${(h.stats.speed * 100).toFixed(1)} · 重量 ${h.stats.weight}</p>` +
    `<p class="mono">指令技:${[...new Set(cmds)].join(' / ')}</p>` +
    `<p class="mono">技能:${skills.join(' / ')}</p>`;
}

/** 把指令动作代码转成箭头文字 */
function motionText(m: string): string {
  return ({ DF: '↓→', DB: '↓←', DU: '↓↑', FF: '→→', BF: '←→', DD: '↓↓' } as Record<string, string>)[m] ?? m;
}

function openSelect() {
  phase = 'select';
  hud.hideBanner();
  selectEl.classList.add('show');
  refreshSelect();
}

// ---------- 战斗流程 ----------

/** 用当前选中的角色开始(或重开)房间 */
function startRoom() {
  const room = ROOMS.outpost;
  const hero: CharacterDef = HEROES[heroIndex];
  world = createWorld(room, ROSTER, (Date.now() & 0xffff) | 1);
  world.defaultEnemyAI = makeScriptAI(0.55);
  world.summonAI = makeScriptAI(0.8);
  player = spawnFighter(world, hero, 0, 4, room.depth / 2);
  gfx.buildRoom(room, 11);
  hud.setPlayer(player);
  hud.hideBanner();
  selectEl.classList.remove('show');
  stats = { maxCombo: 0, damageTaken: 0, frames: 0 };
  phase = 'play';
  hud.flash(room.name);
}

/** 结算评价:连击越高、受伤越少、用时越短越好 */
function rank(): string {
  const score = stats.maxCombo * 4 - stats.damageTaken * 0.5 - stats.frames / 120;
  return score > 40 ? 'S' : score > 15 ? 'A' : score > -10 ? 'B' : 'C';
}

// 菜单按键(战斗中的按键由 input.read() 每帧读取,不走这里)
input.onKey = code => {
  sfx.unlock();
  const enter = code === 'Enter' || code === 'NumpadEnter' || code === 'KeyJ';
  if (phase === 'select') {
    const n = HEROES.length;
    if (code === 'KeyA' || code === 'ArrowLeft') heroIndex = (heroIndex + n - 1) % n;
    else if (code === 'KeyD' || code === 'ArrowRight') heroIndex = (heroIndex + 1) % n;
    else if (code === 'KeyW' || code === 'ArrowUp' || code === 'KeyS' || code === 'ArrowDown') heroIndex = (heroIndex + 5) % n;
    else if (enter) { startRoom(); return; }
    refreshSelect();
  } else if (phase === 'title' && enter) openSelect();
  else if ((phase === 'clear' || phase === 'dead') && (code === 'Enter' || code === 'NumpadEnter')) openSelect();
  else if (phase === 'play' && code === 'Escape') openSelect();
};

function resize() { gfx.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize);
resize();

// 标题画面:背后渲染一个只有主角站着的场景
buildSelect();
world = createWorld(ROOMS.outpost, ROSTER, 1);
world.useWaves = false;
player = spawnFighter(world, HEROES[0], 0, 6, 2.2);
gfx.buildRoom(ROOMS.outpost, 11);
hud.setPlayer(player);
hud.banner('烬渊', '<em>ASHEN ABYSS</em><br><br>十位持名者,向无王之都进发。<br><br>按 <b>Enter</b> 开始');

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
  while (acc >= STEP && steps < 5) {
    const inputs = new Map<number, number>();
    inputs.set(player.id, phase === 'play' ? input.read() : 0);
    const hpBefore = player.hp;
    step(world, inputs);
    gfx.handleEvents(world.events);
    sfx.handle(world.events);
    hud.update(world, player, STEP);
    if (phase === 'play') {
      stats.frames++;
      stats.damageTaken += Math.max(0, hpBefore - player.hp);
      for (const e of world.events) if (e.type === 'hit' && e.attacker === player.id) stats.maxCombo = Math.max(stats.maxCombo, e.combo);
      if (world.cleared) {
        phase = 'clear';
        hud.banner('区域净化', `评价 <b>${rank()}</b><br>最高连击 ${stats.maxCombo} · 受伤 ${Math.round(stats.damageTaken)} · 用时 ${(stats.frames / 60).toFixed(1)} 秒<br><br>按 <b>Enter</b> 继续`);
      } else if (player.state === 'dead') {
        phase = 'dead';
        hud.banner('你被遗忘了', '余烬夺走了你的名字。<br><br>按 <b>Enter</b> 重来');
      }
    }
    acc -= STEP; steps++;
  }
  if (steps === 5) acc = 0; // 掉帧太严重时丢弃积压,避免「死亡螺旋」
  perf.simMs += performance.now() - t0;
  gfx.render(world, player.id, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 供自动化测试与调试使用
(window as unknown as Record<string, unknown>).__game = {
  get world() { return world; }, get player() { return player; }, get phase() { return phase; },
  perf, start: startRoom, pick(i: number) { heroIndex = i; startRoom(); },
};
