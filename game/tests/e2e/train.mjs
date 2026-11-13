// 训练页冒烟测试:开始训练,等一段时间,检查代数在涨、考试有记录、无报错。
// 用法:node tests/e2e/train.mjs [url] [输出目录] [训练秒数]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/train.html';
const out = process.argv[3] ?? 'test-results';
const secs = Number(process.argv[4] ?? 60);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(1000);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1000);
await page.fill('#workers', '3');
await page.dispatchEvent('#workers', 'change');
await page.click('#toggle');
await page.waitForTimeout(secs * 1000);
await page.screenshot({ path: `${out}/10-train.png` });
const info = await page.evaluate(() => {
  const t = window.__train.trainer;
  const h = t.history;
  return { generation: t.state.generation, first: h[0], last: h[h.length - 1], points: h.length, sps: document.getElementById('s-sps').textContent, ms: document.getElementById('s-ms').textContent, saved: !!localStorage.getItem('ashen-abyss.ai.v1.kael') };
});
// 联赛:换成训练塞拉,此时本机已有凯尔的模型,应当被找到并作为对手参与训练
await page.click('#toggle');                       // 暂停并保存凯尔
await page.selectOption('#hero', 'sera');
await page.waitForTimeout(500);
const leagueText = await page.textContent('#league-n');
await page.click('#toggle');
let g2 = 0;
for (let i = 0; i < 40 && g2 < 3; i++) { await page.waitForTimeout(500); g2 = await page.evaluate(() => window.__train.trainer.state.generation); }
await page.click('#toggle');
info.league = { text: leagueText, found: await page.evaluate(() => window.__train.trainer.league.length), generations: g2 };
console.log(JSON.stringify({ info, errors }));
await browser.close();
if (errors.length || info.generation < 1 || info.league.found !== 1 || info.league.generations < 3) process.exit(1);
