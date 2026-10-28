# 变更记录（CHANGELOG）

> 格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
> 与 README §10.3 分工：**本文件记「产物发了什么」，README §10.3 记「文档结构怎么变」**。
> 每次打 tag 追加一节。

## [10290257] — 2026-10-29 · 承伤侧补偿（每回合 2 个动作 + HP+5）+ 修远程动作重复计数 + 删金色旧侧边栏

> **已发版**：根目录 `game.html` **346,229 B / sha256 `9a6a36fc`** / build `10290257`，
> `index.html` 的 `var BUILD` 同步为 `10290257`（双 BUILD 一致）。**24 模块不变**。
> 三件一批：`ISSUE-20261029-25`（平衡）+ `ISSUE-20261029-24`（BUG）+ 人类口述「删金色旧侧边栏」。

### 25（承伤侧补偿，SD · 人类 02:4x 拍板「2 动作 + HP+5」）

- **动作预算 1 → 2**：新增 `BASE_ACTIONS_PER_TURN = 2`，`maxActionsThisTurn()` 改用它。
  攻击 / 技能 / 闪避各占 1 件 → **「打一拳 + 闪一次」成立**，不再是互斥二选一。
- **攻击次数上限独立出来**：新增 `maxAttacksThisTurn()`（仍为 `1 + extraAttacks`）。
  这是本次最容易做错的地方 —— 原来「动作预算」和「攻击次数」共用 `maxActionsThisTurn()`，
  只改那一个函数会把攻击也变成 2 次，等于简单翻倍输出，那不是本次要的效果。
- `nodeFitsBudget()` 同时校验 `actions ≤ 2` 与 `attackCount ≤ 1`；被拒提示新增 `budgetRejectReason()`
  **区分「动作上限」与「攻击次数上限」**（否则玩家只放一个攻击节点却被说「动作上限」会完全看不懂）。
- `BASE_HP_BONUS` **4 → 9**（玩家 L1 满血 10 → 15 左右）。
- 攻击节点的「已用」灰显改按攻击次数判（`playerAttacksDone >= maxAttacksThisTurn()`），
  否则 2 动作预算下打完一拳按钮不会变灰。
- 开局规则多一行公告：「每回合可以做 2 件事，攻击次数仍是 1 次」。
- **数据依据**（`SD工作空间/测试套件/runs_1029b/`，各 80 局）：线上现状均关 **1.30**、均杀 1.61、
  **73.8% 死在第 1 关、100% 阵亡**；承伤 = 满血的 94.7%，来源 **敌人近战 83.7% / 相杀 16.3%**。
  6 组对照实验（HP+5 / HP+10 / 敌人-1 / 2 动作 / 2 动作+2 攻击 / 2 动作+HP5）中，
  **只有「2 动作 + HP5」能把四个角色拉到同一档**。
- **发版实测（80 局）**：均关 **1.88**、均杀 **3.81**、L1 死亡率 **33.8%**、
  四角色最优 **3.00 / 2.40 / 2.00 / 2.00**（删被动前是 3.00 / 1.60 / 2.80 / 1.00）。

### 24（远程攻击节点重复计动作，SD）

- 删掉 `resolvePlayerAttack()` 远程分支**收尾**那一对 `playerAttacksDone++ / playerActionsUsed++`
  （与入口那对重复），原位留注释防回填。净删 2 行，`src/**` 一行未改。
- 影响：**「探测先锋」对远程角色此前等于白拿**（第二发被 `canPerformAction` 静默吞掉）。

### 外壳（人类 02:06「再删掉金色的旧侧边栏排行榜按钮」）

- `index.html` 删 `#lobbyHandle` 整块（CSS + `<button>` + `setLobbyOpen` 引用 + 点击绑定），
  连带删只为它服务的 `syncBattleMode()` / `gamePhase()` / 1.2s 轮询。
- 入口只剩游戏内棋盘左上角的 ♟ 角标（`postMessage 'ark_open_lobby'`）。
  两处「左滑把手」提示文案改为「点棋盘左上角 ♟」。

### 门禁

- jsdom **200 项**（`bundle_test` 58 / `dom_load` 23 / `layout_chrome` 53 / **`lobby_shell` 42**（39→42）/ `battle_ui` 24）。
- CDP：`lobby` 30/30、**新增 `lobby_follow` 17/17**、`facing` 24/24、`startcell` 14/14、
  **新增 `remote_action` 15/15**、`close_btn` 14/14。
- **两条新测试都做过反向验证**（不是空判）：把重复计数植回产物 → remote_action 5 项转红；
  把跟随写成「坐标直接贴指针」→ 5 项转红；把出口停留改 0 → D1 转红；预算改回 1 → F2 转红。

## [10290130] — 2026-10-29 · 设置抽屉精简 + 设置/账号角标搬进棋盘两角

> **已发版**：根目录 `game.html` **332,056 B / sha256 `86e99fa3`** / build `10290130`，
> `index.html` 的 `var BUILD` 同步为 `10290130`（双 BUILD 一致）。**24 模块不变**。
> 同一构建内实施两个 issue（人类 01:15 拍板「21 和 22 由同一个人做」）：**22 先、21 后，一次发版**。

### 22（设置抽屉精简，DSQ）

- **删掉「↩ 选角」按钮**：它与「⟲ 重开」行为完全等价（都是 `drawerClose() + initCharSelect()`），
  删了**玩家能力零损失**；`#setBtns` 的 `repeat(4,1fr)` 同步改成 3 列，不留空位。
- **「⟲ 重开」去掉二次确认**（`window.confirm('确定重开游戏吗？…')`），点了直接回选角大厅
  —— 人类 01:15 明确「重开就是回到大厅」，语义保持原样，不做「重打当前关」。
- **全库再无确认弹窗**：`src/` 与产物内 `window.confirm` 零命中。
- 取舍已知：战斗中误点「⟲ 重开」会立刻丢当前局且不可撤销（人类要的就是「少一次点击 > 防误触」）。
  将来要防误触，正确做法是改成长按，**不要把 confirm 加回来**。

### 21（地图角标，DSQ · B 方案「叠层」，人类 01:0x 拍板）

- ⚙ 从「左上角悬浮固定钮」搬到**棋盘右上格**；新增 ♟ 在**棋盘左上格**。两者尺寸 = 恰好一个格子
  （`var(--cell)`），随格子缩放；共用同一套样式（大小 / 圆角 / 配色 / 高亮态 / `aria`）。
- 角标挂在 `#boardWrap` 内、**不进 `#board`**（`paintBoard()` 每帧 `innerHTML` 重刷那一层会被冲掉）；
  贴的是**棋盘的角**而不是容器的角 —— `updateCellSize()` 用公式算出 `--corner-x / --corner-y` 补掉居中余量。
- **遮挡已处理**：角标 `z-index: var(--z-corner)` = 30，低于 `#unitLayer`(40)，且单位层本就 `pointer-events:none`
  → 站在角落的敌人，血条 / 精英词缀 / 意图箭头绘制在角标之上，**不会被盖住**（§B 强制处理 1）。
- ♟ 点击 `postMessage({type:'ark_open_lobby'})` → 外壳 `index.html` 开 `#lobbyDrawer`；外壳开合后再回发
  `ark_lobby_state`，游戏侧同步 ♟ 的高亮与 `aria-expanded`。**联网 / 榜单逻辑一行都没搬进 game.html**（NB-04 不变）。
- 直开 `game.html`（`window.parent === window`）时 **♟ 自动隐藏**，不留死按钮；旧的左边缘把手 `#lobbyHandle` 按授权**保留**。
- 已知代价（人类明确接受）：这两格**点不到也走不上去**；攻击 / 技能 / 闪避都是点路径节点，所以角落里的敌人照样能打。
- **仍欠一份数据**：§B 强制处理 2 要 SD 统计两角「是墙的占比 / 是否参与可走格与边长公式」。数据未出，
  按 B 上线；若可走占比显著，由团队领导决定是否改判 A（mapgen 预留两角）。

