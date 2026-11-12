// 编辑器冒烟测试:复制内置英雄 → 改名 → 逐个切换标签页 → 截图 → 断言无报错。
// 用法:先 `npx vite preview --port 4180`,再 node tests/e2e/editor.mjs [url] [输出目录]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4180/editor.html';
const out = process.argv[3] ?? 'test-results';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept());
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(ok ? 'ok  ' : 'FAIL', msg); };

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/20-editor-empty.png` });

// 1) 复制内置英雄并改名
await page.selectOption('.tab:not([hidden]) .row select', 'brynn');
await page.click('text=复制内置英雄');
await page.waitForTimeout(500);
const nameInput = page.locator('.tab:not([hidden]) section:has(h3:text-is("基本信息")) label.fld:has-text("名称") input');
await nameInput.fill('测试战士');
await page.waitForTimeout(800);
check((await page.locator('.errs.good').count()) >= 1, '复制的英雄校验通过');
// 展开第一个招式
await page.locator('table.moves button:text-is("展开")').first().click();
await page.waitForTimeout(300);
// 在预览画布里试玩:点击画布后按键
await page.click('#arena');
for (const k of ['KeyD', 'KeyJ', 'KeyJ', 'KeyK']) { await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); await page.waitForTimeout(80); }
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/21-editor-char.png`, fullPage: true });

// 制造一个错误看校验面板
const hpInput = page.locator('.tab:not([hidden]) label.fld:has-text("生命 hp") input');
await hpInput.fill('900');
await page.waitForTimeout(500);
check((await page.locator('.tab:not([hidden]) .errs.bad').count()) >= 1, '生命 900 触发校验错误');
await page.screenshot({ path: `${out}/22-editor-char-errors.png` });
await hpInput.fill('320');
await page.waitForTimeout(500);

// 2) 房间
await page.click('.tab-btn:text-is("房间")');
await page.click('text=新建房间');
await page.waitForTimeout(400);
await page.click('button:text-is("试玩")');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/23-editor-room.png`, fullPage: true });

// 3) 章节
await page.click('.tab-btn:text-is("章节")');
await page.click('text=新建章节');
await page.waitForTimeout(500);
check((await page.locator('svg.graph circle.node').count()) === 4, '章节节点图画出 4 个节点');
await page.screenshot({ path: `${out}/24-editor-chapter.png`, fullPage: true });

// 4) 导入/导出
await page.click('.tab-btn:text-is("导入/导出")');
await page.waitForTimeout(300);
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
const path = await dl.path();
const { readFileSync } = await import('node:fs');
const exported = JSON.parse(readFileSync(path, 'utf8'));
check(exported.characters.length === 1 && exported.characters[0].name === '测试战士', '导出的 json 含改名后的角色');
check(exported.rooms.length === 1 && exported.chapters.length === 1, '导出含房间与章节');
await page.screenshot({ path: `${out}/25-editor-io.png`, fullPage: true });
// 导入一个坏文件
await page.setInputFiles('input[type=file]', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"ashen-abyss-pack","version":1,"characters":[{"id":"x"}],"rooms":[],"chapters":[]}') });
await page.waitForTimeout(500);
check((await page.locator('.tab:not([hidden]) .errs.bad').count()) >= 1, '坏文件导入被拒绝并显示错误');
// 清空后再导入刚导出的文件
await page.click('#btn-clear');
await page.waitForTimeout(300);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('ashen-abyss.pack.v1')).characters.length === 0), '清空生效');
await page.setInputFiles('input[type=file]', path);
await page.waitForTimeout(500);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('ashen-abyss.pack.v1')).characters.length === 1), '重新导入后角色恢复');
await page.screenshot({ path: `${out}/26-editor-io-after.png`, fullPage: true });

// 刷新后数据仍在(自动保存)
await page.reload();
await page.waitForTimeout(800);
check(await page.evaluate(() => window.__editor.ctx.pack.characters.length === 1), '刷新后自动保存的数据仍在');

console.log(JSON.stringify({ errors, fails }));
await browser.close();
if (errors.length || fails.length) process.exit(1);
