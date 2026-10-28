/* @slot:beforeInitLevel */
/* P0.1-4 拆分 · 20261028c 基线（templates/game.html）701-927 行 · 地图生成：bfsReachable / growRegion / smoothRegion / clearSpawnArea / countWalkable / placeObstacles / generateMap（纯逻辑，不碰 DOM） */
function bfsReachable(m, sx, sy) {
  const visited = new Set();
  const q = [[sx, sy]];
  visited.add(key(sx, sy));
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (m[ny][nx] !== 0) continue;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      visited.add(k);
      q.push([nx, ny]);
    }
  }
  return visited;
}
function growRegion(startX, startY, target) {
  const m = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
  const region = new Set();
  const frontierSet = new Set();
  const frontier = [];
  function scoreOf(c) {
    let cnt = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = c.x + dx, ny = c.y + dy;
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && m[ny][nx] === 0) cnt++;
    }
    return cnt;
  }
  function openCell(x, y) {
    m[y][x] = 0; region.add(key(x, y));
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || nx >= COLS - 1 || ny < 1 || ny >= ROWS - 1) continue;
      const k = key(nx, ny);
      if (region.has(k) || frontierSet.has(k)) continue;
      frontierSet.add(k); frontier.push({ x: nx, y: ny });
    }
  }
  openCell(startX, startY);
  while (region.size < target && frontier.length > 0) {
    const sampleSize = Math.min(5, frontier.length);
    let bestIdx = 0, bestScore = -1;
    for (let i = 0; i < sampleSize; i++) {
      const idx = randInt(frontier.length);
      const s = scoreOf(frontier[idx]);
      if (s > bestScore) { bestScore = s; bestIdx = idx; }
    }
    const c = frontier[bestIdx];
    frontier[bestIdx] = frontier[frontier.length - 1];
    frontier.pop();
    frontierSet.delete(key(c.x, c.y));
    if (region.has(key(c.x, c.y))) continue;
    openCell(c.x, c.y);
  }
  return { m, region };
}
function smoothRegion(m, sx, sy) {
  for (let round = 0; round < 3; round++) {
    const changes = [];
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      if (Math.abs(x - sx) + Math.abs(y - sy) <= SPAWN_CLEAR_RADIUS) continue;
      let wc = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && m[ny][nx] === 0) wc++;
      }
      if (m[y][x] === 1 && wc >= 6) changes.push([x, y, 0]);
      else if (m[y][x] === 0 && wc <= 2) changes.push([x, y, 1]);
    }
    if (changes.length === 0) break;
    for (const [x, y, v] of changes) m[y][x] = v;
  }
}
function clearSpawnArea(m, sx, sy, radius) {
  for (let y = Math.max(1, sy - radius); y <= Math.min(ROWS - 2, sy + radius); y++) for (let x = Math.max(1, sx - radius); x <= Math.min(COLS - 2, sx + radius); x++) {
    if (Math.abs(x - sx) + Math.abs(y - sy) <= radius) m[y][x] = 0;
  }
}
function countWalkable(m) {
  let n = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (m[y][x] === 0) n++;
  return n;
}
function placeObstacles(m, spawnX, spawnY) {
  const obstacleCells = new Set();
  /* ★ ISSUE-20261029-29：障碍组数按内部面积自适应。
   * 旧值写死 8 组（每组 1-4 格，平均吃掉 ~16 格）是为 16×16 / 25×25 的大图定的；
   * 9×9 内部只有 49 格，照搬会把近 1/3 的可走区变成石头堆（实测可走只剩 29 格）。
   * 公式在 25×25 时算出 44 → 仍取 OBSTACLE_GROUPS_TRY(8)，与旧行为逐格一致；
   * 9×9 时 49/12 ≈ 4 组，够做掩体又不至于堵死。 */
  const maxGroups = Math.max(2, Math.min(OBSTACLE_GROUPS_TRY, Math.round((ROWS - 2) * (COLS - 2) / 12)));
  let groupsPlaced = 0, attempts = 0;
  while (groupsPlaced < maxGroups && attempts < 60) {
    attempts++;
    const candidates = [];
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      if (m[y][x] !== 0) continue;
      if (Math.abs(x - spawnX) + Math.abs(y - spawnY) <= SPAWN_CLEAR_RADIUS) continue;
      let ao = 0;
      for (const [dx, dy] of DIR4) if (obstacleCells.has(key(x + dx, y + dy))) ao++;
      if (ao > 0) continue;
      candidates.push({ x, y });
    }
    if (candidates.length === 0) break;
    const seed = candidates[randInt(candidates.length)];
    const size = 1 + randInt(OBSTACLE_MAX_GROUP);
    const group = [seed];
    const localSet = new Set([key(seed.x, seed.y)]);
    m[seed.y][seed.x] = 1;
    obstacleCells.add(key(seed.x, seed.y));
    for (let i = 1; i < size; i++) {
      const frontier = [];
      for (const c of group) for (const [dx, dy] of DIR4) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 1 || nx >= COLS - 1 || ny < 1 || ny >= ROWS - 1) continue;
        if (m[ny][nx] !== 0) continue;
        if (localSet.has(key(nx, ny))) continue;
        if (Math.abs(nx - spawnX) + Math.abs(ny - spawnY) <= SPAWN_CLEAR_RADIUS) continue;
        let ao = 0;
        for (const [ddx, ddy] of DIR4) {
          const k2 = key(nx + ddx, ny + ddy);
          if (obstacleCells.has(k2) && !localSet.has(k2)) ao++;
        }
        if (ao > 0) continue;
        frontier.push({ x: nx, y: ny });
      }
      if (frontier.length === 0) break;
      const next = frontier[randInt(frontier.length)];
      m[next.y][next.x] = 1;
      obstacleCells.add(key(next.x, next.y));
      localSet.add(key(next.x, next.y));
      group.push(next);
    }
    const reach = bfsReachable(m, spawnX, spawnY);
    if (reach.size < countWalkable(m)) {
      for (const c of group) { m[c.y][c.x] = 0; obstacleCells.delete(key(c.x, c.y)); }
      continue;
    }
    groupsPlaced++;
  }
  return obstacleCells;
}
function generateMap(numEnemies, targetWalkable) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const candidates = [];
    for (let y = Math.max(2, Math.floor(ROWS * 0.5)); y < ROWS - 2; y++) for (let x = 2; x < Math.min(COLS - 2, Math.floor(COLS * 0.55) + 1); x++) candidates.push({ x, y });
    if (candidates.length === 0) continue;
    const playerStart = candidates[randInt(candidates.length)];
    const { m } = growRegion(playerStart.x, playerStart.y, targetWalkable);
    clearSpawnArea(m, playerStart.x, playerStart.y, SPAWN_CLEAR_RADIUS);
    smoothRegion(m, playerStart.x, playerStart.y);
    clearSpawnArea(m, playerStart.x, playerStart.y, SPAWN_CLEAR_RADIUS);
    let reach = bfsReachable(m, playerStart.x, playerStart.y);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (m[y][x] === 0 && !reach.has(key(x, y))) m[y][x] = 1;
    let changed = true, rounds = 0;
    while (changed && rounds < 5) {
      changed = false; rounds++;
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
        if (m[y][x] !== 0) continue;
        if (Math.abs(x - playerStart.x) + Math.abs(y - playerStart.y) <= SPAWN_CLEAR_RADIUS) continue;
        let cnt = 0;
        for (const [dx, dy] of DIR4) if (m[y+dy][x+dx] === 0) cnt++;
        if (cnt <= 1) { m[y][x] = 1; changed = true; }
      }
    }
    reach = bfsReachable(m, playerStart.x, playerStart.y);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (m[y][x] === 0 && !reach.has(key(x, y))) m[y][x] = 1;
    placeObstacles(m, playerStart.x, playerStart.y);
    let spawnOk = true;
    for (let y = Math.max(1, playerStart.y - SPAWN_CLEAR_RADIUS); y <= Math.min(ROWS - 2, playerStart.y + SPAWN_CLEAR_RADIUS); y++) for (let x = Math.max(1, playerStart.x - SPAWN_CLEAR_RADIUS); x <= Math.min(COLS - 2, playerStart.x + SPAWN_CLEAR_RADIUS); x++) {
      if (Math.abs(x - playerStart.x) + Math.abs(y - playerStart.y) <= SPAWN_CLEAR_RADIUS && m[y][x] !== 0) spawnOk = false;
    }
    if (!spawnOk) continue;
    const count = countWalkable(m);
    if (count < targetWalkable - 15 || count > targetWalkable + 15) continue;
    for (let x = 0; x < COLS; x++) { m[0][x] = 1; m[ROWS - 1][x] = 1; }
    for (let y = 0; y < ROWS; y++) { m[y][0] = 1; m[y][COLS - 1] = 1; }
    const cells = [...reach].map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; });
    /* ★ ISSUE-20261029-29：定版 9×9 后「离玩家 ≥6 格」太苛刻 —— 内部只有 7×7，
     * 硬卡 6 会让 5 个起点经常凑不齐（每次都掉进下面的兜底空房间）。
     * 改成按棋盘短边自适应：25 格时代 ≈ 6（与原值一致），9×9 时 = 5。 */
    const farDist = Math.max(4, Math.round(Math.min(ROWS, COLS) * 0.55));
    const far = cells.filter(c => dist(c, playerStart) >= farDist && m[c.y][c.x] === 0);
    if (far.length < numEnemies) continue;
    const shuffled = far.sort(() => rng() - 0.5);
    const enemyStarts = [];
    for (const c of shuffled) {
      if (enemyStarts.every(s => dist(s, c) >= 2)) {
        enemyStarts.push(c);
        if (enemyStarts.length >= numEnemies) break;
      }
    }
    if (enemyStarts.length < numEnemies) continue;
    let rewards = [];
    {
      const validSpots = [];
      for (const c of cells) {
        if (m[c.y][c.x] !== 0) continue;
        if (Math.abs(c.x - playerStart.x) + Math.abs(c.y - playerStart.y) <= SPAWN_CLEAR_RADIUS) continue;
        if (enemyStarts.some(es => es.x === c.x && es.y === c.y)) continue;
        let wc = 0;
        for (const [dx, dy] of DIR4) {
          const nx = c.x + dx, ny = c.y + dy;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || m[ny][nx] === 1) wc++;
        }
        if (wc >= 3) validSpots.push(c);
      }
      /* 基础恢复道具：第 3 关起 70% 概率出现 1 个；
         「急救药箱」每层再额外保证 1 个（必定出现） */
      const baseCount = (level >= 3 && rng() < 0.7) ? 1 : 0;
      const want = Math.min(baseCount + Math.max(0, buffs.kit), validSpots.length);
      const pool = validSpots.slice();
      for (let i = 0; i < want; i++) {
        rewards.push(pool.splice(randInt(pool.length), 1)[0]);
      }
    }
    return { map: m, playerStart, enemyStarts, rewards };
  }
  /* ★ 兜底图（400 次都没生成出合格地图时）也按新尺寸重做：
   * 旧写法硬编码 `playerStart.x + 4 + i` / `playerStart.y - 4 - i`，在 9×9 下会算出 (7,2)、(7,2)…
   * 两个敌人重叠在同一格（后面 spawn 时两只怪叠一起，谁也走不动）。
   * 改成「内部全开 → 按离玩家的距离从远到近挑起点、两两保持 ≥2 格」，与原兜底语义一致但不会撞车。 */
  const m = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
  const playerStart = { x: 1, y: ROWS - 2 };
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) m[y][x] = 0;
  clearSpawnArea(m, playerStart.x, playerStart.y, SPAWN_CLEAR_RADIUS);
  for (let x = 0; x < COLS; x++) { m[0][x] = 1; m[ROWS - 1][x] = 1; }
  for (let y = 0; y < ROWS; y++) { m[y][0] = 1; m[y][COLS - 1] = 1; }
  const cells = [];
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (m[y][x] === 0) cells.push({ x, y });
  cells.sort((a, b) => dist(b, playerStart) - dist(a, playerStart));
  const enemyStarts = [];
  for (const c of cells) {
    if (dist(c, playerStart) < 3) continue;
    if (enemyStarts.every(s => dist(s, c) >= 2)) {
      enemyStarts.push(c);
      if (enemyStarts.length >= numEnemies) break;
    }
  }
  return { map: m, playerStart, enemyStarts, rewards: [] };
}

/* 联机 9×9 竞技场（ISSUE-20261028-13 方案 A）。
 * 选角大厅内部不再有障碍物后，联机战场改用它自己的快照 —— 保证联机地形与
 * 改动前「逐格相同」（含 4 根角柱 + 中间 2 块），不会因为一次 UI 清理动到平衡。 */
function buildPvpArena() {
  const m = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let i = 0; i < 9; i++) { m[i][0] = 1; m[i][8] = 1; m[0][i] = 1; m[8][i] = 1; }
  m[2][3] = 1; m[2][5] = 1; m[6][3] = 1; m[6][5] = 1;
  m[3][4] = 1; m[5][4] = 1;
  return m;
}
