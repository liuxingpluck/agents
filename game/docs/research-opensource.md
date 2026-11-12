# 开源 beat 'em up / 打击感调研(第二轮)

> 目的:对照 OpenBOR、GitHub 上的网页清版游戏、game feel 资料,找出我们(见 `PROGRESS.md` / `DESIGN.md`)还缺的东西。
> 方法与可信度:本轮用 WebSearch + WebFetch。**chronocrash.com(OpenBOR 官方 wiki/论坛)、discourse.threejs.org、segaretro.org 在本容器 DNS 解析失败(被网络策略挡住)**,
> 所以 OpenBOR 的关键字级细节多数来自记忆,凡标「记忆」的条目均 **未核实**。GitHub 页面可以打开,License 是实际读到的。
> 不复制任何仓库代码,只记录思路。

## 1. 调研对象一览

| 项目 / 资源 | 链接 | 许可 | 值得借鉴 | 核实状态 |
|---|---|---|---|---|
| OpenBOR 引擎 (DCurrent) | https://github.com/DCurrent/openbor | BSD-3-Clause | 数据驱动的 entity / animation / 攻击盒模型;自带脚本引擎;大量社区模组 | 仓库已读;文档细节未核实 |
| OpenBOR Wiki / Legacy Manual | https://chronocrash.com/openbor/wiki/ | 未知 | 关键字清单(见第 2 节) | 未核实(域名被挡,仅见搜索摘要) |
| ChronoCrash 论坛(Weapon Drop 等帖) | https://www.chronocrash.com/forum/threads/weapon-drop-overview.4977/ | 未知 | 武器掉落/持武器敌人的生成方式 | 未核实(仅搜索摘要) |
| KickPunch (kenamick/game-off-2017) | https://github.com/kenamick/game-off-2017 | 代码 MIT,素材 CC BY 4.0 | Phaser 小型清版;踢击击退远但伤害低、拳快伤高;食物回血分大小 | 已读 |
| Fight of Dwarves (mbarde) | https://github.com/mbarde/fightOfDwarves | MIT | melonJS,2-4 人同屏本地对战,手柄,`#debug` 调试面板 | 已读 |
| road-brawler (jfmdev) | https://github.com/jfmdev/road-brawler | MPL-2.0 | Phaser3 + TypeScript + Vite + PWA 的工程组织(不是清版,仅工程参考) | 已读 |
| quiver-dev/template-beat-em-up (Godot 4) | https://github.com/quiver-dev/template-beat-em-up | MIT(素材另有许可) | 可配置攻击、可配置敌人 AI、关卡「锁屏区域」(level blocking)、检查器/调试叠层 | 已读首页,无细节 |
| JSBeatDown (fperez371) | https://github.com/fperez371/JSBeatDown | 未核实 | Canvas + Webpack 的 1v1 格斗 | 仅搜索摘要 |
| straightcurve/fighting-game-prototype | https://github.com/straightcurve/fighting-game-prototype | 未核实 | TypeScript + Three.js + Vite 格斗原型,与我们技术栈最像 | 仅搜索摘要 |
| Streets of Nice(Three.js 3D 清版) | https://discourse.threejs.org/t/streets-of-nice-an-arcade-beat-em-up-built-with-three-js/96927 | 未核实 | 同为 Three.js 街机清版;是否开源/是否 AI 生成不明 | 未核实(域名被挡) |
| 其他 AI 生成/社区浏览器格斗游戏(seeles.ai 上 Hobo、Crazy Flasher 系列等) | https://www.seeles.ai/games/action | 未核实 | 只是搜索结果里出现的在线游戏,无源码 | 未核实,不作依据 |
| The Art of Screenshake (Vlambeer, J.W. Nijman, 2013) | 搜索只得到二手文章,未取得一手链接 | — | 同一个射击游戏逐步加:屏震、后坐力、停顿、粒子、击退 | 一手未核实 |
| Juice it or Lose it (Jonasson & Purho) | 搜索无命中 | — | 「反馈要和重要性成比例」的 juice 理念 | 一手未核实(凭记忆) |
| Hades / God of War 战斗设计文章 | 搜索无命中 | — | 凭记忆:取消窗口宽、受击反馈分级 | 未核实 |
| Streets of Rage 4 系统(EGM 报道、SCMP、PC Gamer 等) | https://egmnow.com/willing-to-risk-anything-how-streets-of-rage-4-aims-to-revive-a-beloved-franchise/ | — | 敌人击飞后撞隐形墙反弹;星星拾取后双键放超必杀;特殊技扣血、攻击回血;双人互相接浮空 | 来自搜索摘要;segaretro Systems 页未核实 |
| 二手 game feel 文章(appscale、gamedo 等) | https://appscale.blog/en/blog/game-feel-juice-hitstop-screenshake-easing-2026 | — | 「命中停顿 2 帧就能加重量感」「屏震强度与动作重要性匹配」 | 仅搜索摘要,数值需自行调 |

