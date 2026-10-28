/* P0.1-4 拆分 · 20261028c 基线 1908-2003 行 · 状态重置（整局 / 整轮两级收敛）：freshBuffs / clearLevelUpOverlay / resetSkillState / resetRunProgress / resetTurnState / createPlayerStats / createPlayerUnit / syncPlayerFromStats */
/* =========================================================
 * ★ 状态重置：开局 / 换角色 / 通关 / 回合切换
 * 原来同一个变量表在 initCharSelect、selectCharacter、initLevel、
 * confirmAction、endRound 里各抄了一份，新增状态时极容易漏清。
 * 这里按「整局 / 整轮」两级收敛。
 * ========================================================= */
function freshBuffs() {
  return { kettle: 0, blade: 0, sass: 0, kit: 0, pill: 0, scout: 0 };
}
function clearLevelUpOverlay() {
  document.querySelectorAll('.lv-mask').forEach(m => m.remove());
}
/* 技力与角色专属技能状态（换角色 / 重开时清零） */
function resetSkillState() {
  fencerSp = 0;
  wheelchairSp = 0;
  vampireSp = 0;
  vampireSkillActive = false;
  amiyaBonusTargets = 0;
}
/* 整局成长：等级 / 经验 / buff / 护盾 / 升级弹窗 */
function resetRunProgress() {
  levelHpBonus = 0;
  heroLevel = 1;
  xp = 0;                       // 漏重置 → 二周目带经验开局
  pendingLevelUps = 0;
  levelStartHp = 0;
  levelActions = 0;
  buffs = freshBuffs();
  playerShield = 0;
  levelUpOpen = false;
  lastLevelUpConMod = 0;
  clearLevelUpOverlay();
  resetSkillState();
}
/* 一回合内的临时状态（每回合开始 / 结束时都清）。
 * clearCounter=true 时连反击状态一起清（回合结束时需要）。 */
function resetTurnState({ clearCounter = false } = {}) {
  playerChargingThisTurn = false;
  playerAttacksDone = 0;
  playerActionsUsed = 0;
  playerDodging = false;
  playerDodgeACBonus = 0;
  dodgeTriggerIndex = -1;
  pendingAttack = false;
  pendingChargeInfo = null;
  playerChargeStopReason = null;
  playerChargeCausedDamage = false;
  playerChargeBudget = 0;
  playerChargeHits = 0;
  if (clearCounter) fencerCounterActive = false;
}

function createPlayerStats(charId) {
  const char = CHARACTERS[charId];
  return {
    abilities: { ...char.abilities },
    profMelee: char.profMelee,
    profRanged: char.profRanged,
    abilityPoints: 0,
    currentHp: 0,
    extraTargets: 0,
    extraAttacks: 0,
    critChance: 0.08,
  };
}
function createPlayerUnit(start) {
  return {
    x: start.x, y: start.y,
    hp: playerStats.currentHp, maxHp: playerStats.maxHp,
    move: playerStats.move, range: PLAYER_RANGE,
    rangedDmg: playerStats.rangedDmg,
    meleeDmg: playerStats.meleeDmg,
    critChance: playerStats.critChance,
    extraTargets: playerStats.extraTargets,
    extraAttacks: playerStats.extraAttacks,
    visibleSteps: playerStats.visibleSteps,
    abilities: playerStats.abilities,
    ac: playerStats.ac,
    prof: playerStats.prof,
    meleeProf: playerStats.meleeProf,
    rangedProf: playerStats.rangedProf,
    alive: true, facing: { dx: 1, dy: 0 },
  };
}
/* 加点 / 升级后把派生面板同步到战斗单位（唯一入口，避免两边字段漂移） */
function syncPlayerFromStats() {
  if (!player) return;
  player.maxHp = playerStats.maxHp;
  player.move = playerStats.move;
  player.meleeDmg = playerStats.meleeDmg;
  player.rangedDmg = playerStats.rangedDmg;
  player.visibleSteps = playerStats.visibleSteps;
  player.abilities = playerStats.abilities;
  player.ac = playerStats.ac;
  player.prof = playerStats.prof;
  player.meleeProf = playerStats.meleeProf;
  player.rangedProf = playerStats.rangedProf;
}
