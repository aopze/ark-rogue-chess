# 架构说明（ARCHITECTURE）

> 状态：`P0.1-2` 建立目录骨架，**`P0.1-3` 构建脚本已落地**（`build/bundle.mjs` + `build/verify.mjs` + 单测）。
> 内容随 `P0.1-4` 机械拆分继续填充。
> 权威协作规则在根目录 `README.md`；本文件只讲**代码怎么组织、为什么这样组织**。

## 一句话架构

**`src/**` 模块化源码 → 构建内联 → 根目录单个 `game.html`**。

模块化的目标**不是**拆成 ESM 多文件上线，而是让源码可读可测，产物仍然是一个离线单文件
（双击即玩、可任意静态托管、能在 Telegram iframe 里跑）。

## 为什么产物必须是单文件

| 约束 | 来源 |
|---|---|
| 不得引入运行时外部依赖，保住离线单文件 | 红线 NB-04 |
| 发布只写 `game.html` 一个文件 | 红线 NB-01 |
| 想改游戏先写 `issues/`，不许直接改 `game.html` | §0.0 铁律 |

因此：**可以随便拆源码，但出口永远只有一个 `game.html`。**

## 目录职责

| 路径 | 职责 | 现在的状态 |
|---|---|---|
| `game.html` | 构建产物，唯一发布物 | 单文件，约 249 KB / 5.4k 行 |
| `src/data/` | 角色 / 敌人 / 遗物 / 事件 / 节点模板 / 数值（`balance.json` 为唯一数值出口） | ✅ 第一批已搬：`constants.js` / `characters.js` / `enemies.js`（原 `game.html` 487-620 行） |
| `src/rules/` | 纯规则：`rng` / `state` / `resolveTurn` / `combat` / `mapgen` / `progress` | ✅ 第二批已搬：`state.js` / `buffs.js` / `sp.js`（原 `game.html` 622-751 行） |
| `src/ui/` | DOM 渲染、棋盘交互、面板、日志、横竖屏布局、跨帧补丁 | ✅ 第三批已搬：`dom-refs.js`（原 `game.html` 489-523 行） |
| `src/net/` | 联机：传输层（poll / ws）、房间流程、回放导入导出 | ✅ 第三批已搬：`pvp-core.js`（PVP-CORE 结算核心，原 553-740 行） |
| `src/main.js` | 入口：装配依赖、启动 | 空，待 `P0.1-4` |
| `templates/game.html` | 构建模板（`<style>` 占位 + 脚本注入点） | 空，待 `P0.1-4` 从 `game.html` 剥离；**缺失时构建自动回退**到根目录 `game.html` 作基底（直通模式） |
| `build/bundle.mjs` | 按清单顺序内联 `src/**` → 输出产物 | ✅ 已落地（`P0.1-3`）。**默认输出到 `build/out/game.html`**，写根目录需显式授权 |
| `build/verify.mjs` | AC-23 / NB-04 / 结构 / 产物一致性校验 | ✅ 已落地（`P0.1-3`），可独立运行 |
| `build/manifest.json` | 内联清单（顺序 = 产物中脚本出现顺序） | ✅ 已建，`modules` 待 `P0.1-4` 填充 |
| `build/bundle_test.mjs` | 构建脚本离线单测（34 项） | ✅ 已建 |
| `tests/` | unit / replay / property / e2e / fixtures | 骨架已建，现存 6 个 e2e 仍在 `net/`，待 `P0.1-5` 收编 |
| `tools/` | 发布、快照归档、性能基准 | 空 |
| `docs/` | 本文档及 RULES / CONTENT / ONLINE / COMPAT / RELEASE | 本文件已建，RELEASE 已摘 §0.9 并补构建命令 |
| `net/`（根目录） | 联机**运行时**与联机侧测试脚本 | 已存在，非 `src/net/` |
| `issues/` | 需求入口（§0.0） | 已存在 |

> ⚠️ 注意区分：根目录 `net/` 是**已上线联机模块的家**（`net.js` / `room-server.py` / 测试脚本），
> 而 `src/net/` 是 `P0.1-4` 机械拆分后的**源码归属目录**。两者在拆分完成前并存，不要混淆。

## 构建流程（`P0.1-3` 已落地）

```
src/data/*.json ─┐
src/rules/*.js  ─┤
src/ui/*.js     ─┼→ build/bundle.mjs ─→ templates/game.html ─→ ./game.html
src/net/*.js    ─┤        │                                        │
src/main.js     ─┘        │                                        │
                          └─ build/verify.mjs（一致性 + NB-04）    └─ AC-23：校验 index.html 的 BUILD
```

### 常用命令

```bash
node build/bundle.mjs                 # 试构建 → build/out/game.html（默认，安全，不碰根目录）
node build/bundle.mjs --prev game.html # 与上版做一致性比对（仅允许注释/空白差异）
node build/bundle.mjs --bump          # 只打印下一个 build 号，不改任何文件
node build/bundle.mjs --self-test     # 用 tests/fixtures 迷你样例验证内联管线
node build/bundle.mjs --out game.html # ★发版：写根目录，需 --force 或 ARK_RELEASE_OK=1
node build/bundle_test.mjs            # 离线单测（34 项）
node build/verify.mjs <产物> --prev <旧产物>
```

### 安全设计（三条护栏）

1. **默认不碰根目录 `game.html`** —— 试构建一律落在 `build/out/`。写根目录被识别为发版动作
   （§0.0 / NB-12），缺授权即以**退出码 4** 中止并说明原因。
