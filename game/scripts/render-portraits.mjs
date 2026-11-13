// 用游戏自己的 3D 模型渲染一套占位图:主角与 Boss 的头像、主角全身立绘、标题背景。
// 这些只是真正美术到位前的过渡,负责出图的一方直接覆盖同名文件即可。
// 用法(在 game/ 下,先 `npx vite build && npx vite preview --port 4173 &`):
//   node scripts/render-portraits.mjs [网址]        之后再运行 npm run art:manifest
// 只生成还不存在的文件;加 --force 则全部重画(不会覆盖别人放进来的图——见下方 MARK)。
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv.find(a => a.startsWith('http')) ?? 'http://localhost:4173/';
const force = process.argv.includes('--force');
const root = fileURLToPath(new URL('../public/art/', import.meta.url));
// 记录哪些文件是本脚本生成的:--force 时只重画这些,不动别人放进来的真正美术
const markFile = root + 'placeholders.json';
const mine = new Set(existsSync(markFile) ? JSON.parse(readFileSync(markFile, 'utf8')) : []);

const HEROES = ['kael', 'brynn', 'sera', 'ilex', 'rook', 'vesper', 'morgan', 'odran', 'li', 'nola'];
const BOSSES = ['gareth', 'bishop', 'colossus', 'queenshade', 'nameless'];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForTimeout(800);

/** 该不该画这个文件:不存在就画;已存在时只有加了 --force 且是本脚本以前画的才重画 */
const want = rel => !existsSync(root + rel) || (force && mine.has(rel));
const save = (rel, dataUrl) => {
  mkdirSync(root + rel.split('/').slice(0, -1).join('/'), { recursive: true });
  writeFileSync(root + rel, Buffer.from(dataUrl.split(',')[1], 'base64'));
  mine.add(rel);
  console.log('生成', rel);
};

for (const id of [...HEROES, ...BOSSES]) {
  const rel = `portraits/${id}.png`;
  if (want(rel)) save(rel, await page.evaluate(id => window.__game.snapshot(id, 'portrait', 512, 512), id));
}
for (const id of HEROES) {
  const rel = `full/${id}.png`;
  if (want(rel)) save(rel, await page.evaluate(id => window.__game.snapshot(id, 'full', 1024, 1536), id));
}
if (want('ui/title.png')) {
  // 标题背景:十位主角站成一排的场景截图(隐藏界面)
  await page.evaluate(() => { window.__game.lineup(); document.getElementById('hud').style.display = 'none'; });
  await page.waitForTimeout(2500);
  const buf = await page.screenshot({ type: 'png' });
  save('ui/title.png', 'data:image/png;base64,' + buf.toString('base64'));
}
writeFileSync(markFile, JSON.stringify([...mine].sort(), null, 1));
await browser.close();
