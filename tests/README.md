# tests/ —— 测试归属目录

> **当前为空骨架**（`P0.1-2` 建立）。内容由 `P0.1-5` 回归入库收编而来。

## 子目录

| 目录 | 用途 |
|---|---|
| `unit/` | `node:test` 规则单测（纯函数，无 DOM） |
| `ai/` | **jsdom 贪心 AI 自动对战冒烟测试（已收编为回归基线）** |
| `replay/` | 金样回放：seed + plans + 事件流哈希 |
| `property/` | `fast-check` 属性测试 |
| `e2e/` | Playwright：布局 / 设备 / 无障碍 |
| `fixtures/` | 测试数据 |

## `ai/` —— AI 自动对战冒烟测试（回归基线）

用 jsdom 把单文件 `game.html` 真正跑起来，由「贪心 AI」操作角色把游戏玩 N 局，
每回合后做状态不变量体检，抓运行时异常与数值/坐标违规。

- 脚本：`tests/ai/ai_battle_test.mjs`（从 `build/out/ai_10games.mjs` 收编而来；后者在 `build/out/`
  内、被 `.gitignore` 忽略，**不能作为基线**，故迁移到此处）。
- 角色循环：`fencer → amiya → wheelchair → vampire`；局数由 `ARK_GAMES` 控制（**默认 9**，即 2 个完整轮转，确保默认即覆盖 L3+ 幽灵层）。
- 体检项：越界 / **站墙** / HP 负数·超上限 / 重叠 / 卡死 / 运行时 console.error。

### 运行

jsdom 已声明为 `devDependency`，首次克隆后 `npm install` 即可获得，无需手动配置 `NODE_PATH`：

```bash
npm install            # 首次：安装 jsdom 等开发依赖
npm run test:ai        # 默认 9 局（覆盖 L3+ 幽灵层），跑根目录 game.html
ARK_GAMES=3 npm run test:ai   # 快速冒烟 3 局
ARK_GAME_HTML=/abs/path/game.html npm run test:ai   # 指定产物（如 build/out/game.html）
```

> 缺 jsdom 时脚本会明确报错并提示 `npm install`，不会抛晦涩堆栈。

- 退出码：任何运行时错误 / 不变量违规 → `exit 1`（可作基线门禁）；全绿 → `exit 0`。
- 默认目标产物 = 仓库根 `game.html`（向上找同时含 `game.html` 与 `index.html` 的目录）。

### ★ 已知设计行为（不计入违规）

幽灵(`ghost`) 敌人从 **L3** 解锁，且寻路时 `bfsPathTo` 的 `isGhost` 分支**故意跳过墙判定**
（设计上穿墙移动、可停在墙格）。因此 audit 对 ghost 落在墙格只做信息级记录（「幽灵站墙」），
**不判为「站墙」违规**。这是 2026-10-29 初版测试把幽灵站墙误报为违规后修正的结论，
属测试侧误报，**游戏逻辑无需修改**。

## 现状：e2e 脚本还在 `net/` 下

现有 6 个 e2e 脚本位于 `net/`，是**联机侧自建**的，尚未收编：

```
net/dom_load_test.mjs        23 项（含 AC-02 版本检查）
net/pvp_core_test.mjs        20 项
net/pvp_e2e_test.mjs         16 项
net/pvp_browser_test.mjs     16 项
net/hook_integration_test.mjs 8 项
net/client_test.mjs
```

跑法（后三者依赖房间服务）：

```bash
python net/room-server.py &
export NODE_PATH=$TEMP/arkjsdom/node_modules
node net/dom_load_test.mjs
```

`P0.1-5` 会把它们移入 `tests/e2e/` 并纳入 `npm test`。在那之前，**不要以为这里空就等于没有测试**。

## 另有一个 Python 单测

`net/push_guard_test.py` —— `push_api.py` 覆盖保护的离线单测（10 项，不需 token / 不联网）。
