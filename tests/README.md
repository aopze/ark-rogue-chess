# tests/ —— 测试归属目录

> **当前为空骨架**（`P0.1-2` 建立）。内容由 `P0.1-5` 回归入库收编而来。

## 子目录

| 目录 | 用途 |
|---|---|
| `unit/` | `node:test` 规则单测（纯函数，无 DOM） |
| `replay/` | 金样回放：seed + plans + 事件流哈希 |
| `property/` | `fast-check` 属性测试 |
| `e2e/` | Playwright：布局 / 设备 / 无障碍 |
| `fixtures/` | 测试数据 |

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