结论:GitHub 上**没有找到**成熟的开源 Three.js + TypeScript 清版游戏;网页清版多为 Phaser/melonJS 的小品,系统深度远低于我们。真正深度的参考只有 OpenBOR 与商业作品。

## 2. OpenBOR 要点(多数为记忆,未核实,落地前应对照官方 wiki)

- **Entity 类型**:player / enemy / npc / item / obstacle / trap / endlevel / text 等,各自有 hit 与 attack 的阵营规则(`candamage`、`hostile`)。我们目前只有玩家与敌人两方,没有「可破坏物 / 道具 / 陷阱」这类中立实体。
- **Animation 模型**:每个动画 = 一串帧 + 每帧的 `bbox`(受击盒)、`attack`(攻击盒,带伤害、击退类型、停顿 `forcedirection`、`pausetime`、`blast`)、`delay`、位移 `move`。攻击盒可带 `noblock`、`dropv`(击飞初速度三元组)等。与我们的帧数据 JSON 思路一致。
- **Pain / Fall 分档**:受击有 `pain`(轻退)、`fall`(击倒)、`burn`、`shock` 等多种受击动画,由攻击类型(attack1..N)映射到不同受击动画。我们目前受击反应较统一。
- **Juggle / guard points**:`jugglepoints`(浮空承受值,被连续打浮空会耗尽,耗尽后不再被浮空)、`guardpoints`(防御耐久,耗尽则破防),以及每个攻击的 `juggle cost`。这是比「全局连击上限」更细的防无限连手段。
- **Grab / Throw**:内建 grapple:`GRAB`、`GRABATTACK`、`THROW`、`GRABBACK`、`GRABFORWARD` 等动画;`cantgrab` / `antigrab` / `paingrab` 控制被抓难度;投掷轨迹由 `throw` 属性给出,被投出的敌人可以砸到别人(`throwdamage`)。(搜索摘要确认了这些关键字。)
- **Freespecial 输入**:`freespecial`、`freespecial2..N` 用方向序列 + 键定义指令技(如「前前攻击」「下上攻击」),另有 `runattack`、`jumpattack`、`jumpforward` 等预置动画槽;`combostyle` 控制连段方式。我们已有等价物。
- **道具 / 武器**:item 实体可是回血食物、分数、命、**武器(`weapon_item`)**;拾取后切到持武器的动画集(`WALK`→`WALK2`…,命名因版本而异),武器有耐久/使用次数。论坛确认可以直接生成「持武器的敌人」。
- **敌人生成脚本**:关卡文本用 `at <滚动位置>` + `spawn` + `coords` + `health` + `item`(击杀掉落)+ `alias`;`group`(同屏上限)、`wait`(清场才继续)、`nojoin`、`boss` 标记。入场方式用 `spawnframe` / 空降动画(`RISE`、`jump` 入场)。
- **难度 / 命数**:`lives`、`credits`(续币次数)、`continue` 倒计时、`nodamage` 的难度修正(Easy/Normal/Hard 对敌人伤害与生命的倍率)、`nopause`、分数加命(每 N 分奖励一条命)。

## 3. Game feel / 战斗设计要点

