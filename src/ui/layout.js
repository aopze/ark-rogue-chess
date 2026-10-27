/* @slot:beforeLayoutV */
/* P0.1-4 拆分 · 20261028c 基线（templates/game.html）1078-1161 行 · 竖版地图高度比例拖动：gameEl / MAP_V_KEY / mapVRatio / vGameBox / vMapBounds / applyMapVHeight / syncMapVHeight / clearMapVHeight / 拖动状态与 endSideDrag */
// ===== 竖版（layout-v）：地图高度比例，可上下拖动 =====
const gameEl = document.getElementById('game');
const MAP_V_KEY = 'ark_map_v_ratio';
let mapVRatio = null;      // null = 未拖动过，沿用 CSS 默认（紧贴棋盘）
try {
  const s = parseFloat(localStorage.getItem(MAP_V_KEY));
  if (s >= 0.2 && s <= 0.86) mapVRatio = s;
} catch (_) {}
// #game 去掉上下内边距后的可用高度
function vGameBox() {
  const cs = getComputedStyle(gameEl);
  const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
  return Math.max(140, gameEl.clientHeight - padT - padB);
}
function vMapBounds(box) {
  return { min: Math.max(96, box * 0.22), max: Math.max(96 + 80, box * 0.82) };
}
function applyMapVHeight(px, save) {
  const box = vGameBox();
  const { min, max } = vMapBounds(box);
  const h = Math.round(Math.max(min, Math.min(max, px)));
  mapVRatio = h / box;
  boardWrap.style.maxHeight = 'none';
  boardWrap.style.height = h + 'px';
  if (save) { try { localStorage.setItem(MAP_V_KEY, String(mapVRatio)); } catch (_) {} }
  updateCellSize();
  return h;
}
function syncMapVHeight() {
  if (!document.body.classList.contains('layout-v')) { clearMapVHeight(); return; }
  if (mapVRatio == null) { clearMapVHeight(); return; }
  applyMapVHeight(mapVRatio * vGameBox(), false);
}
function clearMapVHeight() {
  boardWrap.style.height = '';
  boardWrap.style.maxHeight = '';   // 回到 CSS 默认（竖屏按宽高比紧贴棋盘）
  updateCellSize();
}

let sideDragging = false, sideDragVertical = false, sideDragRaf = 0, sideDragPendingW = null;
let mapVDragStartY = 0, mapVDragStartH = 0, mapVDragPending = null;
function sideDragFlush() {
  sideDragRaf = 0;
  if (sideDragPendingW != null) { applySidebarWidth(sideDragPendingW, false); sideDragPendingW = null; }
  if (mapVDragPending != null) { applyMapVHeight(mapVDragPending, false); mapVDragPending = null; }
}
dragHandle.addEventListener('pointerdown', (e) => {
  sideDragVertical = document.body.classList.contains('layout-v');
  // 横版：手机端不开放（侧栏宽度由媒体查询固定）；竖版：手机/桌面都可用
  if (!sideDragVertical && window.innerWidth <= 760) return;
  sideDragging = true;
  if (sideDragVertical) {
    mapVDragStartY = e.clientY;
    mapVDragStartH = boardWrap.offsetHeight;
  }
  dragHandle.classList.add('dragging');
  try { dragHandle.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});
dragHandle.addEventListener('pointermove', (e) => {
  if (!sideDragging) return;
  if (sideDragVertical) {
    mapVDragPending = mapVDragStartH + (e.clientY - mapVDragStartY);
  } else {
    // 右侧内边距16 + 半个调整块5 + 两个gap 8*2 ≈ 29
    sideDragPendingW = window.innerWidth - e.clientX - 29;
  }
  if (!sideDragRaf) sideDragRaf = requestAnimationFrame(sideDragFlush);
});
function endSideDrag() {
  if (!sideDragging) return;
  sideDragging = false;
  dragHandle.classList.remove('dragging');
  if (sideDragRaf) { cancelAnimationFrame(sideDragRaf); sideDragRaf = 0; sideDragFlush(); }
  if (sideDragVertical) {
    applyMapVHeight(boardWrap.offsetHeight, true);
  } else {
    const cur = parseFloat(sidebarEl.style.width) || sidebarEl.offsetWidth;
    applySidebarWidth(cur, true);
  }
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
      // 竖版：侧栏铺满宽度，六维图用默认尺寸
      sidebarEl.style.width = '';
      radarCanvas.style.width = '';
      radarCanvas.style.height = '';
    } else {
      // 横版：恢复上次拖动宽度（手机端由媒体查询接管，不设内联宽度）
      if (window.innerWidth > 760) {
        let saved = NaN;
        try { saved = parseInt(localStorage.getItem(SIDE_W_KEY), 10); } catch (_) {}
        if (!isNaN(saved) && saved > 0) applySidebarWidth(saved, false);
        else fitSidebarToWidth();
      } else {
        sidebarEl.style.width = '';
        radarCanvas.style.width = '';
        radarCanvas.style.height = '';
      }
    }
  } catch (_) {}
  setTimeout(() => {
    try { syncMapVHeight(); } catch (_) {}
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
