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

// 本回合规划出来的「动作」占用情况：{ dodge, dodgeIndex, actions, skillIdxs, attackCount, skillCount }
function plannedActionInfo(path, atkIdxs, skillIdxs) {
  const p = path || playerPath;
  const atk = atkIdxs || attackIndices;
  const sk = skillIdxs || skillIndices;
  const wIdx = firstWaitIndex(p);
  const skOnPath = [...new Set(sk.filter(i => i > 0 && i < p.length))].sort((a, b) => a - b);
  const skSet = new Set(skOnPath);
  /* 技能节点占了第一个等待步：技能就绪时技能优先（这一步不闪避）；技能没就绪时仍可闪避 */
  const dodge = wIdx >= 0 && !(skSet.has(wIdx) && skillReadyInfo(p).ready);
  /* ★ 起点格（idx 0）的攻击节点也要算一个动作 —— 它是「原地攻击」，
   * 结算时走 pendingAttack 分支、同样消耗 playerActionsUsed。
   * 旧版用 `i > 0` 把它漏掉，导致「起点攻击 + 另一个攻击节点」规划期不报超限、
   * 结算时才莫名其妙打空（ISSUE-20261028-17 / BUG-STARTCELL-ATTACK）。 */
  const atkOnPath = [...new Set(atk.filter(i => i >= 0 && i < p.length))];
  return {
    dodge,
    dodgeIndex: (dodge ? wIdx : -1),
    skillIdxs: skOnPath,
    attackCount: atkOnPath.length,
    skillCount: skOnPath.length,
    actions: (dodge ? 1 : 0) + atkOnPath.length + skOnPath.length,
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

/* 玩家当前有效 AC：闪避状态下额外 +N（闪避持续到本回合结束） */
function playerEffectiveAC() {
  let ac = player ? player.ac : 10;
  if (playerDodging) ac += playerDodgeACBonus;
  return ac;
}