### 门禁

- `bundle_test` 58 / `dom_load` 23 / `layout_chrome` 53 / `battle_ui` 24 / `lobby_shell` 39 = **197 项全绿**。
- 构建五项校验通过（双 BUILD / NB-04 / 结构完整性 / 注入标记 / 无重复定义）。
- **未自动验证项**：竖版 390×844 与横屏下的视觉贴合、触屏点击手感（jsdom 无布局），需浏览器 / 真机目检。

## [10290123] — 2026-10-29 · 删除「贴身反击 / 趁乱攻击」自动补刀被动

> **已发版**：根目录 `game.html` **328,692 B / sha256 `260e68b5`** / build `10290123`，
> `index.html` 的 `var BUILD` 同步为 `10290123`（双 BUILD 一致）。
> 人类维护者指令（01:17）：「贴身反击和趁乱攻击同步一下，都彻底删掉，只剩下朝向攻击和攻击节点两种攻击方式」。

### 删除（整条机制，不是改名、不是收窄）

- **`templates/game.html#resolveScuffleAttacks()` 整个函数（58 行）**——本 tick 只要玩家有动作，就对
  **所有**相邻敌人各补一刀：不占动作、不吃动作上限、每 tick 无上限；近战走正常伤害/暴击，远程固定 1 点保底。
- 该函数的唯一调用点（`confirmAction()` 结算循环里 `await resolveScuffleAttacks(playerActionThisTick)`）。
- 只为它存在的 `let playerActionThisTick = false;` 及 2 处赋值（`pendingAttack` 分支、移动分支）。
- `src/rules/actions.js` 动作机制注释里的「被动行动：…」条目。
- `src/rules/buffs.js` 锈蚀刀片：`近战伤害 +1，贴身反击伤害 +1` → **`近战伤害 +1`**（遗物数值未变，
  只是把不存在的机制从文案里去掉）。
- `templates/game.html` 风笛冲锋提示：`禁用攻击节点与贴身反击` → **`禁用攻击节点`**。

### 现在的攻击方式（只剩两种）

| 方式 | 规则 |
|---|---|
| 攻击节点 | 单击路径格（含**脚下那格 = 原地攻击**）设节点，到达该步出手一次，**占 1 次动作** |
| 朝向必中 | 攻击节点的近战分支：正对目标即命中，覆盖自然 1，伤害与暴击判定照旧；远程 / 技能 / 敌人侧不套用 |

闪避（第一个等待，AC+3）与角色技能（双击设节点）不变。
`applyFacingGuaranteedHit()` 调用点 **2 → 1**（只剩攻击节点近战分支）。

### ⚠️ 平衡影响（80 局矩阵，参数与上一版一致）

| 角色 | 删除前最优 | 删除后最优 | 均杀 |
|---|---|---|---|
| 风笛 | 3.00 关 | **1.20 关** | 6.4 → 0.8 |
| 泥岩 | 2.80 关 | **1.00 关** | 6.2 → 0.8 |
| 华法琳 | 1.60 关 | **1.00 关** | 2.6 → 0.6 |
| 阿米娅 | 1.00 关 | 1.00 关 | 0.8 → 0.4 |

该被动实测占玩家总输出的大头，删掉后第 1–2 关即阵亡。这是**人类指定的设计取舍**（简化机制优先），
不是 bug。要恢复可玩性应做**数值补偿**（玩家基础伤害 / 敌人血量成长 / 每回合动作数），**不要加回机制**。
数据：`SD工作空间/测试套件/runs_1029/`（`before_*` 与 `noscuffle_*` 各 80 局）。

### 门禁（全部在发版产物上跑）

| 套件 | 结果 |
|---|---|
| `node build/bundle_test.mjs` | 58/58 |
| `net/dom_load_test.mjs` | 23/23（`commit` = `99e31548…`，40 位 sha） |
| `net/layout_chrome_test.mjs` | 53/53 |
| `net/lobby_shell_test.mjs` | 39/39 |
| `net/battle_ui_test.mjs` | 24/24 |
| `cdp_facing_test.cjs` | **24/24**（新增：产物里两个旧名零出现 / `resolveScuffleAttacks` 不存在 / 只有 1 次出手） |
| `cdp_startcell_attack_test.cjs` | 14/14 |
| `cdp_lobby_test.cjs` | 30/30 |

合计 **197 项 + 68 项 CDP** 全绿，`pageErrors` / `console.error` 全 0。

### 测试套件同步

- `cdp_facing_test.cjs`：S1 断言 `calls === 3` → **`calls === 2`**（定义 + 1 处调用，作硬闸门）；
  S2 改为「`贴身反击` 与 `趁乱攻击` 在产物里**都是 0 次**」；S3 改为「无 `resolveScuffleAttacks` / `scuffleFlatDmg` 残留」；
  原第 6 组（验证被动吃朝向必中）整组替换为「机制已删除」的正面验证 + 「攻击节点仍是唯一出手口」。
- 删除 `cdp_scuffle_test.cjs`（它验证的是「收窄」方案，该方案已被彻底删除取代）。

## [10290150] — 2026-10-29 · 伤害改骰子（近战 2d4 / 远程 1d8）+ 关闭按钮改角标式

> **已发版**：根目录 `game.html` **337,435 B / sha256 `81a38643`** / build `10290150`，
> `index.html` 的 `var BUILD` 同步（双 BUILD 一致）。
> 人类 01:37：「近战攻击造成 2d4 伤害，远程攻击造成 1d8 伤害」；01:42：「账号/排行/设置面板关闭按钮删掉，
> 改成面板里与入口按钮同位置、同尺寸的关闭按钮，再按一下关闭，标题放到面板顶部右侧」。

### ① 伤害改骰子

| | 公式 | 起手（属性 12） | 期望 |
|---|---|---|---|
| 近战（风笛 / 泥岩） | 2d4 + ⌊(STR−10)/2⌋ + 锈蚀刀片层数 | 2d4+1 | 6.0 |
| 远程（华法琳 / 阿米娅） | 1d8 + ⌊(INT−10)/2⌋ | 1d8+1 | 5.5 |

- 常量：`src/data/constants.js` → `PLAYER_MELEE_DICE = {n:2,s:4}`、`PLAYER_RANGED_DICE = {n:1,s:8}`。
- 新函数：`src/rules/dnd.js` → `rollDamageDice()` / `rollPlayerMeleeDamage()` / `rollPlayerRangedDamage()` /
  `fmtDmgDice()` / `playerMeleeDmgLabel()` / `playerRangedDmgLabel()`；`recomputePlayerDerivedStats()` 里的
  `meleeDmg / rangedDmg` **降级为期望值**（`diceAvg` + 修正），只给 AI 估值与兜底用。
- **7 处伤害点全部改为掷骰**：近战攻击节点、远程攻击节点、岩崩锤反击、精神爆发、相杀、冲锋撞击、冲锋追击（`path.js`）。
- 暴击乘在**掷完之后的总伤害**上（×2）：朝向暴击 / 自然 20 / 8% 随机 / 技能必暴。
- 面板改显示骰子文案：角色卡数值格（`templates/game.html`）与手机虚拟键（`src/ui/mobile-pad.js`）显示 `2d4+1` / `1d8+1`。
- `net/layout_chrome_test.mjs` 断言从「= 定值」改为「= 骰子文案」。
- **PvP 未改**（`net/pvp-core.js` 是独立逐 tick 相杀模型）。

### ② 关闭按钮改角标式

