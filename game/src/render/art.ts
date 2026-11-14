// 美术资源清单:游戏启动时读取 public/art/manifest.json,得知有哪些图片可用。
// 没有图片的地方一律回退到程序绘制,所以清单为空时游戏照常运行。

/** 当前可用的图片清单(相对路径集合),启动时由 loadArtManifest 填充。 */
let files = new Set<string>();

/** 一张战斗姿势图的校正值:k 是放大倍数,cx 是人物重心在画布里的横向位置(0~1,0.5 为正中) */
export interface SpriteMeta { k: number; cx: number }
let sprites: Record<string, Record<string, SpriteMeta>> = {};
const NO_META: SpriteMeta = { k: 1, cx: 0.5 };

/** 取某个角色某个姿势的校正值(没有记录就不校正) */
export function spriteMeta(id: string, pose: string): SpriteMeta {
  return sprites[id]?.[pose] ?? NO_META;
}

/**
 * 一段逐帧动画的说明:所有帧排在一张网格图里(cols 列 × rows 行,从左到右、从上到下)。
 * 角色动画另带校正值:k 放大倍数、cx 重心横向位置、fy 脚底纵向位置(0 顶 ~ 1 底)、hit「打出去」的那一帧。
 */
export interface AnimMeta { frames: number; cols: number; rows: number; fps: number; loop: boolean; k?: number; cx?: number; fy?: number; hit?: number }
let anims: Record<string, AnimMeta> = {};

/** 取一段逐帧动画(key 形如 "fx/slash"、"kael/run");没有这段动画返回 null */
export function animMeta(key: string): AnimMeta | null {
  return files.has(`anim/${key}.webp`) ? anims[key] ?? null : null;
}

/**
 * 读取清单。读取失败(文件不存在、离线)时当作没有任何图片。
 * @returns 可用图片的相对路径集合(相对 public/art/)
 */
export async function loadArtManifest(): Promise<Set<string>> {
  try {
    const r = await fetch('./art/manifest.json', { cache: 'no-cache' });
    if (r.ok) files = new Set<string>(((await r.json()) as { files: string[] }).files);
    // 姿势图的校正表(由 scripts/art-build.py 测量生成);没有也不要紧
    const m = await fetch('./art/sprites/meta.json', { cache: 'no-cache' });
    if (m.ok) sprites = await m.json();
    // 逐帧动画的说明表(同样由 art-build.py 生成)
    const a = await fetch('./art/anim/meta.json', { cache: 'no-cache' });
    if (a.ok) anims = await a.json();
  } catch { /* 没有清单就全部用方块 */ }
  return files;
}

/** 某张图是否存在(path 相对 public/art/,不带扩展名;优先用压缩好的 webp,其次 png) */
export function findArt(pathNoExt: string): string | null {
  for (const ext of ['webp', 'png', 'jpg']) if (files.has(`${pathNoExt}.${ext}`)) return `./art/${pathNoExt}.${ext}`;
  return null;
}
