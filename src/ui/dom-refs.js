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

/* 点属性名 → 打开属性说明卡（ISSUE-20261028-09 G2）。
 * 注意语义变了：以前「点一次 = 加一点」，现在「点一次 = 看这个属性到底管什么」，
 * 加点入口挪到说明卡里的方形「+1」——先让人看懂再加，也避免误触。 */
radarCanvas.addEventListener('click', (e) => {
  if (phase === PHASE.GAMEOVER || phase === PHASE.RESOLVING) return;
  const rect = radarCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const hit = radarLabelHits.find(h => Math.hypot(h.x - x, h.y - y) <= h.r + 10);
  if (!hit) return;
  if (typeof openAbilityInfo === 'function') openAbilityInfo(hit.k);
});
radarCanvas.addEventListener('mousemove', (e) => {
  const rect = radarCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const hit = radarLabelHits.find(h => Math.hypot(h.x - x, h.y - y) <= h.r + 10);
  radarCanvas.style.cursor = hit ? 'pointer' : '';
});

const unitEls = new Map();
