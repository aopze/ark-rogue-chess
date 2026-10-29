/* @slot:shell */
/* ============================================================================
 * 外壳 · 面板层（ISSUE-20261029-45）
 * ----------------------------------------------------------------------------
 * 与原 index.html 相比，这里删掉了两块纯为跨 iframe 服务的补丁：
 *   · placeLobbyOverBoard()：原来要「iframe 偏移 + 游戏内棋盘矩形」两次换算，
 *     还得等游戏 postMessage 上报；现在同文档，直接读 #board 的 rect。
 *   · syncCornerToGame()：原来要量 #lobbyOpenBtn 的 rect 再换算到抽屉坐标系；
 *     现在 CSS 直接用棋盘的 --corner-x / --cell（同 :root），CSS 就精确。
 *
 * 新增：面板高度按「至少 8 名」兜底（ISSUE-45 AC-7）—— 棋盘是正方形，
 * 竖屏下棋盘高可能只有 390px，装不下 8 行，所以面板允许在棋盘基础上**向上撑高**，
 * 上限是「棋盘上沿到视口底部」，不会溢出屏幕。
 * ========================================================================== */
(function () {
  'use strict';
  var NS = window.ArkShell;
  if (!NS) return;

  var open = false;
  var ROWS_VISIBLE = 8;
  var ROW_BLOCK = 42;      // 行高 38 + 间距 4
  var CHROME_H = 96;       // header 36 + footer 44 + 内边距

  function $(id) { return document.getElementById(id); }
  function boardEl() { return document.getElementById('board'); }

  /* ===== 提示条 / toast（游戏侧没有同名实现，这里是唯一一套）===== */
  function showHint(text, ok) {
    var h = $('hint');
    if (!h) return;
    h.textContent = text || '';
    h.className = (ok ? 'ok' : '');
    clearTimeout(showHint._t);
    showHint._t = setTimeout(hideHint, 6000);
  }
  function hideHint() {
    var h = $('hint');
    if (h) h.className = 'hide';
  }
  function toast(text, ms) {
    var t = $('toast');
    if (!t) return;
    t.textContent = text || '';
    t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 3000);
  }

  /* 覆盖 01 的占位实现，让 02/03 拿到真实 UI */
  NS.ui.toast = toast;
  NS.ui.showHint = showHint;
  NS.ui.hideHint = hideHint;

  /* ===== 面板定位与显隐 ===== */
  function place() {
    var d = $('lobbyDrawer'), b = boardEl();
    if (!d || !b) return;
    var r = b.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return;
    var vh = window.innerHeight || 0;
    var need = ROWS_VISIBLE * ROW_BLOCK + CHROME_H;
    var avail = vh - r.top - 6;
    var h = Math.max(r.height, Math.min(need, avail > 0 ? avail : r.height));
    d.style.left = Math.round(r.left) + 'px';
    d.style.top = Math.round(r.top) + 'px';
    d.style.width = Math.round(r.width) + 'px';
    d.style.height = Math.round(h) + 'px';
    d.style.bottom = 'auto';
  }

  /* 角标位置由 CSS 的 --corner-x/--cell 决定，这里只需在尺寸变化时确保面板跟随 */
  function syncCorner() { /* CSS 变量自动生效，保留钩子供 board.paint() 调用 */ }

  function setOpen(next) {
    open = !!next;
    var d = $('lobbyDrawer'), m = $('lobbyMask'), btn = $('lobbyOpenBtn');
    if (open) place();
    if (d) {
      d.classList.toggle('on', open);
      d.setAttribute('aria-hidden', open ? 'false' : 'true');
      d.style.pointerEvents = '';
    }
    if (m) m.classList.toggle('on', open);
    /* 游戏侧角标同步高亮（原来是 postMessage 'ark_lobby_state'，现在直接改） */
    if (btn) {
      btn.classList.toggle('on', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (open) {
      if (d && d.focus) { try { d.focus({ preventScroll: true }); } catch (e) {} }
      NS.board.refresh();          // 每次打开都拉一次实时榜
      /* 等榜单落地后再滚到自己：refresh 是异步的，paint 里会再调一次 */
      setTimeout(function () { NS.board.scrollToMe(); }, 120);
    } else {
      NS.board.closeEdit();
    }
  }

  /* ===== 完整排行榜浮层（leaderboard.html 仍是独立页面，保留这条 iframe）===== */
  function openRank() {
    var p = $('rankPanel');
    if (!p) return;
    p.classList.add('open');
    var f = $('rankFrame');
    if (f) f.src = 'leaderboard.html?t=' + Date.now();
    NS.board.pushMyScore();
    NS.board.pushSnapshot();
    NS.board.pushApiBase();
  }
  function closeRank() {
    var p = $('rankPanel');
    if (p) p.classList.remove('open');
  }

  NS.panel = {
    isOpen: function () { return open; },
    setOpen: setOpen,
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    toggle: function () { setOpen(!open); },
    place: place,
    syncCorner: syncCorner,
    openRank: openRank,
    closeRank: closeRank,
    toast: toast,
    showHint: showHint,
    hideHint: hideHint,
  };
})();
