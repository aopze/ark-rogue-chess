# 发版说明（RELEASE）

> 本文件从 `README` §0.9 摘出发版相关部分，方便发版时单看一篇。
> **§0.9 仍是权威**，冲突时以 §0.9 为准。

## 双 BUILD 必须同时改

| 位置 | 变量 | 作用 |
|---|---|---|
| `game.html` | `window.__ARK_VERSION__.build` | 玩家自查版本（标题栏「设置」右侧显示 `v<build>`） |
| `index.html` | `var BUILD = '...'` | iframe 用 `game.html?v=<BUILD>` 拉取，**改变 URL 才能穿透 CDN 缓存** |

两处值必须相同，格式 `YYYYMMDDx`（如 `20261028a`，同日多次发版顺延 `b`、`c`…）。

> ✅ `P0.1-3` 已落地：`build/bundle.mjs` 自动注入 `game.html` 的 build（取自 `index.html` 的 `var BUILD`），
> 并校验两者一致（`AC-23`）。`index.html` 是只读资产，脚本**只校验不改写** —— 不一致时构建失败并打印应改的值。

## 构建 → 发布 → 回滚（四步）

```bash
# ① 改 index.html 的 BUILD（人类做；脚本不碰只读资产）
#    下一个 build 号可用下面这行查：
node build/bundle.mjs --bump            # 例：当前 20261028a → 输出 20261028b

# ② 试构建 + 与上版比对（只写 build/out/，不碰根目录）
node build/bundle.mjs --prev game.html

# ③ 发版：写根目录产物（属发版动作，需显式授权）
ARK_RELEASE_OK=1 node build/bundle.mjs --out game.html --prev game.html
#   随后用 net/push_api.py 推送（带并发覆盖保护）
python net/push_api.py --file game.html --message "..."

# ④ 回滚
git checkout <上一版提交> -- game.html && python net/push_api.py --file game.html --message "回滚 ..."
```

> 第 ② 步的 `--prev` 会做**产物一致性比对**：归一化（去注释/空白、抹平版本对象）后应与上版完全一致，
> 否则说明拆分引入了实质改动，需人工确认。

## 发布后自检 3 步

1. `GET https://api.github.com/repos/aopze/ark-rogue-chess/contents/game.html`
   解码 base64 与本地 `cmp` 比对 —— 确认**服务器收到了**（与 CDN 无关）。
2. `GET .../pages/builds/latest` 确认 `status: built`、`error.message: null`。
3. 浏览器访问 `game.html?v=<新build>`，看版本号是否为新值。

Pages 走 Fastly，`Cache-Control: max-age=600`：**发布后 10 分钟内仍可能看到旧版属正常**，别误判为没上线。

## 推送通道

`git push` 在本机常被拦；稳定路径是 `net/push_api.py`（走 `api.github.com`）。
它带**并发覆盖保护**：远端目标文件若已被他人推进，会以退出码 3 中止（详见 `README` §0.6）。
