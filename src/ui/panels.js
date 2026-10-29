/* =========================================================================
 * ISSUE-20261028-09 G2 · 属性数据（属性抽屉与说明卡已随 ISSUE-20261029-37 移除）
 *
 * 六维数值公式仅保留给雷达图（canAlloc / 顶点提示）与角色面板（♟️）六维图加点使用。
 * 加点入口：角色面板里的六维图 —— 点属性名直接 +1（见 dom-refs.js 的 #charRadarCanvas 点击）。
 * ========================================================================= */
const ABILITY_INFO = {
  str: { name: '力量', desc: '近战伤害与近战命中。近战伤害 = <code>1 + 力量修正</code>；风笛 / 泥岩 用这一条。' },
  dex: { name: '敏捷', desc: '移动力与防御等级。移动力 = <code>⌊敏捷 / 2⌋</code>；AC = <code>5 + ⌊(敏捷 + 体质) / 4⌋</code>。' },
  con: { name: '体质', desc: '生命上限。maxHp = <code>体质 + 4 + 等级加成</code>；同时参与 AC 公式。' },
  int: { name: '智力', desc: '远程伤害与远程命中。远程伤害 = <code>1 + 智力修正</code>；阿米娅 / 华法琳 用这一条。' },
  wis: { name: '感知', desc: '战场预判与技力上限。敌人意图可见步数 = <code>1 + max(0, 感知修正)</code>；部分角色的技力上限 = 感知值。' },
  cha: { name: '魅力', desc: '当前版本无任何数值作用（只显示、只参与面板展示）。' }
};

/* 当前该属性的数值：选角时看候选人，局内看 playerStats
 * ★ ISSUE-20261028-19：动态角色（预备干员）在选角阶段读的是**副本**，不是 CHARACTERS 静态值。 */
function currentAbilityValue(k) {
  if (phase === PHASE.CHAR_SELECT && selectedCandidate && CHARACTERS[selectedCandidate.id]) {
    const a = candidateAbilitiesOf(selectedCandidate.id);
    return (a && a[k]) || 0;
  }
  if (playerStats && playerStats.abilities) return playerStats.abilities[k] || 0;
  if (player && player.abilities) return player.abilities[k] || 0;
  return 0;
}

/* 当前还能加几点：选角阶段看候选副本，局内看 playerStats */
function pointsLeftNow() {
  if (phase === PHASE.CHAR_SELECT) return candidatePointsLeft();
  return playerStats ? (playerStats.abilityPoints || 0) : 0;
}

function canAllocateNow() {
  if (phase === PHASE.CHAR_SELECT) {
    /* ISSUE-20261028-19 B1：选角阶段只有动态角色（预备干员）能加点，且必须有剩余点数。
     * 前四个角色在这一相位仍然不可加点 —— 行为与之前完全一致。 */
    return candidatePointsLeft() > 0;
  }
  return !!(playerStats && playerStats.abilityPoints > 0
    && (phase === PHASE.PLANNING || phase === PHASE.LEVELCLEAR));
}
