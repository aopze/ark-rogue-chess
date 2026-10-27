/* P0.1-4 拆分 · 20261028c 基线 2052-2340 行 · 棋盘几何与特效：findPath / getBoundingBox / getCellEl / cellCenter / unitCenter / facingIndicatorHtml / unitHtml / hasLineOfSight / canRangedAttack / playerAttackRangeCells / 敌人首步箭头 / floatText / ringFx / slashFx / animateBullet / hitFx / missFx / refreshUnits */
function findPath(startX, startY, targetX, targetY, maxSteps = 99) {
  if (startX === targetX && startY === targetY) return [];
  const queue = [{ x: startX, y: startY, path: [] }];
  const visited = new Set();
  visited.add(key(startX, startY));
  const dirs = DIR4_BFS;
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr.path.length >= maxSteps) continue;
    for (const [dx, dy] of dirs) {
      const nx = curr.x + dx, ny = curr.y + dy;
      if (!isWalkable(nx, ny)) continue;
      if (visited.has(key(nx, ny))) continue;
      if (phase === PHASE.CHAR_SELECT) {
        if (charCandidates.some(c => c !== selectedCandidate && c.x === nx && c.y === ny && (nx !== targetX || ny !== targetY))) continue;
      } else if (phase === PHASE.PLANNING) {
        if (nx === player.x && ny === player.y) continue;
      }
      visited.add(key(nx, ny));
      const newPath = [...curr.path, { x: nx, y: ny }];
      if (nx === targetX && ny === targetY) return newPath;
      queue.push({ x: nx, y: ny, path: newPath });
    }
  }
  return null;
}

function getBoundingBox() {
  let minX = COLS, maxX = -1, minY = ROWS, maxY = -1;
  const m = phase === PHASE.CHAR_SELECT ? selMap : map;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    let v = false;
    if (m[y][x] === 0) v = true;
    else if (m[y][x] === 1) {
      for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && m[ny][nx] === 0) { v = true; break; }
      }
    }
    if (v) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  if (minX === COLS) return { minX: 0, maxX: COLS - 1, minY: 0, maxY: ROWS - 1 };
  return { minX, maxX, minY, maxY };
}

