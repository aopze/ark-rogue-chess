#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
push_api.py 覆盖保护的单测（离线：不联网、不写远端、不需要 token）

为什么需要它：
  保护逻辑本身若不被验证，等于不存在。2026-10-27 P0.1-1 的事故，
  根因就是"没人检查过远端 game.html 是否已被他人推进"。
  这个测试用假的远端 sha 直接驱动 guard_against_overwrite，
  覆盖 放行 / 拦截 / 强制 / 无法判定 四条路径，以及 --base 的优先级。

用法：
    python net/push_guard_test.py
"""
import importlib.util
import json
import os
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("push_api", os.path.join(HERE, "push_api.py"))
push_api = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(push_api)

OK, BAD = [], []


def mkroot():
    """临时仓库根（非 git 仓库，确保 git 兜底读不到东西）。"""
    d = tempfile.mkdtemp(prefix="arkguard_")
    os.makedirs(os.path.join(d, "net"), exist_ok=True)
    return d


def write_state(root, files):
    with open(os.path.join(root, "net", ".push_baseline.json"), "w", encoding="utf-8") as f:
        json.dump({"files": files}, f)


def expect_exit(code=3):
    """断言被覆盖保护以指定退出码中止。"""
    def deco(fn):
        def wrapped():
            try:
                fn()
            except SystemExit as e:
                assert e.code == code, "退出码应为 %s，实际 %r" % (code, e.code)
                return
            raise AssertionError("应当中止，却放行了")
        return wrapped
    return deco


def check(name, fn):
    try:
        fn()
        OK.append(name)
        print("  ✅ %s" % name)
    except AssertionError as e:
        BAD.append(name)
        print("  ❌ %s —— %s" % (name, e))
    except Exception as e:
        BAD.append(name)
        print("  ❌ %s —— 异常 %r" % (name, e))


# ---- 测试数据 ---------------------------------------------------------------
LOCAL_RAW = b"local content v1"
BASE_RAW = b"remote version that I started from"
OTHER_RAW = b"someone else pushed this meanwhile"

LOCAL_SHA = push_api.blob_sha(LOCAL_RAW)
BASE_SHA = push_api.blob_sha(BASE_RAW)
OTHER_SHA = push_api.blob_sha(OTHER_RAW)

ITEMS = [("game.html", LOCAL_RAW)]


# ---- 用例 -------------------------------------------------------------------
def t_new_file():
    """远端还没有这个文件 → 是新增，不存在覆盖，放行。"""
    push_api.guard_against_overwrite(mkroot(), ITEMS, {}, {}, force=False)


def t_identical():
    """本地内容与远端完全一致 → 本次根本不会写入，放行。"""
    push_api.guard_against_overwrite(
        mkroot(), [("game.html", LOCAL_RAW)], {"game.html": LOCAL_SHA}, {}, force=False)


def t_baseline_match():
    """远端仍是基线记录里的那一版 → 无人推进，放行。"""
    root = mkroot()
    write_state(root, {"game.html": BASE_SHA})
    push_api.guard_against_overwrite(
        root, ITEMS, {"game.html": BASE_SHA}, {}, force=False)


@expect_exit(3)
def t_baseline_mismatch():
    """远端已变成第三方版本 → 拦截，防止整片抹掉他人改动。"""
    root = mkroot()
    write_state(root, {"game.html": BASE_SHA})
    push_api.guard_against_overwrite(
        root, ITEMS, {"game.html": OTHER_SHA}, {}, force=False)


def t_force_passes():
    """--force 时即使不匹配也放行（责任自负）。"""
    root = mkroot()
    write_state(root, {"game.html": BASE_SHA})
    push_api.guard_against_overwrite(
        root, ITEMS, {"game.html": OTHER_SHA}, {}, force=True)


@expect_exit(3)
def t_unknown_baseline():
    """既无基线记录、git 也读不到 → 无法判定，按有风险处理。"""
    push_api.guard_against_overwrite(
        mkroot(), ITEMS, {"game.html": OTHER_SHA}, {}, force=False)


def t_explicit_base_match():
    """--base 指定的那版就是远端当前 → 放行。"""
    push_api.guard_against_overwrite(
        mkroot(), ITEMS, {"game.html": BASE_SHA}, {"game.html": BASE_SHA}, force=False)


@expect_exit(3)
def t_explicit_base_wins():
    """--base 与远端不符时，即使基线记录里'碰巧'有远端这版，也必须拦截。
       （验证 --base 是最高优先级，不被兜底来源稀释）"""
    root = mkroot()
    write_state(root, {"game.html": OTHER_SHA})   # 兜底本会放行
    push_api.guard_against_overwrite(
        root, ITEMS, {"game.html": OTHER_SHA}, {"game.html": BASE_SHA}, force=False)


def t_state_roundtrip():
    """基线记录的写入/读取闭环（save_state → load_state → 用于判定）。"""
    root = mkroot()
    st = push_api.load_state(root)
    assert st == {}, "空目录应无基线记录"
    push_api.save_state(root, {"branch": "main", "files": {"game.html": BASE_SHA}})
    st = push_api.load_state(root)
    assert st["files"]["game.html"] == BASE_SHA, "写入后应能读回同一 sha"
    assert os.path.isfile(os.path.join(root, "net", ".push_baseline.json"))


def t_multi_file_blocks_only_risky():
    """多文件推送：只拦有风险的那一个，安全的那个不受影响（仍整体中止）。"""
    root = mkroot()
    write_state(root, {"game.html": BASE_SHA, "CHANGELOG.md": push_api.blob_sha(b"cl base")})
    items = [("CHANGELOG.md", b"cl local"), ("game.html", LOCAL_RAW)]
    remote = {"CHANGELOG.md": push_api.blob_sha(b"cl base"),   # 未变，安全
              "game.html": OTHER_SHA}                          # 被人推进，风险
    try:
        push_api.guard_against_overwrite(root, items, remote, {}, force=False)
    except SystemExit as e:
        assert e.code == 3
        return
    raise AssertionError("存在风险文件却放行了")


CASES = [
    ("远端无此文件（新增）→ 放行", t_new_file),
    ("本地与远端一致 → 放行", t_identical),
    ("基线匹配远端 → 放行", t_baseline_match),
    ("远端被他人推进 → 拦截(3)", t_baseline_mismatch),
    ("--force 时放行", t_force_passes),
    ("无法判定基线 → 拦截(3)", t_unknown_baseline),
    ("--base 匹配 → 放行", t_explicit_base_match),
    ("--base 优先级高于兜底 → 拦截(3)", t_explicit_base_wins),
    ("基线记录写入/读回闭环", t_state_roundtrip),
    ("多文件：有风险即整体拦截", t_multi_file_blocks_only_risky),
]


def main():
    print("=" * 66)
    print("push_api.py 覆盖保护 单测（离线）")
    print("=" * 66)
    for name, fn in CASES:
        check(name, fn)
    print("=" * 66)
    print("通过 %d / 失败 %d" % (len(OK), len(BAD)))
    if BAD:
        print("失败项：" + ", ".join(BAD))
    return 0 if not BAD else 1


if __name__ == "__main__":
    raise SystemExit(main())
