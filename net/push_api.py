#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
方舟战棋 -> GitHub Pages 推送（API 模式）

为什么需要它：本机网络对 github.com 的 CONNECT 被代理拦（502），
git push / clone 全都走不通；而 api.github.com 是通的。
所以改走 GitHub REST 的 Git Data API：blob -> tree -> commit -> 更新 ref，
一次提交里可以带多个文件，且是原子的（要么全成功，要么全不变）。

用法：
    # token 从环境变量读（推荐，不会进命令行历史）
    set GITHUB_TOKEN=github_pat_xxx          # Windows cmd
    $env:GITHUB_TOKEN="github_pat_xxx"       # PowerShell
    export GITHUB_TOKEN=github_pat_xxx       # bash

    python net/push_api.py                      # 只推 game.html
    python net/push_api.py --file game.html --file net/net.js
    python net/push_api.py --all-net            # game.html + net/ 下所有脚本
    python net/push_api.py --dry-run            # 只检查，不写

    # 也可以直接传
    python net/push_api.py --token github_pat_xxx

并发覆盖保护（默认开启，见文件内 §并发覆盖保护 注释）：
    python net/push_api.py --sync-baseline      # 声明"我已对齐远端最新"，记录基线
    python net/push_api.py --base <commit-sha>  # 显式声明改动基于哪个提交
    python net/push_api.py --force              # 明知有人推进过，仍要覆盖（慎用）

token 最小权限：Fine-grained PAT，只勾选 aopze/ark-rogue-chess 这一个仓库，
Repository permissions -> Contents: Read and write。别的都不用勾。
创建入口：https://github.com/settings/personal-access-tokens/new
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"
UA = "ark-rogue-chess-push/1.0"


def call(method, path, token, body=None, retries=3):
    """调 API，返回 (status, json)。401/403/404 直接抛出可读错误。"""
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Bearer " + token)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        req.add_header("User-Agent", UA)
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = json.loads(e.read()).get("message", "")
            except Exception:
                pass
            if e.code in (401, 403, 404, 409, 422):
                raise RuntimeError(
                    "GitHub 返回 %d：%s\n  请求：%s %s" % (e.code, detail or "(无消息)", method, url)
                )
            last = RuntimeError("HTTP %d %s" % (e.code, detail))
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = RuntimeError("网络错误：%s" % e)
        time.sleep(1.2 * (attempt + 1))
    raise last


def blob_sha(content_bytes):
    """本地算 git blob sha，用来判断文件是否真的变了（避免空提交）。"""
    import hashlib
    head = b"blob %d\x00" % len(content_bytes)
    return hashlib.sha1(head + content_bytes).hexdigest()


def collect_files(args, root):
    files = []
    if args.all_net:
        files.append("game.html")
        net_dir = os.path.join(root, "net")
        for name in sorted(os.listdir(net_dir)):
            p = os.path.join(net_dir, name)
            if os.path.isfile(p) and not name.startswith(".") and not name.endswith((".log", ".pyc")):
                files.append("net/" + name)
    else:
        files = list(args.file or []) or ["game.html"]
    out = []
    for rel in files:
        full = os.path.join(root, rel.replace("/", os.sep))
        if not os.path.isfile(full):
            raise SystemExit("找不到文件：%s" % rel)
        with open(full, "rb") as f:
            out.append((rel, f.read()))
    return out


# ---------------------------------------------------------------------------
# §并发覆盖保护
#
# 背景（2026-10-27 P0.1-1 真实事故）：
#   game.html 是单文件产物，API 用 base_tree 增量建树 —— 语义是"整文件覆盖"。
#   两个 bot 同时改 game.html 时，后推的一方会整片抹掉先推那方的改动，
#   而因为是 fast-forward 成功提交，不会报任何错，改动就这么无声消失了。
#   原实现的 422 重试更危险：它重取基线后仍用同一份本地内容再推一次，
#   等于"检测到有人抢先，然后坚持覆盖他"。
#
# 保护原理（一句话）：
#   推送前先问 "远端当前这一版，是我所知道的那一版吗？"
#   判据：远端该文件的 blob sha，是否命中「我的基线」。
#
# 基线 = 我这次改动所基于的那个版本，来源优先级：
#   1) --base <commit>                     显式声明，最可靠
#   2) net/.push_baseline.json             上次推送/对齐时记录的远端文件 sha
#   3) 本地 git 的 HEAD / origin/main      兜底
# 三者都无法判定时，按"有可能覆盖"处理，要求显式 --sync-baseline 或 --force。
#
# 误报（保守中止）远好过漏报（静默丢改动）；中止信息里给出 rebase 的正确姿势。
# ---------------------------------------------------------------------------

