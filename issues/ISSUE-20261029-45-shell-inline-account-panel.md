# ISSUE-20261029-45 · 外壳内联进 game.html + 账号面板重构

- **状态**：实施中
- **提出**：人类维护者（2026-10-29 22:56 / 23:21 指令）
- **实施**：HZY工作空间
- **基线**：`958fdf5`（BUILD `10292228`，远端 main 一致）

## 0. 人类原话（需求原文，不改写）

> bot项目已经交接到了NAS,也就是你的工作空间
> 合并好之后开始优化账号面板
> 优化账号面板,排行榜里每一项都窄一点,保证至少可以显示前8个排名
> 注意适配竖屏
> 账号信息面板内只显示排行榜,聚焦自己的排名,名字右侧的[我]换成[编辑],点击之后自己的排名UI下方展开抽屉,里面是名字的输入栏,输入栏下面是说明文字[名字只能用汉字或英文，后面的数字是口令：只在你编辑时显示，永远不会出现在排行榜上。记住整串（如「阿米娅1234」），换设备输入同一串就能找回同一账号] 如果玩家修改了名字和口令,那么直接视为修改,不会新注册一个账号
> 浏览器里会出现白色的滑动条,优化掉改成原生滑动条

## 1. 为什么要合并（不是洁癖，是被耦合逼的）

现状是「`index.html` 外壳 + `iframe` 装 `game.html`」，但隔离早已名存实亡：

| # | 耦合 | 位置 | 代价 |
|---|---|---|---|
| 1 | 3 条 postMessage | `ark_open_lobby` / `ark_board_rect` / `ark_lobby_state` | 协议一改两端都要动，无类型约束 |
| 2 | 直接读 iframe DOM | `syncCornerToGame()` 抄 `#lobbyOpenBtn` 的 rect | 补丁① 为此写了 40 行换算 + 9 个门禁 |
| 3 | 注入脚本 + 轮询顶层变量 | `hooksrc` 读 `phase/level/enemies`，300ms 一次 | **改个变量名就静默失灵**，门禁抓不到 |
| 4 | 反向劫持外壳 UI | `patchDLCChrome()` 改父文档 `#hint`/`#ghint`/`showHint` | 跨文档改 DOM，约 50 行纯补丁 |
| 5 | 双份 z-index 体系 | 外壳 80/90/9999/10000 vs 游戏 `--z-mask:1100`/`--z-drawer:1101` | 各自为政，靠 iframe 边界侥幸不打架 |
| 6 | BUILD 双写 | `index.html` 的 `var BUILD` ↔ 产物 `__ARK_VERSION__` | AC-23 兜着，但每次发版要人工同步 |

合并后 1–5 全部消失，6 收敛为单源。

## 2. 方案

### 2.1 结构
- 外壳 CSS → `templates/game.html` 的 `<style>` 末尾（唯一真相源不变）
- 外壳 DOM → `templates/game.html` body 内（棋盘容器之后）
- 外壳 JS → `src/shell/*.js`，进 `build/manifest.json`，标 `/* @slot:shell */`
- 模板在 `pvpInjectUI();` 之后新增槽位 `<!-- @inject:scripts:shell -->`

### 2.2 BUILD 单源
- 新增 `build/version.json`（`{"build":"..."}`）为唯一真值来源
- `build/verify.mjs` 的 `readBuildFromIndex` → `readBuild()`：优先 `version.json`，回退 `index.html` 的 `var BUILD`（向后兼容）
- `build/bundle.mjs` 同步改用 `readBuild()`
- `index.html` 退化为跳转页（meta refresh → `game.html`），不再承载业务

### 2.3 边界拆除
| 原实现 | 新实现 |
|---|---|
| `postMessage ark_open_lobby` | 游戏侧直接调 `shellOpenLobby()` |
| `postMessage ark_board_rect` | 同文档，`boardEl.getBoundingClientRect()` 直接量 |
| `postMessage ark_lobby_state` | `setLobbyOpen()` 内直接 toggle 按钮 `.on` |
| `hooksrc` 轮询 `phase/level/enemies` | 游戏 `phase` 变为 `gameover` 时直接调 `shellReportScore()` |
| `patchDLCChrome()` | 整块删除（不再有父文档） |
| `#lobbyOpenBtn` 在 iframe 内隐藏 | 永远显示（不再是嵌入式） |

### 2.4 z-index 统一（并入 `--z-*` 变量族）
```
--z-corner:30  --z-vpad:1002  --z-mask:1100  --z-drawer:1101
--z-lobbyMask:1200  --z-lobby:1201  --z-fullrank:1500  --z-toast:1900
```

### 2.5 样式作用域
外壳类名全部加 `#lobbyDrawer` / `#arkToast` 等作用域前缀，避开与游戏重名的 5 个类（`.empty .ghost .tag .lv .nm`）。不改游戏侧选择器，避免动 28 处 `.lv`。

### 2.6 NB-04 处理（必须显式声明，不静默绕过）
`index.html:7` 的 `<script src="https://telegram.org/js/telegram-web-app.js">` 改为**运行时按需注入 + 1200ms 超时降级**：
- 静态扫描查不到（不是 `<script src>` 标签），但这是**语义变更而非绕闸门**
- 游戏本体零依赖 SDK；SDK 失败 → 网页游客通道（device id）照常工作
- `build/verify.mjs` 的 NB-04 注释里补一句"允许 1 处动态可选加载：Telegram SDK"，使后来者看得见

