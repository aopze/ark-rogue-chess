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
/* 「👤 账号与排行」角标（ISSUE-20261029-21 S2 / ISSUE-20261029-45 重构）
 * 外壳（账号 + 榜单 + 面板）已内联进本文件，不再有 iframe 边界，所以原来那套
 * 「上报棋盘矩形 → postMessage 开面板 → 等外壳回发状态」全部删除：
 *   · 面板位置：ArkShell.panel.place() 直接读 #board 的 rect
 *   · 开合状态：ArkShell.panel.setOpen() 直接改这里的 .on / aria-expanded
 *   · 按钮不再「非嵌入就隐藏」—— 单文件里它永远有功能。 */
(function bindLobbyOpenBtn() {
  const btn = document.getElementById('lobbyOpenBtn');
  if (!btn) return;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (typeof window.arkOpenLobby === 'function') window.arkOpenLobby();
  });
})();

/* @slot:beforeDlcChrome */
/* ISSUE-20261029-45：原 patchDLCChrome 已整块删除。
 * 它存在的唯一理由是「游戏在 iframe 里、外壳在父文档」，需要跨文档做三件事：
 * 隐藏外壳悬浮主页 #btnHome、把 #ghint 挪到右上角、劫持外壳 showHint 缩短提示时长。
 * 合并成单文件后父文档就是本文档，这三件事全部失去意义；
 * #hint 的「点击消失 + 缩短时长」改由 ArkShell.panel.showHint 自行实现。 */
