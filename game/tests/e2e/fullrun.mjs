// 全流程速通:用作弊清场的方式把 5 章从头走到结局,验证章节衔接、剧情幕、存档与结局都正常。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => localStorage.removeItem('ashen-abyss.save.v1'));
await page.reload();
await page.waitForTimeout(700);
const state = () => page.evaluate(() => ({ phase: window.__game.phase, chapter: window.__game.run?.chapter ?? -1, node: window.__game.run?.node ?? null }));
const visited = [];
let rooms = 0, last = '';
for (let i = 0; i < 400; i++) {
  const s = await state();
  const key = `${s.phase}:${s.chapter}:${s.node}`;
  if (key !== last) { visited.push(key); last = key; }
  if (s.phase === 'ending') break;
  if (s.phase === 'play') {
    // 作弊:跳过所有波次并清掉敌人
    await page.evaluate(() => { const w = window.__game.world; w.wave = w.room.waves.length; w.fighters = w.fighters.filter(f => f.team === 0); });
    rooms++;
    await page.waitForTimeout(150);
  } else {
    await page.keyboard.press('Enter'); // 标题、选人、剧情、路线图、清场后离开,都用 Enter 推进
    await page.waitForTimeout(s.phase === 'map' || s.phase === 'clear' ? 650 : 200);
  }
}
const end = await state();
const saved = await page.evaluate(() => localStorage.getItem('ashen-abyss.save.v1'));
const chapters = [...new Set(visited.map(v => v.split(':')[1]))].filter(c => c !== '-1');
const ok = end.phase === 'ending' && chapters.length === 5 && rooms === 20 && saved === null;
console.log(JSON.stringify({ ok, end, rooms, chapters, saveClearedAtEnding: saved === null, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