function getCellEl(x, y) { return boardEl.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`); }
function cellCenter(x, y) {
  const cell = getCellEl(x, y);
  if (cell) {
    const r = cell.getBoundingClientRect();
    const lr = fxLayer.getBoundingClientRect();
    return { x: r.left - lr.left + r.width / 2, y: r.top - lr.top + r.height / 2 };
  }
  return { x: 0, y: 0 };
}
function unitCenter(x, y) {
  const cell = getCellEl(x, y);
  if (cell) {
    const icon = cell.querySelector('.icon');
    if (icon) {
      const r = icon.getBoundingClientRect();
      const lr = fxLayer.getBoundingClientRect();
      return { x: r.left - lr.left + r.width / 2, y: r.top - lr.top + r.height / 2 };
    }
  }
  return cellCenter(x, y);
}
function facingIndicatorHtml(facing) {
  if (!facing) return '';
  const v = FACING_GLYPH[facing.dx + ',' + facing.dy];
  if (!v) return '';
  return `<div class="facing-ind ${v[1]}">${v[0]}</div>`;
}
function unitHtml(icon, hp, opts = {}) {
  const { isGhost = false, maxHp = 1, isPlayer = false, facing = null } = opts;
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const color = isPlayer ? '#3b9eff' : '#e74c3c';
  const iconClass = isGhost ? 'icon ghost-icon' : 'icon';
  return `<div class="unit">${facingIndicatorHtml(facing)}<div class="${iconClass}">${icon}</div><div class="hp-bar"><div class="hp-fill" style="width:${pct}%;background:${color};"></div></div></div>`;
}
function hasLineOfSight(from, to) {
  const distCheb = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  if (distCheb === 0) return true;
  if (distCheb === 1) return true;
  let x0 = from.x, y0 = from.y;
  const x1 = to.x, y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    if (!(x0 === from.x && y0 === from.y) && !(x0 === x1 && y0 === y1)) {
      if (!inBounds(x0, y0)) return false;
      if (map[y0][x0] === 1) return false;
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    const moveX = e2 >= dy;
    const moveY = e2 <= dx;
    if (moveX) { err += dy; x0 += sx; }
    if (moveY) { err += dx; y0 += sy; }
    // ★ 斜向拐角穿透检测：同时跨 X、Y（对角线步）时，不能从两个相邻墙的夹角里钻过去。
    // 若「横向相邻格」与「纵向相邻格」都是墙，则这条对角连线被堵死。
    if (moveX && moveY) {
      const cornerX = x0 - sx; // 横向侧格（本步起点的那一列）
      const cornerY = y0 - sy; // 纵向侧格（本步起点的那一行）
      const blockedA = inBounds(cornerX, y0) ? (map[y0][cornerX] === 1) : true;
      const blockedB = inBounds(x0, cornerY) ? (map[cornerY][x0] === 1) : true;
      if (blockedA && blockedB) return false;
    }
  }
  return true;
}
/* 远程攻击可达性判定。range 省略时取 player.range。
 * 幽灵：停在墙格内时无敌（无法被命中）；站在墙外可走格时仍需视线，
 * 不可隔墙命中（即「墙后幽灵」必须没被墙挡住视线才能打）。 */
function canRangedAttack(from, target, range) {
  const r = (range === undefined) ? player.range : range;
  if (cheb(from, target) > r) return false;
  if (target.type === 'ghost') {
    if (map[target.y][target.x] === 1) return false;  // 墙里的幽灵无敌（保留设计意图）
    // 墙外幽灵：继续走下面的视线判定，避免隔墙命中
  }
  return hasLineOfSight(from, target);
}
/* 「攻击范围」高亮：以第一个攻击节点（没有则当前位置）为圆心，
 * 远程角色取 player.range，近战角色取相邻 1 格；视线被墙挡掉的格子不算。 */
function playerAttackRangeCells() {
  const set = new Set();
  if (phase !== PHASE.PLANNING || !player) return set;
  const range = isRangedChar(selectedChar) ? (player.range || PLAYER_RANGE) : 1;
  const origin = rangeDisplayOrigin();
  if (!origin) return set;
  for (let y = origin.y - range; y <= origin.y + range; y++) {
    for (let x = origin.x - range; x <= origin.x + range; x++) {
      if (!inBounds(x, y)) continue;
      if (map[y][x] === 1) continue;
      const d = Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y));
      if (d > range) continue;
      if (d > 0 && !hasLineOfSight(origin, { x, y })) continue;
      set.add(key(x, y));
    }
  }
  return set;
}

function showEnemyFirstStepArrows() {
  clearEnemyArrows();
  if (phase !== PHASE.PLANNING) return;
  const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 50;
  const offset = cellSize * 0.35;
  enemies.forEach((e, i) => {
    if (!e.alive) return;
    if (e.stunTurns > 0) return;
    const path = enemyPaths[i];
    if (!path || path.length < 2) return;
    const extra = (selectedChar === 'amiya' && e.amiyaRevealActive) ? e.amiyaRevealActive : 0;
    const stepsToShow = (player ? player.visibleSteps : 1) + extra;
    for (let s = 1; s <= stepsToShow && s < path.length; s++) {
      const prev = path[s-1], curr = path[s];
      const dx = Math.sign(curr.x - prev.x), dy = Math.sign(curr.y - prev.y);
      const ch = ARROW_CHARS[`${dx},${dy}`];
      if (!ch) continue;
      let ox = 0, oy = 0;
      if (dx === -1) ox = offset; if (dx === 1) ox = -offset;
      if (dy === -1) oy = offset; if (dy === 1) oy = -offset;
      const c = cellCenter(curr.x, curr.y);
      const el = document.createElement('div');
      el.className = 'enemy-arrow';
      el.textContent = ch;
      el.style.left = (c.x + ox) + 'px';
      el.style.top = (c.y + oy) + 'px';
      fxLayer.appendChild(el);
      enemyArrows.push(el);
    }
  });
}
function clearEnemyArrows() { enemyArrows.forEach(el => el.remove()); enemyArrows = []; }

function floatText(x, y, text, color, isCrit, offsetY = 0) {
  const c = cellCenter(x, y);
  floatTextAt(c.x, c.y, text, color, isCrit, offsetY);
}
function floatTextAt(px, py, text, color, isCrit, offsetY = 0, extraClass = '') {
  const el = document.createElement('div');
  el.className = 'float-text' + (isCrit ? ' crit' : '') + (extraClass ? ' ' + extraClass : '');
  el.textContent = text;
  if (!isCrit) el.style.color = color;
  el.style.left = px + 'px';
  el.style.top = (py + offsetY) + 'px';
  fxLayer.appendChild(el);
  const endScale = isCrit ? 1.7 : 1.35, startScale = isCrit ? 0.9 : 0.7;
  el.animate([
    { transform: `translate(-50%,-50%) scale(${startScale})`, opacity: 0.2, offset: 0 },
    { transform: `translate(-50%,-130%) scale(${endScale})`, opacity: 1, offset: 0.35 },
    { transform: `translate(-50%,-200%) scale(${endScale * 0.9})`, opacity: 0, offset: 1 }
  ], { duration: isCrit ? 1000 : 800, easing: 'ease-out' }).finished
    .then(() => el.remove())
    .catch(() => el.remove());
}
function ringFx(x, y, color) {
  const c = cellCenter(x, y);
  const el = document.createElement('div');
  el.className = 'ring-fx';
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';
  el.style.borderColor = color;
  el.style.boxShadow = `0 0 14px ${color}`;
  fxLayer.appendChild(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(0.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.9)', opacity: 0 }], { duration: 420, easing: 'ease-out' }).finished
    .then(() => el.remove())
    .catch(() => el.remove());
}
function slashFx(x, y, color) {
  const c = cellCenter(x, y);
  const el = document.createElement('div');
  el.className = 'slash-fx';
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';
  el.style.filter = `drop-shadow(0 0 6px ${color})`;
  fxLayer.appendChild(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.2) rotate(25deg)', opacity: 0 }], { duration: 360, easing: 'ease-out' }).finished
    .then(() => el.remove())
    .catch(() => el.remove());
}
function getLiveCenter(unitKey, layerRect) {
  const rec = unitEls.get(unitKey);
  if (!rec) return null;
  const r = rec.el.getBoundingClientRect();
  return {
    x: r.left - layerRect.left + r.width / 2,
    y: r.top - layerRect.top + r.height / 2,
  };
}
async function animateBullet(fromPos, targetKey, fallback, isCrit, isAlien, fromKey) {
  const layerRect = fxLayer.getBoundingClientRect();
  const start = (fromKey && getLiveCenter(fromKey, layerRect)) || unitCenter(fromPos.x, fromPos.y);
  const bullet = document.createElement('div');
  bullet.className = 'bullet' + (isCrit ? ' crit' : '') + (isAlien ? ' alien' : '');
  bullet.style.left = '0px';
  bullet.style.top = '0px';
  bullet.style.transform = `translate(${start.x}px, ${start.y}px) translate(-50%,-50%)`;
  fxLayer.appendChild(bullet);
  let bx = start.x, by = start.y;
  const startTime = performance.now();
  const SPEED_PX_PER_MS = 0.85;
  const HARD_TIMEOUT = 900;
  await new Promise(resolve => {
    function tick(now) {
      const live = getLiveCenter(targetKey, layerRect)
                || (fallback ? unitCenter(fallback.x, fallback.y) : null);
      if (!live) { resolve(); return; }
      const dx = live.x - bx, dy = live.y - by;
      const d = Math.hypot(dx, dy);
      if (d < 6 || now - startTime > HARD_TIMEOUT) { resolve(); return; }
      const frameTravel = Math.min(d, SPEED_PX_PER_MS * 16.67);
      bx += dx / d * frameTravel;
      by += dy / d * frameTravel;
      bullet.style.transform = `translate(${bx}px, ${by}px) translate(-50%,-50%)`;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  bullet.remove();
}
function hitFlashCell(x, y) {
  const cell = getCellEl(x, y);
  if (!cell) return;
  cell.classList.remove('hitflash');
  void cell.offsetWidth;
  cell.classList.add('hitflash');
}

/* 战斗结算后同步单位层与数值面板（原为成对的 renderUnits(); updateStats();） */
function refreshUnits() { renderUnits(); updateStats(); }

/* 统一命中/暴击特效：暴击走橙环 + 金字，普通命中走黄环 + 淡黄字。
 * label 为暴击前缀文案（如「暴击」「爆发暴击」），仅暴击时拼接。 */
function hitFx(x, y, dmg, isCrit, label) {
  ringFx(x, y, isCrit ? '#ff4500' : '#ffe66d');
  hitFlashCell(x, y);
  floatText(x, y, (isCrit ? label + ' -' : '-') + dmg, isCrit ? '#ffd700' : '#ffe66d', isCrit);
}

/* 统一未命中特效 */
function missFx(x, y) {
  floatText(x, y, 'MISS', '#bbb');
}
