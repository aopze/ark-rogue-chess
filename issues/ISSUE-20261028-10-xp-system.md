# 升级机制改为经验制：本关失血越少，经验越多；保证第 3 关必升 1 级

<!--
本文件只是需求，不要顺手去改 game.html（README §0.0 铁律）。
等人类维护者说「版本更新」时才会按 issues/ 里的条目一次性实施，完工后删除本文件。
-->

- **提出人 / 时间**：用户 / 2026-10-28 16:48（17:0x 按用户澄清重写；17:05 确认「负失血夹零」与「升级回满血不影响经验」）
- **类型**：balance（附带少量 ui：经验条 + 结算日志）
- **优先级**：P1 明显影响体验（改变整条成长曲线，所有平衡基线作废）
- **状态**：ready

---

## 现状

1. **升级是「每 3 关固定升 1 级」**：`src/rules/buffs.js:6` `LEVELUP_EVERY_N_LEVELS = 3`，`templates/game.html:2868` `const willLevelUp = clearedLevel % LEVELUP_EVERY_N_LEVELS === 0;`。打得好像打得烂，第 3/6/9 关通关时都一样升级，**没有任何「效率」概念**。
2. **没有经验值这个东西**：全库没有 `xp` / `exp` 字段，等级只由 `heroLevel` 表示（`src/rules/buffs.js:7`，初始 1，`reset.js:25` 重置为 1）。
3. **关卡之间没有任何恢复**：`initLevel` 里只有 `currentHp = min(currentHp, maxHp)`（`templates/game.html:749-750`），血量**原样带到下一关**。唯一回满血的时机是升级（`openLevelUp()` 里 `playerStats.currentHp = playerStats.maxHp`）。
4. **关内确实有回血**（不是关末）：恢复道具 ❤️ `+3`（`templates:2002`）、血迹 🩸 `+1~2`（`2029`）、华法琳通关时吸场上血迹每处 `+2`（`2846`）、药枚护盾（`playerShield`）挡伤害、加点体质即时加 HP（`1288`）。
5. **升级效果**（`openLevelUp()`，`templates:2904`）：`heroLevel += 1` → HP 上限 += `max(0, abilityMod(con))`（累计进 `levelHpBonus`）→ 回满血 → `abilityPoints += 2` → 弹奖励池 3 选 1。
6. **`LEVELUP_EVERY_N_LEVELS` 被敌人成长共用**：`src/data/enemies.js:160` 用它算「每 3 关敌人 HP 上限 + 体质加值」，`templates:820` 用它显示敌人等级。**动这个常量 = 22 关所有敌人同时变形。**

---

## 期望

### A. 口径：`hpLoss` = 关卡开始血量 − 关卡结束血量

用户原话是「行动数越少 → 关卡结束时失去的血量越少 → 经验越多」，**衡量的是这条链的最后一环：本关实际掉了多少血**。行动数只是原因之一，不是指标本身。

- `levelStartHp`：在 `initLevel()` 里 `player = createPlayerUnit(gen.playerStart)` **之后立刻**取 `player.hp`。
  - 必须取 `player.hp` 而不是 `playerStats.currentHp`：后者是跨关持久值，进关瞬间两者相等，但只有 `player.hp` 是战斗中的唯一真实血量。
- `endHp`：在 `onLevelClear()` 里、**华法琳吸完场上血迹之后**取 `player.hp`。此时 `playerStats.currentHp = player.hp` 已在函数开头同步过，两者一致。
  - 顺序理由：华法琳通关回血本身就是「关卡结束时血量」的一部分，算在失血里才自洽。
- `hpLoss = max(0, levelStartHp - endHp)` —— **取 0 下限是硬要求，不是可选优化**（用户 17:05 明确要求「防止负失血」）。
  - 关内净回血（吃 ❤️ +3 / 🩸 +1~2 / 华法琳吸血迹 +2 抵消了伤害）时 `levelStartHp - endHp` 会是负数，必须夹到 0；否则 `efficiency = ref - hpLoss` 会超过 `ref`，经验突破上限 24。
  - 日志里最小只显示 `失血 0`，不出现负数。
