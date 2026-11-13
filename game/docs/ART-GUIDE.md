# 美术资源规范(给负责生成图片的 AI / 画师)

游戏目前用程序绘制的方块人。**只要把图片按下面的路径和文件名放进仓库,游戏会自动用图片替换方块**;
没有的图继续用方块,所以可以分批交付,不必一次做完。

## 现状(2026-11-14)

全部 211 张正式美术已交付并接入游戏。目录约定在交付后调整过:

- **源文件**(PNG 原图)放在 `game/art/source/`,目录结构与下文相同(`ui/` `portraits/` `full/` `sprites/` `bg/`)
- **网页实际使用的图**是压缩后的 WebP,在 `game/public/art/`,由脚本从源文件生成,**不要手工改这里**
- **第二批(262 张)待生成,见下一节**
- 更新或新增图片的流程:把 PNG 放进 `game/art/source/` 对应位置 → 在 `game/` 下运行
  `python3 scripts/art-build.py`(需要 Pillow)→ `npm run art:manifest` → `npm run build:pages` → 提交
- 交付说明与生成记录:`game/art/DELIVERY-NOTES.md`、`game/art/generation-records.json`

## 第二批(2026-11-13 新增,待生成)——让动作「连起来」

**为什么要第二批**:第一批每个主角只有 9 个姿势。试玩时的问题是——连招每一下都是同一张图、
跑步只有两帧像在滑、蓄力 / 格挡 / 空中攻击 / 抓取都没有自己的图。游戏代码已经为下面这些新姿势留好了位置,
**图片放进来就自动生效,不需要改代码**;没到的图继续用第一批的图顶替,所以可以分批交。

清单在 **`game/art/prompts-v2.json`**(共 262 张),字段和第一批一样,多了一个 `reference`:
生成这张图时请以它指向的那张第一批图(该角色的 `idle.png`)作为形象参考,保证脸、发型、服装、武器不变。

| 优先级 | 张数 | 内容 | 游戏里的效果 |
|---|---|---|---|
| 0 | 90 | 10 个主角 × `run1 run2 run3 run4`(跑步四帧循环)、`light2 light3`(轻攻击第 2、3 下)、`heavy2 heavy3`(重攻击第 2、3 下)、`charge`(蓄力蓄势) | 跑步不再滑步;连招每一下动作都不同 |
| 1 | 76 | 10 个主角 × `guard`(格挡)`dodge`(闪避)`airlight` `airheavy`(空中轻 / 重攻击)`grab`(抓取)`launched`(被打飞)`getup`(起身);另加 6 张场景物件 | 格挡、空中连招、抓取都有专属动作;障碍物和掉落物不再是方块 |
| 2 | 40 | 10 个主角 × `command`(前冲指令技)`special2` `special3`(第 2、3 个技能)`super`(终极技) | 四个技能各有各的姿势(第一批的 `special` 继续作为第 1 个技能) |
| 3 | 56 | 17 种敌人 / Boss × `walk2` `attack2`(重招)`launched`;5 个 Boss 另加 `special` | 敌人走路有两帧、轻重招姿势不同 |

### 保存位置与流程

1. 按 `path` 保存 PNG,路径已经直接写成源文件位置,例如 `art/source/sprites/kael/run1.png`、`art/source/props/rock.png`(相对 `game/` 目录)。
2. 全部(或一批)放好后在 `game/` 下运行:
   ```bash
   python3 scripts/art-build.py
   ```
   ```bash
   npm run build:pages
   ```
   第一条把 PNG 压成网页用的 WebP 并测量每张图(见下);第二条更新图片清单并重新打包网页。
3. `git pull --rebase` 后提交、推送到 `claude/elegant-planck-qpupha`。提交 `game/art/source/`、`game/public/art/` 和仓库根目录的 `docs/`。

### 硬性要求(和第一批相同的不再重复,只列要特别注意的)

- **归一化方式保持和第一批完全一样**:按可见内容框等比缩放、水平居中,内容框高度最大约 435 像素、下边界在 y≈480。
  不要自己另行调整人物大小——`art-build.py` 会按姿势类型自动测量并校正(比如蓄力下蹲、闪避翻滚的图会被自动缩小,
  武器伸得远的图会被自动放大),前提是所有图用同一种归一化方式。
- **特效要小、要贴身**:蓄力的光、技能的火焰只画在武器或手边一小圈。大范围特效由游戏程序实时绘制,
  画在图里反而会让人物被缩小、位置跑偏。
- **朝右**,包括 `launched`(被打飞:头朝左上、脚朝右,身体接近水平、脸朝上)和 `dodge`。
- `run1 → run2 → run3 → run4` 是一个循环:1 和 3 是两腿前后张开的「腾空 / 着地」帧(左右腿互换),
  2 和 4 是单腿支撑、另一条腿提膝经过的「收腿」帧(左右腿互换)。四张的上身前倾角度、头的高度要接近,否则循环会抖。
- `light2 / light3 / heavy2 / heavy3` 要和第一批的 `light / heavy` **明显不同**(换出手的方向、换手、换高度),连起来才像一套连招。
- 场景物件(`props/`):单个物件,贴着画布底边,透明背景,不要投影。`rock crate barrel barricade` 是 512×512,`food ember` 是 256×256。
- 女性角色的尺度要求同第一批:成年、高挑、长腿、丝袜,着装完整,不要裸露或露骨姿势。

### 交付后如果某张图在游戏里偏大 / 偏小 / 偏前偏后

在 `game/art/source/sprites/overrides.json` 里写校正值(没有这个文件就新建),然后重新运行 `python3 scripts/art-build.py`:

```json
{ "kael": { "charge": { "k": 1.1, "cx": 0.45 } } }
```

`k` 是放大倍数(1 = 不变),`cx` 是人物身体中心在画布里的横向位置(0 = 最左,1 = 最右,0.5 = 正中)。两个可以只写一个。

## 第一批(已完成)的说明

以下是第一批 211 张的原始说明,保留作参考。

### 你要做的事

1. 读 `game/art/prompts.json`。里面的 `images` 数组每一项是一张图:
   - `path`:保存位置(相对 `game/` 目录),**文件名与目录必须完全一致**
   - `width` / `height`:像素尺寸
   - `transparent`:`true` 表示必须是透明背景的 PNG
   - `prompt` / `negative`:正向 / 反向提示词(英文,可直接使用)
   - `priority`:0 最先做,1 其次,2 最后
   - `note`:这张图在游戏里的用途
2. 按 `priority` 从小到大生成。`path` 里写的是 `public/art/...`,**实际请保存到 `art/source/...` 的同名位置**(见上方「现状」)。
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