- **Hitstop**:命中瞬间攻守双方各冻结数帧,重击更长、击杀最长(我们已有击杀顿帧)。需要区分「攻击方冻结」与「受击方冻结」,以及多段技的每段顿帧。
- **Screen shake**:强度与动作重要性成比例,用衰减曲线而非随机常数;方向性屏震(沿击打方向)比纯随机更有力。
- **Hit spark / flash**:不同攻击类型不同火花(斩、打、火),受击者闪白 2~3 帧。
- **Knockback 曲线**:击退不是匀速,是「快速初速 + 摩擦衰减」,落地再反弹一次;重击击退远、轻击几乎不动。
- **Enemy telegraph**:出招前有可读的预兆(抬手、闪光、音效),预兆时长 ≈ 玩家反应时间(约 12~20 帧),Boss 大招更长。
- **Attack token(攻击令牌)**:同屏同时只允许 N 个敌人处于「攻击状态」,其余绕圈/徘徊(经典 beat 'em up 与动作游戏通用的 AI 公平性手段)。一手来源未找到,属行业通用做法。
- **Streets of Rage 4 式**:击飞撞墙反弹、星星超必杀、特殊技扣血且攻击回血、双人互接浮空。
- **Hades / God of War(记忆)**:招式取消窗口宽、出手即可被闪避取消、受击分级清晰、精英有霸体条。

## 4. 我们还缺什么(按优先级)

对照 PROGRESS.md「引擎局限:瞬移无穿越判定、治疗只在出手帧、没有持续地面效果实体、没有格挡」与 DESIGN.md 已有内容。

### P0(最直接提升手感与可玩性)

1. **道具掉落与拾取(食物 / 分数 / 武器)**
   - 是什么:击杀或打碎物件后掉落食物(分大小回血)、金币分数、短时武器。
   - 为什么:清版的核心奖励循环;PROGRESS 已列「道具掉落」为下一步;KickPunch 连小品都有分级食物。
   - 实现:`sim/` 新增 `pickup` 实体(位置、类型、存活帧数),`world.ts` 每帧做拾取判定;掉落表放 `data/`(敌人 JSON 增 `drops`);`render/` 画简单旋转模型。

2. **可破坏物件(酒桶 / 箱子 / 路灯)**
   - 是什么:中立实体,有 HP 和受击盒,被打碎后出道具。
   - 为什么:给房间增加「打什么」的选择,使道具掉落有来源;OpenBOR 的 obstacle 概念。
   - 实现:`sim/` 增 `prop` 实体类型,复用现有命中判定,阵营设为中立;房间 JSON 增 `props: [{type,x,z,drop}]`,编辑器加摆放。

3. **更细的受击反应(按攻击类型区分)**
   - 是什么:轻击=小退不倒、重击=踉跄、打击/斩击/火系对应不同受击动画与火花,被打方向决定转身方向。
   - 为什么:PROGRESS 列了「受击方向」未做;让每招有各自的「手感指纹」。
   - 实现:招式帧数据增 `hitReaction`(`flinch|stagger|launch|spin`)与 `hitFx`;`fighter.ts` 状态机按此进入对应受击状态;`render/` 按 `hitFx` 选火花。

4. **敌人攻击令牌(同屏同时进攻数限制)**
   - 是什么:同屏最多 N 个敌人可处于「接近并出手」状态,其他围绕、等待。
   - 为什么:避免被 5 个敌人同时无预警围殴的不公平感,让战斗可读;对「连打新手」平衡也有帮助。
   - 实现:`sim/ai/` 加全局令牌表,敌人在选招前申请令牌,出招结束归还;令牌数随难度与房间配置变化。

5. **敌人出招前摇(telegraph)统一规范**
   - 是什么:所有重攻击和 Boss 大招有可见预兆(闪色/抬手/音效),前摇帧数有下限。
   - 为什么:让「看招反应」成为玩法,而非只靠站位硬吃。
   - 实现:`data/enemies/` 招式增 `telegraph: {frames, fx}` 并由 JSON 校验器检查下限;`render/` 按 telegraph 在出手前闪光。

6. **跳跃攻击 / 冲刺攻击完整化(jump-in、run attack)**
   - 是什么:空中按攻击键的方向派生、冲刺中攻击的专属招(OpenBOR 的 `jumpattack`/`runattack` 槽)。
   - 为什么:机动与进攻结合,是名将/三国战记的标志手感。
   - 实现:先核对 `data/` 角色是否已具备;缺的在角色模板里补默认招,`input.ts` 已有方向派生,只需映射到状态。

### P1(加深系统与重玩性)

7. **Juggle points(单敌浮空预算)**
   - 是什么:每个敌人有浮空耐久,每次浮空追打消耗,耗尽后该敌人不再被浮空,而是直接倒地。
   - 为什么:比全局连击上限更精确,可让轻型敌人好打、Boss 难浮空,取代一刀切。
   - 实现:`combat.ts` 的伤害补正旁增加 `juggleBudget`(敌人 JSON 配置);招式配 `juggleCost`。

8. **霸体 / 破防槽(super armor + guard break)**
   - 是什么:精英与 Boss 出招时有霸体,承受一定打击后霸体破裂并硬直;玩家也有破防槽。
   - 为什么:Boss 战阶段感,玩家被迫转换策略;DESIGN 已有「防御槽」但没有格挡。
   - 实现:`fighter.ts` 增 `armorHP`;命中时若在霸体帧内只扣 `armorHP` 不进硬直;`armorHP<=0` 进入 `broken` 状态;`render/` 显示护甲条。

9. **格挡与弹反(guard / parry)**
   - 是什么:按住防御键减伤,出手前几帧按下触发弹反(无伤+让对手硬直)。
   - 为什么:PROGRESS 明确写「没有格挡」,而布琳的设定本就是格挡反击。
   - 实现:`sim/` 增 `guard` 状态,命中判定查询防御方向与「弹反窗口帧」;防御消耗防御槽;`render/` 用金属火花。

10. **Boss 多阶段**
    - 是什么:血量阈值触发阶段切换(新招、变速、召唤小怪、短暂无敌的转场)。
    - 为什么:5 个 Boss 之间拉开差异,提升终章记忆点。
    - 实现:`data/enemies/` Boss JSON 增 `phases: [{hpBelow, moveset, onEnter}]`;`world.ts` 监测血量切换,AI 选招表按阶段换。

11. **敌人入场多样化**
    - 是什么:从屏幕上方跳下、破门而出、地下冒出、骑乘进场,而非只是从边缘走入。
    - 为什么:几乎零战斗成本换来明显的节奏变化(OpenBOR 的 spawn 入场动画)。
    - 实现:房间波次 JSON 增 `entrance: 'walk'|'drop'|'burst'|'rise'`;`sim/` 增入场状态(进场期间无敌或不可被打,N 帧后转入 AI),`render/` 播对应效果。

12. **长关卡内「GO」闸门(滚屏分段)**
    - 是什么:一个较长房间内分多个「锁屏战斗段」,清完再放行并出现 GO 箭头(OpenBOR 的 `at` + `wait`;Godot 模板的 level blocking)。
    - 为什么:弥补房间制过于「盒子化」的感觉,更接近真正街机清版的推进感。
    - 实现:房间 JSON 增 `gates: [{x, waves}]`;`world.ts` 摄像机边界在波次清空前锁定;`ui/` 显示 GO 箭头。

13. **环境危害(陷阱 / 地面持续伤害)**
    - 是什么:火盆、尖刺、落石,可伤敌我,也可把敌人打进去。
    - 为什么:增加位置策略,击飞/投掷获得新用途。
    - 实现:先补 PROGRESS 提到的缺口——「持续存在的地面效果实体」;`sim/` 增 `zone` 实体(范围、周期、伤害),房间 JSON 配置;`render/` 画地面特效。

14. **分数 / 命数 / 续币 / 排名**
    - 是什么:每关评分(已有过关评分基础)累计成总分;命数与续币;每 N 分加命;本地排行榜(localStorage)。
    - 为什么:街机游戏的重玩动力,多周目与多路线有了比较标尺。
    - 实现:`sim/` 世界增 `score`、`lives` 字段(保持确定性);`ui/` 做结算与排行榜;存档沿用现有 localStorage。

15. **敌人被投出时撞击其他敌人 / 撞墙反弹(完成 PROGRESS 下一步)**
    - 是什么:投掷物体带碰撞伤害,保龄球式连锁;击飞撞边界反弹并可再追打。
    - 为什么:SOR4 的核心爽点,也是 PROGRESS「玩法加深」的第 2 项。
    - 实现:`combat.ts` 中把被投/击飞的敌人视为临时攻击盒(带 `thrown` 标记),命中他人则转移部分伤害;墙壁反弹用反射初速度并减半。

### P2(锦上添花 / 工具)

16. **训练模式与帧数据显示**
    - 是什么:木桩、可重置站位、屏幕上显示当前招式的 startup/active/recovery 帧、命中/被防帧优势。
    - 为什么:我们是数据驱动并有编辑器,帧数据显示几乎白送;利于平衡与玩家学习。
    - 实现:`sim/` 已有帧数据,`ui/` 做叠层读取当前招式;编辑器的木桩测试页复用。

17. **回放录制(基于确定性 sim)**
    - 是什么:记录「种子 + 每帧输入」,可重放、可分享、可用于自动回归测试。
    - 为什么:sim 已确定性 60Hz,成本极低;也是排查平衡 bug 和 AI 训练数据的利器。
    - 实现:`sim/` 外加一层 `replay.ts` 保存输入流;`ui/` 增回放播放器;`tests/` 用回放做黄金测试。

18. **背击加成与背后受击提示**
    - 是什么:从背后命中伤害提升/破霸体;被背击时 HUD 方向提示。
    - 为什么:薇丝刺客的设定已提到背击加成,通用化让走位有价值。
    - 实现:`combat.ts` 命中时比较攻击方向与受击者朝向;`render/` 显示「BACK」字样。

19. **持武器敌人 / 骑乘敌人**
    - 是什么:敌人带武器(掉落可捡)、骑兽的精英。
    - 为什么:内容丰富度;武器掉落与道具系统天然衔接。
    - 实现:依赖第 1、2 项;敌人 JSON 增 `wields` 字段,死亡时掉落对应 pickup;骑乘作为一个双体包围盒的大型敌人处理。

20. **本地合作(co-op)**
    - 是什么:同屏 2 人,共享房间推进,友伤可选。
    - 为什么:清版的灵魂之一,SOR4 的双人接浮空也是卖点。
    - 实现:`world.ts` 的玩家由单个改为数组,摄像机取中点;输入层已支持手柄,可映射第二位玩家;敌人 AI 目标选择需改为「最近玩家」。

## 5. 不建议做的

1. **照搬 OpenBOR 的脚本语言/文本关卡格式**:我们已有 JSON + 校验器 + 编辑器,引入第二套 DSL 只会增加维护面。借概念(spawn 的 `at`/`wait`/`group`)即可。
2. **做成像素 2D 精灵引擎**:既有 Three.js 低模 + 贴图回退管线,迁到 Phaser 类 2D 引擎没有收益,而且会丢掉确定性 sim 与渲染分离的优势。
3. **联网对战 / 在线 co-op**:确定性 sim 虽然适合 rollback,但需要服务器或 P2P、反作弊和延迟处理,与「零后端、可放 GitHub Pages」冲突;本地 co-op 已足够。
4. **过早加大量武器种类**:先把拾取框架(第 1、2 项)做稳,再慢慢加;一次加十几种会让平衡与编辑器校验爆炸。
5. **一味加重屏震和顿帧**:二手资料都强调「强度与重要性成比例」;全屏频繁抖动会损害可读性并加重手机端负担,应给设置面板加「屏震强度」选项而不是默认加大。

## 6. 建议的落地顺序

先 P0 的 1→2→3(道具、可破坏物、受击分级共享「实体与命中」基础设施),再 4→5(AI 公平与可读性),随后 P1 的 7、8、9(防御与霸体),Boss 阶段与入场多样化可并行内容工作。回放录制(17)成本很低,建议在 P0 期间顺手做,用来给每次改动做回归。