- 设置抽屉：删 header 里 30px 的 `.drawer-x`；新增 `.drawer-corner-x`，尺寸 `var(--cell)`、位置 `var(--corner-x/y)`，
  与棋盘右上格 ⚙ 完全同尺寸同位置；`header` 加 `.head-end`（标题靠右，右 padding 让出格子宽度）。
- `index.html`「账号与排行」抽屉：删 `#lobbyClose`；新增 `#lobbyCornerClose`（左上 10px、36×36）；
  `.dhead` 改 `justify-content:flex-end`、左 padding 56px；`.dclose` 样式停用（保留注释）。
- **不动**：属性抽屉、升级奖励抽屉（入口不在棋盘角上）、完整排行榜浮层的 `#rankClose`（全屏 iframe 无其他退出路径）。

### 平衡回归（80 局，参数与前两版一致）

| 角色 | `10290123` | `10290150` | `10290058`（删被动前） |
|---|---|---|---|
| 风笛 | 1.20 关 | **1.80 关** | 3.00 关 |
| 泥岩 | 1.00 关 | **1.80 关** | 2.80 关 |
| 华法琳 | 1.00 关 | **1.20 关** | 1.60 关 |
| 阿米娅 | 1.00 关 | **1.00 关** | 1.00 关 |

均承伤仍 ≈ 14.6（满血）→ 现阶段瓶颈是**承伤**不是输出；继续加伤害收益递减，下一轮该动敌人伤害 / 玩家 HP / 动作数。
数据：`SD工作空间/测试套件/runs_1029/`（`noscuffle_*`、`dice_*` 各 80 局 + 成绩表）。

### 门禁（全部在发版产物上跑）

| 套件 | 结果 |
|---|---|
| `node build/bundle_test.mjs` | 58/58 |
| `net/dom_load_test.mjs` | 23/23 |
| `net/layout_chrome_test.mjs` | 53/53 |
| `net/lobby_shell_test.mjs` | 39/39 |
| `net/battle_ui_test.mjs` | 24/24 |
| `cdp_facing_test.cjs` | 24/24 |
| `cdp_startcell_attack_test.cjs` | 14/14 |
| `cdp_lobby_test.cjs` | 30/30 |
| **`cdp_close_btn_shots.cjs`（新增）** | **14/14** |

### 顺带记录（未修）

- 远程攻击节点重复计数 `playerAttacksDone / playerActionsUsed`（`10290058` 起就有）→
  `ISSUE-20261029-24-remote-action-double-count`，等「版本更新」修。

## [10290058] — 2026-10-29 · 起始格（原地）攻击修复（ISSUE-17）

> **已发版**：根目录 `game.html` **332,257 B / sha256 `d8d5c7fd`** / build `10290058`，
> `index.html` 的 `var BUILD` 同步为 `10290058`（双 BUILD 一致）。
> 派发：人类维护者「17 号重新落盘并提交 main」——上一版 `10282343` 漏带了这份修复。

### 修复

- **`templates/game.html#toggleAttack()`**：越界判断 `if (idx < 1) return;` →
  `if (idx < 0 || idx >= playerPath.length) return;`。旧判断把「路径起点（idx 0）」和非法下标
  一起挡死，于是**点自己脚下那格毫无反应**，而 `confirmAction()` 里
  `attackIndices.includes(0) → pendingAttack` 的「原地攻击」支持**永远是死分支**。
- **`src/rules/actions.js#plannedActionInfo()`**：攻击节点过滤 `i > 0` → `i >= 0`。
  只改前一处不改这里，会出现「起点攻击 + 第二个攻击节点」规划期不报超限、结算时第二下莫名打空。
- 起点节点专属战报「🎯 原地攻击：不移动，进入本回合后先在起始格出手（占一次动作）。」
- `pointerup` 双击分支加 `idx > 0`：起点格没有技能节点可设，双击按「再点一次」处理，
  否则会还原快照把刚设上的原地攻击悄悄抹掉。
- 底部操作提示补「点脚下那格=原地攻击」（PC 与手机两套文案）。

### 未包含（重要）

- **ISSUE-20261028-10 A 条「趁乱攻击收窄」未上线**。代码已实现并自测通过
  （`cdp_scuffle_test` 8/8：剩步数触发 / 一次一个 / 每回合一次），但 80 局平衡回归**断崖**：
  风笛 3.00 → 1.00 关、泥岩 2.80 → 1.20 关、均杀 6.4 → 0.2。原因：现有「贴身反击」是
  **每个 tick 对全部相邻各补一刀**，约占玩家总输出八成，收窄等于删掉主力输出。
  代码留在 `SD工作空间/游戏demo/_build_ws6/`，等人类拍板（原样收窄 / 收窄+补偿 / 只做 Boss B）。
- **ISSUE-10 B 条 Boss 圆岩巨像**未开始（不在本次授权范围）。

### 门禁（全部在发版产物上跑）

| 套件 | 结果 |
|---|---|
| `node build/bundle_test.mjs` | 58/58 |
| `net/dom_load_test.mjs` | 23/23（`commit` 字段 = `488aa06f…`，40 位 sha） |
| `net/layout_chrome_test.mjs` | 53/53 |
| `net/lobby_shell_test.mjs` | 39/39 |
| `net/battle_ui_test.mjs` | 24/24 |
| `cdp_startcell_attack_test.cjs` | **14/14**（真实 pointerdown/up 打到格子中心） |
| `cdp_facing_test.cjs` | 22/22 |
| `cdp_lobby_test.cjs` | 30/30 |

合计 **197 项 + 66 项 CDP** 全绿，`jsdomError` / `console.error` / `pageErrors` 全 0。

## [10290007] — 2026-10-29 · 删掉泥岩隐藏的 +42% 近战暴击（ISSUE-20）

> **已发版**：根目录 `game.html` **330,937 B / sha256 `38aeec3c`** / build `10290007`，
> 构建时 `main` @ `7c95c380d5`。人类维护者授权「发版」，本轮范围 = 20。
> **只有一处数值改动**，没有新增/删除角色、敌人、技能、骰子或经验口径；UI 与外壳零改动。

### 修复

- **泥岩隐藏暴击率**：`meleeCritTag()` 原本在「自然20 / 朝向」都不中之后，对泥岩（`fencer`）额外加 42%，
  与基础 `critChance = 0.08` 叠成 **50%** —— 是其他近战角色（风笛 8%）的 **6.25 倍**。
  这条加成 **README / CHANGELOG / issue 全目录零记载**，角色 `tips` 也只写了技力、反击、岩崩锤、闪避，
  属纯隐藏强度。现改为所有角色同一条 `player.critChance`，暴击只剩三条公开途径：
  **自然 20 → 朝向 → 面板暴击率**。
- **刻意没有动的两处**：① `rng()` 的调用次数与位置（原本两条判定都不中时同样要调一次），
  所以**整局随机序列完全不变**；② 泥岩反击伤害的必定暴击（在 `meleeCritTag` 之外，是独立机制）。

### 测试

- `net/battle_ui_test.mjs` 新增 `[4] 近战暴击率` 组：构造「正面近战 + 非朝向 + 非自然20」这条**唯一**能走到
  `critChance` 的分支，抽样 2000 次得泥岩 **7.6%**、风笛 **7.5%**（同口径）。
  **并验证了这条测试抓得住回归**：把旧逻辑临时植回产物，立刻红成 48.3% vs 7.6%。
- 合计 **197 项全绿**：`bundle_test` 58 / `dom_load_test` 23 / `layout_chrome_test` 53 /
  `lobby_shell_test` 39 / `battle_ui_test` 24。

---

## [10282343] — 2026-10-28 · UI 重构 + 取消主页（ISSUE-09 + ISSUE-10）