- **关末不回血**（用户明确要求）：不做任何 `currentHp += regen` 之类的结算，血量照原样带进下一关，与现状一致。
- **升级回满血保留，且不影响本关经验**（用户 17:05 确认）：`openLevelUp()` 是在 `onLevelClear()` 里 `setTimeout(..., 600)` 之后才执行的，属于**两关之间**的动作；而 `hpLoss` / `xpGain` 在 `onLevelClear()` 内就已算完冻结。所以回满血只会抬高**下一关**的 `levelStartHp`（从而抬高下一关的 `ref`），对已经结算的这一关零影响。

### B. 每关经验

```
ref       = clamp(round(levelStartHp * XP_DMG_REF_RATIO), XP_DMG_REF_MIN, XP_DMG_REF_MAX)
efficiency = clamp(ref - hpLoss, 0, XP_EFF_CAP)          // 少失 1 血 = +1 步
xpGain    = XP_CLEAR_BASE + efficiency * XP_PER_STEP     // 12 + 2×步，恒在 [12, 24]
```

- `ref` 用**本关开始的血量**做基准（不是 `maxHp`）：基准随血量自动缩放，且**堵住「带 1 HP 进关 → 反正掉不了血 → 永久满经验」这个漏洞**。带伤进关时基准同步变小（下限 2），必须几乎零失血才拿满效率。
- 失血超过基准（挨打多）→ 效率 0，只剩保底 12；零失血 → 效率拉满 6 步 → 24。
- 单关经验恒在 `[12, 24]`，**下限是常数**——这是「第 3 关必升」能成立的唯一原因（见 D）。

### C. 升级判定

```
while (pendingLevelUps < 3 && xp >= XP_TABLE[heroLevel]) {
  xp -= XP_TABLE[heroLevel];
  heroLevel += 1;
  pendingLevelUps += 1;
}
```

- `XP_TABLE[heroLevel]` = 从当前等级升到下一级所需经验；`heroLevel` 超出表长时按表尾 +100 递增。
- 一次通关最多连升 3 级（防死循环）；升级效果沿用现有 `openLevelUp()`，**每个待升级各弹一次奖励**。
- **玩家升级与 `LEVELUP_EVERY_N_LEVELS` 彻底解耦**：`willLevelUp` 不再看关卡号，只看 `pendingLevelUps > 0`。

### D. 「正常游玩至少第 3 关能升」是算术保证，不看水平

| 场景 | 单关经验 | 累计到第 2 关末 | 第 3 关末 |
|---|---|---|---|
| 最差（每关挨满，效率 0） | 12 | 24 < 36 | **36 ≥ 36 → Lv.2** |
| 正常（失血≈基准，效率 1~2 步） | 14~16 | 28~32 < 36 | **42~48 → Lv.2** |
| 完美（零失血两关） | 24 | 48 ≥ 36 | Lv.2（第 2 关就升） |

- 下限侧：`12 × 3 = 36 = XP_TABLE[1]` → **无论怎么打，第 3 关通关时必到 Lv.2**。
- 第 1 关永远升不了（单关上限 24 < 36）。
- 第 2 关能升的条件是「两关几乎零失血」（24 × 2 ≥ 36），属于奖励硬操作，不违反「至少第 3 关」。
- 若希望「最早也只能第三关升」，把 `XP_TABLE[1]` 提到 **50**（2 关最多 48 < 50），其余不动。

**常量（新增在 `src/data/constants.js` 末尾，标注「玩家经验制，ISSUE-10」）**：

| 常量 | 值 | 说明 |
|---|---|---|
| `XP_CLEAR_BASE` | 12 | 每关保底经验（决定了保底升级的算术下限） |
| `XP_DMG_REF_RATIO` | 0.40 | 允许失血基准 = 本关开始血量 × 40% |
| `XP_DMG_REF_MIN` | 2 | 基准下限（残血进关时） |
| `XP_DMG_REF_MAX` | 8 | 基准上限（满血高体质时不至于太宽松） |
| `XP_PER_STEP` | 2 | 少失 1 血 = +2 经验 |
| `XP_EFF_CAP` | 6 | 效率步数封顶（→ 最多 +12） |
| `XP_TABLE` | `[0, 36, 64, 98, 140, 190, 250, 320, 400, 500]` | 下标=当前等级，值=升到下一级所需 |

