# 升级机制改为经验制：行动数越少，关末失血越少、经验越多；保证第 3 关必升 1 级

<!--
本文件只是需求，不要顺手去改 game.html（README §0.0 铁律）。
等人类维护者说「版本更新」时才会按 issues/ 里的条目一次性实施，完工后删除本文件。
-->

- **提出人 / 时间**：用户 / 2026-10-28 16:48
- **类型**：balance（附带少量 ui：经验条 + 结算日志）
- **优先级**：P1 明显影响体验（改变整条成长曲线，所有平衡基线作废）
- **状态**：ready

---

## 现状

1. **升级是「每 3 关固定升 1 级」**：`src/rules/buffs.js:6` `LEVELUP_EVERY_N_LEVELS = 3`，`templates/game.html:2868` `const willLevelUp = clearedLevel % LEVELUP_EVERY_N_LEVELS === 0;`。玩家打得好打得烂，第 3/6/9 关通关时都一样升级，**没有任何「效率」概念**。
2. **没有经验值这个东西**：全库没有 `xp` / `exp` 字段，等级只由 `heroLevel` 表示（`src/rules/buffs.js:7`，初始 1，`reset.js:25` 重置为 1）。
3. **关卡之间没有任何恢复**：`initLevel` 里只有 `currentHp = min(currentHp, maxHp)`（`templates/game.html:749`），血量**原样带到下一关**。唯一回满血的时机是升级（`openLevelUp()` 里 `playerStats.currentHp = playerStats.maxHp`）。
4. **升级效果**（`openLevelUp()`，`templates/game.html:2904`）：`heroLevel += 1` → HP 上限 += `max(0, abilityMod(con))`（累计进 `levelHpBonus`）→ 回满血 → `abilityPoints += 2` → 弹奖励池 3 选 1（`showLevelUpOverlay`）。
5. **`LEVELUP_EVERY_N_LEVELS` 被敌人成长共用**：`src/data/enemies.js:160` 用它算「每 3 关敌人 HP 上限 + 体质加值」，`templates/game.html:820` 用它显示敌人等级。**动这个常量 = 22 关所有敌人同时变形。**

---

## 期望

### A. 「行动数」的定义（先定死口径）

- **行动数 = 本关点了几次「开始行动」**，即 `confirmAction()` 成功进入结算的次数（含闪避 / 等待 / 攻击 / 技能各种回合）。
- 计数用**独立变量** `levelActions`，在 `initLevel()` 里清零、在 `confirmAction()` 里 `++`。**不许用 `battleRound` 反推**（PVP、异常重入、`resolveStep` 分段都会让回合号与实际确认次数不一致）。
- PVP 模式不计入（`pvpSubmitPlan()` 那条分支直接 return，本来就到不了 `++`）。

### B. 关末「休整结算」：行动越少，失去的血量越少

通关时先做一次血量结算，再进下一关：

```
regenRaw = (PAR - levelActions) + 1
regen    = clamp(regenRaw, -REGEN_TAX_MAX, REGEN_CAP)
currentHp = clamp(currentHp + regen, 1, maxHp)
```

- `PAR = XP_PAR_BASE + XP_PAR_PER_ENEMY × levelEnemyCount`（本关**初始**敌人数量，`initLevel` 里的 `numEnemies`）
- `REGEN_TAX_MAX = 4`（最多倒扣 4 点）、`REGEN_CAP = 6`（最多回 6 点）
- 直白说：**比基准少 1 次行动 = 关末多回 1 HP；比基准多 1 次 = 少回 1 HP，最多倒扣 4 点。**
- 保底：`currentHp` 不得低于 1（通关结算不该把玩家结算死）。
- 必须先算休整、再走升级（升级会回满血，顺序反了就看不出休整的意义）。

### C. 经验与升级

**每关经验**：

```
xpGain = XP_CLEAR_BASE + clamp((PAR - levelActions) × XP_EFF_PER_STEP, 0, XP_EFF_CAP)
```

**升级判定**（通关时，`pendingLevelUps` 记录待升次数）：

```
while (pendingLevelUps < 3 && xp >= XP_TABLE[heroLevel]) {
  xp -= XP_TABLE[heroLevel];
  heroLevel += 1;
  pendingLevelUps += 1;
}
```

- `XP_TABLE[heroLevel]` = 从当前等级升到下一级所需经验；`heroLevel` 超出表长时按表尾 +100 递增。
- 一次通关最多连升 3 级（防死循环）；升级效果完全沿用现有 `openLevelUp()`（HP 上限 + 体质加值、回满血、+2 属性点、奖励 3 选 1），**每个待升级都要各弹一次**。
- **玩家升级与 `LEVELUP_EVERY_N_LEVELS` 彻底解耦**：`willLevelUp` 不再看关卡号，只看向 `pendingLevelUps > 0`。

**常量（新增在 `src/data/constants.js`，不要复用敌人那套）**：

