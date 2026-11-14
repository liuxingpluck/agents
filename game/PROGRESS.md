# 进度记录(给接手的会话看)

> 每次提交前更新这个文件。新会话 / 被唤醒后先读它和 `docs/DESIGN.md`。

## 2026-11-14 生图交接与等待 API

原生图对话已中断并归档；第二批累计 98/268 张已落盘，剩余 170 张，17 项动画试做未交付。用户再次指出内置生图会自动展示图片，现已终止该批调用；后续只接受本机保存文件后返回路径的交付方式。用户正准备激活 Pro 附送的 API 额度并创建密钥；官方入口和接口信息、恢复位置见 `art/DELIVERY-V2.md`。不得通过内置工具继续插图，也不恢复本机游戏或浏览器测试。

## 2026-11-14 第二批美术首组

生图协作方已完成 `art/prompts-v2.json` 优先级 0 的 90 张，并导出 WebP、同步静态发布素材；见 `art/DELIVERY-V2.md`。本轮没有启动浏览器、游戏或测试。动图试做清单已发现，实际动画输出待验证。

## 2026-11-14 第二批前 94 张已接入并验收(开发方)

- 逐角色核对了 90 张优先级 0(跑步四帧、轻 / 重第 2、3 下、蓄力)和凯尔的 guard / dodge / airlight / airheavy:朝向、形象一致性没问题
- 实机确认新图生效:跑步用 run1~4,轻连用 light → light2 → light3,重连用 heavy → heavy2 → heavy3,按住重键用 charge,格挡用 guard
- 修正:蓄力 / 格挡姿势不再按「下蹲」缩小(有的角色画的是站姿,被缩成了 0.8 倍);招式特效大小封顶(蓄力重击的刀光曾盖住半个屏幕)
- 生图方反馈:**请求 GIF 时工具实际返回的是单帧 PNG**,动图试做批(`art/prompts-anim.json`)暂时做不了,等对方确认可行的输出方式

## 2026-11-14 本机试玩已叫停

已同步到 `b2f7d47`。AOBB 逐帧试玩尝试因用户反馈页面卡住、系统资源占用而停止；临时逐帧代码已撤回，Vite 已停止，未完成本轮战斗体验。详见 [中止记录](docs/PLAYTEST-20261114.md)。用户本轮只授权整理记录并提交上传，之后停止工作；不要据自动试玩约定重新启动本机浏览器、游戏或负载测试。

## 约定

- 开发分支:`claude/elegant-planck-qpupha`,每完成一小步就 commit + push(推送前先 `git pull --rebase`,生图 AI 也会往这个分支放图)
- 游戏代码全部在 `game/` 下;构建产物在仓库根 `docs/`(GitHub Pages 用)
- 不创建 PR(除非用户明确要求)
- **每次启动的顺序**:① 提交未提交的成果 ② `git pull --rebase` ③ 读 `docs/FEEDBACK.md` 处理反馈 ④ 检查有没有正式美术 ⑤ 都没有再做「下一步」里的事
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

- [x] 设计文档、调研、角色 / 敌人 / 美术规范(`docs/`)、项目总览 `README.md`
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
  - [x] 训练出的 AI 上场:标题按 V 单挑神经网络(读取训练场存档;没练过则用脚本 AI,`tests/e2e/duel.mjs`)
  - [x] 陪练升级:脚本 AI + 连打机器人 + 自博弈三档;考试同时报告对连打机器人的胜率(实测 90 秒 0% → 100%)
  - [x] 面向用户的说明文档 `docs/AI.md`(输入、输出、训练方法、为什么暂时只用 CPU、局限)
  - [x] 联赛:训练时自动把本机其他角色的模型当对手(训练页可开关)
  - [x] 内置模型:10 个角色各一个离线练好的模型(`public/models/`,`scripts/train-builtin.sh` 重新训练);
    单挑 AI 开箱即用(对手每场轮换),训练页以内置模型为起点(`tests/e2e/builtin.mjs`)
  - [x] WebGPU:显卡批量前向计算(`src/ml/gpu.ts`)+ 训练页「显卡测试」(核对与 CPU 一致、三种批量测速,`tests/e2e/gpu.mjs`);
    训练本身仍用 CPU,原因见 `docs/AI.md`
  - [ ] 所有角色轮流训练的全自动联赛;战役精英怪用神经网络(要先练一对多);模型变大后把训练推理切到显卡
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
  - [x] 占位美术:用游戏内模型自动渲染的头像(主角 + Boss)、主角立绘、标题背景共 26 张(`scripts/render-portraits.mjs`;
    正式美术到位后直接覆盖;`public/art/placeholders.json` 记录了哪些是占位图)
  - [x] 五个章节的专属程序布景(木栅与瞭望塔 / 尖拱与墓碑 / 支架铁轨与发光根须 / 亮窗高塔与石像 / 倒悬尖塔与余烬裂缝)
  - [x] 程序绘制的主角外观升级:发型与发色、男女体型、短裙、长袜、眼睛(`Look` 新增 hair / feminine / skirt / legColor;图片到位前的过渡)
  - [x] 2026-11-14 按用户反馈重做战斗手感(详见 `docs/FEEDBACK.md` 的「已处理」):
    各职业不同的连段数与抓取范围(`src/data/tuning.ts`)、蓄力重击、格挡 / 弹反 / 破防、空中连招(上浮、砸地反弹)、
    随机障碍物(岩石 / 木箱 / 路障,挡路挡弹)、敌人绕行与持盾格挡、一批新特效与奥义特写
  - [x] 正式美术 211 张已接入:源文件 `art/source/`,网页用 WebP(`python3 scripts/art-build.py` 生成)
  - [x] 2026-11-13 按第二次反馈改手感:重攻击点按立刻出、按住才转蓄力、出手加快并向前踏步;按住方向自动奔跑;
    贴图大小 / 位置自动校正(`scripts/art-build.py` 生成 `public/art/sprites/meta.json`,可用 `art/source/sprites/overrides.json` 人工微调);
    按移动距离切换迈步图、出招时的身体动作、跑步扬尘、星芒火花
  - [x] 第二批美术需求已备好:`art/prompts-v2.json`(268 张,含 6 张可选特效贴图),说明在 `docs/ART-GUIDE.md`「第二批」。
    `SpriteRig.poseOf` 已映射好新姿势(run1-4 / light2-3 / heavy2-3 / charge / guard / dodge / airlight / airheavy / grab / launched / getup / command / special2-3 / super;
    敌人 walk2 / attack2 / launched),障碍物与掉落物读 `props/<id>`;图没到就退回旧图
  - [x] 2026-11-14 招式特效系统 `src/render/fx.ts`(`FxLayer`):按 `MoveDef.anim` 自动配刀光 / 枪芒 / 拳风 / 砸地 / 法阵等,
    贴图用 canvas 现画,`art/fx/<名字>` 有图则替换;`whiff` 事件驱动(多段招式每段带 `again`)。
    另加 ↓↓+重 = 格挡(`Fighter.guardHold`)、冲刺取消(命中后 →→,事件 `dashCancel`)、星芒弹体
  - [ ] 真正的高低地形(高台 / 斜坡)——等用户看过障碍物后再定
  - [x] 双人同屏合作:选人界面按 P 开启;2P 用方向键 + 小键盘 1(轻)2(重)0(跳)3(特殊技).(闪避)或第二个手柄;
    每波多一个敌人,两人不能离太远,一人倒下继续、下一间以 30% 生命复活(`tests/e2e/coop.mjs`)
  - [x] 背景音乐:程序合成的音序器,菜单 / 战斗 / Boss 三种氛围自动切换,设置里可调音量(`src/render/music.ts`;好不好听需要人来听)
  - [x] 本地排行榜:标题画面显示各角色最高得分前三
  - [x] 练习场:标题按 T,无限血木桩、能量常满,实时显示招式帧数据与连击伤害(`tests/e2e/practice.mjs`)