**算例**（阿米娅 maxHp 10，L1 满血进关 → ref = round(10×0.4) = 4）：

| 关 | 开始 HP | 结束 HP | 失血 | 效率步 | 本关经验 |
|---|---|---|---|---|---|
| L1 | 10 | 6 | 4 | 0 | 12 |
| L1 | 10 | 8 | 2 | 2 | 16 |
| L1 | 10 | 10 | 0 | 4（封顶 6，实际 4） | 20 |
| L2 | 8 | 6 | 2 | round(8×0.4)=3 → 1 步 | 14 |
| L3 | 3（残血） | 3 | 0 | ref = max(2,1) = 2 → 2 步 | 16 |

### E. UI（最小的两处）

- **关卡结算日志**（`templates:2869` 那段）：一次说清三件事 ——
  `第 3 关通过！本关失血 3/14（基准 6）→ 经验 +16（16/36）。`
  升级时追加一行 `⭐ 升级！Lv.2 → …`（沿用现有文案）。
- **角色卡等级旁加经验条**（`templates:1033` 的 `hero-lv-gold`）：`Lv.N` 下面一条 3px 细进度条，宽 = `xp / XP_TABLE[heroLevel]`，方形、无圆角（遵守 ISSUE-09 的「方形=信息」）。
- **开局规则说明**（`templates:829`）必须改写，不能再写「每 3 关提升 1 级」，改成「通关得经验，本关掉血越少经验越多，经验满即升级」。第 830 行的**敌人**成长说明保持原样（敌人仍按 3 关升级）。

---

## 涉及区域

| 位置 | 要动的东西 |
|---|---|
| `src/data/constants.js` | 新增上表 7 个常量（文件末尾） |
| `src/rules/buffs.js` | 新增 `let xp = 0;` / `let pendingLevelUps = 0;` / `let levelStartHp = 0;`（+ 可选 `levelActions` 仅供日志） |
| `src/rules/reset.js` | 上述变量在开局重置时清零（`heroLevel = 1` 旁边） |
| `templates/game.html` ~750 `initLevel()` | `player = createPlayerUnit(...)` 之后 `levelStartHp = player.hp;`（顺带 `levelActions = 0`） |
| `templates/game.html` 1750 `confirmAction()` | 可选：`levelActions++`，**只用于日志，不参与经验计算** |
| `templates/game.html` 2837–2875 `onLevelClear()` | 华法琳吸血迹之后取 `endHp`、算 `hpLoss` / `xpGain`、判升级、写日志；`willLevelUp` 改读 `pendingLevelUps > 0` |
| `templates/game.html` 2904 `openLevelUp()` | 消费 `pendingLevelUps`；`heroLevel += 1` 与 `xp -= XP_TABLE[...]` 已在结算段做过，这里只负责数值与奖励弹窗；奖励选完若 `pendingLevelUps > 0` 再递归弹下一次 |
| `templates/game.html` 1331–1357 `renderControls()` | LEVELCLEAR 文案：`levelUpPending` 分支改写；未升级分支补「本次未升级，经验 X/Y」 |
| `templates/game.html` 1033 / 卡片 CSS | 经验条 |
| `templates/game.html` 829 | 规则说明文案 |
| `src/data/enemies.js` | **不许动**。`LEVELUP_EVERY_N_LEVELS` 继续只服务敌人成长 |

---

## 硬约束 / 已知坑

