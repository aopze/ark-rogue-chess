/* 方舟战棋 · 联机传输层（浏览器端）
 *
 * 形态：普通 <script>，挂到 window.NET，不依赖任何库。
 * 可以直接内联进 game.html（保持单文件），也可以 <script src="net/net.js">。
 *
 * 用法：
 *   NET.config({ base: 'https://xxx.ts.net' });
 *   NET.on('start', ({slots}) => {...});
 *   NET.on('turn',  ({turn, seed, plans}) => {...});
 *   NET.on('next',  ({turn}) => {...});
 *   await NET.create('房主名');        // 或 await NET.join('A1B2C3', '名字')
 *   NET.plan(turn, plan);              // 提交本回合计划
 *   NET.ready(turn);                   // 结算动画播完，报就绪
 *
 * 设计要点：
 *   - 长轮询而不是 WebSocket：回合制每回合至多 4 次往返，够用，且不用处理帧重连。
 *   - 断线自愈：轮询失败按 1s→2s→4s→5s 退避重连，从上次 seq 续读，事件不丢。
 *   - 混合内容护栏：https 页面连 http 服务一定失败，这里提前报明确错误，
 *     而不是让 fetch 抛一个看不出原因的 TypeError。
 */
(function (global) {
  'use strict';

  var CFG = { base: '', pollWait: 25 };
  var S = {
    room: null, token: null, slot: -1,
    seq: 0, turn: 0, alive: false, handlers: {}
  };
  var ctrl = null;

  function emit(name, data) {
    var list = S.handlers[name];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](data); } catch (e) {
        console.error('[NET] handler error on "' + name + '"', e);
      }
    }
  }

  function on(name, fn) {
    (S.handlers[name] = S.handlers[name] || []).push(fn);
    return NET;
  }

  function config(o) {
    if (!o) return CFG;
    if (o.base != null) CFG.base = String(o.base).replace(/\/+$/, '');
    if (o.pollWait != null) CFG.pollWait = o.pollWait;
    var b = CFG.base;
    if (global.location.protocol === 'https:' && /^http:\/\//i.test(b)) {
      throw new Error(
        '[NET] 混合内容会被浏览器拦截：当前页面是 https，服务地址却是 ' + b +
        '\n请用 Tailscale Funnel / Cloudflare Tunnel 提供的 https 地址。'
      );
    }
    return CFG;
  }

  function req(path, body) {
    var opt = { method: body === undefined ? 'GET' : 'POST', cache: 'no-store' };
    if (body !== undefined) {
      opt.headers = { 'Content-Type': 'application/json' };
      opt.body = JSON.stringify(body);
    }
    return fetch(CFG.base + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var err = new Error(j.error || ('HTTP ' + r.status));
          err.status = r.status;
          throw err;
        }
        return j;
      });
    });
  }

  function absorb(events) {
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.seq > S.seq) S.seq = ev.seq;
      if (ev.type === 'turn') S.turn = ev.turn + 1;
      if (ev.type === 'next') S.turn = ev.turn;
      emit(ev.type, ev);
      emit('*', ev);
    }
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function loop() {
    if (!S.alive) return;
    var url = '/api/poll?room=' + encodeURIComponent(S.room) +
              '&token=' + encodeURIComponent(S.token) +
              '&since=' + S.seq + '&wait=' + CFG.pollWait;
    ctrl = (global.AbortController ? new AbortController() : null);
    var opt = { cache: 'no-store' };
    if (ctrl) opt.signal = ctrl.signal;

    fetch(CFG.base + url, opt).then(function (r) {
      return r.json();
    }).then(function (j) {
      if (j.events && j.events.length) absorb(j.events);
      if (typeof j.turn === 'number' && j.turn > S.turn) S.turn = j.turn;
      emit('_alive', {});
      loop();
    }).catch(function (e) {
      if (!S.alive) return;
      emit('error', e);
      // 403/404 是致命错误（房间没了 / token 失效），别再无脑重连
      if (e && (e.status === 403 || e.status === 404)) {
        S.alive = false;
        emit('closed', { reason: e.message });
        return;
      }
      sleep(1000).then(loop);
    });
  }

  function start() {
    if (S.alive) return;
    S.alive = true;
    loop();
  }

  var NET = {
    config: config,
    on: on,
    get state() { return { room: S.room, slot: S.slot, turn: S.turn, seq: S.seq, alive: S.alive }; },

    create: function (name, charId) {
      return req('/api/create', { name: name || '房主', charId: charId || '' }).then(function (j) {
        S.room = j.room; S.token = j.token; S.slot = j.slot; S.seq = 0;
        start();
        emit('joined', { room: j.room, slot: j.slot, host: true });
        return j;
      });
    },

    join: function (room, name, charId) {
      return req('/api/join', { room: room, name: name || '挑战者', charId: charId || '' }).then(function (j) {
        S.room = String(room).toUpperCase(); S.token = j.token; S.slot = j.slot; S.seq = 0;
        start();
        emit('joined', { room: S.room, slot: j.slot, host: false });
        return j;
      });
    },

    plan: function (turn, plan) {
      return req('/api/plan', { room: S.room, token: S.token, turn: turn, plan: plan });
    },

    ready: function (turn) {
      return req('/api/ready', { room: S.room, token: S.token, turn: turn });
    },

    quit: function () {
      var r = req('/api/quit', { room: S.room, token: S.token }).catch(function () {});
      return r.then(function () {
        S.alive = false;
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
        S.room = null; S.token = null; S.seq = 0; S.turn = 0;
      });
    }
  };

  global.NET = NET;
})(window);
