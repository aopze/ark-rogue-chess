# 架构说明（ARCHITECTURE）

> 状态：**骨架**（`P0.1-2` 建立目录）。内容随 `P0.1-3` 构建脚本 / `P0.1-4` 机械拆分逐步填充。
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
| `src/data/` | 角色 / 敌人 / 遗物 / 事件 / 节点模板 / 数值（`balance.json` 为唯一数值出口） | 空，待 `P0.1-4` 搬运 |
| `src/rules/` | 纯规则：`rng` / `state` / `resolveTurn` / `combat` / `mapgen` / `progress` | 空，待 `P0.1-4` 搬运 |
| `src/ui/` | DOM 渲染、棋盘交互、面板、日志、横竖屏布局、跨帧补丁 | 空，待 `P0.1-4` 搬运 |
| `src/net/` | 联机：传输层（poll / ws）、房间流程、回放导入导出 | 空，待 `P0.1-4` 搬运 |
| `src/main.js` | 入口：装配依赖、启动 | 空，待 `P0.1-4` |
| `templates/game.html` | 构建模板（`<style>` 占位 + 脚本注入点） | 空，待 `P0.1-3` |
| `build/bundle.mjs` | 按清单顺序内联 `src/**` → 输出 `game.html` | 空，待 `P0.1-3` |
| `build/verify.mjs` | 产物一致性 / 体积预算校验 | 空，待 `P0.1-3` |
| `tests/` | unit / replay / property / e2e / fixtures | 空，待 `P0.1-5` 收编 |
| `tools/` | 发布、快照归档、性能基准 | 空 |
| `docs/` | 本文档及 RULES / CONTENT / ONLINE / COMPAT / RELEASE | 本文件已建 |
| `net/`（根目录） | 联机**运行时**与联机侧测试脚本 | 已存在，非 `src/net/` |
| `issues/` | 需求入口（§0.0） | 已存在 |

> ⚠️ 注意区分：根目录 `net/` 是**已上线联机模块的家**（`net.js` / `room-server.py` / 测试脚本），
> 而 `src/net/` 是 `P0.1-4` 机械拆分后的**源码归属目录**。两者在拆分完成前并存，不要混淆。

## 构建流程（`P0.1-3` 后）

```
src/data/*.json ─┐
src/rules/*.js  ─┤
src/ui/*.js     ─┼→ build/bundle.mjs ─→ templates/game.html ─→ ./game.html
src/net/*.js    ─┤        │                                        │
src/main.js     ─┘        │                                        │
                          └─ build/verify.mjs（一致性 + 体积预算）  └─ AC-23：校验 index.html 的 BUILD
```

`P0.1-3` 的验收要点（`README` §5.1）：

- `AC-01`：`npm run build` 产出 `game.html`，与线上基线字节差 < 2%，且 e2e 全绿
- `AC-23`：构建时**自动注入** `__ARK_VERSION__.build`；构建结束前校验 `index.html` 的 `var BUILD`
  是否等于本次 build，不一致则构建失败（`index.html` 是只读资产，脚本只校验不改写）

## 拆分原则（`P0.1-4`）

1. **纯移动，不改逻辑**：先让结构对，再谈重构。
2. 每批 ≤ 3 个模块，每批跑一遍 e2e（防止 `let/const` 提升与初始化顺序的隐性依赖）。
3. `src/rules/` 必须保持**无 DOM、无 `window`**（`AC-05`：`grep -r "document\.\|window\." src/rules` 为空）。
   规则层一旦沾 DOM，就无法单测与重演。
4. 数据外置时，数值统一收敛到 `src/data/balance.json`，避免散落魔法数字。

## 待建文档

| 文件 | 内容 | 状态 |
|---|---|---|
| `docs/RULES.md` | 战斗与规则的可验证定义 | 占位，待 `M0.2` |
| `docs/CONTENT.md` | 角色 / 敌人 / 遗物 / 事件内容表 | 占位，待 `M0.3` |
| `docs/ONLINE.md` | 联机协议与房间服务 | 占位，待 `M0.4` |
| `docs/COMPAT.md` | 设备 / 浏览器 / Telegram 兼容矩阵 | 占位，待 `M0.5` |
| `docs/RELEASE.md` | 发版流程与回滚 | 占位，可先摘 §0.9 |

## 相关红线速查

- `index.html`、`leaderboard.*`：只读资产，未经人类授权不得改
- `game.html`：唯一产物出口，由构建产出；手工改动前先看 §0.0
- 不得引入运行时外部依赖（NB-04）
