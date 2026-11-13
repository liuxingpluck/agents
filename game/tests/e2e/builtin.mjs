// 内置模型测试:清空本机存档后,
//  1. 按 V 单挑,对手应由「内置」神经网络控制并且会行动;连打两场,对手角色应当轮换
//  2. 训练页在没有本机存档时,应以内置模型为起点(代数 > 0)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(600);
const fights = [];
for (let n = 0; n < 2; n++) {
  await page.keyboard.press('KeyV'); await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  const flash = await page.textContent('#flash');
  const rival = await page.evaluate(() => window.__game.world.fighters.find(f => f.team === 1).def.id);
  const x0 = await page.evaluate(() => window.__game.world.fighters.find(f => f.team === 1).x);
  let acted = false;
  for (let i = 0; i < 20 && !acted; i++) {
    await page.waitForTimeout(300);
    acted = await page.evaluate(x0 => { const r = window.__game.world.fighters.find(f => f.team === 1); return Math.abs(r.x - x0) > 0.5 || !!r.move; }, x0);
  }
  fights.push({ flash, rival, acted });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
}
await page.goto(base + 'train.html'); await page.waitForTimeout(1500);
const train = await page.evaluate(() => ({ gen: window.__train.trainer.state.generation, status: document.getElementById('status').textContent }));
const ok = fights.every(f => f.flash.includes('内置') && f.acted) && fights[0].rival !== fights[1].rival && train.gen > 0 && train.status.includes('内置模型');
console.log(JSON.stringify({ ok, fights, train, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
