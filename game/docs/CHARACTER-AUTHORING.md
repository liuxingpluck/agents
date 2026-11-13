# 角色数据编写规范

角色是纯数据(`CharacterDef`,定义在 `src/sim/types.ts`)。范例:`src/data/characters.ts` 里的 `kael`。
招式语义以 `src/sim/world.ts` 为准(尤其是 `pickMove`、`applyHit`、`castEffects`)。

## 文件

每个角色一个文件:`src/data/chars/<id>.ts`,`export const <id>: CharacterDef = {...}`。
用 `src/data/build.ts` 的 `mv()`、`box()`、`toMap()`。召唤物等附属单位在同文件 `export const extras: CharacterDef[]`。

## 每个角色必须有

- `normals`:LP、HP、LK、HK 四个入口。LP 至少 2~3 段(用 `chain: { LP: '下一招' }`),LK 至少 2 段
- `airNormals`:至少 2 个空中招式(`air: true`)
- 一个 id 为 `grab` 的抓取招(`grab: {...}`),由 轻拳+轻脚 同时按触发
- `commands`:至少 3 个指令技(tier = COMMAND),motion 从 `DF DB DU FF BF DD` 中选
- `skills`:恰好 4 个;前 3 个 tier = SKILL(cost 15~35),第 4 个是奥义 tier = SUPER(cost 60)
- 至少一个挑空招(`launch` 0.30~0.38),至少一个击倒招(`knockdown: true`)
- `lore`:2~3 句,符合 `docs/DESIGN.md` 第 6 节世界观(持名者、名之遗物、每用一次力量失去一段记忆)
- `title`:四字左右的称号

## 数值范围(60 帧/秒)

| 类型 | startup | active | recovery | damage | hitstun | hitstop |
|---|---|---|---|---|---|---|
| 轻攻击 tier 0 | 3~6 | 2~4 | 7~13 | 4~10 | 15~20 | 3~6 |
| 重攻击 tier 1 | 6~14 | 3~5 | 14~24 | 11~21 | 18~26 | 7~11 |
| 指令技 tier 2 | 5~12 | 4~10 | 14~22 | 12~18 | 22~26 | 8~9 |
| 技能 tier 3 | 6~16 | 2~24 | 16~26 | 单段 14~24 / 多段每击 5~8 | 20~26 | 3~10 |
| 奥义 tier 4 | 8~14 | 20~36 | 26~34 | 多段每击 7~10 | 24 | 4 |

- `pushX`:0.02~0.3(击退速度);hitbox 的 x 范围近战一般 0.2~1.8,长柄到 2.6,z 容差 0.6~1.3
- 飞行道具:`projectile: { speed 0.2~0.4, life 40~80, radius 0.25~0.45, y 0.9~1.3, color }`,此时 hitbox 用 `box(0,0,0,0,0.6)`
- 多段招用 `rehit`(每隔几帧重新判定)
- 可用的特殊字段:`moveX` `selfLaunch` `jumpCancel` `armor` `invuln` `heal` `summon` `teleport` `grab`
- `stats`:hp 150~320(法师/弓手低,坦克高);speed 0.055~0.085;jump 0.33~0.38;weight 0.8~1.5;energyMax 100
- `anim` 只能用 `AnimKind` 里已有的值
- `look`:配色偏暗黑风但主色要有辨识度(别全是黑灰),weapon 从类型里选

## 注释

所有招式分组、每个指令技与技能上方都写中文注释,说明用途与在连段中的位置(起手 / 中继 / 收尾 / 挑空)。
文件头写一段角色打法说明和 2 条推荐连招。

## 测试

写 `tests/chars-<组名>.test.ts`(vitest),对自己负责的每个角色验证:
1. normals / airNormals / commands / skills / chain 引用的招式 id 全部存在
2. 有 `grab`,skills 长度为 4 且第 4 个 tier 为 4
3. 在模拟里对木桩(`ROSTER.brute`,hp 设很大)打出 LP 连段能命中 ≥2 下(参考 `tests/sim.test.ts` 的 `duel` / `run` / `tap` 写法,把角色直接 `spawnFighter` 进去即可,roster 用 `{ ...ROSTER, [id]: def }`)
4. 4 个技能在能量充足时都能出手(`p.energy = 100` 后按对应技能键,`p.move?.id` 正确)

跑 `npx tsc --noEmit` 和 `npx vitest run tests/chars-<组名>.test.ts`,必须全过。

## 禁止

- 不要改 `src/sim/`、`src/data/characters.ts`、`src/data/build.ts`、`src/render/` 等共享文件(引擎缺功能就在最终回复里说明)
- 不要运行 git 命令
