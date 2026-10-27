# `P0.1-4` 剩余 8 区改为「按热度分批」拆分，本轮只搬 mapgen / layout / chrome 三组

- **提出人 / 时间**：WorkBuddy / 2026-10-28 03:40（04:00 按第六批交付重新核对）
- **类型**：docs（工程 / 架构，零玩法改动）
- **优先级**：P1（不阻塞玩家，但每轮发版都在付代价；且是 Godot 复刻的前置）
- **状态**：done（2026-10-28 04:0x 实施完毕，见文末「实施记录」）

## 现状

`P0.1-4` 机械拆分已完成 **7/15 区**（`build/manifest.json` 的 `modules` = **18 个**），
`templates/game.html` = **188,313 B**（`20261028c` 基线）。剩余第 8–15 区仍在模板内，约 3,400 行。

**问题不是"还没拆完"，而是"继续按行号顺序拆会白干"。** 三个事实：

1. **每轮发版都会让已拆部分的基线失效**，必须重新取区对齐，实测每轮 **30–40 分钟**。
   已发生 **4 次**（`20261028a` / `b` / `c` / 第六批按 c 重取）。
2. **第 4 次已经付了真实代价**：03:21 发版时以 03:00 的旧模板为基底改完整文件上传，
   覆盖掉第五批的骨架化 → `manifest.json`（15 模块）与模板（仍含第 6 区）不匹配，
   下次构建会把 `renderUnits` / `findChargeSkillIndex` / `plannedActionInfo` 注入两遍。
   已于 03:35 修复（README v3.6 有完整事故记录）。
3. **`issues/` 里 05（精英词缀）/ 06（遗物事件）/ 07-icon 全部指向第 8–15 区**：
   05 要改回合结算与敌人 AI，06 要往 `levelclear → 事件 → 下一关` 插一层 phase 并改奖励池，
   07-icon 要改 `renderUnits`。**按行号顺序拆 = 拆完立刻被改 = 白拆两遍。**

另一个必须记下的变化：README 新增 **原则 11 / 红线 NB-13 / §10.4 Godot 复刻契约**，
`src/` 现在是 **Godot 正式版的玩法准绳**（对方逐模块对照复刻）。剩余区的重要性上升了，
但"按 NB-13 标准拆"要顺带做命名对齐 + `constants.js` 集中 + `@port` 注释 ——
**这不是纯移动，风险和验证方式都不同，不能和 `P0.1-4` 混在一批。**

## 期望

把"按行号顺序拆"改成**按"谁会改"拆**：只拆大概率不再变动的区，等玩法定型后再拆热区。

判断标准（可量化）：**一个区拆完之后，只要还能撑过 1.5 轮发版（约 45–60 分钟的重取区成本），就是收益。**
低热度区能撑很多轮；高热度区撑不过 1 轮。

### 本轮范围：3 个新模块（全部纯移动）

| 新模块 | 内容 | 区间（188,313 B 模板） | 会被谁改 |
|---|---|---|---|
| `src/rules/mapgen.js` | `bfsReachable` / `growRegion`（含内部 `scoreOf`/`openCell`）/ `smoothRegion` / `clearSpawnArea` / `countWalkable` / `placeObstacles` / `generateMap` | **701–928**（至 `initLevel` 前） | 都不碰 |
| `src/ui/layout.js` | 地图高度比例拖动：`gameEl` / `MAP_V_KEY` / `mapVRatio` / `vGameBox` / `vMapBounds` / `applyMapVHeight` / `syncMapVHeight` / `clearMapVHeight` / `sideDragging` 等状态 / `endSideDrag`；**另加**布局模式段 `LAYOUT_KEY` / `currentLayout` / `setLayout` / `initLayoutMode` IIFE | **1078–1161** + **3382–3428**（两段，实际边界，见实施记录） | 都不碰 |
| `src/ui/chrome.js` | 日志面板 DOM ref + `LOG_POS_KEY` / `setOpenBtn` / `clampLogPanelPos` / `setSettingsOpen` / `bindLogDrag` IIFE / `setHomeBtn`；**另加** `patchDLCChrome` IIFE（隐藏外壳 `#btnHome`、劫持 `showHint`、`#ghint` 同步） | **3268–3380** + **3893–3959**（两段，实际边界，见实施记录） | 都不碰 |

