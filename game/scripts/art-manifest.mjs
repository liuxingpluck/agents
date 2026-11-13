// 扫描 public/art 下已有的图片,生成 public/art/manifest.json。
// 游戏启动时读取这份清单,只加载清单里有的图;没有的继续用程序绘制的方块。
// 用法:node scripts/art-manifest.mjs   (每次新增或删除图片后运行;npm run build:pages 会自动运行)
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/art', import.meta.url));
const files = [];
/** 递归收集图片文件 */
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(png|webp|jpg)$/i.test(name)) files.push(relative(root, p).replaceAll('\\', '/'));
  }
}
walk(root);
files.sort();
writeFileSync(join(root, 'manifest.json'), JSON.stringify({ files }, null, 1));
console.log(`public/art/manifest.json:${files.length} 张图片`);

// 顺带生成内置 AI 模型的清单:public/models/index.json(游戏据此知道哪些角色有内置模型)
const modelDir = fileURLToPath(new URL('../public/models', import.meta.url));
let heroes = [];
try { heroes = readdirSync(modelDir).filter(n => n.endsWith('.json') && n !== 'index.json').map(n => n.replace('.json', '')).sort(); } catch { /* 目录不存在 = 没有内置模型 */ }
if (heroes.length) writeFileSync(join(modelDir, 'index.json'), JSON.stringify({ heroes }));
console.log(`public/models/index.json:${heroes.length} 个内置模型`);