> **已发版**：根目录 `game.html` **330,899 B / sha256 `56898b1b`** / build `10282343`，
> 远程 `main` @ `63a63fc623`。人类维护者授权「版本更新」，本轮范围 = 09 + 10 合并一版。
> **玩法规则与数值零改动**（无新增/删除角色、敌人、技能、骰子、经验口径）。

### 新增

- `src/ui/drawer.js` —— 右侧抽屉组件：`settings` / `stats` / `levelup` 三段，互斥、遮罩、
  Esc（**捕获阶段** `stopPropagation`，否则先被游戏快捷键吃掉）、`aria-expanded` 与 `.on` 同步。
  浮层再叠第二层「属性说明卡」（`#abilityInfoLayer`）。
- `src/ui/panels.js` —— 六维说明卡。公式照**代码实际口径**抄写（力量→近战 `1+修正`；敏捷→`移动力=⌊dex/2⌋`、
  `AC=5+⌊(dex+con)/4⌋`；体质→`maxHp=con+4+等级加成`；智力→远程；感知→敌人意图可见步数与部分角色技力上限；
  魅力→本版无数值作用，只展示）。有剩余点时原地 `+1`，数值与修正即时刷新、卡片不关闭。
- `src/ui/mobile-pad.js` —— 手机虚拟圆钮。**只在 `(pointer: coarse) and (not (any-pointer: fine))` 建 DOM**，
  PC 一律不建。4 方向 + 等待/攻击/技能；攻击键长按 400ms 切攻击范围、短按攻击；技能键按 `spMax` 画等分技力环。
- `net/battle_ui_test.mjs` —— **20 项实战回归**：4 角色 × 3 回合实操（每回合轮着开抽屉 / 开说明卡 / 右键技能节点）、
  结算期间抽屉仍开着、通关 → 加点闸门 → 下一关、触屏实例 3 回合全用圆钮操作、结算后棋盘仍是正方形。
  这条补的是 `layout_chrome_test` 的盲区：那边全在**静止**的 planning 界面上测，测不到「结算中 `updateStats()`
  每帧调 `syncVirtualPad()` / `renderAbilityDrawer()`」这条最容易抛异常的路。
- `net/lobby_shell_test.mjs` —— **39 项外壳回归**：无 `#home`/`#btnStart`、`?v=` 必须等于 `var BUILD`、
  7 种非法账号输入各有**具体原因**、`maxlength=20`、自动生成账号、**可见文本里搜不到口令**、榜单剥数字 + 同名 `·2`。

### 变更（游戏内 UI）

- **正方形棋盘**：`boardAvailSize()` 取「可用短边」，`#boardWrap` 写同一像素宽高；`.cell` 去掉历史的 `×1.12`
  纵向拉伸；`#game` 改 `justify-content: flex-start` 贴左。
- **废除竖版拖高度**（与「正方形永远最大化」互斥）：`ark_map_v_ratio` 不再写入，且启动即 `clearMapVHeight()`
  清掉老用户 localStorage 里的旧比例 —— 否则升级后地图会被一个已不存在的比例锁死。
- **`#radarWrap` 从角色卡移入属性抽屉**，`#radarCanvas` 尺寸 `min(268px, 74vw)`（竖版也放得下）。
- **仪表格降级为纯展示**：去掉 `data-kv-action` 与点击，加点只走「点属性名 → 说明卡里的 +1」。
  手机上是圆形 = 交互、方形 = 信息，混在一起的点击语义会让人误触。
- **键盘补 `V`** 切攻击范围（原来只有鼠标能看）；**右键规划路径上的节点**设技能节点（走既有 `toggleSkill`，起点不接受）。
- **`showLevelUpOverlay()` 不再自建 `.lv-mask`**，改为写入 `#drawerLevelUpBody` 并 `drawerOpen('levelup')`。

### 修复

- **进关瞬间手机圆钮显示旧值**：`initLevel()` 第一次 `render()` 是 `setTimeout(…, 50)`（等离开选角大厅、
  格子尺寸稳定后才量得出布局），这 50ms 里 `phase` 已是 planning 但圆钮还顶着上一关/初始值 ——
  纯触屏玩家会看到「等待 0 / 攻击 0 / 没有技力环」，半帧后才跳正确。在 `setTimeout` 之前补一次 `syncVirtualPad()`。
- **`net/dom_load_test.mjs` 的 build 正则只认旧格式** `^\d{8}[a-z]$`：构建号改 `MMDDHHmm` 后该用例必红（既有缺陷，不是本轮回归）。
  改为两版都认。
- **`net/lobby_shell_test.mjs` 把 BUILD 写死成 `10282321`**：发版改号必红。改为从 `index.html` 读 `var BUILD` 再比 iframe `?v=`，
  这正好也是 AC-23 的要害（不一致 → 用户拿到缓存里的旧 `game.html`）。
- **`net/layout_chrome_test.mjs [2]` 旧断言**跟着正方形改造重写；新增 `[3.5]` 非触屏不建圆钮、`[6]` 触屏实例数值与技力环。

### 变更（外壳 `index.html`）

- **取消主页**：`#home` / `#btnStart` 整块删除，`init()` 直接 `startGame()`，打开即选角大厅。
- **左把手 + 抽屉**：8px 左边缘把手（战斗中 `body.in-battle` 缩到 2px 让位棋盘），抽屉 = 账号卡 + Top10 + 完整榜；
  抽屉拉出时 `iframe.style.pointerEvents = 'none'`（否则棋盘会吞掉滚动手势）。
- **账号 = 显示名 + 数字口令**：`/^([\u4e00-\u9fa5A-Za-z]{1,12})(\d{4,8})$/`。`parseAccount()` **逐条给原因**、
  绝不静默截断；首次自动生成 `玩家<4位>`；公开位置一律 `publicName()` 剥尾部数字；同名显示 `阿米娅 ·2`。
  编辑框 `maxlength=20` 回填完整串。

### 构建基线

- `build/manifest.json`：21 → **24 模块**（新增 `drawer` / `panels` / `mobile-pad`；`drawer`、`panels` 早于 `rng`/`pvp-core`，
  `mobile-pad` 最后）。
- **`P0.1-4` 拆分基线失效**：`chrome.js` / `layout.js` 重写、`dom-refs.js` 改点击语义、模板多处改动，
  旧 README 里的「第 N 区 = 第 X 行」不可再用，请以本次产物为准重新核对。

### 门禁

`bundle_test` **58/58** · `dom_load_test` **23/23** · `layout_chrome_test` **53/53** · `lobby_shell_test` **39/39** ·
`battle_ui_test` **20/20**（新增）= **193 项全绿**，`jsdomError` / `console.error` 全程 0。
本轮未跑 80 局平衡口径：**没有改动任何规则或数值**，平衡门的触发条件（改数值）不成立。


## [未发布] — 机械拆分第七批（按热度分级）+ 构建「多点注入」（`P0.1-4`，build `20261028c`）

> 本节**不涉及线上产物**：根目录 `game.html` 未改动（272,067 B / `959b59d2`）。
> 拆分产物只落在 `build/out/game.html`，**发布需人类授权**（§0.0 / NB-12）。

### 为什么这批不按行号顺序拆

按 `ISSUE-20261028-08-split-by-heat.md`（人类维护者 03:40 确认）：剩下 8 区里有 3 处是
`issues/` 里 05（精英词缀）/ 06（遗物事件）/ 07-icon 的**必改热区** ——
`initLevel` / `finishLevel` / `openLevelUp`（06 要往里插事件 phase）、`resolveTurn` 与敌人 AI（05 改结算）、
`renderUnits`（07-icon）。按行号拆等于「拆完立刻被改」，白拆两遍。

