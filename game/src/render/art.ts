// 美术资源清单:游戏启动时读取 public/art/manifest.json,得知有哪些图片可用。
// 没有图片的地方一律回退到程序绘制,所以清单为空时游戏照常运行。

let files = new Set<string>();

/**
 * 读取清单。读取失败(文件不存在、离线)时当作没有任何图片。
 * @returns 可用图片的相对路径集合(相对 public/art/)
 */
export async function loadArtManifest(): Promise<Set<string>> {
  try {
    const r = await fetch('./art/manifest.json', { cache: 'no-cache' });
    if (r.ok) files = new Set<string>(((await r.json()) as { files: string[] }).files);
  } catch { /* 没有清单就全部用方块 */ }
  return files;
}

/** 某张图是否存在(path 相对 public/art/,不带扩展名时依次尝试 png / webp) */
export function findArt(pathNoExt: string): string | null {
  for (const ext of ['png', 'webp', 'jpg']) if (files.has(`${pathNoExt}.${ext}`)) return `./art/${pathNoExt}.${ext}`;
  return null;
}
