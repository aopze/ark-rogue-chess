#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""方舟战棋 · 联机房间服务（零依赖，仅 Python 标准库）

设计取舍
--------
1. 不用 WebSocket，用 HTTP 长轮询。
   回合计提交，每回合最多 4 次往返（交计划 / 收计划 / 报就绪 / 收下一回合）。
   长轮询的延迟（约 50ms 一次唤醒）对回合制完全无感，换来的是：
   不需要 ws 库、不需要处理断线重连的帧、能穿过任何只放行 HTTP 的网络。

2. 服务端不结算战斗，只做「收计划 → 凑齐 → 广播 + 摇一颗种子」。
   原因是游戏保持单文件，规则逻辑无法在服务端复用，硬校验做不到。
   因此服务器是可信中继：它不判断计划是否合法，只保证两边收到的
   plan 和 seed 完全一致。战斗结果由两端各自重演，靠同一颗种子收敛。

3. 内存存房间，30 分钟无活动自动回收。进程重启会丢局，这可以接受
   （一局 PvP 通常 10 分钟内结束）；要持久化再挂 sqlite。

路由
----
POST /api/create  {name}                        -> {room, token, slot}
POST /api/join    {room, name}                  -> {token, slot}
GET  /api/poll    ?room=&token=&since=&wait=    -> {events:[], seq}
POST /api/plan    {room, token, turn, plan}     -> {ok, waiting}
POST /api/ready   {room, token, turn}           -> {ok, waiting}
POST /api/quit    {room, token}                 -> {ok}
GET  /api/health                                -> {ok, rooms}

