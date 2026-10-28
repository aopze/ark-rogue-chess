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
/* =========================================================
 * ★ 玩家伤害骰（2026-10-29，人类指令：近战 2d4 / 远程 1d8）
 *
 * 唯一伤害公式（每次出手各掷一次，技能倍率乘在**掷完之后的总伤害**上）：
 *   近战 = 2d4 + ⌊(STR−10)/2⌋ + 锈蚀刀片层数      远程 = 1d8 + ⌊(INT−10)/2⌋
 *   暴击 ×2（朝向暴击 / 自然20 / 8% 随机暴击 / 技能必暴）
 *
 * 为什么保留属性修正：加点系统（每级 2 点、上限 20）是升级唯一手感来源，
 * 剥掉属性加成会让「加力量/智力」对伤害完全无效，六维只剩 HP/AC/移动/可见步。
 * 为什么用 randInt 而不是别的随机源：randInt → 全局 rng()，与命中检定同一条随机流，
 * 保证「同一回合内可复现」（测试用 __setD20 之类只替换 d20 时，伤害骰仍然真实随机）。
 * ★ 面板用的 meleeDmg / rangedDmg 从此只是**期望值**（diceAvg + 修正），不要再拿它们当伤害用。
 * ========================================================= */
function rollDamageDice(dd) {
  let total = 0;
  for (let i = 0; i < dd.n; i++) total += 1 + randInt(dd.s);
  return total;
}
function playerMeleeFlatBonus() { return abilityMod(playerStats.abilities.str) + buffMeleeBonus(); }
function playerRangedFlatBonus() { return abilityMod(playerStats.abilities.int); }
/* 真正用于扣血的入口 —— 战斗内所有近战/远程伤害都必须走这两个（含技能、冲锋、相杀、反击）。 */
function rollPlayerMeleeDamage() {
  return Math.max(1, rollDamageDice(PLAYER_MELEE_DICE) + playerMeleeFlatBonus());
}
function rollPlayerRangedDamage() {
  return Math.max(1, rollDamageDice(PLAYER_RANGED_DICE) + playerRangedFlatBonus());
}
/* 面板文案：`2d4+1` / `1d8-1` / `2d4`（修正为 0 时不显示符号） */
function fmtDmgDice(dd, flat) {
  const base = diceLabel(dd);
  if (flat > 0) return base + '+' + flat;
  if (flat < 0) return base + '−' + Math.abs(flat);
  return base;
}
function playerMeleeDmgLabel() { return fmtDmgDice(PLAYER_MELEE_DICE, playerMeleeFlatBonus()); }
function playerRangedDmgLabel() { return fmtDmgDice(PLAYER_RANGED_DICE, playerRangedFlatBonus()); }

function recomputePlayerDerivedStats() {
  const a = playerStats.abilities;
  playerStats.maxHp = a.con + BASE_HP_BONUS + levelHpBonus + buffHpBonus();
  playerStats.move = Math.max(1, Math.floor(a.dex / 2));
  /* ★ 这两个字段**只是期望值**（AI 估值 / 面板兜底 / 日志），实际扣血一律用 rollPlayer*Damage()。
   * diceAvg 与 rollDamageDice 的期望对齐：2d4→5、1d8→5。 */
  playerStats.meleeDmg = Math.max(1, diceAvg(PLAYER_MELEE_DICE) + playerMeleeFlatBonus());
  playerStats.rangedDmg = Math.max(1, diceAvg(PLAYER_RANGED_DICE) + playerRangedFlatBonus());
  playerStats.visibleSteps = 1 + Math.max(0, abilityMod(a.wis));
  playerStats.ac = computeAC(a);
  /* ISSUE-20261028-07：熟练加值改为绑定**角色等级**，每级 +1。
   * 旧口径 `4 + ⌊(关卡-1)/5⌋` 与 heroLevel（每 3 关 +1）脱钩，升级当关玩家看不到熟练变化；
   * 新口径起手仍为 +4（heroLevel=1 → +4），第 1–3 关手感与旧版完全一致。
   * 实测（每方案 21 万次 attackRoll）：对当时真实敌人 AC，每级 +2 会在第 4 关就全类型封顶 95%，
   * 命中机制失效，故取 +1。 */
  playerStats.prof = 4 + Math.max(0, heroLevel - 1);
  /* ISSUE-20261028-19：动态角色（预备干员）的熟练项由六维现算 —— 每次加点都会重跑本函数，
   * 所以「先加智力变远程、再加力量翻回近战」是自动的，不需要额外挂钩。
   * 静态角色继续用 createPlayerStats() 里写好的值，一行都不覆盖（其他四人行为必须完全不变）。 */
  if (charIsDynamic(playerStats.charId)) {
    const ranged = dynamicAttackTypeOf(a) === 'ranged';
    playerStats.profMelee = !ranged;
    playerStats.profRanged = ranged;
  }
  playerStats.meleeProf = playerStats.profMelee ? playerStats.prof : 0;
  playerStats.rangedProf = playerStats.profRanged ? playerStats.prof : 0;
}

/* =========================================================
 * 玩家侧攻击类型（ISSUE-20261028-19）
 *
 * 前四人静态，预备干员按当前六维现算。**所有运行时判定都必须走这里**，
 * 不要再写 `selectedChar === 'wheelchair' || selectedChar === 'fencer'` 这种角色名硬判断 ——
 * 那条判断在预备干员身上会直接把近战角色送进远程分支。
 * ========================================================= */
function playerAttackType() {
  return charAttackTypeOf(selectedChar, playerStats && playerStats.abilities);
}
function playerIsRanged() { return playerAttackType() === 'ranged'; }
function playerDmgLabel() { return playerIsRanged() ? '远程伤害' : '近战伤害'; }

/* ★ 以下三个只读「基础面板（L1）」。
 * 运行时数值请一律用 computeEnemyGrowth(type, level, idx, RUN_SEED) —— 见上方 ISSUE-20261028-03。
 * 保留它们是为了让「基础值」的语义还查得到，不要再拿它们给场上单位赋值。 */
function getEnemyAbilities(type) { return { ...ENEMY_STATS[type].abilities }; }
function getEnemyProf(type) { return ENEMY_STATS[type].prof; }
function computeEnemyHp(type) { return ENEMY_STATS[type].abilities.con; }
function computeEnemyMove(type) {
  return Math.max(1, Math.floor(ENEMY_STATS[type].abilities.dex / 2));
}
