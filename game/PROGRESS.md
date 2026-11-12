# 进度记录(给接手的会话看)

> 每次提交前更新这个文件。新会话 / 被唤醒后先读它和 `docs/DESIGN.md`。

## 约定

- 开发分支:`claude/elegant-planck-qpupha`,每完成一小步就 commit + push(推送前先 `git pull --rebase`,生图 AI 也会往这个分支放图)
- 游戏代码全部在 `game/` 下;构建产物在仓库根 `docs/`(GitHub Pages 用)
- 不创建 PR(除非用户明确要求)
- 用户的要求(按优先级):
  1. 代码随时同步到 GitHub
  2. **玩法优先,尽快能玩**;AI 模型(System 1 快速决策模型)放最后
  3. 四键制操作:轻 / 重 / 跳 / 职业特殊技,用「方向 + 键」派生招式
  4. 打击感要对标 DNF、战国传承3、名将、三国战记
  5. 代码注释用中文,简洁、让人容易看懂
  6. 可以参考 GitHub 上的开源网页游戏
  7. 美术由另一个 AI 按 `docs/ART-GUIDE.md` 与 `art/prompts.json` 生成后放进 `public/art/`;
     每次被唤醒时 `git fetch` 看有没有新图,有就运行 `npm run art:manifest`、构建、提交
  8. 测试在容器里用 Playwright 自己跑

## 当前状态

- [x] 设计文档、调研、角色 / 敌人 / 美术规范(`docs/`)
- [x] M1 可玩原型
- [ ] M2 战斗
  - [x] 连击规则(同招僵直衰减 / 换招可续 / 伤害递减 / Boss 与玩家方硬上限)
  - [x] 强制抓取、程序化音效、受击抖动、击杀顿帧
  - [x] 四键制操作(`src/ui/input.ts`,`tests/e2e/controls.mjs` 验证 9 种输入)
  - [ ] 按键配置界面、手机触控
- [ ] M3 内容
  - [x] 10 个可选角色 + 选人界面
  - [x] 14 种敌人 / Boss(`src/data/enemies/`),敌人 AI 会按距离选招、用技能
  - [x] 5 章战役:剧情、3 路路线图、房间推进、Boss 血条、存档续玩(`tests/e2e/campaign.mjs`)
  - [ ] 平衡性:用机器人批量试玩各章各房间,调整敌人数量与数值
  - [ ] 自制内容包接入正式游戏(编辑器已能导出,游戏还没读取)
- [x] M4 浏览器端 AI 训练(`train.html`):观测 / 网络 / 进化策略 / Worker 并行 / 存档
  - [ ] 训练出的 AI 在正式游戏里上场;更强的陪练;WebGPU(用户说这块放最后)
- [x] M5 编辑器(`editor.html`):角色 / 房间 / 章节 / 导入导出 + 校验(`src/editor/`)
- [ ] M6 打磨
  - [x] 美术管线:有图用图(头像、立绘、战斗贴图、场景),没图回退方块
  - [ ] 伤害数字、尘土、慢动作等打击感细节;注释梳理

## 下一步

1. 自制内容包接入游戏;修掉近景方块挡视线
2. 机器人批量试玩做平衡
3. 打击感细节(伤害数字、击杀慢动作、落地尘土)
4. 手机触控、按键配置界面
5. 注释梳理(render/、ui/、editor/)

## 已知问题 / 备注

- 容器里只有软件渲染,帧时间测不准;模拟层每帧耗时约 0.4ms,不是瓶颈
- 引擎局限:瞬移不带穿越判定、治疗只在出手帧生效一次、没有持续存在的地面效果实体、没有格挡
- 调研时 Wikipedia / GameFAQs 等站点被网络策略挡住,连招规则多来自记忆(见 `docs/research-combat.md`)

## 常用命令(在 game/ 下)

- `npm test` 全部单测(含较慢的 AI 训练测试)
- `npm run build:pages` 构建到仓库根 `docs/`(每次改动后都要跑并提交)
- `npx vite preview --port 4173 &` 之后:
  - `node tests/e2e/smoke.mjs` 冒烟 · `node tests/e2e/controls.mjs` 操作 · `node tests/e2e/campaign.mjs` 战役流程
  - `node tests/e2e/train.mjs` 训练页 · `node tests/e2e/editor.mjs` 编辑器
  - 截图在 `test-results/`

## 待用户处理

- 开启 GitHub Pages:见 `docs/GITHUB-ACCESS.md`(分支 `claude/elegant-planck-qpupha`,文件夹 `/docs`)
- 让生图 AI 读 `game/docs/ART-GUIDE.md` 开始出图
