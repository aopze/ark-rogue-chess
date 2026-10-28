/* P0.1-4 拆分 · DOM 引用与六维图点击热区 */
const boardWrap = document.getElementById('boardWrap');
const boardEl = document.getElementById('board');
const unitLayer = document.getElementById('unitLayer');
const fxLayer = document.getElementById('fxLayer');
const logEl = document.getElementById('log');
const statsEl = document.getElementById('stats');
const footEl = document.getElementById('footBar');
const heroInfoEl = document.getElementById('heroInfo');
const heroKvEl = document.getElementById('heroKv');
const controlsEl = document.getElementById('controls');
const actionSlotEl = document.getElementById('actionSlot');   // 竖屏时「开始行动」按钮的槽位
const radarCanvas = document.getElementById('radarCanvas');
let radarLabelHits = [];   // drawRadar 写入：六维图 6 个属性文字的命中框

/* 点六维图顶点文字：有可分配点数 → 直接 +1；否则 → 打开属性说明卡。
 *
 * ★ ISSUE-20261029-29（人类 04:16）：「升属性的时候点击六维图顶点文字直接升属性，
 *   不要跳转属性说明面板」。
 *   历史变迁：最早是「点一次 = 加一点」→ ISSUE-09 G2 改成「点一次 = 看说明、加点在说明卡里」
 *   → 现在回到「直接加点」，但**说明卡不删**：点数用完 / 该项已到上限时点它仍然弹出说明，
 *   这样既有「一键加点」的顺手，又保留「这属性到底管什么」的查法。
 * 判定用 canAllocateNow()（panels.js 定义，函数声明提升可跨文件调用），
 * 与说明卡里「+1」按钮的启用条件完全同源 —— 不会出现「图能点、按钮灰着」的错位。 */
radarCanvas.addEventListener('click', (e) => {
  if (phase === PHASE.GAMEOVER || phase === PHASE.RESOLVING) return;
  const rect = radarCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const hit = radarLabelHits.find(h => Math.hypot(h.x - x, h.y - y) <= h.r + 10);
  if (!hit) return;
  if (canAllocateNow() && currentAbilityValue(hit.k) < ABILITY_CAP) {
    allocateAbilityPoint(hit.k);
    try { renderAbilityDrawer(); } catch (_) {}
    try { drawRadar(); } catch (_) {}
    try { if (typeof syncAbilityInfoIfOpen === 'function') syncAbilityInfoIfOpen(); } catch (_) {}
    /* 局内加点要把「下一关」按钮的禁用态一并刷新（点数归零才放行） */
    try { render(); } catch (_) {}
    return;
  }
  if (typeof openAbilityInfo === 'function') openAbilityInfo(hit.k);
});
radarCanvas.addEventListener('mousemove', (e) => {
  const rect = radarCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const hit = radarLabelHits.find(h => Math.hypot(h.x - x, h.y - y) <= h.r + 10);
  radarCanvas.style.cursor = hit ? 'pointer' : '';
});

const unitEls = new Map();