2. **`index.html` 只校验不改写** —— 它是只读资产（NB-01）。BUILD 不一致时构建失败并打印应改的值。
3. **产物必须离线自包含**（NB-04）—— 检出外链 `<script src>` / `<link href>` / `import from http` 即失败。

### `P0.1-3` 的验收要点（`README` §5.1）

- `AC-01`：`npm run build` 产出 `game.html`，与线上基线字节差 < 2%，且 e2e 全绿
  （当前 `modules` 为空，尚不能覆盖此条 —— 待 `P0.1-4` 拆分后验收）
- `AC-23`：构建时**自动注入** `__ARK_VERSION__.build`；构建结束前校验 `index.html` 的 `var BUILD`
  是否等于本次 build，不一致则构建失败（`index.html` 是只读资产，脚本只校验不改写）

### 已知限制

- `commit` 字段取 `git rev-parse HEAD`。本机 git 元数据可能落后于远端（网络间歇性），
  此时注入的是本地 HEAD；可用 `ARK_COMMIT=<sha>` 环境变量覆盖。
- `templates/game.html` 尚未产出，当前为**直通模式**：以根目录 `game.html` 为基底，
  只做版本注入与校验，不内联模块。`P0.1-4` 剥离出模板后即转正。

## 拆分原则（`P0.1-4`）

1. **纯移动，不改逻辑**：先让结构对，再谈重构。
2. 每批 ≤ 3 个模块，每批跑一遍 e2e（防止 `let/const` 提升与初始化顺序的隐性依赖）。
3. `src/rules/` 必须保持**无 DOM、无 `window`**（`AC-05`：`grep -r "document\.\|window\." src/rules` 为空）。
   规则层一旦沾 DOM，就无法单测与重演。
4. 数据外置时，数值统一收敛到 `src/data/balance.json`，避免散落魔法数字。

### 进度

| 批次 | 内容 | 模块 | 状态 |
|---|---|---|---|
| 1 | 第 1 区「数据与常量」（`20261028b` 基线 487-594 行） | `data/constants.js`、`data/characters.js`、`data/enemies.js` | ✅ 已完成 |
| 2 | 第 2 区「运行时状态」（`20261028b` 基线 673-809 行） | `rules/state.js`、`rules/buffs.js`、`rules/sp.js` | ✅ 已完成 |
| — | **按 `20261028b` 重新取区对齐**（2026-10-28） | 全部 6 模块 + 模板 | ✅ 已完成 |
| 3 | 第 3 区「DOM 引用与基础工具」（`20261028b` 基线 489-740 行） | `ui/dom-refs.js`、`rules/rng.js`、`net/pvp-core.js` | ✅ 已完成 |
| 4+ | 第 4–15 区（掷骰 / 雷达图 / 规则 / DX / 结算 / 地图 / 关卡 / 渲染 / 输入 / 战斗结算 / 成长 / 启动） | 待定 | ⬜ 待做 |

### 前两批的等价性证明（重要）

机械拆分最怕"看起来搬对了、实际顺序变了"。每批都用三层验证：

1. **文本等价**：`node build/bundle.mjs --prev game.html` —— 归一化（去注释/空白、抹平版本对象）后
   与拆分前 `game.html` **完全一致**。两批合计 +1,459 B（0.58%），低于 `AC-01` 的 2% 预算。
2. **真运行**：`ARK_GAME_HTML=build/out/game.html node net/dom_load_test.mjs` → 23 项全绿；
   `node net/hook_integration_test.mjs build/out/game.html` → 8 项全绿；
   `pvp_core` 20 项 / `pvp_e2e` 16 项 / `pvp_browser` 16 项 / 联机 `client_test` 全绿。
3. **无残留**：关键定义（`PHASE` / `CHARACTERS` / `ENEMY_STATS` / `DIR4_BFS`）在 `src/` 各 1 处，
   模板中只剩**引用**而非重复定义；顶层 `let` 状态（`phase` / `mode` / `player` / `enemies` …）
   也各只有 1 处声明，无重复。

> ⚠️ **换行约定（第二批踩过的坑）**：仓库文本文件一律 `LF`。
> Windows 上以文本模式写文件会把 `\n` 静默转成 `\r\n`（模板 5,208 行全变 CRLF），
> 产物虚增 6,095 B（2.4%）且 diff 整片变红。写回后务必确认 `CRLF = 0`。

> 模板当前仍含第 3–15 区代码，占位符 `<!-- @inject:scripts -->` 位于原第 1 区处。
> 后续每批搬走一段、占位保持原位，顺序因此天然守恒 —— 这是"机械拆分"能零行为改变的根本原因。

## 待建文档

| 文件 | 内容 | 状态 |
|---|---|---|
| `docs/RULES.md` | 战斗与规则的可验证定义 | 占位，待 `M0.2` |
| `docs/CONTENT.md` | 角色 / 敌人 / 遗物 / 事件内容表 | 占位，待 `M0.3` |
| `docs/ONLINE.md` | 联机协议与房间服务 | 占位，待 `M0.4` |
| `docs/COMPAT.md` | 设备 / 浏览器 / Telegram 兼容矩阵 | 占位，待 `M0.5` |
| `docs/RELEASE.md` | 发版流程与回滚 | ✅ 已摘 §0.9 + 构建/发布四步命令 |

## 相关红线速查

- `index.html`、`leaderboard.*`：只读资产，未经人类授权不得改
- `game.html`：唯一产物出口，由构建产出；手工改动前先看 §0.0
- 不得引入运行时外部依赖（NB-04）
