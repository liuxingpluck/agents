// 对战模式测试:先在训练场练几秒得到一个模型,再回游戏按 V 单挑它,
// 检查对手确实由神经网络控制、会行动,并且胜负结算正常。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'test-results';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// 1. 训练凯尔的模型几秒钟(每 5 代自动存档)
await page.goto(base + 'train.html'); await page.waitForTimeout(800);
await page.evaluate(() => localStorage.removeItem('ashen-abyss.ai.v1.kael'));
await page.reload(); await page.waitForTimeout(800);
await page.fill('#workers', '3'); await page.dispatchEvent('#workers', 'change');
await page.click('#toggle');
let gen = 0;
for (let i = 0; i < 60 && gen < 10; i++) { await page.waitForTimeout(500); gen = await page.evaluate(() => window.__train.trainer.state.generation); }
await page.click('#toggle'); // 暂停并保存
const saved = await page.evaluate(() => !!localStorage.getItem('ashen-abyss.ai.v1.kael'));
// 2. 回游戏,选最后一个角色(诺拉),她的「下一位」正是凯尔
await page.goto(base); await page.waitForTimeout(700);
await page.keyboard.press('KeyV'); await page.waitForTimeout(300);
await page.keyboard.press('KeyA'); await page.waitForTimeout(100); // 从第 1 个往左绕到第 10 个
await page.keyboard.press('Enter'); await page.waitForTimeout(600);
const flash = await page.textContent('#flash');
const x0 = await page.evaluate(() => window.__game.world.fighters.find(f => f.team === 1).x);
let acted = false;
for (let i = 0; i < 20 && !acted; i++) {
  await page.waitForTimeout(300);
  acted = await page.evaluate(x0 => { const r = window.__game.world.fighters.find(f => f.team === 1); return Math.abs(r.x - x0) > 0.5 || !!r.move; }, x0);
}
await page.screenshot({ path: `${out}/70-duel.png` });
// 3. 作弊让对手倒下,检查胜利结算
await page.evaluate(() => { const r = window.__game.world.fighters.find(f => f.team === 1); r.hp = 0; r.state = 'dead'; });
await page.waitForTimeout(400);
const title = await page.textContent('#banner-title');
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
const back = await page.evaluate(() => window.__game.phase);
const ok = saved && gen >= 5 && flash.includes('神经网络') && flash.includes('凯尔') && acted && title === '胜利' && back === 'title';
console.log(JSON.stringify({ ok, gen, saved, flash, acted, title, back, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
