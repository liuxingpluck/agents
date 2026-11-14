# 第二批美术交付

2026-11-14 最新状态：第二批 268 张中，98 张已落盘并完成尺寸、透明通道检查，剩余 170 张。17 项 GIF 试做尚未交付。当前生图暂停，等待 API 额度激活及密钥配置，以满足用户只收文件路径、不在聊天中展示图片的要求。

其中包含 `prompts-v2.json` 优先级 0 的全部 90 张：10 位主角各 4 张跑步、2 张追加轻攻击、2 张追加重攻击、1 张蓄力。

- PNG 源图：`art/source/sprites/<角色id>/`。
- WebP：通过现有 `scripts/art-build.py` 以低进程优先级导出到 `public/art/sprites/`；姿势校正表已更新。
- 实际提示词及参考资产：`generation-records-v2.json`。
- 98 张 PNG 均通过文件读取、512×512 尺寸及左上角透明像素检查；这些检查不代表逐帧连贯性或角色身份的视觉验收。
- 图片清单目前为 309 张；只同步新素材、清单和校正表到根目录 `docs/art/`，没有运行游戏、浏览器、训练或负载测试。
- 本清单剩余 170 张尚未交付。另有 `prompts-anim.json` 的 17 个动图试做要求。

按用户要求，不在对话中嵌入图片，只提供文件路径。此记录随后续批次更新。

## 2026-11-14 接手记录

- 原对话 `01a1d11c-81e1-7522-a271-56d32d9e52cc` 已中断并归档，新对话按现有恢复日志接着做。用户明确要求只返回路径、不显示图片。
- 接手时共 94 张已落盘：优先级 0 的 90 张已推送，凯尔的 guard、dodge、airlight、airheavy 4 张尚待推送；仍缺 174 张。
- 保留 `claude/elegant-planck-qpupha` 分支，逐张落盘和记录，按优先级继续生成、导出并同步。
- 动图工具实测记录：明确请求动画 GIF 后返回的是单帧 PNG。该试做不计入动画交付，不更改扩展名冒充 GIF。
- 延续用户对本机负载的限制，保持串行，不启动游戏、浏览器、训练或负载测试。

## 自动展示的实际限制与下一步

- 接手后补了凯尔的 grab、launched、getup，以及布琳的 guard，共 4 张；累计 98 张。恢复日志仍在 `.git/art-work/results-v2.jsonl`，不要重复生成。
- 即使调用方只输出文字元数据、不调用 `generatedImage()`，内置生图工具仍自动把图片插入聊天。用户截图确认后，已终止本批执行。此前关于“没有插入预览”的判断不成立；不要再次通过这个工具试跑。
- 用户已要求调研官方 API。官方文档确认 Pro 100 满足条件可激活每账期 100 美元的 API 赠送额度；首次按剩余账期折算，余额到期不结转。实际领取和账号额度尚未核验。
- 激活入口： https://chatgpt.com/settings/billing 。同邮箱登录，关联接收额度的 API 组织，然后到 https://platform.openai.com/settings/organization/billing/overview 核对到账。
- 创建密钥： https://platform.openai.com/api-keys 。密钥只在本机配置，不写入交付文档、生成日志或 Git。
- 官方 GIF 模型包括 `gpt-image-2.6-sunburst` 与 `gpt-image-2.6-flare`；接口为 `POST https://api.openai.com/v1/images/generations`，带角色参考图时用 `/v1/images/edits`，显式设 `output_format=gif`、`frame_count`（2–16）及 `frame_duration_ms`。API 参考注明需有对应模型的 GIF preview 权限，实际账号权限待核验。
- 赠送额度与接口依据： https://developers.openai.com/api/docs/guides/chatgpt-api-credits 、 https://developers.openai.com/api/docs/guides/image-generation#generate-animated-gif-output 。尚未配置或调用 API，未消耗该 API 额度。
