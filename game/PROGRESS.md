# 进度记录(给接手的会话看)

> 每次提交前更新这个文件。新会话/被唤醒后先读它和 `docs/DESIGN.md`。

## 约定

- 开发分支:`claude/elegant-planck-qpupha`,每完成一小步就 commit + push
- 游戏代码全部在 `game/` 下,不动仓库里其他文件
- 不创建 PR(除非用户明确要求)
- 用户要求:代码必须随时同步到 GitHub;测试在容器里用 Playwright 跑

## 当前状态

- [x] 设计文档 `docs/DESIGN.md`
- [x] M1 可玩原型(凯尔 + 2 种敌人 + 1 个房间 4 波;模拟层 7 项单测;Playwright 冒烟测试)
- [ ] M2 战斗完整
- [ ] M3 内容(10 角色、路线图、故事)
- [ ] M4 浏览器端 AI 训练
- [ ] M5 角色与地图编辑器
- [ ] M6 打磨

## 下一步

M2:抓投、防御/破防、按键配置界面、音效;然后 M3 的其余 9 个角色。

## 常用命令(在 game/ 下)

- `npm test` 模拟层单测
- `npm run build:pages` 构建到仓库根 `docs/`(GitHub Pages 用,每次改动后都要跑并提交)
- `npx vite preview --port 4173 &` 然后 `npm run e2e` 冒烟测试,截图在 `test-results/`

## 待用户处理

- 开启 GitHub Pages:见 `docs/GITHUB-ACCESS.md`(分支 `claude/elegant-planck-qpupha`,文件夹 `/docs`)
