/* P0.1-4 拆分 · 20261028b 基线 1352-1564 行 · 路径判定 / 冲锋计算 / 步数统计 */
/* =========================================================
 * 基础工具
 * ========================================================= */
function isWalkable(x, y) {
  if (phase === PHASE.CHAR_SELECT) return inBounds(x, y) && selMap[y][x] === 0;
  return inBounds(x, y) && map[y][x] === 0;
}
function faceToward(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx === 0 && dy === 0) return { dx: 1, dy: 0 };
  if (Math.abs(dx) >= Math.abs(dy)) return { dx: Math.sign(dx), dy: 0 };
  return { dx: 0, dy: Math.sign(dy) };
}
function isFacingTarget(unit, target) {
  if (!unit || !unit.facing) return false;
  const dx = Math.sign(target.x - unit.x);
  const dy = Math.sign(target.y - unit.y);
  if (dx === 0 && dy === 0) return false;
  return dx === unit.facing.dx && dy === unit.facing.dy;
}
function isInFacingCone(unit, target) {
  if (!unit || !unit.facing) return false;
  const dx = Math.sign(target.x - unit.x);
  const dy = Math.sign(target.y - unit.y);
  if (dx === 0 && dy === 0) return false;
  if (unit.facing.dx !== 0) {
    return dx === unit.facing.dx && Math.abs(dy) <= 1;
  } else {
    return dy === unit.facing.dy && Math.abs(dx) <= 1;
  }
}
/* =========================================================================
 * ISSUE-20261029-41 · 朝向 = 「下一步要去的方向」（人类 2026-10-29 16:18「3 是」）
 *
 * 旧语义是「来向」：落地时写 sign(目标格 - 起点格)，即**进入**方向。
 * 于是「朝上站着 → 原地攻击 → 下一步往左走」这一拳仍按朝上判，左边的敌人吃不到朝向必中。
 *
 * facingAt(path, i) = 从路径第 i 格出发、走向下一个**移动步**的方向：
 *   · path[i+1] 与 path[i] 同格（等待步）→ 继续往后找，即「等待步不转身」；
 *   · 没有下一步移动（终点 / 整条路径都在等）→ 用「进入该格」的方向兜底
 *     （起点格没有来向，才用调用方传进来的 fallback）。
 *
 * ★ 纯函数，不读全局、不碰 DOM：结算（移动落地 / 原地攻击）与渲染（previewFacing /
 *   路径格箭头）必须用同一个它，否则「屏幕上朝哪」和「按哪判」又会分成两套。
 * ========================================================================= */
function facingAt(path, i, fallback) {
  const fb = fallback || { dx: 0, dy: 0 };
  if (!path || !path.length) return fb;
  const start = Math.max(0, Math.min(i | 0, path.length - 1));
  for (let j = start; j < path.length - 1; j++) {
    const dx = Math.sign(path[j + 1].x - path[j].x);
    const dy = Math.sign(path[j + 1].y - path[j].y);
    if (dx !== 0 || dy !== 0) return { dx, dy };
  }
  if (start > 0) {
    const dx = Math.sign(path[start].x - path[start - 1].x);
    const dy = Math.sign(path[start].y - path[start - 1].y);
    if (dx !== 0 || dy !== 0) return { dx, dy };
  }
  return fb;
}
/* 规划期的渲染朝向 = facingAt(0)，即**第一个移动步**的方向。
 * 旧实现返回「整条路径最后一步」的方向（路径尽头），与结算用的 player.facing 不是同一套；
 * 改完「屏幕上朝哪就按哪判」（ISSUE-20261029-33 的口径）。
 * startX/startY 只为兼容旧调用签名保留：path[0] 与玩家位置不一致（异常态）时，
 * 用它补一个「玩家 → path[0]」的方向。 */
function previewFacing(path, startX, startY) {
  if (!path || !path.length) return null;
  const f = facingAt(path, 0, null);
  if (f && (f.dx || f.dy)) return f;
  const dx = Math.sign(path[0].x - startX);
  const dy = Math.sign(path[0].y - startY);
  if (dx !== 0 || dy !== 0) return { dx, dy };
  return null;
}
function calcPathSignature() {
  if (!player || !enemies) return '';
  // 修复：签名必须包含玩家正在规划的路径。
  // 原来只放玩家坐标，玩家画/撤回路径时坐标没变 → 签名不变 → 敌人意图永远不重算，
  // 于是「预判玩家路径」这套逻辑完全没有触发机会。
  const pathSig = playerPath.map(p => p.x + ',' + p.y).join('>');
  /* ISSUE-20261029-28：小队成员的位置也要进签名 —— 它们是敌人的移动占位，
   * 漏了这条会让「成员走开 / 召唤出新成员」不触发敌人意图重算，箭头指向过期格子。 */
  const squadSig = (typeof squadUnits !== 'undefined' ? squadUnits : [])
    .map(s => s.x + ',' + s.y).join(';');
  return player.x + ',' + player.y + '|' + pathSig + '|' + squadSig + '|' +
    enemies.map(e => e.alive ? key(e.x, e.y) : 'x').join(';');
}

