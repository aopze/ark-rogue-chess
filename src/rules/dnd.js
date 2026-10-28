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
/* ISSUE-20261028-15：玩家近战「朝向必中」。
 * 正对目标出手时，不再由 d20 决定中不中 —— 一律算命中，伤害与暴击判定完全照旧。
 *   - A2 仍然掷骰：d20 照掷、自然 20 的暴击优先级不变（本函数只写 hit，不碰 nat20）。
 *   - B1 覆盖自然 1（推荐值）：否则玩家会遇到「我正对着它，还是空了」，规则等于没建立起来。
 *   - A4 / C1 只给玩家近战用：远程（含不稳定血浆的 forcedHit）、技能爆发、敌人侧一律不调用本函数。
 * 不复用 atk.forcedHit —— 那个字段已经被「不稳定血浆」占用，混用会让日志串味。 */
function applyFacingGuaranteedHit(atk, target) {
  if (!player || !target || !isFacingTarget(player, target)) return atk;
  if (atk.hit) return atk;                 // 本来就命中：保留 total/AC 的原始展示，不多贴标签
  atk.hit = true;
  atk.facingHit = true;                    // 朝向必中（A3 的日志/浮字据此加「· 必定命中」）
  atk.nat1Overridden = !!atk.nat1;         // 记录「自然 1 被覆盖」，让战报能解释这行数字
  return atk;
}
function fmtRoll(atk, ac) {
  /* ISSUE-20261028-15：朝向必中的点数会「看起来打不中」，必须就地解释，否则像 bug。
   * 这种情况下比较符也要按真实总点数显示（`6<AC30（朝向必中…）`），不能因为 hit=true 就写成 ≥。 */
  const forced = atk.facingHit ? `（朝向必中${atk.nat1Overridden ? '，覆盖自然1' : ''}）` : '';
  const cmp = atk.facingHit ? (atk.total >= ac ? '≥' : '<') : (atk.hit ? '≥' : '<');
  if (atk.disadvantage) {
    return `劣势 d20=${atk.roll}${atk.mod >= 0 ? '+' : ''}${atk.mod}${atk.prof ? '+熟' + atk.prof : ''}=${atk.total} / d20=${atk.otherRoll}${atk.mod >= 0 ? '+' : ''}${atk.mod}${atk.prof ? '+熟' + atk.prof : ''}=${atk.otherTotal}，取低${cmp}AC${ac}${forced}`;
  }
  return `d20=${atk.roll}${atk.mod >= 0 ? '+' : ''}${atk.mod}${atk.prof ? '+熟' + atk.prof : ''}=${atk.total}${cmp}AC${ac}${forced}`;
}
function recomputePlayerDerivedStats() {
  const a = playerStats.abilities;
  playerStats.maxHp = a.con + BASE_HP_BONUS + levelHpBonus + buffHpBonus();
  playerStats.move = Math.max(1, Math.floor(a.dex / 2));
  playerStats.meleeDmg = Math.max(1, 1 + abilityMod(a.str)) + buffMeleeBonus();
  playerStats.rangedDmg = Math.max(1, 1 + abilityMod(a.int));
  playerStats.visibleSteps = 1 + Math.max(0, abilityMod(a.wis));
  playerStats.ac = computeAC(a);
  /* ISSUE-20261028-07：熟练加值改为绑定**角色等级**，每级 +1。
   * 旧口径 `4 + ⌊(关卡-1)/5⌋` 与 heroLevel（每 3 关 +1）脱钩，升级当关玩家看不到熟练变化；
   * 新口径起手仍为 +4（heroLevel=1 → +4），第 1–3 关手感与旧版完全一致。
   * 实测（每方案 21 万次 attackRoll）：对当时真实敌人 AC，每级 +2 会在第 4 关就全类型封顶 95%，
   * 命中机制失效，故取 +1。 */
  playerStats.prof = 4 + Math.max(0, heroLevel - 1);
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
