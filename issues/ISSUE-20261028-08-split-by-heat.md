# `P0.1-4` 剩余 9 区改为「按热度分批」拆分，本轮只搬 4 组低热度代码

- **提出人 / 时间**：WorkBuddy / 2026-10-28 03:40
- **类型**：docs（工程 / 架构，零玩法改动）
- **优先级**：P1（不阻塞玩家，但每轮发版都在付代价；且是 Godot 复刻的前置）
- **状态**：ready

## 现状

`P0.1-4` 机械拆分已完成 **6/15 区**（15 个模块，`build/manifest.json` 的 `modules` 长度），
第 7–15 区仍在 `templates/game.html` 内（当前 205,408 B）。

**问题不是"还没拆完"，而是"继续按行号顺序拆会白干"。** 三个事实：

1. **每轮发版都会让已拆部分的基线失效**，必须重新取区对齐。实测每轮耗时 **30–40 分钟**。
   已发生 3 次：`20261028a`、`20261028b`、`20261028c`。
2. **第 3 次已经付了真实代价**：03:21 发版时以 03:00 的旧模板（12 模块期）为基底改完整文件上传，
   覆盖掉第五批 03:05 的骨架化 → `manifest.json`（15 模块）与模板（仍含第 6 区）不匹配，
   下次构建会把 `renderUnits` / `findChargeSkillIndex` / `plannedActionInfo` 注入两遍。
   已于 03:35 修复（README v3.6 有完整事故记录）。
3. **`issues/` 里的 05（精英词缀）/ 06（遗物事件）/ 07-icon 全部指向第 7–15 区**：
   05 要改回合结算与敌人 AI，06 要往 `levelclear → 事件 → 下一关` 插一层 phase，
   07-icon 要改 `renderUnits`。**按行号顺序拆 = 拆完立刻被改 = 白拆两遍。**

另一个必须记下的变化：README 新增 **原则 11 / 红线 NB-13 / §10.4 Godot 复刻契约**，
`src/` 现在是 **Godot 正式版的玩法准绳**（对方逐模块对照复刻）。这让剩余区的重要性上升，
但同时意味着"按 NB-13 标准拆"要顺带做命名对齐 + `constants.js` 集中 + `@port` 注释 ——
**这不是纯移动，风险和验证方式都不同，不能和 `P0.1-4` 混在一批。**

## 期望

把"按行号顺序拆"改成**按"谁会改"拆**：只拆大概率不再变动的区，等玩法定型后再拆热区。

判断标准（可量化）：**一个区拆完之后，只要还能撑过 1.5 轮发版（约 45–60 分钟的重取区成本），就是收益。**
低热度区能撑很多轮；高热度区撑不过 1 轮。按此分三档：

| 档 | 内容 | 参考位置（205,408 B 模板） | 会被谁改 | 结论 |
|---|---|---|---|---|
| 🟢 低 | 特效层 | 813–928（`floatText`/`floatTextAt`/`ringFx`/`slashFx`/`getLiveCenter`/`hitFlashCell`/`hitFx`/`missFx`） | 都不碰 | **本批就拆** |
| 🟢 低 | 地图生成 | 1135–1362（`bfsReachable`/`growRegion`/`smoothRegion`/`clearSpawnArea`/`countWalkable`/`placeObstacles`/`generateMap`，至 `initLevel` 前） | 都不碰 | **本批就拆** |
| 🟢 低 | 布局与地图高度拖动 | 1513–1596（`gameEl`/`MAP_V_KEY`/`mapVRatio`/`vGameBox`/`vMapBounds`/`applyMapVHeight`/`syncMapVHeight`/`clearMapVHeight`/`sideDragging` 等状态/`endSideDrag`） | 都不碰 | **本批就拆** |
| 🟢 低 | 设置面板 + 日志面板壳 + 跨帧补丁 | 3703–3760（日志面板 DOM ref/`clampLogPanelPos`/`setSettingsOpen`/`bindLogDrag`）、3804–3830（`setHomeBtn`/`LAYOUT_KEY`/`currentLayout`/`setLayout`）、4327–4400（`patchDLCChrome` IIFE） | 都不碰 | **本批就拆** |
| 🟡 中 | 关卡流程与升级 | `initLevel` / `finishLevel` / `openLevelUp` / `createPlayerUnit` / `clearLevelUpOverlay` | 06 要插事件 phase、加遗物奖励 | 等 06 |
| 🔴 高 | 回合结算与敌人 AI | `resolveTurn` / 敌人近战·远程攻击 / 相杀 / 追击 | 05 改结算、06 可能改 | 等 05 |
| 🔴 高 | 单位渲染与交互 | `renderUnits`（已拆到 `src/ui/units.js`）、`buildBoardHtml` / `updateCellSize`、动作节点与路径规划 | 07-icon 改渲染 | 等 07-icon |

