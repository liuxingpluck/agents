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
  - [x] 设置面板(改键、音量,`src/ui/settings.ts`)、手机触屏按键(`src/ui/touch.ts`,`tests/e2e/touch.mjs`)
- [ ] M3 内容
  - [x] 10 个可选角色 + 选人界面
  - [x] 14 种敌人 / Boss(`src/data/enemies/`),敌人 AI 会按距离选招、用技能
  - [x] 5 章战役:剧情、3 路路线图、房间推进、Boss 血条、存档续玩(`tests/e2e/campaign.mjs`)
  - [x] 平衡性第一轮:「连打新手」机器人批量试玩(`tests/balance.test.ts`),加了清波回血、缩短精英房、下调两个 Boss
  - [x] 自制内容包接入正式游戏(标题画面按 M 切换自制章节)
- [x] M4 浏览器端 AI 训练(`train.html`):观测 / 网络 / 进化策略 / Worker 并行 / 存档
  - [ ] 训练出的 AI 在正式游戏里上场;更强的陪练;WebGPU(用户说这块放最后)
- [x] M5 编辑器(`editor.html`):角色 / 房间 / 章节 / 导入导出 + 校验(`src/editor/`)
- [ ] M6 打磨
  - [x] 美术管线:有图用图(头像、立绘、战斗贴图、场景),没图回退方块
  - [x] 伤害数字、击杀慢动作、落地尘土、重击镜头冲击
  - [x] 贴图管线用占位图验证过(头像 / 立绘 / 战斗贴图 / 地面 / 远景都能显示)
  - [x] 注释梳理第一轮(render/、ui/、main、train、data 基础文件)
  - [x] 撞墙反弹、投掷砸人、空中受身、冲刺攻击、道具掉落(食物 / 余烬)、霸体大招预警闪光
  - [x] 可破坏的木桶(掉道具)、敌人空降入场、Boss 半血进入第二阶段
  - [x] 战斗中按 Tab 看招式表(暂停);顿帧期间不消耗输入缓冲;`tests/combo.test.ts` 连招手感回归(每个主角快按慢按都能连上)
  - [x] 场景机关:地面喷火口(矿道 / 王都 / 烬渊自动生成,也可在房间数据里写 `hazards`),不分敌我
  - [x] 注释梳理第二轮:ml/、data/chapters、data/characters(editor/ 还没做——子 agent 中途额度用尽)
  - [x] 过关结算卡(评价 / 连击 / 受伤 / 用时 / 得分)与累计得分
  - [x] 回放:记录种子 + 逐帧按键,标题画面按 R 重放最近一场,结束时校验与原战斗一致(`tests/e2e/replay.mjs`)
  - [x] 注释:sim/(world.ts、types.ts)与 editor/ 已补全
  - [ ] 训练模式显示帧数据(见 `docs/research-opensource.md`)

## 下一步

1. `docs/research-opensource.md` 里还没做的:训练模式(木桩 + 帧数据显示)、本地排行榜
2. 平衡:第三章 Boss 巨像对「连打新手」机器人仍只有 2/10(真人可闪避 + 原地续关,暂时保留)
3. 等美术图片到位后接入并逐张检查(脚底对齐、朝向、大小)
5. 训练出的 AI 上场(用户说放最后)

## 已知问题 / 备注

- 容器里只有软件渲染,帧时间测不准;模拟层每帧耗时约 0.4ms,不是瓶颈
- 引擎局限:瞬移不带穿越判定、治疗只在出手帧生效一次、没有持续存在的地面效果实体、没有格挡
- 调研时 Wikipedia / GameFAQs 等站点被网络策略挡住,连招规则多来自记忆(见 `docs/research-combat.md`)

## 常用命令(在 game/ 下)

- `npm run test:fast` 单测(不含较慢的 AI 训练与平衡试玩);`npm test` 全部
- `npx vitest run tests/balance.test.ts --disable-console-intercept` 平衡试玩报告
- `npm run e2e:all` 构建并跑完全部 8 个浏览器测试(冒烟 / 操作 / 战役 / 全流程速通 / 回放 / 触屏与设置 / 编辑器 / 训练页),截图在 `test-results/`
- `npm run build:pages` 构建到仓库根 `docs/`(每次改动后都要跑并提交)

## 待用户处理

- 开启 GitHub Pages:见 `docs/GITHUB-ACCESS.md`(分支 `claude/elegant-planck-qpupha`,文件夹 `/docs`)
- 让生图 AI 读 `game/docs/ART-GUIDE.md` 开始出图