事件（长轮询吐出）
------------------
start   {slots:[名字,名字]}            两人到齐，开局
plan_in {slot, turn}                  对手已交计划（只告诉你有，不告诉内容）
turn    {turn, plans:{0:?,1:?}, seed} 两份计划齐了，附本回合骰子种子
next    {turn}                        双方都看完结算，进入下一回合
peer_left {slot}
"""

import argparse
import json
import secrets
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOM_TTL = 30 * 60          # 房间闲置多久回收（秒）
POLL_TIMEOUT_MAX = 50.0     # 长轮询最长挂起时间（秒）
EVENTS_KEEP = 400           # 每房间保留的事件条数

LOCK = threading.Lock()
WAKE = threading.Condition(LOCK)
ROOMS = {}


# ---------------------------------------------------------------- 房间模型

def _now():
    return time.time()


def _emit(room, ev):
    """追加一条事件并唤醒所有挂起的轮询。调用方必须已持有 LOCK。"""
    room["seq"] += 1
    ev["seq"] = room["seq"]
    ev["t"] = _now()
    room["events"].append(ev)
    if len(room["events"]) > EVENTS_KEEP:
        room["events"] = room["events"][-EVENTS_KEEP:]
    room["active"] = _now()
    WAKE.notify_all()
    return ev


def _new_room(host_name):
    room = {
        "id": uuid.uuid4().hex[:6].upper(),
        "created": _now(),
        "active": _now(),
        "seq": 0,
        "events": [],
        "turn": 0,
        "slots": {0: {"name": host_name, "token": secrets.token_hex(8)},
                  1: None},
        "plans": {},    # {turn: {slot: plan}}
        "seed": {},     # {turn: seed}
        "ready": {},    # {turn: set(slot)}
    }
    ROOMS[room["id"]] = room
    return room


def _slot_of(room, token):
    for slot, p in room["slots"].items():
        if p and p["token"] == token:
            return slot
    return None


def _both_in(room):
    return room["slots"][0] and room["slots"][1]


def _cleanup_loop():
    """回收闲置房间，防止长期运行内存膨胀。"""
    while True:
        time.sleep(60)
        with LOCK:
            dead = [rid for rid, r in ROOMS.items()
                    if _now() - r["active"] > ROOM_TTL]
            for rid in dead:
                ROOMS.pop(rid, None)
        if dead:
            print(f"[cleanup] 回收房间 {dead}", flush=True)


# ---------------------------------------------------------------- HTTP 层

class Handler(BaseHTTPRequestHandler):
    server_version = "ArkRoom/0.1"
    protocol_version = "HTTP/1.1"

    # ---- 基础工具

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            # 客户端在长轮询返回前关掉了页面 / 切了后台。这是常态，不是错误。
            self.close_connection = True

    def _body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0:
                return {}
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return {}

    def _q(self, qs, key, default=None):
        v = qs.get(key)
        return v[0] if v else default

    def log_message(self, fmt, *args):
        pass  # 自己打日志，屏蔽 BaseHTTPRequestHandler 的逐请求输出

    # ---- 路由

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        if u.path == "/api/health":
            with LOCK:
                return self._send(200, {"ok": True, "rooms": len(ROOMS)})
        if u.path == "/api/poll":
            return self._poll(qs)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        d = self._body()
        fn = {
            "/api/create": self._create,
            "/api/join": self._join,
            "/api/plan": self._plan,
            "/api/ready": self._ready,
            "/api/quit": self._quit,
        }.get(u.path)
        if not fn:
            return self._send(404, {"error": "not found"})
        return fn(d)

    # ---- 具体接口

    def _create(self, d):
        name = str(d.get("name") or "房主")[:16]
        char_id = str(d.get("charId") or "")[:16]
        with LOCK:
            room = _new_room(name)
            room["slots"][0]["charId"] = char_id
            slot = 0
            token = room["slots"][0]["token"]
        print(f"[create] {room['id']} by {name} [{char_id or '-'}]", flush=True)
        return self._send(200, {"room": room["id"], "token": token, "slot": slot})

    def _join(self, d):
        rid = str(d.get("room") or "").strip().upper()
        name = str(d.get("name") or "挑战者")[:16]
        char_id = str(d.get("charId") or "")[:16]
        with LOCK:
            room = ROOMS.get(rid)
            if not room:
                return self._send(404, {"error": "房间不存在或已回收"})
            if room["slots"][1]:
                return self._send(409, {"error": "房间已满"})
            room["slots"][1] = {"name": name, "token": secrets.token_hex(8),
                                "charId": char_id}
            token = room["slots"][1]["token"]
            _emit(room, {"type": "start",
                         "slots": [room["slots"][0]["name"], name],
                         "chars": [room["slots"][0].get("charId", ""), char_id]})
        print(f"[join]  {rid} <- {name} [{char_id or '-'}]", flush=True)
        return self._send(200, {"token": token, "slot": 1})

    def _plan(self, d):
        rid = str(d.get("room") or "").upper()
        token = str(d.get("token") or "")
        try:
            turn = int(d.get("turn"))
        except (TypeError, ValueError):
            return self._send(400, {"error": "turn 缺失"})
        plan = d.get("plan")
        if plan is None:
            return self._send(400, {"error": "plan 缺失"})

        with LOCK:
            room = ROOMS.get(rid)
            if not room:
                return self._send(404, {"error": "房间不存在"})
            slot = _slot_of(room, token)
            if slot is None:
                return self._send(403, {"error": "token 无效"})
            if turn != room["turn"]:
                # 重复提交同一回合是合法的（重连后补发），回合已过则拒绝
                return self._send(409, {"error": f"回合不同步，服务端在 {room['turn']}"})

            cur = room["plans"].setdefault(turn, {})
            if slot in cur:
                return self._send(200, {"ok": True, "dup": True})
            cur[slot] = plan
            room["active"] = _now()

            if len(cur) < 2:
                _emit(room, {"type": "plan_in", "slot": slot, "turn": turn})
                return self._send(200, {"ok": True, "waiting": True})

            # 两份齐了 → 摇种子并广播
            seed = secrets.randbelow(2 ** 31 - 1)
            room["seed"][turn] = seed
            _emit(room, {"type": "turn", "turn": turn, "seed": seed,
                         "plans": {str(k): v for k, v in cur.items()}})
        print(f"[turn]  {rid} #{turn} both plans in, seed={seed}", flush=True)
        return self._send(200, {"ok": True, "waiting": False})

    def _ready(self, d):
        rid = str(d.get("room") or "").upper()
        token = str(d.get("token") or "")
        try:
            turn = int(d.get("turn"))
        except (TypeError, ValueError):
            return self._send(400, {"error": "turn 缺失"})

        with LOCK:
            room = ROOMS.get(rid)
            if not room:
                return self._send(404, {"error": "房间不存在"})
            slot = _slot_of(room, token)
            if slot is None:
                return self._send(403, {"error": "token 无效"})
            rs = room["ready"].setdefault(turn, set())
            rs.add(slot)
            room["active"] = _now()
            if len(rs) < 2:
                return self._send(200, {"ok": True, "waiting": True})
            if room["turn"] == turn:
                room["turn"] = turn + 1
                _emit(room, {"type": "next", "turn": room["turn"]})
            return self._send(200, {"ok": True, "waiting": False})

    def _quit(self, d):
        rid = str(d.get("room") or "").upper()
        token = str(d.get("token") or "")
        with LOCK:
            room = ROOMS.get(rid)
            if not room:
                return self._send(404, {"error": "房间不存在"})
            slot = _slot_of(room, token)
            if slot is None:
                return self._send(403, {"error": "token 无效"})
            _emit(room, {"type": "peer_left", "slot": slot})
            ROOMS.pop(rid, None)
        return self._send(200, {"ok": True})

    def _poll(self, qs):
        rid = str(self._q(qs, "room", "")).upper()
        token = str(self._q(qs, "token", ""))
        try:
            since = int(self._q(qs, "since", "0"))
            wait = min(float(self._q(qs, "wait", "25")), POLL_TIMEOUT_MAX)
        except ValueError:
            return self._send(400, {"error": "参数错误"})

        deadline = _now() + wait
        with LOCK:
            room = ROOMS.get(rid)
            if not room:
                return self._send(404, {"error": "房间不存在"})
            if _slot_of(room, token) is None:
                return self._send(403, {"error": "token 无效"})

            while True:
                room["active"] = _now()
                fresh = [e for e in room["events"] if e["seq"] > since]
                if fresh:
                    return self._send(200, {"events": fresh,
                                            "seq": room["seq"],
                                            "turn": room["turn"]})
                left = deadline - _now()
                if left <= 0:
                    return self._send(200, {"events": [], "seq": room["seq"],
                                            "turn": room["turn"]})
                WAKE.wait(left)


class QuietServer(ThreadingHTTPServer):
    """客户端断连（关页面、切后台、AbortController）会抛 ConnectionResetError。
    这是长轮询的常态，不该在日志里刷一屏堆栈，其余异常照常打印。"""
    daemon_threads = True

    def handle_error(self, request, client_address):
        import sys
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, ConnectionAbortedError,
                            BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def main():
    ap = argparse.ArgumentParser(description="方舟战棋联机房间服务")
    ap.add_argument("--host", default="127.0.0.1",
                    help="监听地址。走 Funnel/Tunnel 时保持 127.0.0.1；"
                         "局域网直连调试用 0.0.0.0")
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()

    threading.Thread(target=_cleanup_loop, daemon=True).start()
    srv = QuietServer((args.host, args.port), Handler)
    print(f"方舟战棋房间服务已启动 → http://{args.host}:{args.port}", flush=True)
    print(f"健康检查：curl http://{args.host}:{args.port}/api/health", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止", flush=True)


if __name__ == "__main__":
    main()
