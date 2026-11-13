# 美术资源规范(给负责生成图片的 AI / 画师)

游戏目前用程序绘制的方块人。**只要把图片按下面的路径和文件名放进仓库,游戏会自动用图片替换方块**;
没有的图继续用方块,所以可以分批交付,不必一次做完。

## 现有的占位图

`public/art/` 里目前已有 26 张图:主角与 Boss 的头像、主角全身立绘、标题背景。
它们是用游戏自带的方块模型自动渲染出来的**占位图**(清单见 `public/art/placeholders.json`,生成脚本是 `scripts/render-portraits.mjs`),
**请直接用正式美术覆盖同名文件**,不需要保留。战斗姿势图(`sprites/`)和场景图(`bg/`)还没有任何文件。

## 你要做的事

1. 读 `game/art/prompts.json`。里面的 `images` 数组每一项是一张图:
   - `path`:保存位置(相对 `game/` 目录),**文件名与目录必须完全一致**
   - `width` / `height`:像素尺寸
   - `transparent`:`true` 表示必须是透明背景的 PNG
   - `prompt` / `negative`:正向 / 反向提示词(英文,可直接使用)
   - `priority`:0 最先做,1 其次,2 最后
   - `note`:这张图在游戏里的用途
2. 按 `priority` 从小到大生成,保存到对应 `path`。
3. 全部(或一批)放好后,在 `game/` 目录运行:
   ```bash
   node scripts/art-manifest.mjs
   ```
   它会更新 `public/art/manifest.json`(游戏靠这份清单知道有哪些图)。
4. 提交并推送到分支 `claude/elegant-planck-qpupha`(推送前先 `git pull --rebase`,因为游戏代码也在这个分支上持续更新)。
   只改 `game/public/art/` 下的文件,不要动其他目录。

## 目录与命名

```
game/public/art/
  ui/title.png                 标题画面背景            1920×1080  不透明
  portraits/<角色id>.png        头像                   512×512    不透明
  full/<角色id>.png             全身立绘               1024×1536  透明
  sprites/<角色id>/<姿势>.png   战斗姿势               512×512    透明
  bg/<主题id>/far.png           场景远景(横向可平铺)   2048×1024  不透明
  bg/<主题id>/ground.png        地面贴图(四方连续)     1024×1024  不透明
  manifest.json                由脚本生成,不要手写
```

- 角色 id(主角):`kael brynn sera ilex rook vesper morgan odran li nola`
- 角色 id(Boss):`gareth bishop colossus queenshade nameless`
- 角色 id(敌人):`husk brute emberbow hound monk chanter miner crawler kingsguard shade ashling skeleton`
- 主题 id:`ashsnow abbey mine city abyss`
- 主角姿势:`idle walk1 walk2 light heavy special jump hurt down`
- 敌人 / Boss 姿势:`idle walk1 attack hurt down`
- 格式:PNG(也接受 `.webp`),全部小写文件名

## 战斗姿势图(sprites)的硬性要求

这些图会直接贴在游戏里的角色位置上,不符合要求会穿帮:

- **朝右**(游戏里朝左时会自动水平翻转)
- **透明背景**,不要地面、不要投影、不要特效光圈铺满画面
- 单个角色,**全身入画**,角色高度约占画布高度的 85%
- **双脚踩在画布底部往上约 6% 的位置**(512 高的图,脚底在 y≈480),水平居中
- 同一角色的所有姿势:体型、服装、配色、武器必须一致(提示词里已带固定的外观描述,请原样保留)
- `down`(倒地)姿势:角色横躺,仍然在画布下半部

## 画风与尺度

- 统一画风写在 `prompts.json` 的 `style` 字段:暗黑奇幻、半写实日系插画、灰烬与余烬橙的配色
- 女性角色:**成年**、高挑、长腿、丝袜,性感但着装完整——不要裸露、不要露骨姿势
- 男性角色:冷峻、帅气或沉稳
- 所有角色都是成年人
- 不要出现文字、水印、边框

## 想改角色外观?

外观描述集中在 `game/scripts/art-prompts.mjs` 顶部的表里。改完运行
`node scripts/art-prompts.mjs` 重新生成 `art/prompts.json`。

## 数量

共 211 张:优先级 0 有 31 张(标题图 1 + 主角头像 10 + 主角立绘 10 + 场景 10),
优先级 1 有 95 张(Boss 头像 5 + 主角战斗姿势 90),优先级 2 有 85 张(敌人与 Boss 战斗姿势)。
