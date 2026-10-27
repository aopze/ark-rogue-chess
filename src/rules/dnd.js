/* P0.1-4 机械拆分：从 game.html（20261028b 基线）第 536-609 行原样搬移
 * （泥岩技力获取 + DnD 六属性系统：abilityMod / computeAC / attackRoll / 掷骰检定 / recomputePlayerDerivedStats / 敌人 L1 基础面板只读查询）。
 * 纯移动未改逻辑；顺序由 build/manifest.json 保证与拆分前一致。 */
/* =========================================================
 * 泥岩技力
 * ========================================================= */
function gainFencerSp(n = 1) {
  if (selectedChar !== 'fencer') return;
  if (fencerSp >= FENCER_SP_MAX) return;
  const sass = sassExtraSp();
  if (sass) log('🥤 香草沙士：额外获得 1 点技力！');
  const oldSp = fencerSp;
  fencerSp = Math.min(FENCER_SP_MAX, fencerSp + n + sass);
  if (oldSp < FENCER_SP_MAX && fencerSp >= FENCER_SP_MAX) {
    log(`⚡ 泥岩技力已满（${FENCER_SP_MAX}/${FENCER_SP_MAX}）！「岩崩锤」就绪：反击状态下免疫所有攻击；下次反击触发眩晕+回复1/2HP。`);
    if (player && player.alive) floatText(player.x, player.y, '岩崩锤就绪！', '#ffd700');
  }
}

/* =========================================================
 * DnD 六属性系统
 * ========================================================= */
function abilityMod(score) { return Math.floor((score - 10) / 2); }
function abilityLabel(score) {
  const m = abilityMod(score);
  return score + (m >= 0 ? '(+' + m + ')' : '(' + m + ')');
}
function computeAC(abilities) {
  return 5 + Math.floor((abilities.dex + abilities.con) / 4);
}
function attackRoll(attackerMod, prof, targetAC) {
  const d20 = 1 + randInt(20);
  const total = d20 + attackerMod + prof;
  if (d20 === 20) return { roll: d20, total, hit: true, nat20: true, nat1: false, mod: attackerMod, prof };
  if (d20 === 1) return { roll: d20, total, hit: false, nat20: false, nat1: true, mod: attackerMod, prof };
  return { roll: d20, total, hit: total >= targetAC, nat20: false, nat1: false, mod: attackerMod, prof };
}
function attackRollDisadvantage(attackerMod, prof, targetAC) {
  const a1 = attackRoll(attackerMod, prof, targetAC);
  const a2 = attackRoll(attackerMod, prof, targetAC);
  const chosen = a1.total <= a2.total ? a1 : a2;
  const other  = a1.total <= a2.total ? a2 : a1;
  return {
    ...chosen,
    otherRoll: other.roll,
    otherTotal: other.total,
    disadvantage: true
  };
}
function fmtRoll(atk, ac) {
  if (atk.disadvantage) {
    return `劣势 d20=${atk.roll}${atk.mod >= 0 ? '+' : ''}${atk.mod}${atk.prof ? '+熟' + atk.prof : ''}=${atk.total} / d20=${atk.otherRoll}${atk.mod >= 0 ? '+' : ''}${atk.mod}${atk.prof ? '+熟' + atk.prof : ''}=${atk.otherTotal}，取低${atk.hit ? '≥' : '<'}AC${ac}`;
  }
  return `d20=${atk.roll}${atk.mod >= 0 ? '+' : ''}${atk.mod}${atk.prof ? '+熟' + atk.prof : ''}=${atk.total}${atk.hit ? '≥' : '<'}AC${ac}`;
}
function recomputePlayerDerivedStats() {
  const a = playerStats.abilities;
  playerStats.maxHp = a.con + levelHpBonus + buffHpBonus();
  playerStats.move = Math.max(1, Math.floor(a.dex / 2));
  playerStats.meleeDmg = Math.max(1, 1 + abilityMod(a.str)) + buffMeleeBonus();
  playerStats.rangedDmg = Math.max(1, 1 + abilityMod(a.int));
  playerStats.visibleSteps = 1 + Math.max(0, abilityMod(a.wis));
  playerStats.ac = computeAC(a);
  playerStats.prof = 4 + Math.floor((level - 1) / 5);
  playerStats.meleeProf = playerStats.profMelee ? playerStats.prof : 0;
  playerStats.rangedProf = playerStats.profRanged ? playerStats.prof : 0;
}

/* ★ 以下三个只读「基础面板（L1）」。
 * 运行时数值请一律用 computeEnemyGrowth(type, level, idx, RUN_SEED) —— 见上方 ISSUE-20261028-03。
 * 保留它们是为了让「基础值」的语义还查得到，不要再拿它们给场上单位赋值。 */
function getEnemyAbilities(type) { return { ...ENEMY_STATS[type].abilities }; }
function getEnemyProf(type) { return ENEMY_STATS[type].prof; }
function computeEnemyHp(type) { return ENEMY_STATS[type].abilities.con; }
function computeEnemyMove(type) {
  return Math.max(1, Math.floor(ENEMY_STATS[type].abilities.dex / 2));
}