/* 风笛技力：路径里每段「同方向连续 ≥2 步」贡献该段长度（1 步不算直线，得 0）。
 * 等待（同格重复）和转向都会断开一段。
 *   wdds → w(1=0) + d(2=2) + s(1=0) = 2 点
 *   wwwd → w(3=3) + d(1=0)        = 3 点
 */
function pathSpGain(path) {
  if (!path || path.length < 3) return 0;
  let gain = 0, runDx = 0, runDy = 0, runLen = 0;
  const flush = () => { if (runLen >= 2) gain += runLen; runLen = 0; };
  for (let i = 1; i < path.length; i++) {
    const dx = Math.sign(path[i].x - path[i - 1].x);
    const dy = Math.sign(path[i].y - path[i - 1].y);
    if (dx === 0 && dy === 0) { flush(); runDx = 0; runDy = 0; continue; }  // 等待：断开
    if (runLen > 0 && dx === runDx && dy === runDy) { runLen++; }
    else { flush(); runDx = dx; runDy = dy; runLen = 1; }
  }
  flush();
  return gain;
}
/* 规划时预览用的技力（真实值 + 当前路径将获得的量，封顶 5） */
function wheelchairPreviewSp() {
  if (selectedChar !== 'wheelchair') return wheelchairSp;
  return Math.min(WHEELCHAIR_SP_MAX, wheelchairSp + pathSpGain(playerPath));
}
/* 冲锋模式：技力满 5 时，路径里第一个「移动步上的技能节点」就是冲锋触发点，返回其路径下标。
 * sp 省略时用「预览技力」（真实值 + 当前路径将获得的量）；结算阶段传真实值，避免重复计入增量。 */
function findChargeSkillIndex(path, sp) {
  const spNow = (sp === undefined) ? wheelchairPreviewSp() : sp;
  if (!path || spNow < WHEELCHAIR_SP_MAX) return null;
  const idxs = [...skillIndices]
    .filter(i => i > 0 && i < path.length)
    .filter(i => !(path[i].x === path[i - 1].x && path[i].y === path[i - 1].y))
    .sort((a, b) => a - b);
  return idxs.length ? idxs[0] : null;
}
function pathHasCharge(path, sp) { return findChargeSkillIndex(path, sp) !== null; }
/* 规划期预览：若在当前路径上发动冲锋，额度（= 剩余移动步数）是多少（ISSUE-20261028-01）。
 * 返回 null 表示当前不满足发动条件；返回 0 表示额度不够、发不动。 */
function previewChargeBudget(path) {
  const p = path || playerPath;
  if (!p || !player) return null;
  const idx = findChargeSkillIndex(p, wheelchairPreviewSp());
  if (idx === null) return null;
  const usedMove = countMoveSteps(p.slice(0, idx + 1));
  return Math.max(0, (player.move || 1) - usedMove);
}
/* 生成冲锋段。maxSteps = 本回合剩余移动步数（ISSUE-20261028-01）：
 * 冲锋距离不再「一路到墙」，而是最多推进 maxSteps 格——剩几步就冲几格、打几次。
 * 撞墙/出界提前结束返回 'wall'；走满额度仍未撞墙返回 'budget'（日志要区分这两种）。
 * maxSteps 省略时退回旧行为（到墙为止），仅供调试/兼容调用。 */
function computeStraightChargePath(path, trigger, maxSteps) {
  const startPos = path[trigger.endIdx];
  const dir = trigger.dir;
  const result = [];
  const limit = (maxSteps === undefined || maxSteps === null) ? Infinity : Math.max(0, maxSteps | 0);
  let cx = startPos.x, cy = startPos.y;
  let safety = 0;
  const maxSafety = COLS + ROWS + 4;
  while (safety < maxSafety) {
    if (result.length >= limit) return { chargePath: result, stopReason: 'budget' };
    safety++;
    const nx = cx + dir.dx, ny = cy + dir.dy;
    if (!inBounds(nx, ny) || map[ny][nx] === 1) {
      return { chargePath: result, stopReason: 'wall' };
    }
    result.push({ x: nx, y: ny });
    cx = nx; cy = ny;
  }
  return { chargePath: result, stopReason: 'maxSafety' };
}

/* 冲锋停下后，找出「朝向前方 maxDist 格」内的存活敌人（由近到远，遇墙截断视线）。
 * 只认朝向直线上的格子，侧后方一律不吃冲锋伤害。 */
