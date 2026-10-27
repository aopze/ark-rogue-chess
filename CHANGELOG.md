# 变更记录（CHANGELOG）

> 格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
> 与 README §10.3 分工：**本文件记「产物发了什么」，README §10.3 记「文档结构怎么变」**。
> 每次打 tag 追加一节。

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
