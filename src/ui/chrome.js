/* @slot:beforeLogPanel */
/* P0.1-4 拆分 · 设置与日志面板外壳
 *
 * ISSUE-20261028-09 G 起，旧版「左上角可拖动悬浮窗」整体废除：
 *  - 删除 LOG_POS_KEY / clampLogPanelPos() / bindLogDrag() 与绝对定位拖动；
 *  - localStorage['ark_log_pos'] 读到也直接忽略（布局已完全不同，不迁移）；
 *  - 设置内容改为 #drawerSettings 抽屉，开关仍是左上角同一个 ⚙（位置不变）。 */
const logResetBtn  = document.getElementById('logResetBtn');
const logRotateBtn = document.getElementById('logRotateBtn');
const setOpenBtnEl = document.getElementById('setOpenBtn');

/* 兼容旧调用点：语义改成「开/关设置抽屉」 */
function setSettingsOpen(open) {
  if (open) drawerOpen('settings');
  else if (drawerIsOpen('settings')) drawerClose();
}

if (setOpenBtnEl) setOpenBtnEl.addEventListener('click', function (e) {
  e.stopPropagation();
  drawerToggle('settings');
});

// 旧的悬浮窗坐标不再有任何意义：清掉，避免以后有人以为它还在生效
try { localStorage.removeItem('ark_log_pos'); } catch (_) {}

/* =========================================================================
 * 隐藏调试开关（ISSUE-20261028-11）
 * 在设置抽屉标题栏的版本号 #setVer 上「连点 5 次，相邻间隔 ≤500ms」切换调试模式。
 * 设计要点：
 *  - 触发时不弹 toast / 不写日志 / 不闪浮字，玩家侧零感知；状态只在
 *    window.__ARK_DEBUG__ 暴露（控制台可读，不算提示）。
 *  - 用 pointerdown 而非 click：标题栏在抽屉里，stopPropagation + preventDefault
 *    既能触发计数又不至于选中文字。
 *  - touch-action:manipulation 已在 CSS 侧加上，避免移动端双击缩放吞掉快速连点。
 *  - 已开启状态下再连满 5 次 → 关闭（A3）；任一次超 500ms → 计数立即清零（A2）。
 *  - 三种重置点（回选角 / 开新局 / 重置 / 联机）在各自入口调用 setDebugMode(false)。
 * ========================================================================= */
(function bindHiddenDebugSwitch() {
  const el = document.getElementById('setVer');
  if (!el) return;
  const NEED = 5, GAP_MS = 500;
  let count = 0, lastAt = 0;
  const evt = ('onpointerdown' in window) ? 'pointerdown' : 'click';
  el.addEventListener(evt, function (e) {
    e.stopPropagation();
    e.preventDefault();
    const now = Date.now();
    count = (now - lastAt <= GAP_MS) ? count + 1 : 1;
    lastAt = now;
    if (count >= NEED) {
      count = 0; lastAt = 0;
      setDebugMode(!debugMode);
    }
  }, { passive: false });
})();

/* 「重开」：随时回到选角大厅（ISSUE-20261029-22：人类明确「重开不用提示是否确定」，
 * 点了直接走 drawerClose() + initCharSelect()，与设置抽屉里其余按钮同一节奏。
 * 取舍已知：战斗中手滑点它会立刻丢当前局、不可撤销 —— 这是「少一次点击 > 防误触」的
 * 明确要求。将来若要防误触，正确做法是改成长按，不要把 confirm 加回来。 */
logResetBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  drawerClose();
  initCharSelect();
});
/* 「♟ 账号与排行」（ISSUE-20261029-21 S2）：游戏内只做按钮 + 点击链路。
 * 联网与榜单本体留在外壳 index.html —— NB-04 规定单文件产物不得引入运行时外部依赖，
 * 把 bot API 搬进 game.html 会让离线 / 微信 / TG 环境直接白屏。
 * 点击 → postMessage 交外壳开 #lobbyDrawer；外壳开合后再回发状态，这里同步 .on / aria-expanded。
 * 直开 game.html（window.parent === window）时按钮隐藏，不留一个点了没反应的死按钮。 */
