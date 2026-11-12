// 触屏操作与设置面板验证:手机横屏尺寸,全程不用键盘走到战斗;再验证改键。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'test-results';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

// ---------- 触屏 ----------
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(String(e)));
await page.goto(base + '?touch=1');
await page.waitForTimeout(800);
const phase = () => page.evaluate(() => window.__game.phase);
const log = [];
await page.tap('#banner'); await page.waitForTimeout(300); log.push(await phase());            // select
await page.tap('#cards .card:nth-child(1)'); await page.waitForTimeout(300); log.push(await phase()); // story(已选中的卡再点一次 = 确认)
await page.tap('#banner'); await page.waitForTimeout(400); log.push(await phase());            // map
await page.screenshot({ path: `${out}/40-touch-map.png` });
const node = page.locator('#map-svg g[data-node="ch1-a1"]');
await node.tap(); await page.waitForTimeout(200);
if (await phase() === 'map') { await node.tap(); }
await page.waitForTimeout(1800); log.push(await phase());                                         // play
// 摇杆向右拖,并按「轻」
const x0 = await page.evaluate(() => window.__game.player.x);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
await touch('touchStart', [{ x: 110, y: 300, id: 1 }]);
await touch('touchMove', [{ x: 180, y: 300, id: 1 }]);
await page.waitForTimeout(900);
const x1 = await page.evaluate(() => window.__game.player.x);
await touch('touchEnd', []);
await page.tap('#pad button[data-b=LP]');
let move = null;
for (let i = 0; i < 10 && !move; i++) { await page.waitForTimeout(20); move = await page.evaluate(() => window.__game.player.move?.id ?? null); }
await page.screenshot({ path: `${out}/41-touch-play.png` });
await ctx.close();

// ---------- 设置:改键 ----------
const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
p2.on('pageerror', e => errors.push(String(e)));
await p2.goto(base); await p2.waitForTimeout(600);
await p2.click('#open-settings'); await p2.waitForTimeout(200);
await p2.click('#settings button[data-a=LP]'); await p2.keyboard.press('KeyF'); await p2.waitForTimeout(200);
const label = await p2.textContent('#settings button[data-a=LP]');
await p2.screenshot({ path: `${out}/42-settings.png` });
await p2.click('#set-close');
await p2.evaluate(() => window.__game.pick(0)); await p2.waitForTimeout(1200);
await p2.keyboard.down('KeyF');
let m2 = null;
for (let i = 0; i < 10 && !m2; i++) { await p2.waitForTimeout(20); m2 = await p2.evaluate(() => window.__game.player.move?.id ?? null); }
await p2.keyboard.up('KeyF');
await p2.click('#open-settings'); await p2.click('#set-reset'); await p2.click('#set-close');

const ok = log.join() === 'select,story,map,play' && x1 > x0 + 1 && move === 'lp1' && label === 'F' && m2 === 'lp1';
console.log(JSON.stringify({ ok, log, moved: +(x1 - x0).toFixed(2), move, label, m2, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
