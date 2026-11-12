# 进度记录(给接手的会话看)

> 每次提交前更新这个文件。新会话/被唤醒后先读它和 `docs/DESIGN.md`。

## 约定

- 开发分支:`claude/elegant-planck-qpupha`,每完成一小步就 commit + push
- 游戏代码全部在 `game/` 下,不动仓库里其他文件
- 不创建 PR(除非用户明确要求)
- 用户要求:代码必须随时同步到 GitHub;测试在容器里用 Playwright 跑

## 当前状态

- [x] 设计文档 `docs/DESIGN.md`
- [ ] M1 可玩原型
- [ ] M2 战斗完整
- [ ] M3 内容(10 角色、路线图、故事)
- [ ] M4 浏览器端 AI 训练
- [ ] M5 角色与地图编辑器
- [ ] M6 打磨

## 下一步

搭建 Vite + TS + Three.js 骨架,实现 M1。

## 待用户处理

- 在仓库 Settings → Pages 中把 Source 设为 GitHub Actions(部署工作流推送后)
