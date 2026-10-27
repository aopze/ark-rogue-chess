# 规则说明（RULES）

> 状态：**占位**（`P0.1-2` 建立骨架）。内容待 `M0.2 规则可验证` 阶段填充。
> 拆分的落地位置见 `docs/ARCHITECTURE.md`。

## 应包含

- `resolveTurn(state, plans, turnSeed) → { state, events }` 的完整语义
- 伤害 / 护盾 / 闪避 / 朝向 / 射程的**判定顺序**（顺序变了结果就变，必须写死）
- 随机数分层种子派生规则（可复现的前提，`?seed=` 复现 bug 的基础）
- 每条规则对应的金样回放位置（`tests/replay/`）

## 硬约束

`src/rules/` 必须无 DOM、无 `window`（`AC-05`）。规则层一旦沾 DOM，就无法单测与重演。
