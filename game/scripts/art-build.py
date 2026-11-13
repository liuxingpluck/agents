#!/usr/bin/env python3
"""把美术源文件(game/art/source/ 下的 PNG)压缩成网页用的 WebP,输出到 game/public/art/。

为什么要这一步:源文件一共一百多 MB,直接放上网页会加载很慢。压成 WebP 后只有十来 MB,肉眼几乎看不出差别。
源文件原样保留,以后想重新导出、换画质都可以。

用法(在 game/ 目录下):  python3 scripts/art-build.py        只处理新增或改动过的图
                        python3 scripts/art-build.py --force 全部重新导出
需要 Python 3 和 Pillow(pip install pillow)。跑完后再运行 npm run art:manifest 更新图片清单。
"""
import os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'art', 'source')
OUT = os.path.join(ROOT, 'public', 'art')
force = '--force' in sys.argv

# 各类图片的导出设置:(最长边上限, 画质)。立绘和头像在游戏里显示得小,适当缩小;战斗图保持原尺寸以保证清晰。
RULES = {
    'ui': (1920, 80), 'portraits': (384, 82), 'full': (768, 84),
    'sprites': (512, 86), 'bg': (2048, 80),
}

total_in = total_out = n = 0
for kind, (max_side, quality) in RULES.items():
    for d, _, files in os.walk(os.path.join(SRC, kind)):
        for name in sorted(files):
            if not name.lower().endswith('.png'):
                continue
            src = os.path.join(d, name)
            rel = os.path.relpath(src, SRC)
            dst = os.path.join(OUT, os.path.splitext(rel)[0] + '.webp')
            total_in += os.path.getsize(src)
            if not force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                total_out += os.path.getsize(dst)
                continue
            im = Image.open(src)
            im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
            if max(im.size) > max_side:
                k = max_side / max(im.size)
                im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            im.save(dst, 'WEBP', quality=quality, method=4)  # 压缩档位 4:比最高档快很多,体积只大一点点
            total_out += os.path.getsize(dst)
            n += 1
print(f'导出 {n} 张;源文件合计 {total_in / 1e6:.1f} MB → 网页用 {total_out / 1e6:.1f} MB')
