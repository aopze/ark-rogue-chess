/* P0.1-4 拆分 · 20261028b 基线 875-1062 行 · PVP-CORE 联机结算核心（勿在注释中复写区块起止标记） */
/* ==== PVP-CORE BEGIN ====
 * 联机对战的结算核心：纯函数，不碰 DOM、不读全局变量、不用全局 rng()。
 *
 * 为什么必须是纯函数：两个客户端要用「同一份代码 + 同一颗种子 + 同一份计划」
 * 算出「同一串事件」，否则画面会各说各话。任何对全局状态的依赖都会破坏这个等式。
 *
 * 约定：
 *   - slot 0 = 房主，slot 1 = 挑战者，与「谁是本机」无关（对称，不按自己优先排序）。
 *   - 计划格式 { path: [[x,y],...], attackIndices: [k,...] }，path[0] 是起点格。
 *   - 返回 { units, events, winner }，winner 为 -1 / 0 / 1。
 *   - 单测脚本按 PVP-CORE 标记切片 eval，勿在此区间引用外部标识符。
 * ==== PVP-CORE BEGIN ==== */
//#PVP_CORE_START
function pvpRng(seed) {
  let a = (seed >>> 0) || 0x9E3779B9;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pvpMod(score) { return Math.floor((score - 10) / 2); }

function pvpMakeUnit(chars, charId, slot, x, y) {
  const a = { ...chars[charId].abilities };
  return {
    slot: slot, charId: charId, x: x, y: y,
    abilities: a,
    maxHp: a.con, hp: a.con,
    ac: 5 + Math.floor((a.dex + a.con) / 4),
    meleeDmg: Math.max(1, 1 + pvpMod(a.str)),
    rangedDmg: Math.max(1, 1 + pvpMod(a.int)),
    ranged: chars[charId].attackType === 'ranged',
    prof: 2,
    alive: true,
    dodging: false,
    facing: { dx: slot === 0 ? 1 : -1, dy: 0 },
  };
}

function pvpCheb(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
function pvpSame(a, b) { return !!a && !!b && a.x === b.x && a.y === b.y; }
function pvpRangeOf(u) { return u.ranged ? 3 : 1; }
function pvpDmgOf(u) { return u.ranged ? u.rangedDmg : u.meleeDmg; }
/* 相杀按「趁乱打击」算：远程角色贴身只有 1 点保底，近战用近战伤害 —— 与单人规则一致 */
function pvpClashDmgOf(u) { return u.ranged ? 1 : u.meleeDmg; }

function pvpRoll(r, mod, prof, ac) {
  const d20 = 1 + Math.floor(r() * 20);
  const total = d20 + mod + prof;
  if (d20 === 20) return { d20: d20, total: total, hit: true, crit: true };
  if (d20 === 1) return { d20: d20, total: total, hit: false, crit: false };
  return { d20: d20, total: total, hit: total >= ac, crit: false };
}

function pvpResolveTurn(chars, unitsIn, plans, seed) {
  const r = pvpRng(seed);
  const u = [JSON.parse(JSON.stringify(unitsIn[0])), JSON.parse(JSON.stringify(unitsIn[1]))];
  const plansSafe = [plans[0] || {}, plans[1] || {}];
  const path = [plansSafe[0].path || [], plansSafe[1].path || []];
  const nodes = [plansSafe[0].attackIndices || [], plansSafe[1].attackIndices || []];
  const idx = [1, 1];
  const stopped = [false, false];
  const events = [];
  let winner = -1;

  function hurt(s, dmg) {
    const t = u[s];
    t.hp -= dmg;
    if (t.hp <= 0) { t.hp = 0; t.alive = false; if (winner < 0) winner = 1 - s; }
  }

  function tryAttack(s) {
    const me = u[s], foe = u[1 - s];
    if (!me.alive || !foe.alive) return;
    const ac = foe.ac + (foe.dodging ? 3 : 0);
    if (pvpCheb(me, foe) > pvpRangeOf(me)) {
      events.push({ t: 'whiff', slot: s, ac: ac });
      return;
    }
    const mod = pvpMod(me.abilities[me.ranged ? 'int' : 'str']);
    const res = pvpRoll(r, mod, me.prof, ac);
    if (!res.hit) {
      events.push({ t: 'miss', slot: s, d20: res.d20, total: res.total, ac: ac });
      return;
    }
    let dmg = pvpDmgOf(me);
    if (res.crit) dmg *= 2;
    hurt(1 - s, dmg);
    events.push({ t: 'hit', slot: s, d20: res.d20, total: res.total, ac: ac,
                  crit: res.crit, dmg: dmg, hp: u[1 - s].hp });
    if (!u[1 - s].alive) events.push({ t: 'death', slot: 1 - s });
  }

  function clash(cell) {
    const d0 = u[1].alive ? pvpClashDmgOf(u[1]) * 2 : 0;
    const d1 = u[0].alive ? pvpClashDmgOf(u[0]) * 2 : 0;
    if (u[0].alive) hurt(0, d0);
    if (u[1].alive) hurt(1, d1);
    events.push({ t: 'clash', cell: { x: cell.x, y: cell.y },
                  dmg: [d0, d1], hp: [u[0].hp, u[1].hp] });
    if (!u[0].alive) events.push({ t: 'death', slot: 0 });
    if (!u[1].alive) events.push({ t: 'death', slot: 1 });
    /* 相杀是同归于尽：两人都倒 = 平局，不能因为「谁先被扣血」就判另一方赢 */
    if (!u[0].alive && !u[1].alive) winner = -2;
    stopped[0] = true; stopped[1] = true;
  }

  // 行动节点 0：原地攻击（对应单人的 pendingAttack）
  for (let s = 0; s < 2; s++) {
    if (nodes[s].indexOf(0) >= 0) tryAttack(s);
  }

  let guard = 0;
  while (!(stopped[0] && stopped[1]) && guard++ < 80) {
    const dest = [null, null], wait = [false, false], want = [false, false];

    for (let s = 0; s < 2; s++) {
      if (stopped[s] || !u[s].alive || idx[s] >= path[s].length) { stopped[s] = true; continue; }
      const p = path[s][idx[s]];
      // 非法步（越格传送 / 缺字段）直接终止该方移动，避免两端因坏计划分叉
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || pvpCheb(u[s], p) > 1) {
        stopped[s] = true;
        events.push({ t: 'invalid', slot: s });
        continue;
      }
      dest[s] = p;
      if (pvpSame(p, u[s])) { wait[s] = true; }
      else { want[s] = true; }
    }

    if (stopped[0] && stopped[1]) break;

    // 等待步 = 闪避（每回合一次，AC +3）
    for (let s = 0; s < 2; s++) {
      if (wait[s]) {
        idx[s]++;
        if (u[s].alive && !u[s].dodging) {
          u[s].dodging = true;
          events.push({ t: 'dodge', slot: s, ac: u[s].ac + 3 });
        }
      }
    }

    const m0 = want[0] && !stopped[0];
    const m1 = want[1] && !stopped[1];

    if (m0 && m1 && pvpSame(dest[0], dest[1])) {
      clash(dest[0]);
      break;
    }
    if (m0 && m1 && pvpSame(dest[0], u[1]) && pvpSame(dest[1], u[0])) {
      clash(dest[0]);
      break;
    }

    // 同时推进：目的地被「本 tick 结束后仍占着的人」挡住则停下
    const otherEnd = [m0 ? dest[0] : u[0], m1 ? dest[1] : u[1]];
    const arrivals = [];
    for (let s = 0; s < 2; s++) {
      if (!(s === 0 ? m0 : m1)) { continue; }
      if (pvpSame(dest[s], otherEnd[1 - s])) {
        stopped[s] = true;
        events.push({ t: 'blocked', slot: s, at: { x: u[s].x, y: u[s].y } });
        continue;
      }
      const from = { x: u[s].x, y: u[s].y };
      u[s].x = dest[s].x; u[s].y = dest[s].y;
      const dx = Math.sign(u[s].x - from.x), dy = Math.sign(u[s].y - from.y);
      if (dx || dy) u[s].facing = { dx: dx, dy: dy };
      const arrival = idx[s];
      idx[s]++;
      events.push({ t: 'move', slot: s, from: from, to: { x: u[s].x, y: u[s].y } });
      arrivals.push({ slot: s, arrival: arrival });
    }

    for (const a of arrivals) {
      if (nodes[a.slot].indexOf(a.arrival) >= 0) tryAttack(a.slot);
    }

    if (!u[0].alive || !u[1].alive) { stopped[0] = true; stopped[1] = true; }
  }

  return { units: u, events: events, winner: winner };
}
//#PVP_CORE_END