| 常量 | 值 | 说明 |
|---|---|---|
| `XP_CLEAR_BASE` | 13 | 每关保底经验 |
| `XP_EFF_PER_STEP` | 2 | 比基准少 1 次行动 → +2 XP |
| `XP_EFF_CAP` | 12 | 效率加成封顶 |
| `XP_PAR_BASE` | 6 | 基准行动数 = 6 + 2 × 本关敌人数 |
| `XP_PAR_PER_ENEMY` | 2 | |
| `XP_TABLE` | `[0, 36, 64, 98, 140, 190, 250, 320, 400, 500]` | 下标=当前等级，值=升到下一级所需 |
| `REGEN_TAX_MAX` | 4 | 关末最多倒扣 |
| `REGEN_CAP` | 6 | 关末最多回复 |

**算例**（L1 敌人数 3 → PAR 12；L3 敌人数 4 → PAR 14）：

| 关 | 行动数 | 效率加成 | 本关经验 | 关末回血 |
|---|---|---|---|---|
| L1 | 4（高效） | (12−4)×2=16 → 上限 12 | 25 | +6（封顶） |
| L1 | 8（正常） | 8 | 21 | +5 |
| L1 | 12（=基准） | 0 | 13 | +1 |
| L1 | 16（磨蹭） | 0 | 13 | −3 |
| L1 | 22（极慢） | 0 | 13 | −4（封顶） |

### D. 「至少第 3 关能升级」是结构性保证，不依赖玩家水平

- 单关经验下限 = `XP_CLEAR_BASE` = **13**（哪怕行动数拉满，效率加成为 0）。
- 3 关保底 = `13 × 3 = 39` ≥ `XP_TABLE[1] = 36` → **通关第 3 关时必定升到 Lv.2**，与打得好不好无关。
- 上限侧：2 关最多 `(13 + 12) × 2 = 50` > 36 → 高效玩家（每关 ≤4 次行动）可以在**第 2 关**就升；第 1 关不可能升级（最多 25 < 36）。
- 若维护者希望「最早也只能第三关升」，把 `XP_TABLE[1]` 提到 **52** 即可（2 关最多 50 < 52），其余不动。

### E. UI（最小的两处）

- **关卡结算日志**（`templates/game.html:2869` 那段）：一次说清四件事 ——
  `第 3 关通过！行动 8 次（基准 14）→ 经验 +21（21/36），休整 +5 HP (7/12)。`
  升级时追加一行：`⭐ 升级！Lv.2 → …`（沿用现有文案）。
- **角色卡等级旁加经验条**（`templates/game.html:1033` 的 `hero-lv-gold`）：`Lv.N` 下面一条 3px 细进度条，宽 = `xp / XP_TABLE[heroLevel]`，方形、无圆角（遵守 ISSUE-09 的「方形=信息」）。
- **开局规则说明**（`templates/game.html:829`）必须改写，不能再写「每 3 关提升 1 级」；第 830 行的**敌人**成长说明保持原样（敌人仍按 3 关升级）。

---

## 涉及区域

| 位置 | 要动的东西 |
|---|---|
| `src/data/constants.js` | 新增上表 8 个常量（放文件末尾，加注释标明「玩家经验制，ISSUE-10」） |
| `src/rules/buffs.js` | 新增 `let xp = 0;` / `let pendingLevelUps = 0;` / `let levelActions = 0;` |
| `src/rules/reset.js` | 三者在开局重置时清零（`heroLevel = 1` 旁边） |
| `templates/game.html` ~729 `initLevel()` | `levelActions = 0`；新增 `levelEnemyCount = numEnemies`（本关初始敌人数，供 PAR 用） |
| `templates/game.html` 1750 `confirmAction()` | 在 `phase = PHASE.RESOLVING` 之后 `levelActions++` |
| `templates/game.html` 2868–2880（通关段） | 换成 B + C 的结算：先休整回血、再算 XP、再判升级、写日志 |
| `templates/game.html` 2904 `openLevelUp()` | `levelUpPending` 改为消费 `pendingLevelUps`；`heroLevel += 1` 与 `xp -= XP_TABLE[...]` 已在结算段做过，这里只负责数值与奖励弹窗 |
| `templates/game.html` 1331–1357 `renderControls()` | LEVELCLEAR 文案：`levelUpPending` 分支改写；未升级分支提示补一句「本次未升级，经验 X/Y」 |
| `templates/game.html` 1033 / 卡片 CSS | 经验条 |
| `templates/game.html` 829 | 规则说明文案 |
| `src/data/enemies.js` | **不许动**。`LEVELUP_EVERY_N_LEVELS` 继续只服务敌人成长 |

---

## 硬约束 / 已知坑

