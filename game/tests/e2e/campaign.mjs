// 战役流程测试:标题 → 选人 → 剧情 → 路线图 → 战斗 → 清场 → 走出房间 → 路线图 → Boss 房。
// 为了快,清场用作弊方式(直接清掉敌人并跳过波次),只验证流程与界面。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'test-results';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const phase = () => page.evaluate(() => window.__game.phase);
const log = [];
await page.goto(url);
await page.evaluate(() => localStorage.removeItem('ashen-abyss.save.v1'));
await page.reload();
await page.waitForTimeout(800);
log.push(await phase());                                   // title
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
log.push(await phase());                                   // select
await page.keyboard.press('KeyD'); await page.keyboard.press('KeyD');
await page.keyboard.press('Enter'); await page.waitForTimeout(400);
log.push(await phase());                                   // story
await page.screenshot({ path: `${out}/20-story.png` });
await page.keyboard.press('Enter'); await page.waitForTimeout(400);
log.push(await phase());                                   // map
await page.keyboard.press('KeyS'); await page.waitForTimeout(100);
await page.screenshot({ path: `${out}/21-map.png` });
await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
log.push(await phase());                                   // play
// 作弊清场
await page.evaluate(() => { const w = window.__game.world; w.wave = w.room.waves.length; w.fighters = w.fighters.filter(f => f.team === 0); });
await page.waitForTimeout(300);
log.push(await phase());                                   // clear
await page.screenshot({ path: `${out}/22-clear.png` });
// 向右跑出房间
await page.evaluate(() => { window.__game.player.x = window.__game.world.room.width - 4; });
await page.keyboard.down('KeyD'); await page.waitForTimeout(2500); await page.keyboard.up('KeyD');
await page.waitForTimeout(800);
log.push(await phase());                                   // map
const run1 = await page.evaluate(() => ({ ...window.__game.run }));
await page.screenshot({ path: `${out}/23-map2.png` });
// 直接进 Boss 房,跳到 Boss 波
await page.evaluate(() => window.__game.startNode('ch1-boss'));
await page.waitForTimeout(300);
await page.evaluate(() => { const w = window.__game.world; w.wave = w.room.waves.length - 1; w.waveTimer = 1; w.fighters = w.fighters.filter(f => f.team === 0); });
await page.waitForTimeout(2500);
const boss = await page.evaluate(() => { const b = window.__game.world.fighters.find(f => f.def.role === 'boss'); return b ? { id: b.def.id, hp: b.hp } : null; });
// 跟 Boss 打一会儿:靠近并连打
for (let i = 0; i < 30; i++) {
  const d = await page.evaluate(() => { const g = window.__game; const b = g.world.fighters.find(f => f.def.role === 'boss'); return b ? Math.sign(b.x - g.player.x) * (Math.abs(b.x - g.player.x) > 1.4 ? 1 : 0) : 0; });
  if (d) { const k = d > 0 ? 'KeyD' : 'KeyA'; await page.keyboard.down(k); await page.waitForTimeout(200); await page.keyboard.up(k); }
  for (const k of ['KeyJ', 'KeyJ', 'KeyJ', 'KeyK']) { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); await page.waitForTimeout(110); }
  if (i === 12) await page.screenshot({ path: `${out}/24-boss.png` });
}
const after = await page.evaluate(() => { const g = window.__game; const b = g.world.fighters.find(f => f.def.role === 'boss'); return { phase: g.phase, bossHp: b?.hp ?? null, playerHp: g.player.hp, bossMoves: b ? b.def.id : null }; });
const want = ['title', 'select', 'story', 'map', 'play', 'clear', 'map'];
const ok = want.every((p, i) => log[i] === p) && run1.cleared.length === 1 && boss && after.bossHp < boss.hp;
console.log(JSON.stringify({ ok, log, run1, boss, after, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