function findFacingEnemiesWithin(origin, dir, maxDist) {
  const out = [];
  if (!origin || !dir || (!dir.dx && !dir.dy)) return out;
  for (let k = 1; k <= maxDist; k++) {
    const x = origin.x + dir.dx * k, y = origin.y + dir.dy * k;
    if (!inBounds(x, y) || map[y][x] === 1) break;      // 墙挡视线
    for (const e of enemies) {
      if (!e.alive || e.hp <= 0) continue;
      if (e.x === x && e.y === y) out.push(e);
    }
  }
  return out;
}

/* 结算冲锋「剩余额度」（ISSUE-20261028-01）：
 * 撞到没秒掉的敌人会立即停下，但剩余攻击次数不作废 —— 继续按朝向逐次输出，
 * 直到额度用完或前方 3 格内再无可命中的敌人。每次伤害与冲锋撞击一致：近战伤害骰（2d4+修正）× 2。 */
function resolveChargeRemainingHits() {
  if (!playerChargingThisTurn || !player || !player.alive || playerChargeBudget <= 0) return;
  const origin = { x: player.x, y: player.y };
  let guard = 0;
  while (playerChargeBudget > 0 && guard++ < 60) {
    const list = findFacingEnemiesWithin(origin, playerChargeDir, CHARGE_FINISH_RANGE);
    if (list.length === 0) break;
    const target = list[0];                 // 优先最近的
    const dmg = rollPlayerMeleeDamage() * 2;
    target.hp -= dmg;
    playerChargeCausedDamage = true;
    playerChargeBudget -= 1;
    playerChargeHits += 1;
    slashFx(target.x, target.y, '#ffd700');
    ringFx(target.x, target.y, '#ff4500');
    hitFlashCell(target.x, target.y);
    floatText(target.x, target.y, `冲锋追击 -${dmg}`, '#ffd700', true);
    log(`冲锋追击敌人${target.id + 1}，造成${dmg}点伤害！（剩余 ${playerChargeBudget} 次）`);
    if (target.hp <= 0) killEnemy(target, { logText: `敌人${target.id + 1}被冲锋追击击倒` });
  }
  if (playerChargeBudget > 0 && playerChargeHits > 0) {
    log(`冲锋结束：朝向前方 ${CHARGE_FINISH_RANGE} 格内已无可命中目标，剩余 ${playerChargeBudget} 次攻击作废。`);
  }
}

/* ===== 技能节点 =====
 * 技能节点由玩家「双击路径节点」设置，到达该步时发动各角色技能（见 resolveStep 的 triggerSkillNode）。
 * 是否可发动只取决于角色自己的技力/状态，因此这里集中给出「当前是否就绪」的预览信息。 */
function skillReadyInfo(path, usePreview = true) {
  switch (selectedChar) {
    case 'wheelchair': {
      const sp = usePreview ? wheelchairPreviewSp() : wheelchairSp;
      return { ready: sp >= WHEELCHAIR_SP_MAX, name: '高效冲击', spNow: sp, spMax: WHEELCHAIR_SP_MAX };
    }
    case 'vampire':
      return { ready: !vampireSkillActive && vampireSp >= VAMPIRE_SP_MAX, name: '不稳定血浆', spNow: vampireSp, spMax: VAMPIRE_SP_MAX };
    case 'fencer':
      return { ready: !fencerCounterActive && fencerSp >= FENCER_SP_MAX, name: '岩崩锤', spNow: fencerSp, spMax: FENCER_SP_MAX };
    case 'amiya':
      return { ready: amiyaBonusTargets > 0, name: '精神爆发', spNow: amiyaBonusTargets, spMax: amiyaSpMax() };
    case 'rookie':
      /* ISSUE-20261029-28：技力满 5 才能召唤，没有「部分发动」这回事 */
      return { ready: rookieSp >= ROOKIE_SP_MAX, name: '增援召唤', spNow: rookieSp, spMax: ROOKIE_SP_MAX };
    default:
      return { ready: false, name: '技能', spNow: 0, spMax: 0 };
  }
}
/* 路径上有效的技能节点下标（升序、去重；下标 0 = 起点不算） */
function skillNodesOnPath(path) {
  const p = path || playerPath;
  return [...new Set(skillIndices.filter(i => i > 0 && i < p.length))].sort((a, b) => a - b);
}
/* 攻击范围高亮用的路径下标（第一个攻击/技能节点）；没有节点则以角色当前位置为圆心 */
function rangeDisplayOrigin() {
  if (!player) return null;
  const idxs = [...attackIndices, ...skillIndices].filter(i => i < playerPath.length).sort((a, b) => a - b);
  if (idxs.length) return playerPath[idxs[0]];
  return { x: player.x, y: player.y };
}

function countMoveSteps(path) {
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    if (path[i].x !== path[i-1].x || path[i].y !== path[i-1].y) n++;
  }
  return n;
}
function countWaitSteps(path) {
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    if (path[i].x === path[i-1].x && path[i].y === path[i-1].y) n++;
  }
  return n;
}
