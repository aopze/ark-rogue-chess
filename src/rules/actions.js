/* P0.1-4 拆分 · 20261028b 基线 1566-1621 行 · 动作机制与有效 AC 计算 */
/* =========================================================
 * ★ 动作机制（技能触发系统重做后）
 *
 * 主动行动只有三种，共用同一份动作预算：
 *   - 攻击：单击路径节点设攻击节点，到达该步时攻击。
 *     正对目标近战时触发「朝向必中」（dnd.js#applyFacingGuaranteedHit），伤害与暴击判定照旧。
 *   - 技能：双击路径节点设技能节点，到达该步时发动角色技能。
 *   - 闪避：路径里第一个「等待」自动成为闪避节点，AC +3。
 *
 * 【2026-10-29 删机制】旧的「自动补刀」被动已彻底移除 —— 本 tick 只要有动作，就对**所有**相邻
 * 敌人各补一刀，不占动作、无上限，实际占了玩家总输出的一大半；功能上和攻击节点重复。
 * 现在攻击只有一条路：设攻击节点（含朝向必中）。没有自动补刀、没有白嫖出手，不要加回来。
 *
 * 默认每回合 1 次动作（scout 的 extraAttacks 可 +1）。按路径先后先到先得，
 * 超出预算的动作在结算时报失败并写日志。
 * 技能节点占住第一个等待步且技能就绪时，技能优先，该步不结算闪避。
 * ========================================================= */
const DODGE_AC_BONUS = 3;

// 路径里第一个「等待」步的下标；没有则 -1
function firstWaitIndex(path) {
  const p = path || playerPath;
  for (let i = 1; i < p.length; i++) {
    if (p[i].x === p[i-1].x && p[i].y === p[i-1].y) return i;
  }
  return -1;
}

/* 本回合规划出来的「动作」占用情况：{ dodge, dodgeIndex, actions, skillIdxs, attackCount, skillCount, order } */
function plannedActionInfo(path, atkIdxs, skillIdxs) {
  const p = path || playerPath;
  const atk = atkIdxs || attackIndices;
  const sk = skillIdxs || skillIndices;
  const wIdx = firstWaitIndex(p);
  /* ★ ISSUE-20261029-34：技能节点的过滤口径必须与攻击节点一致（都含起点 idx 0）。
   * 旧版写 `i > 0`，于是「在原地点技能」既不占动作预算、也永远不会被结算到
   * （resolveStep 只在 pathIdx >= 1 的移动步上检查技能节点）。现在统一成 `i >= 0`：
   * 起点技能 = 本回合第一个 tick 原地发动（见 templates/game.html#resolveStep）。 */
  const skOnPath = [...new Set(sk.filter(i => i >= 0 && i < p.length))].sort((a, b) => a - b);
  const skSet = new Set(skOnPath);
  /* 技能节点占了第一个等待步：技能就绪时技能优先（这一步不闪避）；技能没就绪时仍可闪避 */
  const dodge = wIdx >= 0 && !(skSet.has(wIdx) && skillReadyInfo(p).ready);
  /* ★ 起点格（idx 0）的攻击节点也要算一个动作 —— 它是「原地攻击」，
   * 结算时走 pendingAttack 分支、同样消耗 playerActionsUsed。
   * 旧版用 `i > 0` 把它漏掉，导致「起点攻击 + 另一个攻击节点」规划期不报超限、
   * 结算时才莫名其妙打空（ISSUE-20261028-17 / BUG-STARTCELL-ATTACK）。 */
  const atkOnPath = [...new Set(atk.filter(i => i >= 0 && i < p.length))];
  const actions = (dodge ? 1 : 0) + atkOnPath.length + skOnPath.length;

  /* ★ ISSUE-20261029-34：动作显示顺序 = 实际结算顺序。
   * 旧版 UI 固定按「闪避 → 攻击 → 技能」拼类型序，与真实结算（按路径步序）相反 ——
   * 于是「原地先点攻击再点等待（闪避）」在界面上显示成「闪避+攻击」。
   * 真实顺序：
   *   ① 起点格（idx 0）的攻击 / 技能最先结算（不移动，先出手 / 先施法）；
   *   ② 其余按路径下标升序，同一下标上先闪避（步首判定）再攻击（步末出手）；
   *      技能与攻击互斥，不会落在同一格。
   * order 里按 kind 分组计数（组序 = 首次出现顺序），UI 直接照着渲染。 */
  const seq = [];
  if (atkOnPath.includes(0)) seq.push({ kind: 'attack', idx: 0 });
  if (skOnPath.includes(0)) seq.push({ kind: 'skill', idx: 0 });
  const stepIdxs = [...new Set([
    ...atkOnPath.filter(i => i > 0),
    ...skOnPath.filter(i => i > 0),
    ...(dodge ? [wIdx] : []),
  ])].sort((a, b) => a - b);
  for (const i of stepIdxs) {
    if (dodge && i === wIdx) seq.push({ kind: 'dodge', idx: i });
    if (skOnPath.includes(i)) seq.push({ kind: 'skill', idx: i });
    if (atkOnPath.includes(i)) seq.push({ kind: 'attack', idx: i });
  }
  const order = [];
  for (const s of seq) {
    const g = order.find(o => o.kind === s.kind);
    if (g) g.count += 1;
    else order.push({ kind: s.kind, count: 1, firstIdx: s.idx });
  }

  return {
    dodge,
    dodgeIndex: (dodge ? wIdx : -1),
    skillIdxs: skOnPath,
    attackCount: atkOnPath.length,
    skillCount: skOnPath.length,
    actions,
    order,
  };
}

