// 四键制操作验证:检查 轻 / ↓+轻 / 重 / ↓+重 / 轻+重 / 特殊技各方向 分别触发了正确的招式,以及 ↓↓+重 = 格挡。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(500);
await page.evaluate(() => { const g = window.__game; g.pick(0); g.world.useWaves = false; g.world.fighters.length = 1; });
/** 按住 hold 里的键,再点一下 keys,返回随后出现的招式 id */
const probe = async (keys, hold = []) => {
  await page.evaluate(() => { const p = window.__game.player; p.energy = 100; });
  await page.waitForTimeout(900);
  for (const k of hold) await page.keyboard.down(k);
  await page.waitForTimeout(60);
  for (const k of keys) await page.keyboard.down(k);
  let id = null;
  for (let i = 0; i < 12 && !id; i++) { await page.waitForTimeout(25); id = await page.evaluate(() => window.__game.player.move?.id ?? null); }
  for (const k of [...keys, ...hold]) await page.keyboard.up(k);
  return id;
};
const got = {
  light: await probe(['KeyJ']), downLight: await probe(['KeyJ'], ['KeyS']),
  heavy: await probe(['KeyK']), downHeavy: await probe(['KeyK'], ['KeyS']),
  grab: await probe(['KeyJ', 'KeyK']),
  sp: await probe(['KeyL']), spSide: await probe(['KeyL'], ['KeyD']), spDown: await probe(['KeyL'], ['KeyS']), spUp: await probe(['KeyL'], ['KeyW']),
};
// ↓↓ + 重 = 格挡:点一下「下」松开,再按住「下」并按住重键,应进入格挡;松开重键后收起
await page.waitForFunction(() => window.__game.player.state === 'idle', null, { timeout: 8000 }); // 等上一招(奥义)完全收招
await page.waitForTimeout(300);
await page.keyboard.down('KeyS'); await page.waitForTimeout(50); await page.keyboard.up('KeyS'); await page.waitForTimeout(50);
await page.keyboard.down('KeyS'); await page.waitForTimeout(50); await page.keyboard.down('KeyK');
await page.waitForTimeout(400);
got.guard = await page.evaluate(() => window.__game.player.state);
await page.keyboard.up('KeyK'); await page.keyboard.up('KeyS');
await page.waitForTimeout(400);
got.guardEnd = await page.evaluate(() => window.__game.player.state);
const want = { guard: 'guard', guardEnd: 'idle',  light: 'lp1', downLight: 'lk1', heavy: 'hp1', downHeavy: 'hk1', grab: 'grab', sp: 'wave', spSide: 'whirl', spDown: 'quake', spUp: 'oath' };
const bad = Object.keys(want).filter(k => got[k] !== want[k]);
console.log(JSON.stringify({ got, bad, errors }));
await browser.close();
if (bad.length || errors.length) process.exit(1);
