# 发版说明（RELEASE）

> 本文件从 `README` §0.9 摘出发版相关部分，方便发版时单看一篇。
> **§0.9 仍是权威**，冲突时以 §0.9 为准。

## 双 BUILD 必须同时改

| 位置 | 变量 | 作用 |
|---|---|---|
| `game.html` | `window.__ARK_VERSION__.build` | 玩家自查版本（标题栏「设置」右侧显示 `v<build>`） |
| `index.html` | `var BUILD = '...'` | iframe 用 `game.html?v=<BUILD>` 拉取，**改变 URL 才能穿透 CDN 缓存** |

两处值必须相同，格式 `YYYYMMDDx`（如 `20261028a`，同日多次发版顺延 `b`、`c`…）。

> `P0.1-3` 落地后由构建脚本自动注入并校验（`AC-23`），不再依赖人工记忆。
> `index.html` 是只读资产，脚本**只校验不改写** —— 不一致时构建失败并打印应改的值。

## 发布后自检 3 步

1. `GET https://api.github.com/repos/aopze/ark-rogue-chess/contents/game.html`
   解码 base64 与本地 `cmp` 比对 —— 确认**服务器收到了**（与 CDN 无关）。
2. `GET .../pages/builds/latest` 确认 `status: built`、`error.message: null`。
3. 浏览器访问 `game.html?v=<新build>`，看版本号是否为新值。

Pages 走 Fastly，`Cache-Control: max-age=600`：**发布后 10 分钟内仍可能看到旧版属正常**，别误判为没上线。

## 推送通道

`git push` 在本机常被拦；稳定路径是 `net/push_api.py`（走 `api.github.com`）。
它带**并发覆盖保护**：远端目标文件若已被他人推进，会以退出码 3 中止（详见 `README` §0.6）。