1. **禁止修改 `LEVELUP_EVERY_N_LEVELS = 3`**。它同时驱动 `computeEnemyGrowth()` 的 HP 加成与 `eLv` 显示；改了等于 22 关所有敌人同时变强/变弱，整个平衡基线与 `RUN_SEED` 可复现性一起报废。玩家侧只是**不再引用**它。
2. **`levelStartHp` 必须取 `player.hp` 且时机在 `createPlayerUnit()` 之后**：`playerStats.currentHp` 是跨关持久值，`initLevel` 里先夹取上限、再 `createPlayerUnit` 把值抄进 `player.hp`；提前取会读到上一关的旧值或在 `<=0 → maxHp` 兜底之前的值。
3. **`endHp` 必须在华法琳吸血迹之后取**（`onLevelClear()` 内的 `if (selectedChar === 'vampire' && bloodDrops.length > 0)` 块之后）。取在前面会让华法琳每关白掉 2×血迹数的血，等于惩罚她的角色特性。
4. **结算顺序**：华法琳血迹结算 → 取 `endHp` → 算经验 / 判升级 → `phase = PHASE.LEVELCLEAR` → `render()`。经验写在 `render()` 之后，日志会出现「先看到血量、后看到原因」的错位。
5. **`enemies.js:159` 的注释**（「与角色 openLevelUp 完全同构」）在本次改动后**不再成立**，实现时要连注释一起改，否则下一个读代码的人会以为两边还同构。
6. **不要动 `playerStats.prof = 4 + max(0, heroLevel - 1)`**：升级节奏变化会让 prof 更早 +1，这是预期副产物，公式本身不动。
7. **重开 / 二周目**：`xp`、`pendingLevelUps`、`levelStartHp` 必须进 `reset.js`，漏一个就会「二周目带经验开局」。
8. **`levelUpPending` 的旧布尔语义要清干净**：`renderControls()` 和 `setTimeout(() => openLevelUp(), 600)` 两处都读它；改成计数后，`if (levelUpPending)` 会把 `0` 当 `false`、`2` 当 `true` 但只弹一次，需逐处改成 `pendingLevelUps > 0`。
9. **加点即时加 HP 不影响本关经验**：`allocateAbilityPoint()` 在 LEVELCLEAR 阶段会因体质变化 `player.hp += diff`（`1288`）。经验必须在通关瞬间（进入 LEVELCLEAR 之前）算完并冻结，不能延后到加点之后再算，否则玩家加体质能给自己刷经验。
10. **负失血必须夹到 0**（用户明确要求）：净回血会让 `levelStartHp - endHp` 变负，`hpLoss` 一律 `max(0, …)`。不夹的后果不只是「给负经验」——`efficiency = ref - hpLoss` 会超过 `ref`，经验突破 24 上限，保底/上限两条算术保证同时失效。写完后用「先被打到 1 HP 再连吃两个 ❤️」的用例验证一次。
11. **升级回满血保留，且不参与本关经验计算**（用户 17:05 确认）：`openLevelUp()` 由 `setTimeout(..., 600)` 在两关之间触发，比 `onLevelClear()` 里的经验结算晚；回满血只改变**下一关**的 `levelStartHp` 与 `ref`。**不允许**为了「统一血量口径」而把经验结算挪到 `openLevelUp()` 之后——那样升级回满会先把 `endHp` 抬到 `maxHp`，失血归零，每关白送满效率。

---

## 验收标准

