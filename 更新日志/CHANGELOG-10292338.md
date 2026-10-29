# CHANGELOG — Build 10292338

- 发布 commit：本次发版提交（父 `4618d80`，Amechihaya，2026-10-29 23:00 BUILD 10292300）
- 基线：`main` @ `4618d80`（ISSUE #26 联机口径修正，BUILD `10292300`）
- 发布动作：BUILD `10292300` → **`10292338`**；`ARK_RELEASE_OK=1 node build/bundle.mjs --out game.html`
- 产物：`game.html` **510619 B**（原 462860 B，+47.8 KB），32 个内联模块（原 26），内嵌 `commit=4618d80`（= 本提交父节点）
- 一句话：**外壳并进单文件，`index.html` 退化为跳转页；账号面板按人类新规格重做**

---

## 一、为什么合并（ISSUE-20261029-45）

对外看是「两个文件 + 一层 iframe」，但它们之间实际有 6 处耦合，隔离早已名存实亡：

| # | 耦合 | 原实现 | 代价 |
|---|---|---|---|
| 1 | 3 条 postMessage | `ark_open_lobby` / `ark_board_rect` / `ark_lobby_state` | 协议改一处两端都要动，无类型约束 |
| 2 | 直接读 iframe DOM | `syncCornerToGame()` 抄 `#lobbyOpenBtn` 的 rect 再换算坐标系 | 上一版为角标对齐写了 40 行换算 + 9 个门禁项 |
| 3 | 注入脚本 + 轮询顶层变量 | `#hooksrc` 每 300ms 读 `phase/level/enemies` | **改个变量名就静默失灵**，门禁抓不到 |
| 4 | 反向劫持父文档 UI | `patchDLCChrome()` 改 `#hint` / `#ghint` / `showHint` | 约 50 行纯补丁 |
| 5 | 双份 z-index 体系 | 外壳 80/90/9999/10000 vs 游戏 `--z-mask:1100` / `--z-drawer:1101` | 靠 iframe 边界侥幸不打架 |
| 6 | BUILD 双写 | `index.html` 的 `var BUILD` ↔ 产物 `__ARK_VERSION__` | 每次发版人工同步，靠 AC-23 兜着 |

合并后 1–5 全部消失，6 收敛为单源。

## 二、结构变化

| 项 | 变更前 | 变更后 |
|---|---|---|
| 入口 | `index.html`（819 行外壳）→ iframe → `game.html` | `game.html` 单文件；`index.html` 仅 2 行跳转（保留 search + **hash**，否则 Telegram 拿不到 initData） |
| 外壳样式 | `index.html` 的 `<style>` | `templates/game.html` 末尾，全部以 `#arkUi` 作用域（避开与游戏重名的 `.empty/.ghost/.tag/.lv/.nm`） |
| 外壳逻辑 | `index.html` 内联 script | `src/shell/` 六个模块：`01-sdk` `02-account` `03-board` `04-panel` `05-score` `06-boot`，各自独立 IIFE，只经 `window.ArkShell` 通信 |
| BUILD 真值来源 | `index.html` 的 `var BUILD` | **`build/version.json`**；`verify.mjs` 的 `readBuildFromIndex` → `readBuild()`（version.json 优先，回退 index.html 兼容旧分支） |
| z-index | 外壳自建 80/90/9999/10000 | 并入 `--z-*` 变量族：`--z-lobbyMask:1200` / `--z-lobby:1201` / `--z-fullrank:1500` |
| 角标定位 | JS 量 `#lobbyOpenBtn` 的 rect 再换算 | **CSS 直接用棋盘的 `--corner-x` / `--corner-y` / `--cell`**（同文档，同一套 `:root` 变量） |

删除的代码（净减）：
- `placeLobbyOverBoard()`（iframe 偏移 + 棋盘矩形两次换算）
- `syncCornerToGame()`（量 rect + 换算 + 5 处写 style）
- `#hooksrc` 注入块与 `injectHook()`
- `patchDLCChrome()` 整块
- `startGame()` / `onGameLoad()` / `#loading` / `#gameWrap`
- 游戏侧 `bindLobbyOpenBtn` 里的 `postBoardRect` / `message` 监听 / 「非嵌入就隐藏」

## 三、账号面板（人类 2026-10-29 23:21 规格）

1. **面板内只显示排行榜** —— 原左 1/3 账号卡（`.acct` / `.avatar` / `.pnameLine` / `.pstats`）整块删除。
2. **聚焦自己的排名** —— 打开面板拉到实时榜后自动 `scrollTop` 居中到自己那行（不用 `scrollIntoView`，避免连带滚动整页）。
3. **`[我]` → `[编辑]`** —— 自己那行名字右侧的徽标改成按钮。
4. **编辑抽屉内联展开** —— 点 `[编辑]` 后**在该行正下方**插入 `li.editRow`：名字输入框 + 保存 + 说明文字。不弹窗、不换屏。
5. **未上榜也能改** —— 自己在榜外时，榜单底部出现「你还没上榜 · 设置名字」，点开同一套抽屉。
6. **改名不新注册** —— 走 `kind:'rename'` → bot 侧 `rename_user(uid, name)` 按 uid 更新，`best_level` / `best_kills` / `runs` 全部保留；前端不动设备 id，uid 不变。
7. 说明文字与需求原文逐字一致（含末尾无句号）。

## 四、密度与滚动条

- 每项 ≈**38px**（原 ≈62px）：`padding 5+7px`、`min-height:38px`、`margin-bottom:4px`、名字 12.5px、层数 11.5px、名次球 19px。
- 副信息（`12杀 · 3次`）在 `max-width:420px` 下隐藏，把宽度让给名字。
- 面板高度不再严格等于棋盘（棋盘是正方形，竖屏下只有 390px 高，装不下 8 行）：
  `height = max(棋盘高, min(8 × 42 + 96, 视口高 − 棋盘上沿 − 6))`
  → 390×844 下算出 **432px**，8 行完整可见，且不溢出屏幕。
