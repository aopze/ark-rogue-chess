/* ISSUE-20261029-28 · 预备干员「增援召唤」规则层
 *
 * 一套最小可用的小队系统：
 *   技力（rookieSp）→ 满 5 → 技能节点发动 → 周围 8 格随机召唤 1 名成员
 *   成员每回合独立行动一次：BFS（与敌人同一套 bfsPathTo）到最近的敌人 → 途中一旦能打就停下打
 *
 * 三条硬约束（改之前先读）：
 *  1) 伤害必须走 enemyTakeDamage()，否则护盾词缀不生效；
 *  2) 击杀必须走 killEnemy()，否则精英掉落 ❤️ / 连杀记账会漏；
 *  3) 成员不是敌人、也不是玩家：不进 enemies 数组（否则被相杀结算），
 *     只放在 squadUnits 里，由 renderUnits 单独渲染一层。
 *
 * ★ ISSUE-20261029-32（人类 05:48 拍板）：上面第 3 条**放宽** ——
 *   「成员无敌」原本是我在 28 号自己拍的口径，人类现在指出「敌人似乎不会攻击召唤单位」，
 *   并要求敌人改用「距离最近的路径格」索敌。人类逐项确认：
 *     · 成员**能被敌人打死**（HP 归 0 → 消失，玩家彻底失去该成员）；
 *     · 敌人同时能打到玩家和成员时 → **谁近打谁，平手打玩家**；
 *     · 伤害来源全部打通：近战贴身 / 外星人远程 / 自爆虫自爆 / 敌人踩进成员格 / Boss 推动。
 *   所以成员从「无敌炮台」变成「有代价的召唤」：会吸引火力，也会真的死。
 *   本文件因此新增：squadTakeDamage / squadUnitAt / squadAliveUnits / squadPredictedNextCell。
 */
function rookieSpMax() { return ROOKIE_SP_MAX; }

/* 获得技力（唯一入口，香草沙士在这里生效） */
function gainRookieSp(n = 1) {
  if (selectedChar !== 'rookie') return 0;
  const before = rookieSp;
  if (before >= ROOKIE_SP_MAX) return 0;
  let gain = n;
  if (sassExtraSp()) { gain += 1; log('🥤 香草沙士：额外获得 1 点技力！'); }
  rookieSp = Math.min(ROOKIE_SP_MAX, before + gain);
  const real = rookieSp - before;
  if (real > 0) {
    if (before < ROOKIE_SP_MAX && rookieSp >= ROOKIE_SP_MAX) {
      log(`😶 预备干员技力已满（${ROOKIE_SP_MAX}/${ROOKIE_SP_MAX}）！「增援召唤」就绪：双击路径节点设置技能节点。`);
      if (player && player.alive) floatText(player.x, player.y, '召唤就绪！', '#ffd700');
    } else {
      log(`😶 预备干员技力 +${real}（${rookieSp}/${ROOKIE_SP_MAX}）`);
    }
    updateStats();
  }
  return real;
}

/* 小队成员六维 = 预备干员六维里最低的一项（人类原话：「数值六项都为预备干员属性最低的一项数值」） */
function squadAbilityScore() {
  const a = playerStats && playerStats.abilities;
  if (!a) return 8;
  return Math.min(a.str, a.dex, a.con, a.int, a.wis, a.cha);
}

/* 成员的派生数值：与玩家同一套公式（HP = con + 基础加成、AC = 5+⌊(敏+体)/4⌋、移动 = ⌊敏/2⌋），
 * 只是六维全部取同一个分数。熟练加值跟随角色等级，跟玩家同步，免得后期成员完全打不中。 */
function squadDerivedStats(score) {
  const abilities = { str: score, dex: score, con: score, int: score, wis: score, cha: score };
  return {
    abilities,
    maxHp: Math.max(1, score + BASE_HP_BONUS),
    ac: computeAC(abilities),
    move: Math.max(1, Math.floor(score / 2)),
    prof: 4 + Math.max(0, heroLevel - 1),
  };
}

