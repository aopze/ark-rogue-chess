/* P0.1-4 拆分 · 20261028b 基线 1566-1621 行 · 动作机制与有效 AC 计算 */
/* =========================================================
 * ★ 动作机制（技能触发系统重做后）
 *
 * 主动行动只有三种，共用同一份动作预算：
 *   - 攻击：单击路径节点设攻击节点，到达该步时攻击。
 *   - 技能：双击路径节点设技能节点，到达该步时发动角色技能。
 *   - 闪避：路径里第一个「等待」自动成为闪避节点，AC +3。
 * 被动行动：趁乱攻击，本 tick 有主动行动时自动结算，不占动作。
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
  const atkOnPath = [...new Set(atk.filter(i => i > 0 && i < p.length))];
  return {
    dodge,
    dodgeIndex: (dodge ? wIdx : -1),
    skillIdxs: skOnPath,
    attackCount: atkOnPath.length,
    skillCount: skOnPath.length,
    actions: (dodge ? 1 : 0) + atkOnPath.length + skOnPath.length,
  };
}

// 再加一个节点会不会超出动作上限（用于设置节点时的提示）
function nodeFitsBudget(path, atkIdxs, skillIdxs) {
  return plannedActionInfo(path, atkIdxs, skillIdxs).actions <= maxActionsThisTurn();
}

/* 玩家当前有效 AC：闪避状态下额外 +N（闪避持续到本回合结束） */
function playerEffectiveAC() {
  let ac = player ? player.ac : 10;
  if (playerDodging) ac += playerDodgeACBonus;
  return ac;
}
