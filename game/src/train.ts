// AI 训练场页面:左边控制训练并显示进步曲线,右边实时观看「当前模型 vs 脚本 AI」。
import { HEROES, ROSTER } from './data/characters';
import { Fighter } from './sim/types';
import { makeScriptAI } from './sim/ai/script';
import { createWorld, spawnFighter, step, World } from './sim/world';
import { GameRenderer } from './render/renderer';
import { ARENA, EPISODE_FRAMES } from './ml/env';
import { makePolicyController } from './ml/policy';
import { ExamPoint, Progress, SavedModel, Trainer } from './ml/trainer';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const heroSel = $<HTMLSelectElement>('hero'), foeSel = $<HTMLSelectElement>('foe');
const workersIn = $<HTMLInputElement>('workers'), selfPlayIn = $<HTMLInputElement>('selfplay');
const toggleBtn = $<HTMLButtonElement>('toggle'), statusEl = $('status');

for (const h of HEROES) {
  heroSel.add(new Option(`${h.name} · ${h.title}`, h.id));
  foeSel.add(new Option(`${h.name} · ${h.title}`, h.id));
}
workersIn.value = String(Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1)));

let trainer: Trainer | null = null;

/** 按当前设置(重新)创建训练器。切换角色或线程数时调用。 */
function makeTrainer() {
  trainer?.dispose();
  trainer = new Trainer({ hero: heroSel.value, foe: foeSel.value, workers: Number(workersIn.value) || 1, selfPlay: selfPlayIn.checked });
  trainer.onProgress = showProgress;
  toggleBtn.textContent = '开始训练';
  $('s-gen').textContent = String(trainer.state.generation);
  showHistory(trainer.history);
  statusEl.textContent = trainer.state.generation > 0 ? `已载入本机存档(第 ${trainer.state.generation} 代)` : '全新模型:一开始只会乱按';
  restartMatch();
}

/** 把最近一次考试的结果填进表格并重画曲线 */
function showHistory(hist: ExamPoint[]) {
  const last = hist[hist.length - 1];
  $('s-win').textContent = last ? `${Math.round(last.winRate * 100)}%` : '—';
  $('s-dmg').textContent = last ? `${Math.round(last.dealt * 100)}% / ${Math.round(last.taken * 100)}%` : '—';
  $('s-combo').textContent = last ? String(last.maxCombo) : '—';
  drawChart(hist);
}

function showProgress(p: Progress) {
  $('s-gen').textContent = String(p.generation);
  $('s-fit').textContent = `${p.meanFitness.toFixed(2)} / ${p.bestFitness.toFixed(2)}`;
  $('s-sps').textContent = `${(p.stepsPerSec / 1000).toFixed(0)}k 步/秒`;
  $('s-ms').textContent = `${Math.round(p.genMs)} ms`;
  $('s-pool').textContent = String(p.poolSize);
  showHistory(p.history);
}