## 下一步

0. **动图(GIF)试做批**(用户提议;Images 2.6 于 2026-11-04 起支持在 Codex 里生成 GIF):需求在 `art/prompts-anim.json` 与 `docs/ART-GUIDE.md`「动图(GIF)试做批」。
   - 特效:`art/source/fx-anim/*.gif`(黑底)。到了要做:`art-build.py` 用 Pillow 拆帧拼成横排序列帧 WebP + 记录帧数;`fx.ts` 加按 UV 偏移切帧的「翻页」特效,接到对应招式
   - 角色动画:`art/source/anim/<id>/{idle,run,light,heavy,special}.gif`(洋红底,先做 li、kael)。到了要做:拆帧 + 抠洋红 + 边缘去色边;
     `SpriteRig` 支持按帧播放(run 按移动距离推进,攻击按 moveFrame 映射到帧),没有动画的姿势继续用静态图。先逐帧检查抖动和一致性,不行就只用特效
1. 等 Codex 交第二批图(`art/source/` 下出现新文件):跑 `python3 scripts/art-build.py` → `npm run build:pages`,
   然后逐个角色截图检查新姿势的大小和位置(蓄力 / 闪避 / 起身这类「矮」姿势的估算比例在 `art-build.py` 的 `LOW` 表里,不准就调表或写 overrides)
2. 等用户对这次手感修改(K 键、跑动)的试玩反馈
3. 双人合作目前不支持回放与触屏;2P 键位固定不可改
4. 平衡:第三章 Boss 巨像对「连打新手」机器人仍只有 2/10(真人可闪避 + 原地续关,暂时保留)

## 已知问题 / 备注

- 容器里只有软件渲染,帧时间测不准;模拟层每帧耗时约 0.4ms,不是瓶颈
- 引擎局限:瞬移不带穿越判定、治疗只在出手帧生效一次、没有持续存在的地面效果实体
- 调研时 Wikipedia / GameFAQs 等站点被网络策略挡住,连招规则多来自记忆(见 `docs/research-combat.md`)

## 常用命令(在 game/ 下)

- `npm run test:fast` 单测(不含较慢的 AI 训练与平衡试玩);`npm test` 全部
- `npx vitest run tests/balance.test.ts --disable-console-intercept` 平衡试玩报告
- `npm run e2e:all` 构建并跑完全部 14 个浏览器测试(冒烟 / 操作 / 战役 / 全流程速通 / 回放 / 练习场 / 背景音乐 / 双人合作 / 触屏与设置 / 编辑器 / 训练页 / 单挑 AI / 内置模型 / 显卡测试),截图在 `test-results/`
- `npm run build:pages` 构建到仓库根 `docs/`(每次改动后都要跑并提交)

## 待用户处理

- (已完成)GitHub Pages 已由用户开启:https://liuxingpluck.github.io/agents/
- 让生图 AI 读 `game/docs/ART-GUIDE.md` 出正式图(现有 26 张是占位图)
- 试玩反馈:用户会写在 `game/docs/FEEDBACK.md`。**每次启动先读它**,处理完的条目挪到「已处理」并写明做了什么
