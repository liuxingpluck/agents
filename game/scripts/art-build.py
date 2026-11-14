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
    'sprites': (512, 86), 'bg': (2048, 80), 'props': (512, 86), 'fx': (512, 90),
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

# ---- 测量每张战斗姿势图,生成校正表 public/art/sprites/meta.json ----
# 背景:出图时每张图都被缩放到「内容撑满画布」。武器伸得远的姿势(比如刺剑),整个人就被缩得更小,
# 人物也不在画布正中。游戏里如果原样显示,连招时角色会忽大忽小、前后乱跳。
# 这里对每张图做两个测量,交给游戏去校正:
#   k  = 放大倍数。画面高度没占满(说明是被宽度限制住、人被缩小了)的图,按比例放大回去,最多放大到 1.32 倍
#   cx = 人物重心的横向位置(按不透明像素加权)。游戏把重心对准角色所在的位置
import json
FULL_H = 435     # 出图时内容框的最大高度(像素)
UPRIGHT = 0.93   # 攻击 / 行走姿势通常会略微下沉,身高按站立的 93% 估算
# 本来就「矮」的姿势:人物高度大约是站立时的多少。这类图内容撑满画布时人其实被放大了,要缩回去
LOW = {'charge': 0.8, 'dodge': 0.5, 'getup': 0.62, 'run1': 0.88, 'run2': 0.88, 'run3': 0.88, 'run4': 0.88, 'guard': 0.9}
LYING = ('down', 'launched')  # 横着的姿势:不校正大小
meta = {}
sp_dir = os.path.join(SRC, 'sprites')
for hero in sorted(os.listdir(sp_dir)) if os.path.isdir(sp_dir) else []:
    if not os.path.isdir(os.path.join(sp_dir, hero)):
        continue
    for name in sorted(os.listdir(os.path.join(sp_dir, hero))):
        if not name.lower().endswith('.png'):
            continue
        pose = os.path.splitext(name)[0]
        im = Image.open(os.path.join(sp_dir, hero, name)).convert('RGBA')
        alpha = im.split()[3]
        bbox = alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
        if not bbox:
            continue
        h = bbox[3] - bbox[1]
        if pose in LYING or (pose not in LOW and (bbox[2] - bbox[0]) > h * 2.2):
            k = 1.0
        elif pose in LOW:
            # 蓄力 / 格挡有的画成下蹲、有的画成站直,从外框分不出来,所以只放大不缩小;闪避、起身、跑步才允许缩小
            floor = 1.0 if pose in ('charge', 'guard') else 0.6
            k = min(1.32, max(floor, FULL_H * LOW[pose] / h))
        else:
            k = 1.0 if h >= FULL_H - 8 else min(1.32, max(1.0, FULL_H * UPRIGHT / h))
        # 重心:每一列不透明像素的总量加权平均
        small = alpha.resize((128, 128))
        cols = [sum(small.getpixel((x, y)) for y in range(128)) for x in range(128)]
        total = sum(cols) or 1
        cx = sum((x + 0.5) * c for x, c in enumerate(cols)) / total / 128
        meta.setdefault(hero, {})[pose] = {'k': round(k, 3), 'cx': round(cx, 3)}
# 人工微调:某张图在游戏里看着偏大 / 偏小 / 偏前偏后时,在 art/source/sprites/overrides.json 里写
#   { "kael": { "charge": { "k": 1.1, "cx": 0.45 } } }   (k、cx 可以只写一个),会覆盖上面的自动测量
ov_path = os.path.join(sp_dir, 'overrides.json')
if os.path.exists(ov_path):
    for hero, poses in json.load(open(ov_path)).items():
        for pose, v in poses.items():
            meta.setdefault(hero, {}).setdefault(pose, {'k': 1.0, 'cx': 0.5}).update(v)
os.makedirs(os.path.join(OUT, 'sprites'), exist_ok=True)
with open(os.path.join(OUT, 'sprites', 'meta.json'), 'w') as f:
    json.dump(meta, f, separators=(',', ':'))
print(f'姿势校正表:{sum(len(v) for v in meta.values())} 张')
