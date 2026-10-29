/* @slot:shell */
/* ============================================================================
 * 外壳 · 启动层（ISSUE-20261029-45）
 * ----------------------------------------------------------------------------
 * 串起 sdk → account → board → panel，并把两个入口暴露给游戏侧：
 *   window.arkOpenLobby()      —— 棋盘左上角 👤 角标点击
 *   window.arkReportScore(l,k) —— 游戏结束（原 hook 轮询 phase 的替代）
 *
 * 顺序说明：本文件在所有游戏模块**之后**执行（槽位在 initCharSelect() 之后），
 * 所以能保证 #board 已完成首次布局、--cell/--corner-x 已有值。
 * 但 SDK 是异步的：游戏立刻可玩，外壳的身份判定在 SDK 就绪（或超时）后才落定。
 * ========================================================================== */
(function () {
  'use strict';
  var NS = window.ArkShell;
  if (!NS) return;

  function $(id) { return document.getElementById(id); }

  function bindEvents() {
    var mask = $('lobbyMask');
    if (mask) mask.addEventListener('click', function () { NS.panel.close(); });

    var lc = $('lobbyCornerClose');
    if (lc) lc.addEventListener('click', function (e) { e.stopPropagation(); NS.panel.close(); });

    var fr = $('btnFullRank');
    if (fr) fr.addEventListener('click', function (e) { e.stopPropagation(); NS.panel.openRank(); });

    var rc = $('rankClose');
    if (rc) rc.addEventListener('click', NS.panel.closeRank);

    var rf = $('rankFrame');
    if (rf) rf.addEventListener('load', function () {
      NS.board.pushMyScore();
      NS.board.pushSnapshot();
      NS.board.pushApiBase();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (NS.panel.isOpen()) { NS.panel.close(); e.preventDefault(); return; }
      var p = $('rankPanel');
      if (p && p.classList.contains('open')) { NS.panel.closeRank(); e.preventDefault(); }
    });

    /* 转屏 / 改窗口大小：棋盘格子重算（--cell 变），面板正开着就重新贴一次 */
    window.addEventListener('resize', function () {
      if (NS.panel.isOpen()) NS.panel.place();
    });
  }

  function boot() {
    bindEvents();

    NS.sdkReady.then(function (plat) {
      NS.account.resolveMyId();
      NS.account.loadAccount();

      if (plat.IN_TG) {
        if (plat.CAN_REPORT) { NS.panel.showHint('键盘入口 · 成绩会自动记录', true); setTimeout(NS.panel.hideHint, 4000); }
        else { NS.panel.showHint('主页/菜单入口 · 成绩也会记录', true); setTimeout(NS.panel.hideHint, 4500); }
      } else {
        NS.panel.showHint('网页模式 · 正在连接成绩服务器…', false);
      }

      NS.account.loadConfig(function () {
        NS.board.paint();
        NS.board.refresh();

        if (!plat.IN_TG) {
          if (NS.app.reportUrl) {
            NS.panel.showHint('网页模式 · 成绩会自动记录（同一份排行榜）', true);
            setTimeout(NS.panel.hideHint, 4500);
          } else {
            NS.panel.showHint('网页模式 · 成绩服务未连接（bot 没启动？本局成绩不会记录）', false);
          }
        }

        if (NS.app.isNewAccount) {
          setTimeout(function () {
            NS.panel.toast('你的账号是「' + NS.app.myAccount + '」\n点棋盘左上角 👤 → 编辑，可以改成自己的名字（数字口令 4–8 位）', 7000);
          }, 1200);
        }
      });

      try { if (plat.W) { plat.W.ready(); plat.W.expand(); } } catch (e) {}
    });
  }

  /* 游戏侧入口：外壳总是存在（已内联），但保留 typeof 检查让 game.html 被裁剪时也不炸 */
  window.arkOpenLobby = function () { NS.panel.toggle(); };
  window.arkReportScore = function (level, kills) { NS.account.reportScore(level || 0, kills || 0); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
/* #SHELL_END */
