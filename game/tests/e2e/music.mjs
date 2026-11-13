// 背景音乐测试:确认按键后音乐开始排音符,并且随场面切换氛围(菜单 calm → 战斗 battle → 有 Boss 时 boss)。
// 只能验证「程序确实在发声」,好不好听需要人来听。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url); await page.waitForTimeout(600);
const mood = () => page.evaluate(() => ({ mood: window.__game.music.mood, notes: window.__game.music.notes, state: window.__game.music.ctx?.state ?? 'none' }));
await page.keyboard.press('Enter'); await page.waitForTimeout(2500);          // 选人界面:calm
const calm = await mood();
await page.evaluate(() => window.__game.pick(0)); await page.waitForTimeout(2500); // 战斗:battle
const battle = await mood();
await page.evaluate(() => window.__game.startNode('ch1-boss'));
await page.evaluate(() => { const w = window.__game.world; w.wave = w.room.waves.length - 1; w.waveTimer = 1; });
await page.waitForTimeout(3000);                                                // Boss 出场:boss
const boss = await mood();
const ok = calm.mood === 'calm' && battle.mood === 'battle' && boss.mood === 'boss' && calm.state === 'running' && battle.notes > calm.notes && boss.notes > battle.notes;
console.log(JSON.stringify({ ok, calm, battle, boss, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
