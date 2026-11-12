// 冒烟测试:启动预览服务器后运行 `node tests/e2e/smoke.mjs [url] [输出目录]`
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'test-results';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-title.png` });
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/01b-select.png` });
const hero = Number(process.argv[4] ?? 0);
for (let i = 0; i < hero; i++) { await page.keyboard.press('KeyD'); await page.waitForTimeout(60); }
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
await page.evaluate(() => { const p = window.__game.perf; p.frames = 0; p.long = 0; p.worst = 0; p.simMs = 0; });
// 走向敌人并打一套:轻轻轻 → 重 → 挑空
await page.keyboard.down('KeyD'); await page.waitForTimeout(900); await page.keyboard.up('KeyD');
const tap = async (k, wait = 130) => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); await page.waitForTimeout(wait); };
for (let r = 0; r < 14; r++) {
  await tap('KeyJ'); await tap('KeyJ'); await tap('KeyJ'); await tap('KeyK', 200); await tap('KeyI', 250);
  if (r === 2) await page.screenshot({ path: `${out}/02-fight.png` });
  if (r === 6) { await tap('Digit1', 400); await page.screenshot({ path: `${out}/03-skill.png` }); }
  const st = await page.evaluate(() => { const g = window.__game; const e = g.world.fighters.find(f => f.team === 1 && f.hp > 0); return e ? Math.sign(e.x - g.player.x) : 0; });
  if (st !== 0) { const k = st > 0 ? 'KeyD' : 'KeyA'; await page.keyboard.down(k); await page.waitForTimeout(250); await page.keyboard.up(k); }
}
await page.screenshot({ path: `${out}/04-later.png` });
const info = await page.evaluate(() => { const g = window.__game; return { hero: g.player.def.id, phase: g.phase, frame: g.world.frame, wave: g.world.wave, hp: g.player.hp, fighters: g.world.fighters.length, perf: { ...g.perf, simMsPerFrame: +(g.perf.simMs / g.perf.frames).toFixed(3) } }; });
console.log(JSON.stringify({ info, errors }));
await browser.close();
if (errors.length) process.exit(1);
