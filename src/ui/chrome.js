/* @slot:beforeLogPanel */
/* P0.1-4 拆分 · 20261028c 基线（templates/game.html）3268-3380 行 · 设置与日志面板外壳：日志面板 DOM ref / LOG_POS_KEY / setOpenBtn / clampLogPanelPos / setSettingsOpen / bindLogDrag / 重开 / 主页按钮 */
/* 战斗日志：左上角悬浮窗（可拖动），标题栏显示版本号；开关是左上角 ⚙（同一位置切换） */
const logPanelEl   = document.getElementById('logPanel');
const logBarEl     = document.getElementById('logBar');
const logResetBtn  = document.getElementById('logResetBtn');
const logRotateBtn = document.getElementById('logRotateBtn');
const LOG_POS_KEY = 'ark_log_pos';

// 展开 / 收起整个「设置」面板：收起后只剩左上角一个约半格大小的 ⚙ 按钮
const setOpenBtn = document.getElementById('setOpenBtn');
function clampLogPanelPos() {
  const r = logPanelEl.getBoundingClientRect();
  let x = r.left, y = r.top;
  const maxX = Math.max(0, window.innerWidth - r.width);
  const maxY = Math.max(0, window.innerHeight - r.height);
  x = Math.max(0, Math.min(maxX, x));
  y = Math.max(0, Math.min(maxY, y));
  if (Math.abs(x - r.left) > 0.5 || Math.abs(y - r.top) > 0.5) {
    logPanelEl.style.left = Math.round(x) + 'px';
    logPanelEl.style.top = Math.round(y) + 'px';
    logPanelEl.style.right = 'auto';
    logPanelEl.style.bottom = 'auto';
  }
}
function setSettingsOpen(open) {
  logPanelEl.classList.toggle('collapsed', !open);
  if (setOpenBtn) {
    setOpenBtn.classList.toggle('on', open);
    setOpenBtn.textContent = open ? '✕' : '⚙';
    setOpenBtn.title = open ? '收起设置面板' : '设置（点击展开）';
    setOpenBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (open) {
    logPanelEl.classList.remove('folded');
    requestAnimationFrame(clampLogPanelPos);
  } else {
    requestAnimationFrame(clampLogPanelPos);
  }
}
if (setOpenBtn) setOpenBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  // 同一个按钮切换：展开 ↔ 收起（面板内已无折叠按钮）
  setSettingsOpen(logPanelEl.classList.contains('collapsed'));
});
// 默认收起：只留一个半格大小的 ⚙ 按钮
setSettingsOpen(false);

// 拖动移动悬浮窗（按住标题栏）
(function bindLogDrag() {
  let dragging = false, dx = 0, dy = 0;
  const start = (e) => {
    if (e.target.closest('button')) return;
    // 版本号本身是隐藏调试开关的触发点，不能当作拖动手柄（ISSUE-20261028-11）
    if (e.target.closest('#setVer')) return;
    dragging = true;
    const r = logPanelEl.getBoundingClientRect();
    dx = e.clientX - r.left; dy = e.clientY - r.top;
    logPanelEl.classList.add('dragging');
    try { logBarEl.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  };
  const move = (e) => {
    if (!dragging) return;
    const w = logPanelEl.offsetWidth, h = logPanelEl.offsetHeight;
    let x = e.clientX - dx, y = e.clientY - dy;
    x = Math.max(0, Math.min(window.innerWidth - w, x));
    y = Math.max(0, Math.min(window.innerHeight - h, y));
    logPanelEl.style.left = x + 'px';
    logPanelEl.style.top = y + 'px';
    logPanelEl.style.right = 'auto';
    logPanelEl.style.bottom = 'auto';
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    logPanelEl.classList.remove('dragging');
    try {
      localStorage.setItem(LOG_POS_KEY, JSON.stringify({
        left: logPanelEl.style.left, top: logPanelEl.style.top
      }));
    } catch (_) {}
  };
  logBarEl.addEventListener('pointerdown', start);
  logBarEl.addEventListener('pointermove', move);
  logBarEl.addEventListener('pointerup', end);
  logBarEl.addEventListener('pointercancel', end);
  // 恢复上次位置（默认左上角）
  try {
    const p = JSON.parse(localStorage.getItem(LOG_POS_KEY) || 'null');
    if (p && p.left && p.top) {
      logPanelEl.style.left = p.left;
      logPanelEl.style.top = p.top;
      logPanelEl.style.right = 'auto';
      logPanelEl.style.bottom = 'auto';
    }
  } catch (_) {}
})();

/* =========================================================================
 * 隐藏调试开关（ISSUE-20261028-11）
 * 在设置面板标题栏的版本号 #setVer 上「连点 5 次，相邻间隔 ≤500ms」切换调试模式。
 * 设计要点：
 *  - 触发时不弹 toast / 不写日志 / 不闪浮字，玩家侧零感知；状态只在
 *    window.__ARK_DEBUG__ 暴露（控制台可读，不算提示）。
 *  - 用 pointerdown 而非 click：标题栏有拖动监听，在子元素上 stopPropagation +
 *    preventDefault 既能触发计数又不至于误启动拖动 / 选中文字。
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
  el.addEventListener(evt, (e) => {
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

// 「重开」：随时回到选角界面
logResetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (window.confirm('确定重开游戏吗？当前进度将丢失。')) initCharSelect();
});

// 「主页」：嵌套在 DLC 外壳里时调用外壳的 goHome()；单文件独立运行时回到选角界面
const setHomeBtn = document.getElementById('setHomeBtn');
if (setHomeBtn) setHomeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  try {
    if (window.parent && window.parent !== window && typeof window.parent.goHome === 'function') {
      window.parent.goHome();
      return;
    }
  } catch (_) {}
  initCharSelect();
});
/* @slot:beforeDlcChrome */
/* P0.1-4 拆分 · 20261028c 基线（templates/game.html）3893-3959 行 · DLC 外壳接管：patchDLCChrome（隐藏外壳 #btnHome / 劫持 showHint / #ghint 同步） */
/* 嵌入 DLC 外壳（同源 iframe）时，由游戏侧统一接管两处外壳 UI：
 *  - 隐藏外壳自带的悬浮「🏠 主页」按钮（主页已并入「设置」面板，避免重复）
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
