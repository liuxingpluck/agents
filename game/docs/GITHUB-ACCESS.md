# GitHub 访问权限说明

## Claude 现在能做什么

- 通过 Claude GitHub App 读写 `liuxingpluck/agents`
- 只向开发分支 `claude/elegant-planck-qpupha` 推送,不直接改 `main`
- 不会主动创建 Pull Request

## 想关闭 Claude 对 GitHub 的访问

任选一种,随时可做,不影响已经推送到仓库里的代码:

1. **只收回某个仓库**:GitHub → Settings → Applications → Installed GitHub Apps → Claude → Configure
   → Repository access 选 *Only select repositories*,把不想给的仓库去掉 → Save
2. **暂停**:同一页面底部 Danger zone → *Suspend*(可随时恢复)
3. **彻底卸载**:同一页面 Danger zone → *Uninstall*
4. **断开账号关联**:claude.ai → 设置 → 连接器 → GitHub → 断开连接

## 想重新打开

- 重新安装 / 取消暂停:https://github.com/apps/claude/installations/select_target
- 重新关联账号:claude.ai → 设置 → 连接器 → GitHub

## 在线试玩(GitHub Pages)

> 状态:用户已开启(2026-11-13)。地址 https://liuxingpluck.github.io/agents/ ,每次推送后一两分钟自动更新。
> 试玩后的意见请写在 `game/docs/FEEDBACK.md`。

构建产物提交在仓库根目录的 `docs/` 下。开启方法(只需做一次):

1. 仓库 → Settings → Pages
2. Source 选 **Deploy from a branch**
3. Branch 选 `claude/elegant-planck-qpupha`,文件夹选 `/docs` → Save
4. 一两分钟后访问 https://liuxingpluck.github.io/agents/

之后每次推送,页面会自动更新。
