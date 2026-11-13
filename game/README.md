# 烬渊 · Ashen Abyss

运行在浏览器里的横版 3D 街机清版动作游戏。暗黑风,10 个可选角色,5 章战役,带角色 / 地图编辑器和浏览器内的 AI 训练。
纯前端,没有服务器;全部画面和声音都由程序生成,另外支持用图片替换角色与场景(见下方「美术」)。

## 怎么玩

在线试玩(需要先在仓库设置里开启 GitHub Pages,步骤见 `docs/GITHUB-ACCESS.md`):
https://liuxingpluck.github.io/agents/

| 操作 | 键盘(1P) | 双人时的 2P |
|---|---|---|
| 移动 | W A S D | 方向键 |
| 轻攻击 / 重攻击 | J / K | 小键盘 1 / 2 |
| 跳跃 | 空格 | 小键盘 0 |
| 职业特殊技 | L(配合方向放出 4 个不同技能) | 小键盘 3 |
| 闪避 | Shift | 小键盘 . |
| 招式表 | Tab | — |

- 四键制:↓ + 轻 = 踢技,↓ + 重 = 挑空,轻 + 重 = 抓投,→→ 冲刺,冲刺中攻击 = 突进技,被打飞时按跳 = 受身
- 连段只能往后接:轻 → 重 → 指令技 → 特殊技。同一招反复用,对手会越来越快恢复;换着招打才能一直连
- 支持手柄和手机触屏;键位可在「设置」里改

标题画面:Enter 开始旅程 · T 练习场 · V 单挑 AI · R 看回放 · C 继续存档 · M 切换自制章节

## 三个页面

| 页面 | 用途 |
|---|---|
| `index.html` | 游戏本体 |
| `editor.html` | 角色 / 房间 / 章节编辑器,做好的内容在游戏标题画面按 M 游玩 |
| `train.html` | AI 训练场:在浏览器里训练会打架的神经网络,练好后在游戏里按 V 和它单挑 |

## 本地运行

需要 Node.js 22 或更高版本(开发时用的是 22)。在 `game/` 目录下:

```bash
npm install
```

```bash
npm run dev
```

然后打开终端里显示的地址。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器(改代码自动刷新) |
| `npm run test:fast` | 规则层单元测试(约 100 项,几秒) |
| `npm test` | 全部单元测试(含较慢的 AI 训练与平衡试玩) |
| `npm run e2e:all` | 构建并跑完全部浏览器自动化测试(用无头浏览器实际操作游戏) |
| `npm run build:pages` | 构建到仓库根目录的 `docs/`,GitHub Pages 从那里发布 |
| `npm run art:manifest` | 新增或删除图片后运行,更新图片清单 |

## 目录结构

```
game/
  index.html / editor.html / train.html   三个页面
  src/
    sim/      游戏规则核心:判定、连招、AI 行为。不依赖画面,所以能在后台高速空跑(训练、测试、回放都靠它)
    render/   画面与声音:Three.js 渲染、程序绘制的角色与场景、音效、背景音乐
    ui/       血条等界面、键盘 / 手柄 / 触屏输入、设置面板
    data/     内容数据:10 个主角(chars/)、敌人与 Boss(enemies/)、5 章战役(chapters.ts)
    ml/       神经网络与训练
    editor/   编辑器
    main.ts   游戏主流程(标题 → 选人 → 路线图 → 战斗 → …)
  tests/      单元测试;tests/e2e/ 是浏览器自动化测试
  scripts/    小工具:图片清单、提示词生成、一键测试
  art/        美术提示词清单(prompts.json)
  public/art/ 美术图片放这里
  docs/       文档(见下)
```

## 文档

| 文档 | 内容 |
|---|---|
| `PROGRESS.md` | 开发进度、下一步、常用命令(接手开发先看这个) |
| `docs/DESIGN.md` | 设计:世界观、角色、战斗规则、地图结构 |
| `docs/AI.md` | 神经网络对手是怎么回事:看什么、输出什么、怎么练、局限 |
| `docs/ART-GUIDE.md` | 美术规范:图片放哪、叫什么、尺寸与要求 |
| `docs/CHARACTER-AUTHORING.md` | 怎么写一个新角色(数值范围、必备招式) |
| `docs/ENEMY-AUTHORING.md` | 怎么写敌人与 Boss |
| `docs/GITHUB-ACCESS.md` | GitHub 权限、如何收回、如何开启在线试玩 |
| `docs/research-*.md` | 调研笔记(街机连招系统、浏览器端训练方案、开源清版游戏) |

## 美术

游戏默认用程序绘制的低模角色和场景。把图片按 `docs/ART-GUIDE.md` 规定的路径放进 `public/art/`,
运行 `npm run art:manifest`,游戏就会自动用图片替换;没有的图继续用程序绘制,可以分批添加。
每张图的生成提示词在 `art/prompts.json`。

## 想加内容

- **不写代码**:用 `editor.html` 做角色、房间、章节,可导出 JSON 分享
- **写代码**:角色是纯数据(`src/data/chars/*.ts`),照着现有角色和 `docs/CHARACTER-AUTHORING.md` 写;
  写完加进 `src/data/characters.ts` 的 `HEROES`,跑 `npm run test:fast`(`tests/combo.test.ts` 会检查连招能否接上)
