/* P0.1-4 拆分 · 20261028b 基线 811-845 行 · DOM 引用与六维图点击热区 */
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
const actionSlotEl = document.getElementById('actionSlot');   // 竖屏时「开始行动」按钮的槽位（在六维图上方）
const radarCanvas = document.getElementById('radarCanvas');
let radarLabelHits = [];   // drawRadar 写入：六维图 6 个属性文字的命中框，供点击加点用

/* 点击六维图上的属性名即可加点（替换原底部按钮）；鼠标悬停在可加属性上时变手型 */
radarCanvas.addEventListener('click', (e) => {
  if (phase !== PHASE.PLANNING && phase !== PHASE.LEVELCLEAR) return;
  if (!playerStats || playerStats.abilityPoints <= 0) return;
  const rect = radarCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const hit = radarLabelHits.find(h => Math.hypot(h.x - x, h.y - y) <= h.r + 8);
  if (!hit) return;
  allocateAbilityPoint(hit.k);
  render();   // 刷新六维图 + 右侧控件（通关闸门按钮随点数归零启用）
});
radarCanvas.addEventListener('mousemove', (e) => {
  const can = playerStats && playerStats.abilityPoints > 0 && (phase === PHASE.PLANNING || phase === PHASE.LEVELCLEAR);
  if (!can) { radarCanvas.style.cursor = ''; return; }
  const rect = radarCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const hit = radarLabelHits.find(h => Math.hypot(h.x - x, h.y - y) <= h.r + 8);
  radarCanvas.style.cursor = hit ? 'pointer' : '';
});

const unitEls = new Map();