/* 周围 8 格空位（不含自己脚下那一格） */
function squadFreeCellsAround(x, y) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (map[ny][nx] === 1) continue;
      if (enemies.some(e => e.alive && e.x === nx && e.y === ny)) continue;
      if (squadUnits.some(s => s.alive && s.x === nx && s.y === ny)) continue;
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

/* 召唤：随机类型（不与上一次重复）+ 随机空位。返回 { ok, member } */
function summonSquadMember() {
  const cells = squadFreeCellsAround(player.x, player.y);
  if (cells.length === 0) return { ok: false, reason: 'no-cell' };
  /* 不连续重复：上次召唤过的类型从池里剔除；池空了（只有 4 种，理论上不会）就退回全池 */
  let pool = SQUAD_TYPE_ORDER.filter(id => id !== lastSquadType);
  if (pool.length === 0) pool = SQUAD_TYPE_ORDER.slice();
  const typeId = pool[randInt(pool.length)];
  const typeDef = SQUAD_TYPES[typeId];
  const cell = cells[randInt(cells.length)];
  const score = squadAbilityScore();
  const d = squadDerivedStats(score);
  const member = {
    uid: ++squadSeq,
    type: typeId,
    name: typeDef.name,
    icon: typeDef.icon,
    ranged: !!typeDef.ranged,
    x: cell.x, y: cell.y,
    hp: d.maxHp, maxHp: d.maxHp,
    ac: d.ac, move: d.move,
    prof: d.prof,
    range: typeDef.ranged ? PLAYER_RANGE : 1,
    abilities: d.abilities,
    score,
    facing: faceToward({ x: cell.x, y: cell.y }, player),
    alive: true,
  };
  squadUnits.push(member);
  lastSquadType = typeId;
  ringFx(cell.x, cell.y, '#7dd3fc');
  floatText(cell.x, cell.y, `${typeDef.icon} ${typeDef.name}`, '#7dd3fc', true);
  log(`😶 增援召唤！${typeDef.icon} ${typeDef.name} 出现在 (${cell.x},${cell.y})：六维全 ${score}、HP ${d.maxHp}、AC ${d.ac}、移动 ${d.move}。${typeDef.onKillText}`);
  return { ok: true, member };
}

/* 这一格被谁占着（小队成员自己那格除外） */
function squadCellTaken(x, y, selfUid) {
  for (const s of squadUnits) if (s.uid !== selfUid && s.alive && s.x === x && s.y === y) return true;
  if (player && player.alive && player.x === x && player.y === y) return true;
  for (const e of enemies) if (e.alive && e.x === x && e.y === y) return true;
  return false;
}

/* =========================================================
 * ★ ISSUE-20261029-32：成员进入敌人索敌候选池 + 可被敌人打死
 * ========================================================= */

/* 存活的成员（敌人索敌、伤害结算都只看这些） */
function squadAliveUnits() {
  return (typeof squadUnits !== 'undefined' ? squadUnits : []).filter(u => u.alive);
}

/* 某个格子上有没有活着的成员 */
function squadUnitAt(x, y) {
  for (const s of squadUnits) if (s.alive && s.x === x && s.y === y) return s;
  return null;
}

/* ★ 成员「下一格」的预测：成员每回合朝**离它最近的敌人**走（见 squadAct），
 *   所以敌人索敌时用「成员下一步会站的那格」来算距离，
 *   而不是用成员此刻的格子 —— 这正是人类要的「正在朝我走的那个会被优先锁定」。
 *   注意：敌人先结算、成员后结算（endRound 顺序：玩家 → 敌人 → 小队），
 *   所以这里预测的是「本回合稍后成员真的会走到的位置」，不是空想。 */
