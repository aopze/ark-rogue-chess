/* @slot:beforeLayoutV */
/* P0.1-4 拆分 · 20261028c 基线 · 竖版地图高度拖动已于 ISSUE-20261028-09 废除：
 * 正方形棋盘「总是取最大」，高度不能由用户拖动决定，#dragHandle 在 layout-v 下直接不渲染。
 * 保留 applyMapVHeight / syncMapVHeight / clearMapVHeight 三个函数名是因为 resize 与 setLayout
 * 仍有调用；它们不再写 boardWrap.style.height —— 尺寸的唯一来源是 updateCellSize()。 */
const gameEl = document.getElementById('game');
const MAP_V_KEY = 'ark_map_v_ratio';

function applyMapVHeight() { clearMapVHeight(); return boardWrap.offsetHeight; }
function syncMapVHeight() { clearMapVHeight(); }
function clearMapVHeight() {
  // 清掉旧版留下的内联高度与比例：老用户的 ark_map_v_ratio 会把正方形锁死成历史高度
  if (boardWrap.style.height) boardWrap.style.height = '';
  if (boardWrap.style.maxHeight) boardWrap.style.maxHeight = '';
  try { localStorage.removeItem(MAP_V_KEY); } catch (_) {}
  updateCellSize();
}
clearMapVHeight();   // 启动即清，避免旧值影响首屏

let sideDragging = false, sideDragRaf = 0, sideDragPendingW = null;
function sideDragFlush() {
  sideDragRaf = 0;
  if (sideDragPendingW != null) { applySidebarWidth(sideDragPendingW, false); sideDragPendingW = null; }
}
dragHandle.addEventListener('pointerdown', (e) => {
  // 竖版已无拖动条（CSS display:none），这里只剩横版的侧栏宽度拖动；手机端不开放
  if (window.innerWidth <= 760) return;
  sideDragging = true;
  dragHandle.classList.add('dragging');
  try { dragHandle.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});
dragHandle.addEventListener('pointermove', (e) => {
  if (!sideDragging) return;
  // 右侧内边距16 + 半个调整块5 + 两个gap 8*2 ≈ 29
  sideDragPendingW = window.innerWidth - e.clientX - 29;
  if (!sideDragRaf) sideDragRaf = requestAnimationFrame(sideDragFlush);
});
function endSideDrag() {
  if (!sideDragging) return;
  sideDragging = false;
  dragHandle.classList.remove('dragging');
  if (sideDragRaf) { cancelAnimationFrame(sideDragRaf); sideDragRaf = 0; sideDragFlush(); }
  const cur = parseFloat(sidebarEl.style.width) || sidebarEl.offsetWidth;
  applySidebarWidth(cur, true);
  if (player || phase === PHASE.CHAR_SELECT) render();
}
dragHandle.addEventListener('pointerup', endSideDrag);
dragHandle.addEventListener('pointercancel', endSideDrag);
/* @slot:beforeLayoutToggle */
/* P0.1-4 拆分 · 20261028c 基线（templates/game.html）3382-3428 行 · 横竖版切换：LAYOUT_KEY / currentLayout / setLayout / 旋转按钮 / initLayoutMode */
// 「旋转」：切换横版（地图左/UI右）↔ 竖版（地图上/UI下）
const LAYOUT_KEY = 'ark_layout';
function currentLayout() {
  return document.body.classList.contains('layout-v') ? 'v' : 'h';
}
function setLayout(mode, save) {
  const v = mode === 'v';
  document.body.classList.toggle('layout-v', v);
  document.body.classList.toggle('layout-h', !v);
  if (save) { try { localStorage.setItem(LAYOUT_KEY, v ? 'v' : 'h'); } catch (_) {} }
  try {
    if (v) {
      // 竖版：侧栏铺满宽度（六维图在抽屉里，尺寸固定，不再随侧栏变化）
      sidebarEl.style.width = '';
    } else if (window.innerWidth > 760) {
      // 横版：恢复上次拖动宽度
      let saved = NaN;
      try { saved = parseInt(localStorage.getItem(SIDE_W_KEY), 10); } catch (_) {}
      if (!isNaN(saved) && saved > 0) applySidebarWidth(saved, false);
      else fitSidebarToWidth();
    } else {
      sidebarEl.style.width = '';
    }
  } catch (_) {}
  // 布局类切换后必须重算正方形边长（否则会残留上一个方向的尺寸）
  setTimeout(() => {
    updateCellSize();
    if (player || phase === PHASE.CHAR_SELECT) render();
  }, 30);
}
logRotateBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setLayout(currentLayout() === 'v' ? 'h' : 'v', true);
});
(function initLayoutMode() {
  let m = null;
  try { m = localStorage.getItem(LAYOUT_KEY); } catch (_) {}
  // 无记忆时：桌面默认横版（地图左/UI右），手机默认竖版（地图上/UI下）
  if (m === 'v' || m === 'h') setLayout(m, false);
  else setLayout(window.innerWidth <= 760 ? 'v' : 'h', false);
})();