**本批目标模块（4 个，全部纯移动）**

| 新模块 | 内容 | 插入 manifest 位置 |
|---|---|---|
| `src/ui/fx.js` | 8 个特效函数 | 紧跟 `src/ui/units.js` 之后（原出现位置之前） |
| `src/rules/mapgen.js` | 7 个地图生成函数 | `src/ui/radar.js` 之后、`src/rules/path.js` 之前 |
| `src/ui/layout.js` | 地图高度比例拖动整套（含 `localStorage['ark_map_v_ratio']`） | `src/ui/units.js` 之后 |
| `src/ui/chrome.js` | 设置面板 / 日志面板壳 / 首页按钮 / `patchDLCChrome` | manifest 末尾（原位置在模板尾部） |

`modules` 将从 15 增至 19，`templates/game.html` 预计由 205,408 B 降至约 180 KB 量级。

## 涉及区域

`templates/game.html`（4 段代码搬出）+ `build/manifest.json`（+4 项）+ 新增 4 个 `src/` 模块。
**不碰** `game.html` 的任何玩法逻辑，**不碰** `src/data/*` / `src/rules/dnd|path|actions|sp|state|buffs` / `src/net/*`。

## 验收标准

- [ ] `node build/bundle.mjs --prev game.html` 归一化后与搬运前**完全一致**（含注释差异也应为 0，纯移动不新增注释头以外的内容）
- [ ] 4 个新模块的每个函数在产物 `game.html` 中各出现 **1** 次，在 `templates/game.html` 中各出现 **0** 次
- [ ] `build/manifest.json` 的 `modules` 长度 = 19，且顺序仍等于拆分前的代码出现顺序
- [ ] e2e 六套件全绿：`dom_load` 23 / `pvp_core` 20 / `pvp_e2e` 16 / `pvp_browser` 16 / `hook_integration` 8 + 联机 client
- [ ] `build/bundle_test.mjs` 34 项与 `net/push_guard_test.py` 10 项全绿
- [ ] 竖屏 390×844：拖动 `#dragHandle` 分隔条仍能改地图高度，`localStorage['ark_map_v_ratio']` 正常读写，旋屏后比例保留
- [ ] DLC 外壳下：设置面板按钮像素位置在展开/收起前后不变；`#ghint` 无文字时不渲染空胶囊、不压标题栏
- [ ] 产物与上一版字节差 < 2%（`AC-01`）
- [ ] 全程 `anom=0` / `pageErrors=0`（autotest 抽测 1 局即可，纯移动不需要跑 80 局平衡回归）

## 备注

- **本批严格遵循 `P0.1-4` 原则 1「纯移动，不改逻辑」**，不做 NB-13 的命名对齐、不把魔法数字搬进 `constants.js`。
  理由：混两件事会让"归一化后完全一致"这个唯一可靠的等价性判据失效。NB-13 对齐另开一批（建议在 `P0.1-4` 全拆完之后）。
- **两个已知风险点**：
  1. `chrome` 组在模板里是**三段不连续代码**（3703–3760 / 3804–3830 / 4327–4400），是全批最容易漏的一处。
     搬完必须逐段核对原文已从模板删除，否则重复声明（见 README v3.6 事故）。
  2. `fx` 组中间夹着 `refreshUnits()`（908–911 行，只有 4 行，属于"渲染 + 统计"而非特效）。
     本批把它**留在模板原位**，避免把 `updateStats` 拖进 `src/ui/fx.js`；后续拆渲染区时再归位。
- **开工前必做**：先 `GET build/manifest.json` 确认 `modules` 长度仍是 15（若队友已推进，先重新取区对齐再动手）。
  不要用 `templates/game.html` 字节数判断进度 —— 2026-10-28 03:21 的事故正是因为这一点。
- **本 issue 不解决**：发布链路仍是整文件 PUT，所以"产物层面并发覆盖"的风险在拆完之后依然存在。
  真正的并发保护需要在 `net/push_api.py` 里做按模块比对，不在本 issue 范围。
- 人类维护者 2026-10-28 03:40 已确认此分级方案（「就按照你的说法」）。
- 相关：`ISSUE-20261028-05-elite-affixes.md`（ready，等 05）、`ISSUE-20261028-06-relics-and-events.md`（ready，等 06）、`ISSUE-20261028-07-icon-system.md`（P2）。