## 3. 账号面板新规格

```
┌─ 账号面板（覆盖棋盘）──────────────┐
│ [✕ 角标]              🏆 排行榜  更新 10-29 23:12 │
│ ┌─────────────────────────────────┐ │
│ │ 1  名字A   第9层 · 12杀    [编辑]?│ │  ← 只有自己那行有 [编辑]
│ │ 2  名字B   第8层 · 9杀           │ │
│ │ …（至少 8 行可见）               │ │
│ │ 5  我的名  第3层 · 4杀    [编辑] │ │  ← 高亮，打开即滚到这里
│ │ ┌ 编辑抽屉（内联展开）──────────┐│ │
│ │ │ [名字+口令输入框      ] [保存] ││ │
│ │ │ 名字只能用汉字或英文…（指定文案）││ │
│ │ └───────────────────────────────┘│ │
│ │ 6  …                             │ │
│ └─────────────────────────────────┘ │
│ [📊 查看完整排行榜]                  │
└──────────────────────────────────────┘
```

- **只保留排行榜**，删除左 1/3 账号卡（`.acct` / `.avatar` / `.pnameLine` / `.pstats` 全删）
- 自己那行：名字右侧 `[我]` 徽标 → `[编辑]` 按钮
- 点 `[编辑]`：在**该行下方**插入 `li.editRow`，内含输入框 + 保存 + 指定说明文字（原文照抄）
- 未上榜玩家：榜单底部给一行「你还没上榜 · 设置名字」，点开同一套编辑抽屉
- 打开面板：`scrollIntoView({block:'center'})` 聚焦自己那行
- 说明文字**原文**：`名字只能用汉字或英文，后面的数字是口令：只在你编辑时显示，永远不会出现在排行榜上。记住整串（如「阿米娅1234」），换设备输入同一串就能找回同一账号`

## 4. 排行榜密度（竖屏 ≥ 8 名）

- 行高目标 ≤ 44px（原 ≈ 62px：padding 8+8 + nm 13.5 + sc 11 + margin 6）
- 单行布局：名次 + 名字（+ 副信息小字）+ 层数 + 自己那行的按钮
- 断点：`@media (max-width: 420px)` 下隐藏副信息（击杀/次数），只留名字与层数
- 用 `@media (max-height: 700px)` 再压一档
- 兜底自检：门禁里按 390×844 面板高度算，断言 8 行总高 ≤ 可用高度

## 5. 滚动条
- `scrollbar-width: thin` + `scrollbar-color`（Firefox/新 Chromium）
- `::-webkit-scrollbar` 6px、轨道透明、thumb 半透明圆角
- 消除系统白色默认滚动条（`::-webkit-scrollbar` 一旦定义即接管）

## 6. 验收（AC）

- [ ] AC-1 产物为**单文件**：URL 直开 `game.html` 即出现完整功能（棋盘 + 四角角标 + 账号面板 + 榜单），无 iframe
- [ ] AC-2 门禁全绿：`dom_load` / `layout_chrome` / `lobby_shell`（迁移到产物）/ `battle_ui` / `bundle` / `pvp_core` / `pvp_e2e`
- [ ] AC-3 NB-04 通过，且构建日志显式打印"动态可选加载：Telegram SDK"一行
- [ ] AC-4 AC-23 双 BUILD 通过（来源 `build/version.json`）
- [ ] AC-5 面板内**无账号卡**，只有排行榜
- [ ] AC-6 自己那行有 `[编辑]`，点开在其**下方**展开输入框 + 指定说明文字
- [ ] AC-7 竖屏 390×844 下，面板内**≥ 8 名完整可见**
- [ ] AC-8 滚动条为细窄半透明，非系统白色
- [ ] AC-9 改名走 `kind:'rename'`，服务端 `rename_user(uid)` 按 uid 更新，**不新建记录**（bot 侧已确认，本次不改 bot）
- [ ] AC-10 打开面板自动滚到自己并高亮

## 7. 已知风险（如实记录，不在本次修）

**跨设备找回与文案承诺不完全一致。** 服务端身份：
- Telegram 入口 → `initData` 验签 → `uid = tg user id`（跨设备稳定 ✓）
- 网页游客 → `localStorage` 设备 id → `uid = dev_<uuid>`（**换设备即换 uid** ✗）

所以网页通道下「换设备输入同一串找回同一账号」实际会**新建一条记录**，旧记录仍留在榜上，靠前端 `mergeByName()` 合并显示掩盖。要真正兑现文案需 bot 侧支持以 `account` 为身份键（本次不动 bot，仅记录）。本次保证的是：**同一设备/同一 Telegram 账号下改名字+口令 = 更新，不新建**。

## 8. 任务分解

- [ ] T1 `build/version.json` + `readBuild()` 改造（bundle/verify）
- [ ] T2 外壳 CSS/DOM 迁入 `templates/game.html`
- [ ] T3 `src/shell/*.js` 五模块（sdk / account / board / panel / boot）
- [ ] T4 `chrome.js` 删 `patchDLCChrome`、`bindLobbyOpenBtn` 改直调
- [ ] T5 `index.html` 退化为跳转页
- [ ] T6 面板重构（只榜单 / 编辑内联 / 聚焦自己 / 8 名 / 滚动条）
- [ ] T7 门禁迁移与全量回归
- [ ] T8 构建发版 + CHANGELOG + push + 部署 + verify
