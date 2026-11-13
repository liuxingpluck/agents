// 练习场测试:标题按 T → 选人 → 练习场;对木桩打一套,检查帧数据面板与木桩不死。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'test-results';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url); await page.waitForTimeout(600);
await page.keyboard.press('KeyT'); await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
// 直接把角色摆到木桩面前(靠走路的话,帧率不稳时距离会忽长忽短)
const place = () => page.evaluate(() => { const g = window.__game; const d = g.world.fighters.find(f => f.team === 1); if (d.state === 'idle') { g.player.x = d.x - 1.1; g.player.z = d.z; g.player.facing = 1; } });
await place();
let sawMove = false, maxCombo = 0;
for (let r = 0; r < 6; r++) {
  for (const k of ['KeyJ', 'KeyJ', 'KeyJ', 'KeyK', 'KeyL']) {
    await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); await page.waitForTimeout(110);
    const t = await page.textContent('#practice');
    if (t.includes('前摇')) sawMove = true;
    maxCombo = Math.max(maxCombo, await page.evaluate(() => window.__game.world.fighters.find(f => f.team === 1)?.comboCount ?? 0));
  }
  if (r === 2) await page.screenshot({ path: `${out}/60-practice.png` });
  await page.waitForTimeout(700);
  await place();
}
const st = await page.evaluate(() => { const g = window.__game; const d = g.world.fighters.find(f => f.team === 1); return { phase: g.phase, dummyAlive: !!d && d.hp > 0, energy: g.player.energy, panel: document.getElementById('practice').textContent }; });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
const back = await page.evaluate(() => window.__game.phase);
const ok = st.phase === 'play' && st.dummyAlive && sawMove && maxCombo >= 2 && back === 'title' && /最高 [2-9]\d/.test(st.panel);
console.log(JSON.stringify({ ok, sawMove, maxCombo, back, st, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
