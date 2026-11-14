# 美术资源规范(给负责生成图片的 AI / 画师)

游戏按 `public/art/manifest.json` 加载正式静态美术，缺项回退程序图形。PNG 源文件经现有脚本导出为 WebP 后进入运行资源；动画试做的 GIF/序列 PNG 另存源文件目录，需开发方接入拆帧和播放。

## 现状(2026-11-15)

首批 211 张、第二批 268 张静态美术均已交付并更新资源清单，合计 479 张；动画试做 17 项也已提供 GIF 和同名横向序列 PNG，待开发方接入。目录约定在交付后调整过:

- **源文件**(PNG 原图)放在 `game/art/source/`,目录结构与下文相同(`ui/` `portraits/` `full/` `sprites/` `bg/`)
- **网页实际使用的图**是压缩后的 WebP,在 `game/public/art/`,由脚本从源文件生成,**不要手工改这里**
- **第二批268张已全部完成**，详见 `art/DELIVERY-V2.md`、`art/generation-records-v2.json`；17项动画记录见 `art/generation-records-anim.json`
- 更新或新增图片的流程:把 PNG 放进 `game/art/source/` 对应位置 → 在 `game/` 下运行
  `python3 scripts/art-build.py`(需要 Pillow)→ `npm run art:manifest` → `npm run build:pages` → 提交
- 交付说明与生成记录:`game/art/DELIVERY-NOTES.md`、`game/art/generation-records.json`

## 第二批(2026-11-13 新增,268张已完成)——让动作「连起来」

**为什么要第二批**:第一批每个主角只有 9 个姿势。试玩时的问题是——连招每一下都是同一张图、
跑步只有两帧像在滑、蓄力 / 格挡 / 空中攻击 / 抓取都没有自己的图。游戏代码已经为下面这些新姿势留好了位置,
**图片放进来就自动生效,不需要改代码**;没到的图继续用第一批的图顶替,所以可以分批交。

清单在 **`game/art/prompts-v2.json`**(共 268 张),字段和第一批一样,多了一个 `reference`:
生成这张图时请以它指向的那张第一批图(该角色的 `idle.png`)作为形象参考,保证脸、发型、服装、武器不变。

| 优先级 | 张数 | 内容 | 游戏里的效果 |
|---|---|---|---|
| 0 | 90 | 10 个主角 × `run1 run2 run3 run4`(跑步四帧循环)、`light2 light3`(轻攻击第 2、3 下)、`heavy2 heavy3`(重攻击第 2、3 下)、`charge`(蓄力蓄势) | 跑步不再滑步;连招每一下动作都不同 |
| 1 | 76 | 10 个主角 × `guard`(格挡)`dodge`(闪避)`airlight` `airheavy`(空中轻 / 重攻击)`grab`(抓取)`launched`(被打飞)`getup`(起身);另加 6 张场景物件 | 格挡、空中连招、抓取都有专属动作;障碍物和掉落物不再是方块 |
| 2 | 40 | 10 个主角 × `command`(前冲指令技)`special2` `special3`(第 2、3 个技能)`super`(终极技) | 四个技能各有各的姿势(第一批的 `special` 继续作为第 1 个技能) |
| 3 | 62 | 17 种敌人 / Boss × `walk2` `attack2`(重招)`launched`;5 个 Boss 另加 `special` ；另有 6 张**可选**的招式特效贴图 `fx/` | 敌人走路有两帧、轻重招姿势不同;特效贴图见下 |

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

### 招式特效贴图(`art/source/fx/`,可选,最后做)

刀光、枪芒、冲击波这些特效现在由游戏程序绘制,已经能用。如果想换成手绘质感,可以交这 6 张:
`crescent`(月牙刀光)`streak`(枪芒)`burst`(爆裂)`circle`(法阵)`crack`(地裂)`pillar`(光柱)。要求很死:

- **纯黑背景、白到浅灰的图案、不要颜色**(游戏按角色给它染色,并用「叠加发光」显示,黑色部分自动看不见);不要透明通道
- **方向必须和提示词一致**:`crescent` 的弧鼓向右边;`streak` 的尖端朝右且水平居中;`pillar` 底部实、顶部渐隐;其余三张图案居中
- 不合要求的图宁可不交——交了就会替换掉程序画的版本

### 动图(GIF)试做批——Images 2.6 的新能力

OpenAI 2026-11-04 发布的 Images 2.6 可以在 Codex 里按提示词或**参考图**直接生成 GIF 动图。
这正好补上本游戏最缺的东西:真正逐帧的动作。先小批量试做,确认质量后再铺开。
清单在 **`game/art/prompts-anim.json`**:`effects`(7 个特效)和 `characters`(璃、凯尔各 5 段动画)。
`frames` 是建议帧数,`fps` 是播放速度,`loop` 表示是否循环,`reference` 是必须使用的参考图。

**两类共同的要求**

- **镜头不动**:主体在每一帧里的位置、大小基准不变,不要推拉、不要抖动
- 512×512。交 GIF 即可;**如果能拆帧,更欢迎交一张横向排好的序列帧 PNG**(同名 `.png`,所有帧从左到右排成一行,每帧 512×512)
- 逐帧检查:已知这类模型帧数一多容易「抖」(脸、武器在帧间变形)。抖得明显的宁可减少帧数重做

**特效**(存 `art/source/fx-anim/<名字>.gif`)

- **纯黑背景、白到浅灰的图案、不要颜色**(游戏按角色染色,用「叠加发光」显示,黑色自动看不见,所以不需要透明)
- 一次性的特效(除 `flame` 外):第一帧和最后一帧接近全黑
- 方向:`slash` 的弧鼓向右;`flame` 的尾巴朝左;`pillar`、`shockwave` 贴着画面底边;`lightning` 从上到下

**角色动画**(存 `art/source/anim/<角色id>/<动画名>.gif`)

- **必须以 `reference` 指向的 idle.png 作参考图生成**,长相、服装、武器要和它一致
- 朝右;每一帧人物一样大、脚踩在同一条水平线上;`run` 是**原地跑**(人不往前移动,位移由游戏控制)
- 背景:GIF 不支持半透明,所以用**纯洋红色 `#FF00FF` 平涂背景**、不要投影,游戏方会把洋红抠掉。
  如果交的是序列帧 PNG,则直接用透明背景
- 不要把特效(刀光、火焰)画进角色动画里,特效由游戏叠加
- 女性角色尺度同前:成年、着装完整

交付后开发方会把动图拆帧接进游戏(代码等试做图到了再写,以便对着实物调)。**这批是试验:
如果角色动画抖动严重或认不出是同一个人,就只采用特效部分,角色仍用上面的静态姿势图。**

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
