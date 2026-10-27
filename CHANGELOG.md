# 变更记录（CHANGELOG）

> 格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
> 与 README §10.3 分工：**本文件记「产物发了什么」，README §10.3 记「文档结构怎么变」**。
> 每次打 tag 追加一节。

## [未发布] — 机械拆分第一批（`P0.1-4`）

> 本节**不涉及线上产物**：根目录 `game.html` 未改动（仍 249,421 B / `1a86858d00`）。
> 拆分产物只落在 `build/out/game.html`，**发布需人类授权**（§0.0 / NB-12）。

### 新增

- `src/data/constants.js` —— 常量与方向表（原 `game.html` 487-520 行）
- `src/data/characters.js` —— 角色数据与派生查询函数（原 522-591 行）
- `src/data/enemies.js` —— 敌人类型与固定面板（原 593-620 行）
- `templates/game.html` —— 构建模板：原文件第 1 区替换为 `<!-- @inject:scripts -->` 占位，
  第 2–15 区（约 5,200 行）仍在模板内，待后续批次搬移。

三个模块均为**原样搬移，未改一个字符**（各加了 3 行来源说明注释）。
`build/manifest.json` 的 `modules` 顺序 = 拆分前的出现顺序，这是零行为改变的根本保障。

### 等价性三层验证

1. **文本等价**：`node build/bundle.mjs --prev game.html`
   → 归一化（去注释/空白、抹平版本对象）后与拆分前 `game.html` **完全一致**。
   产物 250,119 B vs 249,421 B = **+698 B（0.28%）**，远低于 `AC-01` 的 2% 预算。
2. **真运行**（文本等价不等于能跑）：
   - `ARK_GAME_HTML=build/out/game.html node net/dom_load_test.mjs` → **23 项全绿**
   - `node net/hook_integration_test.mjs build/out/game.html` → **8 项全绿**
3. **无残留**：`PHASE` / `CHARACTERS` / `ENEMY_STATS` / `DIR4_BFS` 在 `src/` 各 1 处定义，
   模板中只剩引用；3 个模块 DOM/`window` 引用均为 **0**。

### 配套改动

- `net/dom_load_test.mjs`：新增 `ARK_GAME_HTML` 环境变量，可指向任意产物
  （此前硬编码 `../game.html`，无法验证构建产物）。
- `docs/ARCHITECTURE.md`：新增「拆分进度表」与「本批的等价性证明」。
- `src/README.md`：更新搬运状态与「顺序即语义」约束。

### 为何先拆这一批

第 1 区是纯 `const` 数据 + 3 个派生函数，**不依赖任何运行时状态、不碰 DOM**，
是 `let/const` 提升与初始化顺序风险最低的一段。按「每批 ≤ 3 模块」的规定走，
先把拆分—构建—验证的闭环跑通，再推进到有状态依赖的第 2 区及以后。

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