function squadPredictedNextCell(u) {
  if (!u || !u.alive) return null;
  const target = squadNearestEnemy(u);
  if (!target) return { x: u.x, y: u.y };
  const path = bfsPathTo(u.x, u.y, target.x, target.y, 1, null, false, 0);
  /* bfsPathTo 在「目标不可达」时返回的是未截断的完整路径，但第 2 格仍然是它打算走的方向 */
  if (path && path.length > 1) return { x: path[1].x, y: path[1].y };
  return { x: u.x, y: u.y };
}

/* ★ 成员的统一受伤入口（与玩家侧的 damagePlayer 对等，但成员没有护盾 / 免疫 / 反击那套）。
 *   HP 归 0 → alive=false（渲染层与 resolveSquadTurn 都会跳过它）→ 玩家彻底失去该成员。 */
function squadTakeDamage(u, amount, source) {
  if (!u || !u.alive || !(amount > 0)) return { dealt: 0, dead: false };
  const before = u.hp;
  u.hp = Math.max(0, u.hp - amount);
  const dealt = before - u.hp;
  floatText(u.x, u.y, '-' + dealt, '#ff6b6b');
  if (u.hp <= 0) {
    u.alive = false;
    log(`💀 ${u.icon} ${u.name}被${source}击杀了（${u.maxHp} HP 归零）。`);
    ringFx(u.x, u.y, '#ff6b6b');
    return { dealt, dead: true };
  }
  log(`🩸 ${u.icon} ${u.name}被${source}命中，造成 ${dealt} 伤害（${u.hp}/${u.maxHp}）。`);
  return { dealt, dead: false };
}

function squadNearestEnemy(u) {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive || e.hp <= 0) continue;
    const d = Math.abs(e.x - u.x) + Math.abs(e.y - u.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/* 「能打的节点」：近战 = 相邻；远程 = 射程内且有视线（与玩家同一套 canRangedAttack） */
function squadCanAttack(u, e) {
  if (!e || !e.alive || e.hp <= 0) return false;
  if (u.ranged) return canRangedAttack({ x: u.x, y: u.y }, e, u.range);
  return cheb(u, e) === 1;
}

function squadFindAttackable(u) {
  let best = null;
  for (const e of enemies) {
    if (!e.alive || e.hp <= 0) continue;
    if (!squadCanAttack(u, e)) continue;
    if (!best || cheb(u, e) < cheb(u, best)) best = e;
  }
  return best;
}

/* 小队成员击杀 → 给预备干员回报（人类指定的四种） */
function squadOnKill(u) {
  const def = SQUAD_TYPES[u.type];
  if (!def || !player || !player.alive) return;
  switch (def.onKill) {
    case 'sp':
      gainRookieSp(SQUAD_KILL_SP);
      break;
    case 'shield':
      playerShield += 1;
      floatText(player.x, player.y, '护盾 +1', '#ffffff');
      log(`😑 ${def.name}击杀敌人：预备干员获得 1 层护盾（当前 ${playerShield} 层）。`);
      break;
    case 'heal': {
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + SQUAD_KILL_HEAL);
      const real = player.hp - before;
      floatText(player.x, player.y, `+${real} HP`, '#2ecc71');
      log(`😇 ${def.name}击杀敌人：预备干员恢复 ${real} HP（${player.hp}/${player.maxHp}）。`);
      break;
    }
    case 'extraNode':
      player.extraAttacks += 1;
      playerStats.extraAttacks = player.extraAttacks;
      floatText(player.x, player.y, '攻击节点 +1', '#ffd700');
      log(`🤠 ${def.name}击杀敌人：预备干员获得 1 个额外攻击节点（本回合可出手 ${maxAttacksThisTurn()} 次）。`);
      break;
  }
  updateStats();
}