- 滚动条：`scrollbar-width:thin` + `scrollbar-color:rgba(255,255,255,.22) transparent`，并接管
  `::-webkit-scrollbar`（6px、轨道透明、thumb 半透明圆角）—— 消除系统默认的白色滚动条。

## 五、NB-04 的处理（显式声明，非静默绕过）

外壳内联后，原 `index.html` 第 7 行那行 `telegram.org/js/telegram-web-app.js` 外链会让 NB-04 直接失败。
改为 `src/shell/01-sdk.js` 运行时动态注入：
- 静态扫描看不到它 —— 这是**语义变更**：它不再是「依赖」，而是「有则增强、无则降级」。
- 超时 1200ms（UA 含 Telegram 时 3000ms）；失败 → 网页游客通道（设备 id），游戏照常可玩、可离线双击。
- `build/verify.mjs` 的 NB-04 注释里已写入这条例外，后来者不必猜。

## 六、验证

| 门禁 | 结果 |
|---|---|
| `dom_load` | 25/25（新增「外壳段标记成对」；rng 断言改为排除外壳身份随机） |
| `layout_chrome` | 65/65（原 60：删 7 项 `patchDLCChrome` 断言，加 5 项合并结构断言 + [4] 段重写） |
| `lobby_shell` | 53/53（**整体重写**，原 51 项针对旧外壳结构） |
| `battle_ui` | 24/24 |
| `bundle`（`build/`） | 58/58 |
| `pvp_core` | 20/20 |
| `pvp_e2e`（实起房间服务） | 26/26 |

合计 **271 项**，0 失败。

`lobby_shell` 新增/重写的关键项：
- 单文件结构：无 `#gameWrap` / 无 `iframe#game` / 无 `#hooksrc` / **只剩 1 条 iframe**（完整排行榜）
- 面板四条开合路径：`arkOpenLobby()` / 再按 / 遮罩 / Esc / 左上角 ✕
- 同名合并（9 条 → 8 行）、自己高亮、`[编辑]` 文案、`.tag [我]` 已消失、未上榜 `setRow`
- 编辑抽屉：紧跟在自己那行之后、预填当前账号、说明文字与原文逐字一致、非法输入不改账号、合法输入调 `renameAccount` 且 `isNewAccount === false`
- 竖屏密度：打桩棋盘 390×390 + 视口 844 → 面板 `height === 432px`（≥ 8 行且 ≤ 视野）
- 滚动条：5 条 CSS 断言锁住 `thin` / 半透明 thumb / 透明轨道

**未做的验证（如实说明）**：本机 Edge 的无头模式（`--headless=new` / `--headless` / `--remote-debugging-port`）启动即 exit 0，调试端口起不来，**无法截图**。所以「观感」层面（配色、字重、拥挤感）没有截图证据，只有几何常量与 CSS 断言。请在真机/浏览器里看一眼（见「七」）。

## 七、上线后请人眼确认（4 项）

1. 打开账号面板（棋盘左上角 👤），**前 8 名是否完整可见**、右侧滚动条是否为细窄半透明（不是白色宽条）。
2. 自己那行名字右侧的 **[编辑]**，点开后抽屉是否**正好长在自己那行下面**、输入框是否预填当前账号。
3. 改个名字保存 → 榜单里自己的名字变了、**层数/击杀/次数没被清零**（= 没有新注册）。
4. 竖屏与横屏各转一次，面板是否仍贴着棋盘左上角、角标是否仍在格子正中。

## 八、已知遗留（不在本次解决）

1. **跨设备找回与文案承诺不完全一致**。服务端身份：Telegram 入口 = `initData` 验签后的 tg user id（跨设备稳定）；网页游客 = `localStorage` 设备 id（**换设备即换 uid**）。所以网页通道下「换设备输入同一串找回同一账号」实际会新建一条记录，旧记录仍在榜上，靠前端 `mergeByName()` 合并显示掩盖。要真正兑现需 bot 侧支持以 `account` 为身份键 —— 本次不动 bot，仅记录。
2. **`05-score.js` 仍是 300ms 轮询**。本次只把「注入 + 跨文档」两层去掉（同文档直接读、直接调 `arkReportScore`），依赖 `phase/level/enemies` 三个顶层变量名的风险仍在。彻底做法是在 `initLevel()` 累加、在 `phase = PHASE.GAMEOVER` 处直接调用，但那要动游戏状态机，与本版「不改变玩法行为」的目标冲突，留待下一个 issue。
3. **`leaderboard.html`（完整排行榜）仍是 iframe**。它是独立页面，本次有意不合并。
4. **故障隔离消失**。以前游戏崩了还能开账号面板；现在同一文档，未捕获异常会一起带走。已做：外壳全链路 `try/catch`、无 `fetch` 环境静默降级、DOM 操作幂等。但没有强隔离手段。

## 九、部署必读

- **`index.html` 必须与 `game.html` 同批发**。新 `index.html` 只有跳转，若只更新 `game.html`，从域名根进去仍会落到旧外壳（旧外壳会用 `?v=10292xxx` 去拉 `game.html`，虽然能跑但会退化成双文档）。
- 新 `index.html` 的跳转**保留 `location.hash`** —— Telegram 的 `#tgWebAppData=...` 在 hash 里，丢了就退化成网页游客身份，成绩会记到另一条记录上。
- `leaderboard.html` / `leaderboard.json` 未改动，原样保留。