REPO_DEFAULT = "aopze/ark-rogue-chess"
BASELINE_REL = "net/.push_baseline.json"


def state_path(root):
    return os.path.join(root, "net", ".push_baseline.json")


def load_state(root):
    p = state_path(root)
    if not os.path.isfile(p):
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(root, state):
    state["observed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        with open(state_path(root), "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("  ⚠️  基线记录写入失败（不影响本次推送）：%s" % e)


def git_blob_sha(root, ref, rel):
    """从本地 git 读某版本下该文件的 blob sha；git 不可用或不存在则返回 None。"""
    import subprocess
    try:
        r = subprocess.run(["git", "rev-parse", "--verify", "--quiet", "%s:%s" % (ref, rel)],
                           cwd=root, capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            return r.stdout.strip() or None
    except Exception:
        pass
    return None


def known_baseline_shas(root, rel, explicit_base_map):
    """我所知道的、该文件"改动前"可能的版本集合。"""
    if rel in explicit_base_map:
        return {explicit_base_map[rel]}
    known = set()
    recorded = (load_state(root).get("files") or {}).get(rel)
    if recorded:
        known.add(recorded)
    for ref in ("HEAD", "origin/main", "origin/HEAD"):
        s = git_blob_sha(root, ref, rel)
        if s:
            known.add(s)
    return known


def resolve_explicit_base(token, repo, base_commit, rels):
    """--base <commit>：取该提交里各文件的 blob sha，作为唯一可信基线。"""
    st, cm = call("GET", "/repos/%s/git/commits/%s" % (repo, base_commit), token)
    st, tr = call("GET", "/repos/%s/git/trees/%s?recursive=1" % (repo, cm["tree"]["sha"]), token)
    return {e["path"]: e["sha"] for e in tr.get("tree", [])
            if e["type"] == "blob" and e["path"] in rels}


def guard_against_overwrite(root, items, remote, explicit_base_map, force=False):
    """
    推送前检查远端这些文件是否已被他人推进到我认知之外的版本。
    - 无风险：打印一行确认后返回
    - 有风险 / 无法判定：打印处置指引；未给 --force 则以退出码 3 中止
    """
    blocked, unknown = [], []
    for rel, raw in items:
        local = blob_sha(raw)
        rsha = remote.get(rel)
        if rsha is None:
            continue                       # 远端尚无此文件 → 新增，不存在覆盖
        if local == rsha:
            continue                       # 内容已一致 → 本次不会写入
        known = known_baseline_shas(root, rel, explicit_base_map)
        if not known:
            unknown.append(rel)
        elif rsha not in known:
            blocked.append((rel, rsha, sorted(known)))

    if not blocked and not unknown:
        print("  🛡️  覆盖保护：远端相关文件无他人推进，可安全推送")
        return

    print("\n" + "=" * 68)
    print("🔴 覆盖保护触发 —— README §0.6：不得靠『选一边』了事")
    print("=" * 68)
    for rel, rsha, known in blocked:
        print("\n  ▸ %s" % rel)
        print("      远端当前 : %s" % rsha[:10])
        print("      我的基线 : %s" % ", ".join(k[:10] for k in known))
        print("      → 我的改动基于旧版，直接推送会整片抹掉他人改动")
    if unknown:
        print("\n  ▸ 无法判定基线的文件：%s" % ", ".join(unknown))
        print("      本机既无基线记录、git 也读不到对应版本")
        print("      → 若你已确认本地版本不落后于远端，先声明基线：")
        print("        python net/push_api.py --sync-baseline")
    print("\n  正确处理（rebase，不是覆盖）：")
    print("    1) 取回远端最新版：GET /repos/%s/contents/<file>?ref=main" % REPO_DEFAULT)
    print("    2) 在远端最新版之上重新叠加你的改动")
    print("    3) 重跑回归测试，再 --sync-baseline 声明已对齐，然后推送")
    print("  确知后果且执意覆盖时：追加 --force\n")

    if force:
        print("  ⚠️  已指定 --force：跳过保护，继续推送（改动丢失风险自负）\n")
        return
    raise SystemExit(3)


def push(token, repo, branch, items, message, dry_run=False,
         root=None, explicit_base=None, force=False):
    # 1. 仓库信息（默认分支 / 权限自检）
    st, info = call("GET", "/repos/" + repo, token)
    branch = branch or info.get("default_branch") or "main"
    if not info.get("permissions", {}).get("push", True):
        print("  ⚠️  token 可能没有写权限（permissions.push = false），继续尝试")

    # 显式基线：--base <commit> 指定时，它是唯一可信的"我改动前的版本"
    explicit_base_map = {}
    if explicit_base:
        explicit_base_map = resolve_explicit_base(
            token, repo, explicit_base, {rel for rel, _ in items})
        print("  基线提交：%s（--base，%d 个文件对齐）"
              % (explicit_base[:10], len(explicit_base_map)))

    for attempt in range(3):
        # 2. 当前分支头
        st, ref = call("GET", "/repos/%s/git/ref/heads/%s" % (repo, branch), token)
        base_commit = ref["object"]["sha"]
        st, commit = call("GET", "/repos/%s/git/commits/%s" % (repo, base_commit), token)
        base_tree = commit["tree"]["sha"]
        print("  分支 %s 当前头：%s" % (branch, base_commit[:10]))

        # 3. 逐个建 blob（本地 sha 与远端一致的跳过）
        st, tree_now = call("GET", "/repos/%s/git/trees/%s?recursive=1" % (repo, base_tree), token)
        remote = {e["path"]: e["sha"] for e in tree_now.get("tree", []) if e["type"] == "blob"}

        # 覆盖保护：每次（重）取基线后都要重跑 —— 重试时远端可能已被他人推进，
        # 绝不能拿同一份本地内容再覆盖一次
        if root:
            guard_against_overwrite(root, items, remote, explicit_base_map, force=force)

        entries, changed = [], []
        for rel, raw in items:
            sha = blob_sha(raw)
            if remote.get(rel) == sha:
                print("  = %-22s 无变化（%d B）" % (rel, len(raw)))
                continue
            if dry_run:
                print("  + %-22s 待写入 %d B" % (rel, len(raw)))
                changed.append(rel)
                continue
            st, blob = call("POST", "/repos/%s/git/blobs" % repo, token,
                            {"content": base64.b64encode(raw).decode("ascii"), "encoding": "base64"})
            entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
            print("  + %-22s 上传 %d B" % (rel, len(raw)))
            changed.append(rel)

        if not changed:
            print("  已经是目标状态，无需提交。")
            return base_commit, []

        if dry_run:
            print("  [dry-run] 将提交 %d 个文件，未写入。" % len(changed))
            return None, changed

        # 4. tree -> commit -> 移动 ref
        st, tree = call("POST", "/repos/%s/git/trees" % repo, token,
                        {"base_tree": base_tree, "tree": entries})
        st, newc = call("POST", "/repos/%s/git/commits" % repo, token,
                        {"message": message, "tree": tree["sha"], "parents": [base_commit]})
        try:
            call("PATCH", "/repos/%s/git/refs/heads/%s" % (repo, branch), token,
                 {"sha": newc["sha"], "force": False})
        except RuntimeError as e:
            if "422" in str(e) or "fast forward" in str(e).lower():
                print("  ⚠️  分支被别处推动过，重取基线后再试（%d/3）" % (attempt + 1))
                continue
            raise
        print("  ✅ 已提交 %s" % newc["sha"][:10])
        return newc["sha"], changed

    raise SystemExit("重试 3 次仍未成功，可能有其他进程在同时改这个分支。")


def verify(token, repo, branch, items):
    print("\n[校验] 读回远端内容，逐字节比对")
    ok = True
    for rel, raw in items:
        st, d = call("GET", "/repos/%s/contents/%s?ref=%s" % (repo, rel, branch), token)
        size = d.get("size")
        if size != len(raw):
            print("  ❌ %-22s 远端 %s B / 本地 %d B" % (rel, size, len(raw)))
            ok = False
            continue
        import hashlib
        remote_blob = "blob %d\u0000" % size
        # 远端 sha 是 git blob sha，与本地计算方式一致
        local_sha = blob_sha(raw)
        if d.get("sha") == local_sha:
            print("  ✅ %-22s %d B  sha 一致 %s" % (rel, size, local_sha[:10]))
        else:
            print("  ❌ %-22s 大小对但 sha 不符（远端 %s）" % (rel, d.get("sha", "")[:10]))
            ok = False
    return ok


def sync_baseline(token, repo, branch, root):
    """把远端当前各文件 sha 记入本地基线，等价于『我已对齐远端最新版』声明。"""
    st, info = call("GET", "/repos/" + repo, token)
    branch = branch or info.get("default_branch") or "main"
    st, ref = call("GET", "/repos/%s/git/ref/heads/%s" % (repo, branch), token)
    head = ref["object"]["sha"]
    st, tree = call("GET", "/repos/%s/git/trees/%s?recursive=1" % (repo, head), token)
    files = {e["path"]: e["sha"] for e in tree.get("tree", []) if e["type"] == "blob"}

    stt = load_state(root)
    stt["branch"] = branch
    stt["remote_head"] = head
    stt["files"] = files
    save_state(root, stt)

    print("[基线] 已记录 %s @ %s 共 %d 个文件 → %s" % (branch, head[:10], len(files), BASELINE_REL))
    for rel in ("game.html", "index.html", "README.md", "CHANGELOG.md"):
        if rel in files:
            print("    %-18s %s" % (rel, files[rel][:10]))
    print("  含义：你已对齐远端最新版，可在此之上改动并安全推送。")
    print("        若期间他人再推进同一文件，推送前会被覆盖保护拦下。")
    return 0


def main():
    ap = argparse.ArgumentParser(description="通过 GitHub REST API 推送（绕过被拦的 github.com）")
    ap.add_argument("--token", default=os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"))
    ap.add_argument("--repo", default="aopze/ark-rogue-chess")
    ap.add_argument("--branch", default=None, help="默认用仓库的 default_branch")
    ap.add_argument("--file", action="append", help="要推送的路径（相对仓库根），可重复")
    ap.add_argument("--all-net", action="store_true", help="game.html + net/ 下所有脚本")
    ap.add_argument("--message", default="feat: 加入联机对战（PvP）\n\n"
                                        "- 9 处 Math.random 改写为可播种 PRNG（mulberry32）\n"
                                        "- 新增 pvpResolveTurn 纯函数结算核心（同时移动/相杀/闪避/射程）\n"
                                        "- 内联联机模块：建房、加入、提交计划、事件回放、胜负判定\n"
                                        "- renderUnits 支持对手单位（橙色血条）")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--base", default=None,
                    help="显式声明本次改动基于哪个提交 sha（覆盖保护的基线）")
    ap.add_argument("--force", action="store_true",
                    help="检测到他人推进过仍要覆盖（默认拒绝，README §0.6）")
    ap.add_argument("--sync-baseline", action="store_true",
                    help="只记录远端当前各文件 sha 到本地基线，不推送。"
                         "用于『我已对齐远端最新版』的声明，或 rebase 完成后刷新基线")
    args = ap.parse_args()

    if not args.token:
        print("缺少 token。任选一种：\n"
              "  1) 设置环境变量 GITHUB_TOKEN\n"
              "  2) python net/push_api.py --token github_pat_xxx\n"
              "创建 Fine-grained PAT：https://github.com/settings/personal-access-tokens/new\n"
              "  仅需 Contents: Read and write，仓库只勾 %s" % args.repo)
        return 2

    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    if args.sync_baseline:
        return sync_baseline(args.token, args.repo, args.branch, root)

    items = collect_files(args, root)
    print("[推送] %s" % args.repo)
    for rel, raw in items:
        print("  待推：%-24s %d B" % (rel, len(raw)))

    sha, changed = push(args.token, args.repo, args.branch, items, args.message,
                        args.dry_run, root=root, explicit_base=args.base, force=args.force)
    if args.dry_run or not changed:
        return 0

    st, info = call("GET", "/repos/" + args.repo, args.token)
    branch = args.branch or info["default_branch"]

    # 推送成功 → 远端这几个文件现在就是我推上去的内容，刷新基线
    stt = load_state(root)
    stt["branch"] = branch
    stt["remote_head"] = sha
    stt.setdefault("files", {}).update({rel: blob_sha(raw) for rel, raw in items})
    save_state(root, stt)

    ok = verify(args.token, args.repo, branch, items)
    print("\n提交：https://github.com/%s/commit/%s" % (args.repo, sha))
    print("Pages 会在 1-2 分钟内生效（CDN 缓存约 10 分钟）：")
    print("  https://%s.github.io/%s/game.html" % (args.repo.split("/")[0].lower(), args.repo.split("/")[1]))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
