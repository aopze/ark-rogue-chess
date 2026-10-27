# src/ —— 源码归属目录

> **`P0.1-4` 机械拆分进行中**。内容由 `P0.1-4` 机械拆分从根目录 `game.html` 搬运而来。
>
> **第一批已完成（第 1 区：数据与常量）** —— `data/constants.js`、`data/characters.js`、`data/enemies.js`。
> **第二批已完成（第 2 区：运行时状态）** —— `rules/state.js`、`rules/buffs.js`、`rules/sp.js`。
> 验证：构建产物与拆分前 `game.html` **归一化后完全一致**，且 e2e 与 hook 集成测试对构建产物全绿。
> 剩余第 3–15 区仍在 `templates/game.html` 中，待后续批次搬移。
>
> ⚠️ **换行约定**：仓库内所有文本文件一律 `LF`。Windows 上用文本模式写文件会静默变成 `CRLF`，
> 会让产物体积虚增约 2.6% 并污染 diff —— 写回后请确认 `CRLF = 0`。

## 四个子目录

| 目录 | 放什么 | 硬约束 |
|---|---|---|
| `data/` | 角色 / 敌人 / 遗物 / 事件 / 节点模板 / 数值 | 数值统一收敛到 `balance.json` |
| `rules/` | `rng` / `state` / `resolveTurn` / `combat` / `mapgen` / `progress` | **无 DOM、无 `window`**（`AC-05`） |
| `ui/` | 渲染 / 棋盘交互 / 面板 / 日志 / 布局 / 跨帧补丁 | 可接触 DOM |
| `net/` | 传输层 / 房间流程 / 回放 | — |

## 搬运原则（`P0.1-4`）

1. **纯移动，不改逻辑** —— 先让结构对，再谈重构。
2. 每批 ≤ 3 个模块，每批跑一遍 e2e。
3. 不要在本目录直接写代码然后期望它生效：**产物是 `game.html`，必须经构建**。
4. **顺序即语义**：`build/manifest.json` 里的顺序 = 产物中脚本的出现顺序。
   `let/const` 提升与初始化顺序都依赖它，新增模块必须插在正确位置并跑全量 e2e。

## 与根目录 `net/` 的区别

根目录 `net/` 是**已上线的联机模块及其测试脚本**（`net.js`、`room-server.py`、`*_test.mjs`）。
这里的 `src/net/` 是拆分后的**源码归属目录**。拆分完成前两者并存，不要混淆。

详见 `docs/ARCHITECTURE.md`。
