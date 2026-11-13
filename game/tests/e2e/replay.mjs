// 回放测试:真实地打几秒(乱按一通),结束录制,再从标题播放回放,
// 检查回放结束时的帧数、玩家位置、生命与录制时完全一致。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(600);
await page.evaluate(() => window.__game.pick(4));
// 乱按 6 秒:走位、连打、技能、跳
const keys = ['KeyD', 'KeyJ', 'KeyJ', 'KeyK', 'KeyL', 'Space', 'KeyA', 'KeyJ', 'KeyS', 'KeyK', 'KeyW', 'KeyD'];
for (let i = 0; i < 60; i++) {
  const k = keys[(i * 7 + (i >> 2)) % keys.length];
  await page.keyboard.down(k); await page.waitForTimeout(40 + (i % 5) * 20); await page.keyboard.up(k);
  await page.waitForTimeout(30);
}
const recorded = await page.evaluate(() => { const g = window.__game; g.stopRecording(); return JSON.parse(localStorage.getItem('ashen-abyss.replay.v1')); });
await page.waitForTimeout(300);
await page.keyboard.press('KeyR');
await page.waitForTimeout(400);
const phase = await page.evaluate(() => window.__game.phase);
// 等回放播完(软件渲染较慢,最多等 60 秒)
let check = null;
for (let i = 0; i < 120 && check === null; i++) { await page.waitForTimeout(500); check = await page.evaluate(() => window.__game.replayCheck); }
const ok = phase === 'replay' && check === true && recorded.end.frame > 100;
console.log(JSON.stringify({ ok, phase, check, frames: recorded.end.frame, runs: recorded.inputs.length / 2, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
