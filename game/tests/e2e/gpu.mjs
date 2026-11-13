// 显卡测试(WebGPU)的验证:点击训练页的「开始测试」,检查显卡算出的结果与 CPU 一致,并给出了三种批量的测速。
// 容器里只有软件模拟的显卡,所以这里的速度数字没有参考价值,只验证功能正确。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/train.html';
const out = process.argv[3] ?? 'test-results';
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url); await page.waitForTimeout(1500);
await page.click('#gpu-test');
let r = null;
for (let i = 0; i < 120 && !r; i++) { await page.waitForTimeout(500); r = await page.evaluate(() => window.__gpuBench ?? null); }
const text = await page.textContent('#gpu-out');
await page.locator('#gpu-out').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${out}/99-gpu.png` });
const ok = !!r && r.maxDiff < 1e-3 && r.rows.length === 3 && r.rows.every(x => x.cpuPerSec > 0 && x.gpuPerSec > 0) && text.includes('与 CPU 一致');
console.log(JSON.stringify({ ok, result: r, errors }));
await browser.close();
if (!ok || errors.length) process.exit(1);