1. **禁止修改 `LEVELUP_EVERY_N_LEVELS = 3`**。它同时驱动 `computeEnemyGrowth()` 的 HP 加成与 `eLv` 显示；改了等于 22 关所有敌人同时变强/变弱，整个平衡基线与 `RUN_SEED` 可复现性一起报废。玩家侧只是**不再引用**它。
2. **`levelEnemyCount` 必须在 `initLevel()` 里存**，不能到通关时再读 `enemies.length` —— 那时敌人已经被 `filter(e => e.alive)` 干掉过，读到的是 0。
3. **结算顺序**：休整回血 → 经验/升级判定 → `phase = LEVELCLEAR` → `render()`。回血写在 `render()` 之后，日志会出现「先看到血量变化、后看到原因」的错位。
4. **`enemies.js:159` 的注释**（「与角色 openLevelUp 完全同构」）在本次改动后**不再成立**，实现时要连注释一起改，否则下一个读代码的人会以为两边还同构。
5. **不要动 `playerStats.prof = 4 + max(0, heroLevel - 1)`**：升级节奏变化会让 prof 更早 +1，这是预期的副产物，但公式本身不动。
6. **重开 / 二周目**：`xp`、`pendingLevelUps`、`levelActions` 必须进 `reset.js`，漏一个就会「二周目带经验开局」。
7. **`levelUpPending` 的旧布尔语义要清干净**：`renderControls()` 和 `setTimeout(() => openLevelUp(), 600)` 两处都读它；改成计数后，`if (levelUpPending)` 这种写法会把 `0` 当 `false`、`2` 当 `true` 但只弹一次，需要逐处改成 `pendingLevelUps > 0`。
8. **XP 结算必须在 `level += 1` 之前还是之后？** 必须在 `const clearedLevel = level;` 之后、`level += 1` 之前取 PAR（PAR 依赖 `levelEnemyCount`，与 `level` 无关，但日志里的「第 N 关」要用 `clearedLevel`）。

---

## 验收标准

- [ ] **保底断言**：每关都拖到 30 次行动（经验恒为下限 13）连续通关 3 关 → 第 1、2 关结束时 `heroLevel === 1`，第 3 关结算后 `heroLevel === 2`。
- [ ] **上限断言**：每关 ≤4 次行动（高效打法）时，第 2 关结算后可达 `heroLevel === 2`；任何打法下第 1 关结束时都不可能升级（单关经验上限 25 < 36）。
- [ ] 单关经验恒在 `[13, 25]` 区间；`levelActions` 每点一次「开始行动」+1，一次回合只 +1。
- [ ] 关末回血符合公式：L1 行动 8 次（PAR 12）→ `+5 HP`；行动 22 次 → `−4 HP`；全程 HP 不低于 1、不高于 `maxHp`。
- [ ] 结算日志同时包含：本关行动数、基准行动数、获得经验、当前经验/阈值、休整 HP 变化。
- [ ] 角色卡 `Lv.N` 旁有经验条，进度与 `xp / XP_TABLE[heroLevel]` 一致，加点触发 `render()` 后不消失。
- [ ] 升级效果不变：HP 上限 +体质加值、回满血、+2 属性点、奖励池 3 选 1 弹窗。
- [ ] 连升 2 级（人为把 XP 调到够两级）时，两次奖励弹窗都能正常走完，不会卡在 `pendingLevelUps` 残留。
- [ ] **敌人零变化**：同一 `RUN_SEED`、同一关、同一 `idx` 的 `computeEnemyGrowth()` 结果（六维 / maxHp / hpBonus）与 `20261028d` 完全一致。
- [ ] 开局规则说明不再出现「每 3 关提升 1 级」的玩家描述；敌人说明保持原样。
- [ ] 重开游戏后 `xp === 0`、`heroLevel === 1`、`pendingLevelUps === 0`。
- [ ] 无新增 JS 报错；单测 24/24、跨关扫描 20/20、布局 14/14 全通过；80 局 AI 试玩 `anom=0 / pageErrors=0 / stalled=0`。
- [ ] **平衡红线**：80 局平均通关关卡由 `0.96` 上升**不超过 1.35**；L1 死亡率不得跌破 35%（跌破说明休整回血把前期压力抹平了）。若超线，优先把 `REGEN_CAP` 6 → 4、`XP_EFF_CAP` 12 → 8。

---

## 备注

### 为什么把「效率」做成加法而不是乘法

- 加法（`base + 效率加成`）保证**经验下限恒为 13**，于是「第 3 关必升」是纯算术保证，不需要玩家会玩。改成乘法或纯效率制，菜鸟可能永远升不了级，这与「正常游玩至少第 3 关升级」直接冲突。

### 与 ISSUE-09 的交互

- ISSUE-09 把通关流程改成「奖励抽屉 → 属性抽屉」两层。本次升级判定会在 `LEVELCLEAR` 之前就把 `pendingLevelUps` 算好，两层抽屉的自动弹出逻辑**不需要再改**，但两边同时实施时要确认：`pendingLevelUps > 0` 时先弹奖励、选完后若 `abilityPoints > 0` 再弹属性——这条顺序不能因为 XP 制而错乱。

### 数值都是可调的

- 上表常量是一组自洽的初值，不是最终答案。真正需要守住的是三条结构性约束：① 单关经验下限 > 0 且恒定 → 保底升级可证明；② 效率加成的斜率（2 XP / 行动）要足够大到「少 3 次行动有明显感知」；③ 关末回血上限 ≤ 6，否则升级回满血的设计意义被稀释。