(function bindLobbyOpenBtn() {
  const btn = document.getElementById('lobbyOpenBtn');
  if (!btn) return;
  let embedded = false;
  try { embedded = !!(window.parent && window.parent !== window); } catch (e) { embedded = false; }
  if (!embedded) { btn.hidden = true; return; }

  /* ★ ISSUE-20261029-29：账号面板与设置面板一样改成「覆盖棋盘格」。
   * 面板本体在外壳（index.html）里，而棋盘的位置只有游戏内部量得到，
   * 所以这里在请求打开的同时把棋盘的矩形（iframe 内坐标系）一并上报，
   * 外壳再加上 iframe 自身的偏移即可把面板贴到棋盘上。
   * 转屏 / 换布局时窗口尺寸不一定变，所以抽屉开着还要在 resize 里补报一次。 */
  let lobbyDrawerOpen = false;
  function postBoardRect() {
    try {
      const r = boardEl.getBoundingClientRect();
      if (!(r.width > 0) || !(r.height > 0)) return;
      window.parent.postMessage({
        type: 'ark_board_rect',
        rect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
      }, '*');
    } catch (e) {}
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    postBoardRect();
    try { window.parent.postMessage({ type: 'ark_open_lobby' }, '*'); } catch (e2) {}
  });
  window.addEventListener('resize', function () { if (lobbyDrawerOpen) setTimeout(postBoardRect, 160); });
  window.addEventListener('message', function (e) {
    const d = e && e.data;
    if (!d || d.type !== 'ark_lobby_state') return;
    const on = !!d.open;
    lobbyDrawerOpen = on;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  });
})();

/* @slot:beforeDlcChrome */
/* P0.1-4 拆分 · DLC 外壳接管：patchDLCChrome（隐藏外壳 #btnHome / 劫持 showHint / #ghint 同步）
 * 嵌入 DLC 外壳（同源 iframe）时，由游戏侧统一接管两处外壳 UI：
 *  - 隐藏外壳自带的悬浮「🏠 主页」按钮（主页已取消，ISSUE-20261028-10）
 *  - 顶部绿色提示条 #hint：点击即消失 + 显示时长缩短到 ~2.2s
 * 单文件独立运行（无父窗口 / 跨域）时自动跳过，不影响单机。 */
(function patchDLCChrome() {
  var P;
  try { P = window.parent; } catch (e) { return; }
  if (!P || P === window) return;
  var pd;
  try { pd = P.document; } catch (e) { return; }
  if (!pd) return;

  function hideHint() {
    var h = null;
    try { h = pd.getElementById('hint'); } catch (e) {}
    if (h) h.className = 'hide';
  }
  function shortenHint() {
    var h = null;
    try { h = pd.getElementById('hint'); } catch (e) {}
    if (!h) return;
    h.style.cursor = 'pointer';
    if (!h.__arkHintBound) {
      h.__arkHintBound = 1;
      h.addEventListener('click', hideHint);
    }
    if (h.className.indexOf('hide') < 0) {           // 当前可见 → 缩短为 2.2s 后消失
      try { P.clearTimeout(P.__arkHintT); } catch (e) {}
      P.__arkHintT = P.setTimeout(hideHint, 2200);
    }
  }

  // 1) 隐藏外壳悬浮主页
  try { var hb = pd.getElementById('btnHome'); if (hb) hb.style.display = 'none'; } catch (e) {}

  // 1.5) 外壳顶部居中的空胶囊（#ghint）：没文字时隐藏，有文字时挪到右上角，避免压住左上角「设置」
  try {
    var gh = pd.getElementById('ghint');
    if (gh) {
      gh.style.left = 'auto';
      gh.style.right = '8px';
      gh.style.transform = 'none';
      var syncGhint = function () {
        var has = (gh.textContent || '').trim().length > 0;
        gh.style.display = has ? '' : 'none';
      };
      syncGhint();
      try {
        new P.MutationObserver(syncGhint).observe(gh, { childList: true, characterData: true, subtree: true });
      } catch (e) {}
    }
  } catch (e) {}

  // 2) 劫持外壳 showHint，使之后弹出的绿色提示同样变短 + 可点击
  try {
    if (typeof P.showHint === 'function') {
      var origShowHint = P.showHint;
      P.showHint = function (text, ok) {
        origShowHint(text, ok);
        shortenHint();
      };
    }
  } catch (e) {}

  // 3) 若提示条此刻已显示，也立刻缩短
  shortenHint();
})();
