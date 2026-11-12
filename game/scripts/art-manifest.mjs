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