判断标准：**拆完能撑过 1.5 轮发版（约 45–60 分钟的重取区成本）才划算**。
已实测每轮发版后的「重新取区对齐」成本 30–40 分钟，且已发生 4 次。

### 前置改造：构建支持「多点注入」（本批能成立的前提）

`layout` 与 `chrome` 各是**两段不连续**代码（layout 在模板 1078 与 3382 行、chrome 在 3268 与 3893 行）。
旧构建只有一个占位符、且位于最前，于是：

- **拼接成一个模块 = 改动求值顺序**：合并后第二段会在模板里 `const dragHandle` / `const logRotateBtn`
  声明之前执行 → **TDZ ReferenceError**（归一化比对看不出来，页面直接白屏）。
- **只拆前面连续段 = 只能拆热区**，与本 issue 的目的相反。

所以先给构建加能力（基建，§0.0 豁免）：

| 文件 | 改动 |
|---|---|
| `build/bundle.mjs` | 新增 `splitBySlot()`：模块内 `/* @slot:<id> */` 切段；`inlineModules()` 把每段注入模板同名 `<!-- @inject:scripts:<id> -->`。**跨槽位置由模板决定（= 求值顺序不变）**，同槽内顺序 = `modules` 顺序；槽位缺失/多余标记均**抛错**（不静默） |
| `build/verify.mjs` | 新增第 6 项校验 `checkNoInjectionMarkers`：产物不得残留 `@inject` 标记。理由：`<!--` 在 JS 里等同行注释，**标记没被替换也不会报错**，只会静默少一段代码 |
| `build/bundle_test.mjs` | 加 10 项单测（切段 / 空段丢弃 / 行内提及不误判 / 残留标记判红与判绿）→ 38 变 **48 项** |
| `net/layout_chrome_test.mjs` | **新增 38 项**：横竖切换、竖版拖拽比例与 `localStorage` 往返、设置面板开合、DLC 外壳 iframe 接管（隐藏 `#btnHome`、`#ghint` 空则隐藏/有字则右上角、劫持 `showHint`） |

### 第七批（3 组低热度代码，模板行号）

| 模块 | 区间 | 内容 |
|---|---|---|
| `src/rules/mapgen.js` | 701-927 | `bfsReachable` / `growRegion` / `smoothRegion` / `clearSpawnArea` / `countWalkable` / `placeObstacles` / `generateMap`（纯逻辑，零 DOM） |
| `src/ui/layout.js` | **1078-1161** + **3382-3428** | 竖版地图高度比例拖动（`gameEl` / `MAP_V_KEY` / `mapVRatio` / `vGameBox` / `vMapBounds` / `applyMapVHeight` / `syncMapVHeight` / `clearMapVHeight` / 拖动状态 / `endSideDrag`）+ 横竖切换（`LAYOUT_KEY` / `currentLayout` / `setLayout` / `initLayoutMode`） |
| `src/ui/chrome.js` | **3268-3380** + **3893-3959** | 设置/日志面板外壳（日志面板 DOM ref / `LOG_POS_KEY` / `setOpenBtn` / `clampLogPanelPos` / `setSettingsOpen` / `bindLogDrag` / 重开 / 主页）+ `patchDLCChrome`（隐藏外壳 `#btnHome` / 劫持 `showHint` / `#ghint` 同步） |

`modules` 18 → **21**（`src/data/` 3 + `src/rules/` 9 + `src/ui/` 8 + `src/net/` 1）。
`templates/game.html` 188,313 B → **166,663 B**（减 21,650 B / 3,432 行）。

### 与 issue 原区间的差异（已按实际边界修正）

issue 写的是 `layout` 1087-1162 + 3366-3445、`chrome` 3269-3368 + 3897-尾。实际取区时按**语义边界**调整：

- `layout` 第 1 段上移到 **1078**（issue 列的 `gameEl` / `MAP_V_KEY` / `mapVRatio` 都在 1079-1081，按 1087 起会把这几个顶层 `const` 留在模板里，而搬走的函数要用它们）。
- `layout` 第 2 段收为 **3382-3428**（3366 附近仍是「重开」按钮，属 chrome）。
- `chrome` 第 1 段延到 **3380**，把「重开」「主页」两个按钮的监听一起带走（issue 把 `setHomeBtn` 列为 chrome 内容，但区间写的是 3368 截止）。
- `chrome` 第 2 段收为 **3893-3959**（只搬 `patchDLCChrome` 及其文档注释）。**不搬**文件尾的 `initCharSelect()` / `pvpInjectUI()` —— 那是启动入口，不是外壳接管。
- 两段之间的空行归属按「跟着上下文的段落走」处理，`--prev` 归一化比对已确认无实质差异。

### 验证

1. **文本等价**：`node build/bundle.mjs --prev game.html` → 归一化后与基线**完全一致**；
   产物 272,787 vs 272,067 B = **+720 B（0.26%）**，远低于 `AC-01` 的 2%。
2. **无残留**：21 个关键函数/常量（`bfsReachable` … `generateMap`、`vGameBox` … `endSideDrag`、
   `currentLayout`/`setLayout`、`clampLogPanelPos`/`setSettingsOpen`、`MAP_V_KEY`/`LAYOUT_KEY`/`LOG_POS_KEY`/`gameEl`）
   在**产物中各 1 次、模板中各 0 次**。
3. **真运行**：e2e 六套件全绿（`dom_load` 23 / `pvp_core` 20 / `pvp_e2e` 16 / `pvp_browser` 16 /
   `hook_integration` 8 + 联机 `client`）；新增 `net/layout_chrome_test.mjs` **38 项全绿**；
   `bundle_test` **48 项**、`push_guard` 10 项全绿。

### 留给后续

- 热区（`initLevel`/`finishLevel`/`openLevelUp`、`resolveTurn` 与敌人 AI、`renderUnits`）**等 05/06/07 落地后再拆**。
- 本批严格「纯移动」：不做 NB-13 的命名对齐、不把魔法数字搬进 `constants.js`。
  混两件事会让「归一化后完全一致」这个唯一可靠的等价判据失效。

## [未发布] — 机械拆分第六批 + 基线复核（`P0.1-4`，build `20261028c`）

> 本节**不涉及线上产物**：根目录 `game.html` 未改动（272,067 B / `959b59d2`）。
> 拆分产物只落在 `build/out/game.html`，**发布需人类授权**（§0.0 / NB-12）。

### 基线复核（承接 README v3.6 的模板误覆盖事故）

人类发版 build `20261028c`（`game.html` 261,228 B → **272,067 B**，ISSUE-04 敌人差异化 + ISSUE-07 熟练加值）。
发版过程中出现过一次**模板误覆盖**（README v3.6 已记录并由发版方修复），本批在其修复版上继续：

- 复核结果：远端 `templates/game.html` 205,408 B（第 1–6 区已骨架化）、`manifest.json` 15 模块 —— 两者**已匹配**，
  我本地独立修复出的模板与该版**逐字节相同**（说明修复口径一致，无二次偏差）。
- 复核 `src/**` 与 `game.html` 的整段命中情况：15 个模块全部命中，无需重取。
- 复核 `src/ui/units.js`：发版方已按通告把 `renderUnits` 的图标改动落到该模块（5,686 B），与本批一致。

### 第六批（第 7 区：状态重置与棋盘特效，20261028c 基线 1908-2340 行）

- `src/rules/reset.js` —— 状态重置（1908-2003 行）：`freshBuffs` / `clearLevelUpOverlay` /
  `resetSkillState` / `resetRunProgress` / `resetTurnState` / `createPlayerStats` /
  `createPlayerUnit` / `syncPlayerFromStats`