`modules` 将从 18 增至 **21**，`templates/game.html` 预计由 188,313 B 降至约 168 KB 量级。

### 明确留到后续的（不要在本轮动）

| 档 | 内容 | 等谁 |
|---|---|---|
| 🟡 中 | 关卡流程与升级：`initLevel` / `finishLevel` / `openLevelUp` / `clearLevelUpOverlay` / 奖励池 | 06（事件要插 phase、加遗物奖励） |
| 🔴 高 | 回合结算与敌人 AI：`resolveTurn` / 敌人近战·远程 / 相杀 / 追击 | 05（改结算） |
| 🔴 高 | 渲染与交互：`renderUnits`（在 `src/ui/units.js`）、`buildBoardHtml` / `updateCellSize` / `logEnemyMainDirections`、动作节点与路径规划 | 07-icon |

⚠️ **特效层（`floatText` / `ringFx` / `slashFx` / `hitFlashCell` / `hitFx` / `missFx` / `getLiveCenter`）
已由第六批搬入 `src/ui/board-fx.js`**，与本 issue 原设想一致（甚至更完整，连 `getCellEl` /
`hasLineOfSight` / 箭头也一起带走了）。本 issue 不重复处理。

## 涉及区域

`templates/game.html`（3 组代码搬出，其中两组各含 2 段）+ `build/manifest.json`（+3 项）+ 新增 3 个 `src/` 模块。
**不碰** `game.html` 的任何玩法逻辑，**不碰** `src/data/*` 与其余 `src/rules/*`、`src/net/*`。

## 验收标准

- [x] `node build/bundle.mjs --prev game.html` 归一化后与搬运前**完全一致**（纯移动，除模块来源注释头外不应有任何差异）
- [x] 3 个新模块的每个函数在产物 `game.html` 中各出现 **1** 次，在 `templates/game.html` 中各出现 **0** 次
- [x] `build/manifest.json` 的 `modules` 长度 = 21，顺序仍等于拆分前的代码出现顺序
- [x] e2e 六套件全绿：`dom_load` 23 / `pvp_core` 20 / `pvp_e2e` 16 / `pvp_browser` 16 / `hook_integration` 8 + 联机 client
- [x] `build/bundle_test.mjs` 34 项与 `net/push_guard_test.py` 10 项全绿
- [x] 竖屏 390×844：拖动 `#dragHandle` 仍改地图高度，`localStorage['ark_map_v_ratio']` 正常读写，旋屏后比例保留
- [x] 横屏 / 竖屏切换（`setLayout`）正常，`localStorage['ark_layout']` 正常
- [x] DLC 外壳下：设置面板按钮像素位置在展开/收起前后不变；`#ghint` 无文字时不渲染空胶囊、不压标题栏；外壳 `#btnHome` 仍被隐藏
- [x] 产物与上一版字节差 < 2%（`AC-01`）
- [x] 全程 `anom=0` / `pageErrors=0`（autotest 抽测 1–2 局即可，纯移动不需要 80 局平衡回归）

## 备注

- **本批严格遵循 `P0.1-4` 原则 1「纯移动，不改逻辑」**，不做 NB-13 的命名对齐、不把魔法数字搬进 `constants.js`。
  理由：混两件事会让"归一化后完全一致"这个唯一可靠的等价性判据失效。NB-13 对齐另开一批（建议 `P0.1-4` 全拆完之后）。
- **唯一的高风险点**：`layout` 与 `chrome` 各是**两段不连续代码**，是本批最容易漏的地方。
  搬完必须逐段核对原文已从模板删除 —— 漏删就是重复声明（见 README v3.6 事故，`function` 重复静默覆盖、`let/const` 重复直接 SyntaxError）。
  建议做法：搬完先跑 `grep -c "^function <name>"` 核对每个函数在模板中为 0、在产物中为 1，再构建。
- **开工前必做**：先 `GET build/manifest.json` 确认 `modules` 长度仍是 18（若队友已推进第 7 批，先重新取区对齐再动手）。
  **不要用 `templates/game.html` 字节数判断进度** —— 03:21 的事故正是因为这一点。
- **本 issue 不解决**：发布链路仍是整文件 PUT，"产物层面并发覆盖"的风险拆完依然存在。
  真正的并发保护需要在 `net/push_api.py` 里做按模块比对，不在本 issue 范围。