/** 画胜率与伤害差两条曲线 */
function drawChart(hist: ExamPoint[]) {
  const c = $<HTMLCanvasElement>('chart');
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = c.clientHeight;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#3a3642'; g.lineWidth = 1;
  for (const y of [0, 0.5, 1]) { g.beginPath(); g.moveTo(0, 8 + (H - 16) * y); g.lineTo(W, 8 + (H - 16) * y); g.stroke(); }
  if (hist.length < 2) return;
  const maxGen = hist[hist.length - 1].generation || 1;
  const line = (color: string, val: (p: ExamPoint) => number) => {
    g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
    hist.forEach((p, i) => {
      const x = (p.generation / maxGen) * (W - 4) + 2, y = 8 + (H - 16) * (1 - val(p));
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.stroke();
  };
  line('#e8e2d6', p => Math.min(1, Math.max(0, (p.dealt - p.taken + 1) / 2)));
  line('#ff6a2a', p => p.winRate);
}

// ---------- 实时观战 ----------

const gfx = new GameRenderer($<HTMLCanvasElement>('arena'));
let world: World, hero: Fighter, foe: Fighter;
let matchFrames = 0, matches = 0, wins = 0;

/** 用训练器当前的参数开一局新的观战比赛 */
function restartMatch() {
  if (!trainer) return;
  world = createWorld(ARENA, ROSTER, (Date.now() & 0xffff) | 1);
  world.useWaves = false; world.protectAll = true;
  const theta = trainer.state.theta.slice(); // 拷贝一份,避免训练中途参数变化影响这一局
  hero = spawnFighter(world, ROSTER[heroSel.value], 0, 4.5, 1.7, makePolicyController(theta, trainer.layout));
  foe = spawnFighter(world, ROSTER[foeSel.value], 1, 9.5, 1.7, makeScriptAI(0.6));
  hero.energy = 30; foe.energy = 30;
  gfx.buildRoom(ARENA, 5);
  matchFrames = 0;
}

function resizeArena() {
  const c = $<HTMLCanvasElement>('arena');
  gfx.resize(c.clientWidth, c.clientHeight);
}
window.addEventListener('resize', () => { resizeArena(); if (trainer) drawChart(trainer.history); });

let last = performance.now(), acc = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now; acc += dt;
  let n = 0;
  while (acc >= 1 / 60 && n < 4) {
    step(world);
    gfx.handleEvents(world.events);
    matchFrames++;
    const over = hero.state === 'dead' || foe.state === 'dead' || matchFrames > EPISODE_FRAMES + 120;
    if (over) {
      matches++;
      if (foe.hp <= 0 && hero.hp > 0) wins++;
      restartMatch();
    }
    acc -= 1 / 60; n++;
  }
  if (n === 4) acc = 0;
  gfx.render(world, hero.id, dt);
  const hp = (f: Fighter) => `${Math.max(0, Math.round((f.hp / f.def.stats.hp) * 100))}%`;
  $('arena-info').innerHTML =
    `<b>${hero.def.name}(AI,第 ${trainer?.state.generation ?? 0} 代)</b> ${hp(hero)}　vs　${foe.def.name}(脚本)${hp(foe)}<br>` +
    `观战战绩 ${wins} 胜 / ${matches} 局`;
  requestAnimationFrame(loop);
}

// ---------- 按钮 ----------

toggleBtn.addEventListener('click', () => {
  if (!trainer) return;
  if (trainer.running) { trainer.stop(); trainer.save(); toggleBtn.textContent = '继续训练'; statusEl.textContent = '已暂停并保存'; }
  else { void trainer.start(); toggleBtn.textContent = '暂停'; statusEl.textContent = '训练中……右侧每局都会换上最新的模型'; }
});
$('reset').addEventListener('click', () => {
  if (!trainer || !confirm('确定丢弃这个角色已训练的模型吗?')) return;
  const was = trainer.running;
  trainer.stop(); trainer.reset();
  matches = 0; wins = 0;
  makeTrainer();
  if (was) toggleBtn.click();
});
$('export').addEventListener('click', () => {
  if (!trainer) return;
  const blob = new Blob([JSON.stringify(trainer.export())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ashen-ai-${trainer.opts.hero}-gen${trainer.state.generation}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('import').addEventListener('click', () => $<HTMLInputElement>('file').click());
$<HTMLInputElement>('file').addEventListener('change', async ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f || !trainer) return;
  try {
    const m = JSON.parse(await f.text()) as SavedModel;
    heroSel.value = m.hero; foeSel.value = m.foe;
    makeTrainer();
    trainer!.import(m);
    makeTrainer();
    statusEl.textContent = `已导入第 ${m.generation} 代模型`;
  } catch (e) { statusEl.textContent = `导入失败:${(e as Error).message}`; }
});
for (const el of [heroSel, foeSel, workersIn, selfPlayIn]) el.addEventListener('change', () => { matches = 0; wins = 0; makeTrainer(); });

foeSel.value = HEROES[0].id;
makeTrainer();
resizeArena();
requestAnimationFrame(loop);

// 供自动化测试使用
(window as unknown as Record<string, unknown>).__train = { get trainer() { return trainer; } };