// 再加一个节点会不会超出预算（用于设置节点时的提示）：
// ① 动作数 ≤ maxActionsThisTurn()（ISSUE-20261029-25 起为 2）② 攻击节点数 ≤ maxAttacksThisTurn()（仍为 1）
function nodeFitsBudget(path, atkIdxs, skillIdxs) {
  const info = plannedActionInfo(path, atkIdxs, skillIdxs);
  return info.actions <= maxActionsThisTurn() && info.attackCount <= maxAttacksThisTurn();
}
// 被拒时说清是哪条线撞的（ISSUE-20261029-25 起「动作数」与「攻击次数」是两个不同的上限，
// 一句「动作上限 2」会把玩家带偏 —— 明明只放了一个攻击节点也会被拒）
function budgetRejectReason(path, atkIdxs, skillIdxs) {
  const info = plannedActionInfo(path, atkIdxs, skillIdxs);
  if (info.attackCount > maxAttacksThisTurn()) {
    return `攻击次数上限 ${maxAttacksThisTurn()}：本回合只能出手 ${maxAttacksThisTurn()} 次（动作预算 ${maxActionsThisTurn()} 件里最多 1 件是攻击，其余留给技能/闪避）。`;
  }
  return `动作上限 ${maxActionsThisTurn()}：攻击节点 + 技能节点 + 闪避合计不能超过 ${maxActionsThisTurn()} 件。`;
}

/* ★ ISSUE-20261029-34：追加一个「等待」步（= 闪避动作）前先查预算。
 * 等待步本身不消耗移动力以外的东西，但**第一个**等待步会自动变成闪避动作（占 1 件）。
 * 旧版三处入口（等待按钮 / Q 键 / 长按 400ms）都只看「等待次数 < 移动力」，
 * 完全不查动作预算 —— 于是「攻击 + 技能 + 闪避」三件能被规划出来（预算只有 2），
 * 界面上出现红色的「3/2」，这就是「连续点会出现 3 个行动」的根因。
 * 注意：第二个及以后的等待步不会新增闪避动作，所以永远不会超预算。 */
function canAddWaitStep(path, atkIdxs, skillIdxs) {
  const p = path || playerPath;
  const last = p.length ? p[p.length - 1] : (player ? { x: player.x, y: player.y } : { x: 0, y: 0 });
  const next = [...p, { x: last.x, y: last.y }];
  if (!nodeFitsBudget(next, atkIdxs, skillIdxs)) {
    return { ok: false, reason: budgetRejectReason(next, atkIdxs, skillIdxs) };
  }
  return { ok: true, path: next };
}

/* 玩家当前有效 AC：闪避状态下额外 +N（闪避持续到本回合结束） */
function playerEffectiveAC() {
  let ac = player ? player.ac : 10;
  if (playerDodging) ac += playerDodgeACBonus;
  return ac;
}
