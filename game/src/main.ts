import { createWorld, spawnFighter, step, World } from './sim/world';
import { Fighter } from './sim/types';
import { makeScriptAI } from './sim/ai/script';
import { ROSTER } from './data/characters';
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

type Phase = 'title' | 'play' | 'clear' | 'dead';
let phase: Phase = 'title';
let world: World;
let player: Fighter;
let stats = { maxCombo: 0, damageTaken: 0, frames: 0 };

function startRoom() {
  const room = ROOMS.outpost;
  world = createWorld(room, ROSTER, (Date.now() & 0xffff) | 1);
  world.defaultEnemyAI = makeScriptAI(0.55);
  player = spawnFighter(world, ROSTER.kael, 0, 4, room.depth / 2);
  gfx.buildRoom(room, 11);
  hud.setPlayer(player);
  hud.hideBanner();
  stats = { maxCombo: 0, damageTaken: 0, frames: 0 };
  phase = 'play';
  hud.flash(room.name);
}

function rank(): string {
  const score = stats.maxCombo * 4 - stats.damageTaken * 0.5 - stats.frames / 120;
  return score > 40 ? 'S' : score > 15 ? 'A' : score > -10 ? 'B' : 'C';
}

input.onKey = code => {
  sfx.unlock();
  if (code !== 'Enter' && code !== 'NumpadEnter') return;
  if (phase !== 'play') startRoom();
};

function resize() { gfx.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize);
resize();

// 标题画面背后也渲染一个空场景
world = createWorld(ROOMS.outpost, ROSTER, 1);
world.useWaves = false;
player = spawnFighter(world, ROSTER.kael, 0, 6, 2.2);
gfx.buildRoom(ROOMS.outpost, 11);
hud.setPlayer(player);
hud.banner('烬渊', '<em>ASHEN ABYSS</em><br><br>十位持名者,向无王之都进发。<br><br>按 <b>Enter</b> 开始');

const STEP = 1 / 60;
let acc = 0, last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
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
      stats.damageTaken += hpBefore - player.hp;
      for (const e of world.events) if (e.type === 'hit' && e.attacker === player.id) stats.maxCombo = Math.max(stats.maxCombo, e.combo);
      if (world.cleared) {
        phase = 'clear';
        hud.banner('区域净化', `评价 <b>${rank()}</b><br>最高连击 ${stats.maxCombo} · 受伤 ${Math.round(stats.damageTaken)} · 用时 ${(stats.frames / 60).toFixed(1)} 秒<br><br>按 <b>Enter</b> 再战`);
      } else if (player.state === 'dead') {
        phase = 'dead';
        hud.banner('你被遗忘了', '余烬夺走了你的名字。<br><br>按 <b>Enter</b> 重来');
      }
    }
    acc -= STEP; steps++;
  }
  if (steps === 5) acc = 0;
  gfx.render(world, player.id, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 供自动化测试与调试使用
(window as unknown as Record<string, unknown>).__game = {
  get world() { return world; }, get player() { return player; }, get phase() { return phase; }, start: startRoom,
};
