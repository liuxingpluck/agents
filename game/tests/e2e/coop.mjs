// 双人合作测试:
//  1. 从菜单走一遍:选人界面按 P 开双人 → 1P 选 → 2P 选 → 进入战斗后场上有两名玩家
//  2. 两人按键互不干扰:D 只动 1P,→ 只动 2P;J 出 1P 的招,小键盘 1 出 2P 的招
//  3. 1P 倒下游戏继续;两人都倒下才失败
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'test-results';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url);
await page.evaluate(() => localStorage.removeItem('ashen-abyss.save.v1'));
await page.reload(); await page.waitForTimeout(600);
// --- 1. 菜单流程 ---
await page.keyboard.press('Enter'); await page.waitForTimeout(250);
await page.keyboard.press('KeyP'); await page.waitForTimeout(100);
const tip1 = await page.textContent('#coop-tip');
await page.keyboard.press('Enter'); await page.waitForTimeout(150);      // 1P 确认(凯尔)
const tip2 = await page.textContent('#coop-tip');
await page.keyboard.press('KeyD'); await page.keyboard.press('KeyD');    // 2P 选第 4 个(伊莱):默认在第 2 个,右移两格
await page.screenshot({ path: `${out}/80-coop-select.png` });
await page.keyboard.press('Enter'); await page.waitForTimeout(350);      // → 剧情
await page.keyboard.press('Enter'); await page.waitForTimeout(350);      // → 路线图
await page.keyboard.press('Enter'); await page.waitForTimeout(1800);     // → 战斗
const menu = await page.evaluate(() => { const g = window.__game; return { phase: g.phase, p1: g.player.def.id, p2: g.player2?.def.id ?? null, extra: g.world.extraPerWave }; });
// --- 2. 按键互不干扰(清掉敌人避免干扰) ---
await page.evaluate(() => { const w = window.__game.world; w.useWaves = false; w.fighters = w.fighters.filter(f => f.team === 0); w.projectiles = []; });
await page.waitForTimeout(500);
const pos = () => page.evaluate(() => ({ x1: window.__game.player.x, x2: window.__game.player2.x }));
const a = await pos();
await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
const b = await pos();
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
const c = await pos();
const move = async (key, who) => { await page.keyboard.down(key); let id = null; for (let i = 0; i < 12 && !id; i++) { await page.waitForTimeout(20); id = await page.evaluate(w => window.__game[w].move?.id ?? null, who); } await page.keyboard.up(key); return id; };
await page.waitForTimeout(300);
const m1 = await move('KeyJ', 'player');
await page.waitForTimeout(600);
const m2 = await move('Numpad1', 'player2');
await page.screenshot({ path: `${out}/81-coop-play.png` });
// --- 3. 倒下的规则 ---
await page.evaluate(() => { const p = window.__game.player; p.hp = 0; p.state = 'dead'; });
await page.waitForTimeout(400);
const afterOne = await page.evaluate(() => window.__game.phase);
await page.evaluate(() => { const p = window.__game.player2; p.hp = 0; p.state = 'dead'; });
await page.waitForTimeout(400);
const afterBoth = await page.evaluate(() => window.__game.phase);
const ok = tip1.includes('开') && tip2.includes('2P') && menu.phase === 'play' && menu.p1 === 'kael' && menu.p2 === 'ilex' && menu.extra === 1
  && b.x1 > a.x1 + 0.8 && Math.abs(b.x2 - a.x2) < 0.05 && c.x2 > b.x2 + 0.8 && Math.abs(c.x1 - b.x1) < 0.05
  && m1 === 'lp1' && m2 === 'lp1' && afterOne === 'play' && afterBoth === 'dead';
console.log(JSON.stringify({ ok, tip1, tip2, menu, a, b, c, m1, m2, afterOne, afterBoth, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