- `src/ui/char-select.js` —— 角色选择流程（2005-2050 行）：`initCharSelect` / `selectCharacter`
- `src/ui/board-fx.js` —— 棋盘几何与特效（2052-2340 行）：`findPath`（BFS 寻路）/ `getBoundingBox` /
  `getCellEl` / `cellCenter` / `unitCenter` / `facingIndicatorHtml` / `unitHtml` / `hasLineOfSight` /
  `canRangedAttack` / `playerAttackRangeCells` / 敌人首步箭头 / `floatText` / `ringFx` / `slashFx` /
  `animateBullet` / `hitFlashCell` / `refreshUnits` / `hitFx` / `missFx`

产物 **271,481 B vs 基线 272,067 B = −586 B**（模块头注释开销被第 5 批的压缩策略抵消），
归一化后与基线**完全一致**；e2e 六套件全绿。

> ℹ️ 归属说明：`board-fx.js` 里的 `findPath` / `hasLineOfSight` / `canRangedAttack` 是**纯函数**，
> 但与原段 DOM 代码交织、无法在不改代码的前提下分离，故暂归 `src/ui/`，
> 已标注于模块头注释，留待 `P0.1-5` 重构期移入 `src/rules/`。

### 新增：`checkNoDuplicateDefinitions`（防止 v3.6 事故复发）

`build/verify.mjs` 新增第 5 项校验，已接入 `runVerify` 与 `bundle.mjs`：

- **做什么**：读 `manifest.json` 的 `modules`，对每个模块提取**顶层定义名**（`function` / `const` / `let` / `var`），
  要求它们在产物中**各只定义 1 次**。
- **为什么**：v3.6 那类事故的后果是静默的 —— `function` 重复定义不报错、后者覆盖前者；
  若是 `let/const` 重复则直接 SyntaxError。人眼在 27 万字节里看不出。
- **精度**：只匹配**行首无缩进**的定义形式，避免函数内同名局部变量误报
  （首版用 `\s*` 允许缩进，导致 `radar.js` 的 `const dist`、`tools.js` 的 `const key` 被误判，已修正）。
- **反向验证**：故意把 `function isWalkable` 塞回模板 → 校验打红 `isWalkable ×2`；恢复后转绿。
- **单测**：`build/bundle_test.mjs` 加 4 项（顶层提取 / 嵌套不计 / `async function` / `const`+`let`），34 → 38 项。

## [未发布] — 机械拆分第一、二批 + `20261028b` 基线重新对齐（`P0.1-4`）

> 本节**不涉及线上产物**：根目录 `game.html` 未改动（现 261,228 B / `4cb46640`，build `20261028b`）。
> 拆分产物只落在 `build/out/game.html`，**发布需人类授权**（§0.0 / NB-12）。

### 新增

**第一批（第 1 区：数据与常量）**

- `src/data/constants.js` —— 常量与方向表（原 `game.html` 487-520 行）
- `src/data/characters.js` —— 角色数据与派生查询函数（原 522-591 行）
- `src/data/enemies.js` —— 敌人类型与固定面板（原 593-620 行）
- `templates/game.html` —— 构建模板：原文件第 1 区替换为 `<!-- @inject:scripts -->` 占位，
  第 2–15 区（约 5,200 行）仍在模板内，待后续批次搬移。

**第二批（第 2 区：运行时状态，原 622-751 行）**

- `src/rules/state.js` —— 顶层 `let` 状态：关卡、路径、技力、闪避、升级、UI 缓存
- `src/rules/buffs.js` —— 升级节奏与奖励池 `BUFF_POOL`、技力加成函数、`damagePlayer` 统一受伤入口
- `src/rules/sp.js` —— 泥岩 / 风笛 / 华法琳三套技力系统与敌人攻击欲望系数

六个模块均为**原样搬移，未改一个字符**（各加了 3 行来源说明注释）。
`build/manifest.json` 的 `modules` 顺序 = 拆分前的出现顺序，这是零行为改变的根本保障。

### `20261028b` 基线重新对齐（2026-10-28 02:35）

人类维护者发版 `20261028b`（`game.html` 249,421 B → **261,228 B**），改动覆盖了已拆的第 1、2 区，
README 顶部随即挂出「基线变更通告：拆分基线已失效，须重新对齐 `src/`」。

**已按通告重新取区**（不是打补丁，而是以新版为唯一基准整段重取）：

| 区域 | 本次发版改了什么 | 已同步到 |
|---|---|---|
| 第 1 区·常量 | `ABILITY_POINTS_PER_LEVEL` → `ABILITY_POINTS_PER_LEVELUP = 2` | `src/data/constants.js` |
| 第 1 区·敌人 | `ENEMY_STATS` 去 `hpFixed`、注「L1 基础面板」；新增 `enemyGrowthRng` / `computeEnemyGrowth` | `src/data/enemies.js` |
| 第 2 区·状态 | 新增 `playerChargeBudget` / `playerChargeHits` / `playerChargeDir` | `src/rules/state.js` |
| 第 2 区·技力 | 新增 `CHARGE_FINISH_RANGE = 3` | `src/rules/sp.js` |
| 第 3–15 区 | `RUN_SEED`、`finishLevel` / `openLevelUp` 发点、冲锋额度与追击、日志按本关单位打印 | `templates/game.html`（仍在模板内） |

新行号区间（以 261,228 B 版为准）：constants 487-522 / characters 524-594 / enemies 596-671 /
state 673-728 / buffs 730-777 / sp 779-809。各模块头部注释已改写为新行号。

验证：`node build/bundle.mjs --prev game.html` 归一化后**完全一致**
（262,900 vs 261,228 B = **+1,672 B / 0.64%**，低于 `AC-01` 的 2%）；
e2e 六套件 + `bundle_test` 34 项 + `push_guard` 10 项全绿。

### 等价性三层验证

1. **文本等价**：`node build/bundle.mjs --prev game.html`
   → 归一化（去注释/空白、抹平版本对象）后与拆分前 `game.html` **完全一致**。
   产物 250,880 B vs 249,421 B = **+1,459 B（0.58%）**，低于 `AC-01` 的 2% 预算。
2. **真运行**（文本等价不等于能跑）：
   - `ARK_GAME_HTML=build/out/game.html node net/dom_load_test.mjs` → **23 项全绿**
   - `net/pvp_core_test.mjs` **20 项** / `net/pvp_e2e_test.mjs` **16 项** / `net/pvp_browser_test.mjs` **16 项** 全绿
   - `node net/hook_integration_test.mjs build/out/game.html` → **8 项全绿**
   - 联机 `client_test`（建房/加入/重连/满房 409）全绿；`build/bundle_test.mjs` 34 项、`push_guard` 10 项全绿
3. **无残留**：`PHASE` / `CHARACTERS` / `ENEMY_STATS` / `DIR4_BFS` 在 `src/` 各 1 处定义，
   模板中只剩引用；模块内无重复声明。

### 配套改动

- `net/dom_load_test.mjs`：新增 `ARK_GAME_HTML` 环境变量，可指向任意产物
  （此前硬编码 `../game.html`，无法验证构建产物）。
- `docs/ARCHITECTURE.md`：新增「拆分进度表」与「本批的等价性证明」。
- `src/README.md`：更新搬运状态、「顺序即语义」约束，并立下 **LF 换行约定**。

### 第三批（第 3 区：DOM 引用与基础工具，20261028b 基线 489-740 行）

- `src/ui/dom-refs.js` —— 13 个 DOM 引用（boardWrap / board / unitLayer / fxLayer / log / stats /
  footBar / heroInfo / heroKv / controls / actionSlot / radarCanvas）+ 六维图点击加点与悬停手型 + `unitEls`（489-523 行）
- `src/rules/rng.js` —— mulberry32 可播种随机：`seedRng` / `rng` / `randInt`，
  以及 `RNG_SEED` 与本局种子 `RUN_SEED`（525-551 行）
