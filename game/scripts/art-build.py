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

# ---- 逐帧动画:把横排的序列帧重排成网格,输出 public/art/anim/ 和 anim/meta.json ----
# 源文件是「所有帧从左到右排成一行」的 PNG(每帧 512×512)。一行太宽(最多 6144 像素),有些显卡放不下,
# 所以改排成每行 4 帧的网格。特效缩到每帧 256(本来就是模糊的光,不需要更大);角色保持 512。
# 帧数 / 速度 / 是否循环 取自 art/prompts-anim.json。
SPEC = {}
for spec_name in ('prompts-anim.json', 'prompts-anim-v2.json'):   # 后读的(第二批)覆盖先读的
    spec_path = os.path.join(ROOT, 'art', spec_name)
    if os.path.exists(spec_path):
        d = json.load(open(spec_path))
        for e in d.get('effects', []) + d.get('characters', []):
            SPEC[os.path.splitext(e['path'].replace('art/source/', ''))[0]] = e
# 不采用的动画(试做后觉得不如静态姿势图:人物画得太小、动作幅度也小)。第二批重做的版本到了就从这里删掉
ANIM_SKIP = {'anim/li/light', 'anim/li/special'}
# 攻击动画里「打出去」的是第几帧(0 起);游戏会把这一帧对准招式真正出判定的时刻
ANIM_HIT = {'anim/kael/light': 3, 'anim/kael/heavy': 4, 'anim/kael/special': 5, 'anim/li/heavy': 4}
COLS = 4

def frames_of(path):
    im = Image.open(path)
    return [im.crop((i * 512, 0, i * 512 + 512, 512)) for i in range(im.width // 512)]

def pack(frames, cell, mode):
    rows = (len(frames) + COLS - 1) // COLS
    sheet = Image.new(mode, (COLS * cell, rows * cell))
    for i, f in enumerate(frames):
        f = f.convert(mode)
        if cell != 512:
            f = f.resize((cell, cell), Image.LANCZOS)
        sheet.paste(f, ((i % COLS) * cell, (i // COLS) * cell))
    return sheet, rows

def shape(frame):
    """一帧里人物的外框高度、底边位置、横向重心、不透明面积"""
    a = frame.convert('RGBA').split()[3]
    bb = a.point(lambda v: 255 if v > 16 else 0).getbbox()
    small = a.resize((128, 128))
    px = small.load()
    cols = [sum(px[x, y] for y in range(128)) for x in range(128)]
    total = sum(cols) or 1
    return bb[3] - bb[1], bb[3], sum((x + 0.5) * c for x, c in enumerate(cols)) / total / 128, total

anim_meta = {}
n_anim = 0
for group in ('fx-anim', 'anim'):
    for d, _, files in os.walk(os.path.join(SRC, group)):
        for name in sorted(files):
            if not name.lower().endswith('.png'):
                continue
            key = os.path.splitext(os.path.relpath(os.path.join(d, name), SRC))[0].replace(os.sep, '/')
            if key in ANIM_SKIP:
                continue
            frames = frames_of(os.path.join(d, name))
            fx = group == 'fx-anim'
            out_key = key.replace('fx-anim/', 'anim/fx/')
            dst = os.path.join(OUT, out_key + '.webp')
            sheet, rows = pack(frames, 256 if fx else 512, 'RGB' if fx else 'RGBA')
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if force or not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(os.path.join(d, name)):
                sheet.save(dst, 'WEBP', quality=86, method=4)
            spec = SPEC.get(key, {})
            m = {'frames': len(frames), 'cols': COLS, 'rows': rows, 'fps': spec.get('fps', 12), 'loop': bool(spec.get('loop', False))}
            if not fx:
                hero, anim = key.split('/')[1:]
                shapes = [shape(f) for f in frames]
                # 大小:让动画第一帧(都是站立预备姿势)和静态 idle 图在游戏里一样高;跑步没有站立帧,按不透明面积折算
                idle_src = os.path.join(sp_dir, hero, 'idle.png')
                a = Image.open(idle_src).convert('RGBA').split()[3]
                bb = a.point(lambda v: 255 if v > 16 else 0).getbbox()
                target = (bb[3] - bb[1]) * meta.get(hero, {}).get('idle', {}).get('k', 1.0)
                m['k'] = round(target / shapes[0][0], 3)
                m['cx'] = round(shapes[0][2] if not m['loop'] else sum(s[2] for s in shapes) / len(shapes), 3)
                m['fy'] = round(max(s[1] for s in shapes) / 512, 3)   # 脚底在画布里的纵向位置
                m['area'] = sum(s[3] for s in shapes) / len(shapes)
                hit = spec.get('hit', ANIM_HIT.get(key))
                if hit is not None:
                    m['hit'] = hit
            anim_meta[out_key.replace('anim/', '', 1)] = m
            n_anim += 1
# 跑步:用「和待机动画的面积比」推算大小
for key, m in anim_meta.items():
    if key.endswith('/run'):
        idle = anim_meta.get(key.replace('/run', '/idle'))
        if idle:
            m['k'] = round(idle['k'] * (idle['area'] / m['area']) ** 0.5, 3)
for m in anim_meta.values():
    m.pop('area', None)
# 人工微调:art/source/anim/overrides.json,写法同姿势图的 overrides,例如 { "kael/run": { "k": 1.2 } }
ov_path = os.path.join(SRC, 'anim', 'overrides.json')
if os.path.exists(ov_path):
    for key, v in json.load(open(ov_path)).items():
        if key in anim_meta:
            anim_meta[key].update(v)
if anim_meta:
    with open(os.path.join(OUT, 'anim', 'meta.json'), 'w') as f:
        json.dump(anim_meta, f, separators=(',', ':'))
print(f'逐帧动画:{n_anim} 段')
