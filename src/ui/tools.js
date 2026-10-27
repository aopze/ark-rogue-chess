/* P0.1-4 拆分 · 20261028b 基线 1063-1108 行 · 距离工具与战斗日志系统 */
function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function cheb(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
function key(x, y) { return x + ',' + y; }
/* 战斗日志：按类型着色，提升可读性。logLines 仍按行存字符串（兼容关卡切换时的切片逻辑）。 */
const LOG_MAX = 600;          // 日志缓冲上限（防止长局内存无限增长）
const LOG_VIEW_MAX = 160;     // 日志可视区 DOM 行数上限
function autoLogType(msg) {
  if (msg == null || msg === '') return 'sep';
  if (/[=＝]{3,}|第\s*\d+\s*关/.test(msg)) return 'sys';
  if (/🥤|香草沙士|奖励|升级|热水壶|护盾|💊/.test(msg)) return 'buff';
  if (/闪避|躲避/.test(msg)) return 'dodge';
  if (/击杀|被击败|击败|倒下|阵亡|💀|死亡/.test(msg)) return 'kill';
  if (/⚡|✦|技力|技能|发动|就绪|高效冲击|岩崩|精神爆发|不稳定血浆|蓄力/.test(msg)) return 'skill';
  if (/回复|恢复|治疗|❤|回血|回复HP/.test(msg)) return 'heal';
  if (/⚠|警告|错误|失败|未命中|挥空|免疫|禁止|取消|无法|不能/.test(msg)) return 'warn';
  if (/命中|造成|伤害|暴击/.test(msg)) return 'damage';
  return 'info';
}
function makeLogLine(msg) {
  const div = document.createElement('div');
  div.className = 'logline log-' + autoLogType(msg);
  div.textContent = msg;
  return div;
}
function renderLogAll() {
  logEl.innerHTML = '';
  for (const m of logLines) logEl.appendChild(makeLogLine(m));
  logEl.scrollTop = logEl.scrollHeight;
}
function clearLog(keepN) {
  logLines = keepN && keepN > 0 ? logLines.slice(-keepN) : [];
  renderLogAll();
}
function log(msg) {
  logLines.push(msg);
  if (logLines.length > LOG_MAX) logLines = logLines.slice(-LOG_MAX);
  logEl.appendChild(makeLogLine(msg));
  while (logEl.childNodes.length > LOG_VIEW_MAX) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
function findLastIndex(arr, predicate) {
  for (let i = arr.length - 1; i >= 0; i--) if (predicate(arr[i], i)) return i;
  return -1;
}