- `src/net/pvp-core.js` —— PVP-CORE 联机结算核心 188 行（553-740 行）。
  纯函数、不碰 DOM、不读全局 `rng()`；`net/pvp_core_test.mjs` 按区块起止标记切片 `eval` 后单测，
  因此**标记字面量在全文只能各出现 1 次**（见下方踩坑）。

`build/manifest.json` 的 `modules` 增至 **9 个**。产物 264,005 B vs 261,228 B = **+2,777 B（1.06%）**。

### 第五批（第 6 区：规则判定，20261028b 基线 1352-1768 行）

- `src/rules/path.js` —— 路径判定与冲锋计算：`isWalkable` / `faceToward` / `isFacingTarget` /
  `isInFacingCone` / `previewFacing` / `calcPathSignature` / `pathSpGain` / `findChargeSkillIndex` /
  `previewChargeBudget` / `computeStraightChargePath` / `resolveChargeRemainingHits` /
  `skillReadyInfo` / `countMoveSteps` / `countWaitSteps`（1352-1564 行）
- `src/rules/actions.js` —— 动作机制：`DODGE_AC_BONUS` / `firstWaitIndex` / `plannedActionInfo` /
  `nodeFitsBudget` / `playerEffectiveAC`（1566-1621 行）
- `src/ui/units.js` —— 动作预算与单位渲染：`maxActionsThisTurn` / `canPerformAttackAction` /
  `clearUnitLayer` / `getUnitIcon` / `getPlayerRenderFacing` / `isPlayerPreviewCharging` / `renderUnits`（1623-1768 行）
  （含 DOM 故归 `ui/`；两个预算函数待重构时移入 `rules/`）

### `AC-01` 体积治理（同批）

15 个模块时产物增量达 **1.94%**（266,292 B），逼近 `AC-01` 的 2% 红线。
增量**全部来自注释与空行**（归一化后始终与基线完全一致，即实质零膨胀），因此做两处压缩：

1. 模块头部的 3-4 行来源说明 → **1 行**（15 个模块省 3,013 B）
2. `bundle.mjs` 的内联分隔头 `/* ---- src: xxx ---- */` → `/* src: xxx */`

结果：**+1,901 B（0.73%）**，为剩余 9 个区留出余量。
顺带修正：第 3-5 批头注释里的「基线行号」其实是**模板行号**（拆分会让模板行数变化），
已用整段子串匹配重算为 `game.html` 的真实行号（`src/**` 现覆盖基线 487-1768 行，区间连续无重叠）。

### 第四批（第 4-5 区：掷骰与面板 / 六维雷达图，20261028b 基线 489-776 行）

- `src/ui/tools.js` —— 基础工具与战斗日志：`dist` / `cheb` / `key` / `LOG_MAX` / `LOG_VIEW_MAX` /
  `autoLogType` / `makeLogLine` / `renderLogAll` / `clearLog` / `log` / `sleep` / `inBounds` / `findLastIndex`（489-534 行）
- `src/rules/dnd.js` —— `gainFencerSp` 泥岩技力 + DnD 六属性系统：`abilityMod` / `abilityLabel` /
  `computeAC` / `attackRoll` / `attackRollDisadvantage` / `fmtRoll` / `recomputePlayerDerivedStats`
  + 敌人 L1 基础面板只读查询（`getEnemyAbilities` / `getEnemyProf` / `computeEnemyHp` / `computeEnemyMove`，536-609 行）
- `src/ui/radar.js` —— 六维雷达图 `drawRadar`（canvas 绘制 + `radarLabelHits` 属性文字命中框，611-776 行）

`build/manifest.json` 的 `modules` 增至 **12 个**。产物 265,079 B vs 261,228 B = **+3,851 B（1.48%）**。

> ℹ️ **体积口径**：`AC-01` 的「字节差 < 2%」按产物原始字节计；增量全部来自来源注释与空行（归一化后与基线完全一致）。第五批已做注释压缩（见下节），当前 +1,901 B / 0.73%。若后续再次逼近 2%，可考虑构建期完全不写来源注释头。

### 踩坑：Windows 文本模式把 LF 写成 CRLF

第二批首次构建时产物虚增 **6,095 B（2.4%）** 且 `diff` 整片变红。
根因是 Windows 上以文本模式（`open(...,'w')`）写回行内容时，`\n` 被静默转成 `\r\n`——
模板 5,208 行全部变成 CRLF。修正方式：统一按二进制写回 `\n`。
**约定：仓库所有文本文件一律 LF，写回后确认 `CRLF = 0`。**

### 踩坑：模块头注释里写了标记字面量，把断言打红

`src/net/pvp-core.js` 的头部说明原本写了「按 `//#PVP_CORE_START` / `//#PVP_CORE_END` 标记切片」，
导致 `dom_load_test` 的「PvP 核心标记成对存在」断言失败 —— 全文 START 出现 2 次（注释 1 次 + 真实 1 次）。
**规矩：被脚本按标记切片的代码块，其注释中不得复写标记字面量。** 已改为「按区块起止标记切片」的描述式写法。

### 为何先拆这两批

第 1 区是纯 `const` 数据 + 3 个派生函数，**不依赖任何运行时状态、不碰 DOM**；
第 2 区是纯 `let` 声明与少量常量，**只依赖第 1 区、且都在同一个 `<script>` 顶层按序求值**——
两段都是 `let/const` 提升与初始化顺序风险最低的部分。按「每批 ≤ 3 模块」的规定走，
先把拆分—构建—验证的闭环跑通，再推进到有 DOM 引用与函数提升依赖的第 3 区及以后。

### 产物影响

无（未发布）。拆分产物与现线上版本行为完全等价，发布时为零行为变化。

### 已知限制

- 模板仍含第 2–15 区代码，因此模板本身**不能单独运行**（缺第 1 区定义），必须经构建。
- `AC-01` 的「`npm run build` 产出与线上基线字节差 < 2%」已在本批达成（0.28%），
  但完整验收建议等全部区拆完后再做。

## [未发布] — 构建脚本落地（`P0.1-3`）

> 本节**不涉及产物**：`game.html` 未改动（仍 249,421 B / `1a86858d00`），线上行为零变化。
> 构建脚本是后续所有产物的唯一出口，故单独立节记录。

### 新增

- `build/bundle.mjs` —— 单文件产物构建：按 `build/manifest.json` 顺序内联 `src/**`，
  剥离 ESM 语法（`import`/`export`）后内联进同一个 `<script>` 上下文，**幂等注入** `__ARK_VERSION__`。
- `build/verify.mjs` —— 产物校验，可独立运行：
  AC-23 双 BUILD / NB-04 离线自包含 / 结构完整性 / 产物一致性。
- `build/manifest.json` —— 内联清单（`modules` 待 `P0.1-4` 填充）。
- `build/bundle_test.mjs` —— 离线单测 **34 项**。
- `tests/fixtures/` —— 迷你模板 + 迷你清单 + 两个样例模块，供 `--self-test` 验证内联管线。

### 三条护栏（设计要点）

1. **默认不碰根目录 `game.html`** —— 试构建一律落在 `build/out/`。
   写根目录被识别为发版动作（§0.0 / NB-12），缺 `--force` 或 `ARK_RELEASE_OK=1` 即以**退出码 4** 中止。
   已实测：无授权时 `game.html` 分毫未动。
2. **`index.html` 只校验不改写** —— 它是只读资产（NB-01）。
   `var BUILD` 是双 BUILD 的唯一真值来源，产物 build 由它注入；不一致则构建失败并打印应改的值。
3. **产物必须离线自包含**（NB-04）—— 检出外链 `<script src>` / `<link href>` / `import from http` 即失败。