/* 一次成员攻击（每回合每成员最多 1 次） */
async function squadAttack(u, e) {
  const modKey = u.ranged ? 'int' : 'str';
  const mod = abilityMod(u.abilities[modKey]);
  const atk = attackRoll(mod, u.prof, e.ac);
  u.facing = faceToward(u, e);
  if (!atk.hit) {
    missFx(e.x, e.y);
    log(`${u.icon} ${u.name}攻击敌人${e.id + 1}未命中 (${fmtRoll(atk, e.ac)})`);
    refreshUnits();
    await sleep(140);
    return;
  }
  const dice = u.ranged ? PLAYER_RANGED_DICE : PLAYER_MELEE_DICE;
  let dmg = Math.max(1, rollDamageDice(dice) + mod);
  const isCrit = atk.nat20;
  if (isCrit) dmg *= 2;
  const dealt = enemyTakeDamage(e, dmg);
  if (dealt > 0) {
    slashFx(e.x, e.y, isCrit ? '#ffd700' : '#7dd3fc');
    hitFlashCell(e.x, e.y);
    floatText(e.x, e.y, `${u.icon}-${dealt}`, isCrit ? '#ffd700' : '#7dd3fc', isCrit);
    log(`${u.icon} ${u.name}${isCrit ? '暴击' : '命中'}敌人${e.id + 1}，造成 ${dealt} 伤害 (${fmtRoll(atk, e.ac)})`);
  }
  if (e.hp <= 0 && e.alive) {
    killEnemy(e, { logText: `敌人${e.id + 1}被${u.name}击败` });
    squadOnKill(u);
  }
  refreshUnits();
  await sleep(180);
}

/* 一名成员的一回合：找目标 → 能打就打 → 否则按 BFS 走向目标，途中一旦进入「能打的节点」就停下开火。
 * 寻路刻意复用敌人那套 bfsPathTo（人类要求「与敌人一致」），占位把玩家 / 敌人 / 其他成员都算进去。 */
async function squadAct(u) {
  if (!u.alive) return;
  const target = squadNearestEnemy(u);
  if (!target) return;
  /* 原地就能打（远程常见）→ 直接开火，不移动 */
  const first = squadFindAttackable(u);
  if (first) { await squadAttack(u, first); return; }

  const isOccupied = (t, x, y) => squadCellTaken(x, y, u.uid);
  let path = bfsPathTo(u.x, u.y, target.x, target.y, u.move, isOccupied, false, 0);
  if (path.length <= 1) {
    /* 被同伴挤住时忽略占位重算一次（与敌人侧反罚站补丁同思路） */
    path = bfsPathTo(u.x, u.y, target.x, target.y, u.move, null, false, 0);
  }
  /* ★ 必须自己截断：bfsPathTo 在「目标不可达」分支返回的是「最近可达点」的完整路径，
   * 那一步**没有**按 maxSteps 截断（敌人侧同样如此，它靠 tick 结算兜住）。
   * 不截断的话成员一回合能瞬移半张地图 —— 实测从 (9,9) 走到 (3,8)，移动力只有 4。 */
  if (path.length > u.move + 1) path = path.slice(0, u.move + 1);
  for (let i = 1; i < path.length; i++) {
    const from = { x: u.x, y: u.y };
    u.x = path[i].x; u.y = path[i].y;
    u.facing = faceToward(from, path[i]);
    refreshBoardOnly();
    await sleep(130);
    /* 走到这一格就能打了 → 停下开火（这就是「在能够进行攻击的节点自动攻击」） */
    const canHit = squadFindAttackable(u);
    if (canHit) { await squadAttack(u, canHit); return; }
  }
}

/* 回合末统一行动：每个成员各走一次。放在 endRound 里（玩家 → 敌人 → 小队），
 * 这样成员不会和玩家的移动抢格子，也不会被相杀结算误伤。 */
async function resolveSquadTurn() {
  if (!squadUnits.length || !player || !player.alive) return;
  if (phase !== PHASE.RESOLVING) return;
  /* 已被打死的敌人清掉引用（成员不会死，但保留兜底） */
  squadUnits = squadUnits.filter(u => u.alive);
  for (const u of squadUnits) {
    if (!player.alive) return;
    if (enemies.filter(e => e.alive).length === 0) return;
    await squadAct(u);
  }
  refreshBoardOnly();
}
