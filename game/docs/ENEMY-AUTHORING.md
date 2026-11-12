# 敌人与 Boss 数据编写规范

先读 `docs/CHARACTER-AUTHORING.md`(数值范围、`mv()`/`box()` 用法、可用字段相同),本文件只写与可选角色不同的地方。

## 文件

每章一个文件 `src/data/enemies/ch<N>.ts`,`export const enemies: CharacterDef[] = [...]`。

## 敌人 AI 如何出招(决定了数据怎么写)

脚本 AI 会在 `normals`、`commands`、`skills` 引用的所有地面招式里挑:
- 按与目标的距离选「够得着」的招(看 `hitbox.x1`;飞行道具视为远程,距离 3~9 米时使用)
- `skills` 里的招需要能量 ≥ `cost`(敌人挨打和打人都会涨能量)
- 带 `teleport` / `moveX` 的招会被当作突进手段
- 带 `heal` / `summon` 的招在血量低 / 召唤物不足时使用

所以:敌人不需要 `grab`(可以有)、不需要空中招式、`commands` 的 motion 随便填一个合法值即可(AI 直接出招,不搓招)。

## 普通敌人(role: 'enemy')

- 2~3 个招式即可;前摇要比可选角色长(startup 12~30),让玩家看得见、躲得开
- hp 40~180,speed 0.03~0.06
- 伤害:轻 5~8,重 9~14
- 每种敌人要有一个鲜明特点(远程 / 霸体 / 快速 / 治疗 / 瞬移),并在注释里写「玩家应该怎么对付它」

## Boss(role: 'boss')

- hp 700~1400(第 1 章最低,第 5 章最高),weight 1.5~2.2,look.scale 1.3~1.7,bulk 1.3~1.8
- 5~7 个招式:2 个普通攻击、2~3 个指令技(其中至少一个突进或瞬移)、2~3 个技能(cost 25~50,其中一个是大范围多段或远程)
- 大招 startup 22~40 且 `armor: true`,伤害 16~26;给玩家留出反击窗口(recovery 26~40)
- 引擎已保证:Boss 被连到上限会强制挣脱并震开周围敌人,一套连段最多掉 25% 血
- 文件头注释写清楚这个 Boss 的战斗节奏与破绽

## 测试

写 `tests/enemies.test.ts`:
1. 所有章节的敌人 id 全局唯一,且不与 `ROSTER` 现有 id 冲突
2. 所有引用的招式 id 存在
3. 每章恰好一个 role 为 'boss' 的角色
4. Boss 的 hp、scale 在规定范围内

`npx tsc --noEmit` 与 `npx vitest run tests/enemies.test.ts` 必须通过。

## 禁止

不要改任何已有文件;不要运行 git 命令。