- [ ] **保底断言**：连续通关 3 关（无论怎么打，含每关挨满）→ 第 1、2 关结束时 `heroLevel === 1`，第 3 关结算后 `heroLevel === 2`。
- [ ] **上限断言**：连续两关零失血 → 第 2 关结算后 `heroLevel === 2`；任何打法下第 1 关结束时都不可能升级（单关上限 24 < 36）。
- [ ] 单关经验恒在 `[12, 24]`；`hpLoss = max(0, levelStartHp − endHp)`，与结算日志里的数字一致。
- [ ] **关末不回血**：通关后 `currentHp` 与通关瞬间 `player.hp` 完全相等（除升级回满外）；连续两关不动血进关，`initLevel` 前后 HP 不变。
- [ ] **残血不漏经验也不能刷**：带 1 HP 进关且零失血 → 效率按 `ref = max(2, round(1×0.4)) = 2` 计 2 步（不是满 6 步）。
- [ ] **负失血夹零**：关内先被打到 1 HP，再连吃 ≥2 个恢复道具 ❤️ 把血吃回上限 → `levelStartHp - endHp` 为负，但 `hpLoss === 0`、`xpGain === 24`（**不得超过 24**），结算日志显示「失血 0」而非负数。
- [ ] **升级回满不影响本关经验**：某关结算时记下 `xpGain` 与日志里的「失血 / 经验」数字，`openLevelUp()` 回满血后这些值一字不变；下一关 `levelStartHp === maxHp`（`ref` 回到满血基准）。
- [ ] **华法琳口径**：同种子下让她通关时场上有 N 处血迹，`endHp` 包含每处 +2 的回复（日志中的失血 = 实际掉血 − 血迹回复）。
- [ ] 结算日志同时包含：本关失血、失血基准、获得经验、当前经验/阈值。
- [ ] 角色卡 `Lv.N` 旁有经验条，进度与 `xp / XP_TABLE[heroLevel]` 一致，加点触发 `render()` 后不消失。
- [ ] 升级效果不变：HP 上限 +体质加值、回满血、+2 属性点、奖励池 3 选 1 弹窗。
- [ ] 连升 2 级（人为把 XP 调到够两级）时，两次奖励弹窗都能正常走完，不会卡在 `pendingLevelUps` 残留。
- [ ] **敌人零变化**：同一 `RUN_SEED`、同一关、同一 `idx` 的 `computeEnemyGrowth()` 结果（六维 / maxHp / hpBonus）与 `20261028d` 完全一致。
- [ ] 开局规则说明不再出现「每 3 关提升 1 级」的玩家描述；敌人说明保持原样。
- [ ] 重开游戏后 `xp === 0`、`heroLevel === 1`、`pendingLevelUps === 0`。
- [ ] 无新增 JS 报错；单测 24/24、跨关扫描 20/20、布局 14/14 全通过；80 局 AI 试玩 `anom=0 / pageErrors=0 / stalled=0`。
- [ ] **平衡红线**：80 局平均通关关卡由 `0.96` 上升**不超过 1.35**；L1 死亡率不得跌破 35%。若超线，先压 `XP_TABLE[1]` 36 → 40（推迟到第 4 关）或把 `XP_EFF_CAP` 6 → 4。

---

## 备注

### 为什么效率基准挂在「本关开始血量」而不是 `maxHp`

- 挂 `maxHp` 会出现退化玩法：带 1 HP 进关 → 物理上最多只能掉 0~1 血 → 每关都「零失血」→ 永久满效率，反而是残血状态最赚。
- 挂 `levelStartHp` 后，基准随当前血量缩放（下限 2）：残血进关只剩 2 点宽容度，不掉血才拿得到那 2 步。血量健康时基准才高。

### 为什么保留一个恒定下限 12

- 保底升级必须可证明。若经验完全由失血决定，菜鸟（每关挨满）可能长期 0 经验，永远升不了级，与「正常游玩至少第 3 关升级」直接冲突。加法结构（`base + 效率偏移`）保证下限恒定 = 12，于是 `12×3 ≥ 36` 是纯算术。

### 如果希望「行动数」本身也独立计分

- 当前方案里行动数**只进日志、不进公式**（它已经通过「打得快 = 少挨打 = 失血少」间接生效）。若要让「拖时间」也被惩罚，追加一条 `ACT_STEP = clamp(PAR − levelActions, 0, 4) × 1` 经验（`PAR = 6 + 2 × 本关初始敌人数`），同时把 `XP_TABLE[1]` 提到 **40**，否则正常玩家会被推到第 2 关就升级。**默认不做**，除非维护者明确要求。

### 与 ISSUE-09 的交互

- ISSUE-09 把通关流程改成「奖励抽屉 → 属性抽屉」两层。本次升级判定在 `LEVELCLEAR` 之前就把 `pendingLevelUps` 算好，两层抽屉的自动弹出逻辑**不需要再改**，但两边同时实施时要确认：`pendingLevelUps > 0` 时先弹奖励、选完后若 `abilityPoints > 0` 再弹属性——这条顺序不能因为 XP 制而错乱。

### 数值都是可调的

- 上表常量是一组自洽初值，不是最终答案。真正要守住的三条结构性约束：① 单关经验下限 > 0 且恒定 → 保底升级可证明；② `3 × 下限 ≥ XP_TABLE[1]` 且 `XP_TABLE[1] > 单关上限`（否则第 1 关就能升）；③ 效率上限（`XP_EFF_CAP × XP_PER_STEP`）不得超过保底值，否则「零失血」相对「挨满」的收益会大到掩盖角色差异。
