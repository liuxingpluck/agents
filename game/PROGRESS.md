# 进度记录(给接手的会话看)

> 每次提交前更新这个文件。新会话/被唤醒后先读它和 `docs/DESIGN.md`。

## 约定

- 开发分支:`claude/elegant-planck-qpupha`,每完成一小步就 commit + push
- 游戏代码全部在 `game/` 下,不动仓库里其他文件
- 不创建 PR(除非用户明确要求)
- 用户要求:代码必须随时同步到 GitHub;测试在容器里用 Playwright 跑

## 当前状态

- [x] 设计文档 `docs/DESIGN.md`、调研 `docs/research-*.md`、角色规范 `docs/CHARACTER-AUTHORING.md`
- [x] M1 可玩原型
- [ ] M2 战斗完整
  - [x] 连击规则(同招僵直衰减 / 换招可续 / 伤害递减 / Boss 与玩家方硬上限)
  - [x] 强制抓取(LP+LK,无视霸体)、程序化音效、受击抖动、击杀顿帧
  - [ ] 防御 / 破防、按键配置界面、手机触控
- [ ] M3 内容
  - [x] 10 个可选角色(`src/data/chars/`)+ 选人界面
  - [ ] 3 路路线图、5 章房间、Boss(role 'boss')、过关动画、故事演出
- [ ] M4 浏览器端 AI 训练
  - [x] 观测 / 策略网络 / 进化策略 / 评估(`src/ml/`),Node 下验证能学到东西(`tests/ml.test.ts`)
  - [ ] Web Worker 并行、训练页面 `train.html`、存档、让训练出的 AI 上场
- [ ] M5 角色与地图编辑器
- [ ] M6 打磨

## 下一步

1. M4 剩余:`src/ml/worker.ts`、`src/ml/trainer.ts`、`train.html`(index.html 右下角已有链接,vite 需配多页面入口)
2. M3 剩余:路线图 + Boss + 更多房间
3. M2 剩余、M5、M6

## 已知问题 / 备注

- 容器里只有软件渲染,帧时间测不准;模拟层每帧耗时约 0.4ms,不是瓶颈
- 子 agent 反馈的引擎局限:瞬移不带穿越判定、治疗只在出手帧生效一次、没有持续存在的地面效果实体、没有真正的格挡

## 常用命令(在 game/ 下)

- `npm test` 模拟层单测
- `npm run build:pages` 构建到仓库根 `docs/`(GitHub Pages 用,每次改动后都要跑并提交)
- `npx vite preview --port 4173 &` 然后 `npm run e2e` 冒烟测试,截图在 `test-results/`

## 待用户处理

- 开启 GitHub Pages:见 `docs/GITHUB-ACCESS.md`(分支 `claude/elegant-planck-qpupha`,文件夹 `/docs`)