- 人类维护者 2026-10-28 03:40 已确认此分级方案（「就按照你的说法」）。
- 相关：`ISSUE-20261028-05-elite-affixes.md`（ready）、`ISSUE-20261028-06-relics-and-events.md`（ready）、`ISSUE-20261028-07-icon-system.md`（P2）。


---

## 实施记录（2026-10-28 04:0x，WorkBuddy）

### 关键发现：本 issue 原方案在当前构建下**跑不通**

issue 写的「3 组代码搬出，其中两组各含 2 段」隐含了一个前提：构建能把**不同模块注入到不同位置**。
实际 `build/bundle.mjs` 当时只有**一个占位符、且位于模板最前**，于是：

- 把两段拼进一个模块再整体注入 → 第二段会在**模板剩余代码之前**执行。
  `layout` 第 2 段一开始就 `logRotateBtn.addEventListener(...)`，而 `const logRotateBtn` 在 `chrome` 段里、
  `const dragHandle` 在模板 1046 行 —— 都在注入点之后 → **TDZ ReferenceError，页面白屏**。
- 归一化比对**看不出来**（文本等价），`dom_load_test` 才可能撞上；而 `dom_load` 只测初始化，
  若报错发生在初始化后则更难察觉。
- 只拆「从前往后的连续段」又正好是热区（第 8 区起），与本 issue 目的相反。

### 因此先做前置改造：构建支持多点注入

| 文件 | 改动 |
|---|---|
| `build/bundle.mjs` | `splitBySlot()` + `inlineModules()` 支持模块内 `/* @slot:<id> */` 分段，各段落到模板 `<!-- @inject:scripts:<id> -->`。**跨槽顺序由模板位置决定**（求值顺序不变），同槽内 = 清单顺序；槽位缺失 / 模板残留标记均抛错 |
| `build/verify.mjs` | 新增 `checkNoInjectionMarkers`（第 6 项校验） |
| `build/bundle_test.mjs` | 38 → **48 项**（切段、空段丢弃、行内提及不误判、残留标记判红/判绿） |
| `net/layout_chrome_test.mjs` | **新增 38 项**，覆盖本 issue 的 3 项 UI 验收（横竖切换 / 竖版拖拽比例 / DLC 外壳 iframe 接管） |

### 实际取区（与 issue 原区间不同，均按语义边界）

| 模块 | issue 原写 | **实际** | 差异原因 |
|---|---|---|---|
| `rules/mapgen.js` | 701–928 | **701–927** | 928 是空行，留给模板做分隔 |
| `ui/layout.js` 段 1 | 1087–1162 | **1078–1161** | `gameEl` / `MAP_V_KEY` / `mapVRatio` 在 1079-1081，按 1087 起会把这些顶层 `const` 留在模板，搬走的函数却要用 |
| `ui/layout.js` 段 2 | ~3366–3445 | **3382–3428** | 3366 一带仍是「重开」按钮，属 chrome；3445 之后是 PvP 区 |
| `ui/chrome.js` 段 1 | 3269–3368 | **3268–3380** | `setHomeBtn` 被 issue 列为 chrome 内容，但区间写在 3368 截止 —— 延到 3380 把「重开」「主页」两个监听一起带走 |
| `ui/chrome.js` 段 2 | 3897–文件尾 | **3893–3959** | 只搬 `patchDLCChrome` 与其文档注释；**文件尾的 `initCharSelect()` / `pvpInjectUI()` 是启动入口，不能搬** |

### 结果

- `modules` 18 → **21**；`templates/game.html` 188,313 B → **166,663 B**（−21,650 B / 3,432 行）。
- 产物 272,787 vs 272,067 B = **+720 B（0.26%）**，归一化后与基线**完全一致**。
- 21 个关键函数/常量：产物各 **1** 次、模板各 **0** 次。
- e2e 六套件 + 新增 `layout_chrome_test` 38 项 + `bundle_test` 48 项 + `push_guard` 10 项全绿。
- 根目录 `game.html` **未改动**（272,067 B / `959b59d2`）。

### 遗留

- 热区仍按 issue 的分级等 05/06/07：`initLevel`/`finishLevel`/`openLevelUp`、`resolveTurn` 与敌人 AI、`renderUnits`。
- 多点注入让「跳段拆」成为常规能力，后续每批都可用槽位，不必再受「只能从头拆」限制。