### 修复

- **`--bump` 用 UTC 推日期，导致同日发版被误判为"未来日期"**。
  人类维护 `index.html` 的 BUILD 写的是本地日期（北京时间 10-28 凌晨写 `20261028a`，此时 UTC 仍是 10-27），
  用 UTC 会得到 `null` 而无法推导。改为本地日期，并加了 2 条**时区回归哨兵**单测。

### 为何做

AC-23 定下的目标是「把双 BUILD 同步从人工纪律升为机器校验」。
根因是 2026-10-27/28 连续两次版本信息不同步（一次险些覆盖他人改动、
一次排查"新版本没上线"实为 CDN 10 分钟缓存）。现在由脚本把关。

### 产物影响

无。`game.html` / `index.html` / `leaderboard.*` 全程未触碰。

### 已知限制

- `manifest.modules` 为空，当前为**直通模式**：以根目录 `game.html` 为基底只做版本注入与校验。
  `AC-01`（`npm run build` 产出与线上基线字节差 < 2%）须待 `P0.1-4` 拆分出模板后才能验收。
- `commit` 取 `git rev-parse HEAD`；本机 git 元数据可能落后远端，可用 `ARK_COMMIT=<sha>` 覆盖。

### 验证（测试证据）

```bash
node build/bundle_test.mjs          # 离线单测 34 项
node build/bundle.mjs --self-test   # 内联管线 4 项断言（顺序/剥离/注入/幂等）
node build/bundle.mjs --prev game.html   # 真实产物试构建：AC-23 / NB-04 / 结构 / 一致性 全绿
```

- 离线单测 **34/34 通过**；`--self-test` **4/4 通过**。
- 真实试构建：`AC-23` 通过（build = index.html BUILD = `20261028a`）、NB-04 无外部依赖、
  结构完整性 1 对 `<script>`、**产物一致性与上版归一化后完全一致**。
- 回归：e2e 6 套件全绿（dom_load 23 / pvp_core 20 / pvp_e2e 16 / pvp_browser 16 / hook 8 / client_test）。

## [未发布] — 工具链加固（`P0.1-7` 的一部分）

> 本节**不涉及产物**：`game.html` 未改动，线上行为零变化。记在这里是因为它直接关系到"改动会不会被静默覆盖"。

### 新增

- `net/push_api.py` **并发覆盖保护**（默认开启）：
  推送前比对远端目标文件的 blob sha 是否命中「我的基线」，不命中即以退出码 **3** 中止，并打印 rebase 指引。
  - 基线来源优先级：`--base <commit>` > `net/.push_baseline.json`（上次推送/对齐时记录）> 本地 git `HEAD`/`origin/main`；三者都无法判定时按"有风险"中止。
  - 新增参数：`--base <commit>`（显式基线）/ `--force`（唯一例外，须在提交信息写明理由）/ `--sync-baseline`（声明已对齐远端）。
- `net/push_guard_test.py`：离线单测 **10 项**，覆盖放行 / 拦截 / 强制 / 无法判定四条路径（不需要 token、不联网、不写远端）。

### 修复

- **原 422 重试缺陷**：检测到"分支被别处推动过"后，仍拿同一份本地内容再推一次 ——
  等于"发现有人抢先，然后坚持覆盖他"。现在每次重取基线后都会重跑覆盖保护。

### 为何做

`game.html` 单文件 + `base_tree` 增量建树 = **整文件覆盖**语义，且 fast-forward 成功时不会报任何错。
2026-10-27 `P0.1-1` 期间，一次推送险些覆盖他人 +53/-32 的 UI 改动（靠人工 rebase 才避免）。
这个保护把"推送前确认对方是否已推进"从**人工纪律**变成**机器强制**。

> 误报（保守中止）远好过漏报（静默丢改动）。被拦下时请走 rebase，不要直接 `--force`。

### 首次实战（上线即生效）

推送 `README.md` 时保护立刻检出：远端 `README.md` 已被他方推进至 `4aabf6ad04`
（新增 §0.9「发布与版本号维护」与 §0.2 授权例外），而我的基线是 `9711fe5396` → 以退出码 **3** 拦下。
处理：取回远端最新版 → 在其上重新叠加我的改动（rebase，不是覆盖）→ 再推。

同批还发现：远端 `game.html` 已被更新至 `1a86858d00`（`__ARK_VERSION__` 增补 `build` 字段、
版本号移至标题栏），本次**刻意未触碰产物**——若当时一并推 `game.html`，也会被拦下。

> 这次实战说明并发不是理论风险：两个协作方在**几分钟内**就撞到了同一个文件。

## [v0.1.0-prototype] — 2026-10-27

M0.1 的第一个动作：**冻结原型基线**（任务 `P0.1-1`）。
此 tag 是"能玩的原型"的快照，此后的工程化改动都以它为对照基准与回滚点。

### 新增

- `window.__ARK_VERSION__ = { version, commit, builtAt }` —— 产物内版本标识（AC-02）。
  - 控制台执行 `__ARK_VERSION__` 可查；
  - 页面「设置」面板（⚙）底部常驻一行：`v0.1.0-prototype · 9a4137c · 2026-10-27`。
- `CHANGELOG.md`（本文件）。

### 产物影响

| 项 | 冻结前 | 冻结后 | 差值 |
|---|---|---|---|
| `game.html` | 247,843 B / 5,448 行 | 248,913 B / 5,467 行 | +1,070 B / +19 行 |

纯新增常量与一行样式，**不改变任何玩法行为**（e2e 全绿，见下）。

### ⚠️ 并发冲突与处理（本次踩到的，值得记住）

开发期间另一个协作方并行改了 `game.html`（`062fe231`「设置同位置切换 + 等级移到名字右侧 + 加点金色方框」，+53/-32），
把我原先基于 `54f64fa` 的注入变成了"会覆盖他人改动"的版本。

按 README §0.6「不得靠选一边了事」，处理方式为 **rebase 而非覆盖**：
取回远端最新 `game.html`（`9a4137c`），在其上重新叠加版本号注入，
再用 API 增量提交（`base_tree` 语义，只更新指定文件，其余文件不受影响）。

> 教训：`game.html` 是单文件产物，两个人同时改就是"整文件覆盖"语义。
> 动手前与推送前都要确认对方是否已推进；P0.1-3 的构建脚本落地后，
> 应改为从 `src/` 构建，冲突面会从"整个文件"降到"单个模块"。

### 已知限制

- `commit` 字段为**被冻结的基线提交** `9a4137c`，而非本 tag 自身的 sha —— 提交无法自引用
  （自己的 sha 要等写完才产生）。P0.1-3 构建脚本上线后，改为构建时注入真实 sha。
- 本次**未做**机械拆分与目录调整（属 `P0.1-2` / `P0.1-4`），产物仍是单文件。
- 发布只写 `game.html`（NB-01）；`index.html` 等 DLC 只读资产全程未触碰。

### 验证（测试证据）

```bash
python net/room-server.py &                       # e2e/browser/client 依赖房间服务
NODE_PATH=$TEMP/arkjsdom/node_modules node net/dom_load_test.mjs
```

- `dom_load_test` → **全部通过（22 项）**，新增 `[7]` 段专门守 AC-02（版本可读 + 页内可查）。
- `pvp_core_test` 20 项、`pvp_e2e_test` 16 项、`pvp_browser_test` 16 项、
  `hook_integration_test` 8 项、`client_test` 全部通过。

### 回滚方式

```bash
# 回到本 tag（含版本号注入）
git checkout v0.1.0-prototype -- game.html

# 回到注入前的纯原型
git checkout 9a4137c -- game.html
```

再用 `push_latest.sh`（或 `net/push_api.py`）重新发布该 `game.html` 即可。
