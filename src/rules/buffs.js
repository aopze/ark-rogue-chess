/* P0.1-4 拆分 · 20261028b 基线 730-777 行 · 升级与奖励池 buff / 统一受伤入口 */
/* =========================================================
 * ★ 升级与奖励池（buff）
 * 升级由经验驱动（ISSUE-20261028-10）：通关得经验，本关掉血越少经验越多，经验满即升级。
 * 升级时：HP 上限 + 体质加值、回满血，并从奖励池 3 选 1。
 * LEVELUP_EVERY_N_LEVELS 现在**只服务敌人成长**（enemies.js），玩家侧不再引用。
 * ========================================================= */
const LEVELUP_EVERY_N_LEVELS = 3;
let heroLevel = 1;
let playerShield = 0;                 // 药枚：护盾层数（抵消一次任意伤害）
let levelUpOpen = false;
let lastLevelUpConMod = 0;
/* ===== 玩家经验制（ISSUE-20261028-10） =====
 * xp            当前等级已累积的经验（升级时按阈值扣减）
 * pendingLevelUps 待结算的升级次数（通关时按 XP 一次算好，逐次弹奖励）
 *                旧变量 levelUpPending（布尔）已废弃：布尔装不下「一次连升 2 级」。
 * levelStartHp  本关开始时的血量（player.hp），失血口径的左端
 * levelActions  本关点了几次「开始行动」——**只用于日志**，不参与经验计算 */
let xp = 0;
let pendingLevelUps = 0;
let levelStartHp = 0;
let levelActions = 0;

/* 升到下一级所需经验（heroLevel 超出表长时按表尾 +100 递增） */
function xpThresholdForLevel(lv) {
  if (lv < XP_TABLE.length) return XP_TABLE[lv];
  return XP_TABLE[XP_TABLE.length - 1] + (lv - (XP_TABLE.length - 1)) * 100;
}
/* 该关「允许失血」的基准：按本关开始血量缩放，而不是 maxHp。
 * 挂 maxHp 会出现退化玩法：带 1 HP 进关 → 物理上掉不了血 → 每关都算零失血 → 永久满效率。 */
function xpDamageRef(startHp) {
  const raw = Math.round(startHp * XP_DMG_REF_RATIO);
  return Math.max(XP_DMG_REF_MIN, Math.min(XP_DMG_REF_MAX, raw));
}
/* 单关经验：hpLoss 取 0 下限（关内吃 ❤️ / 🩸 净回血时会算成负数，
 * 不夹会让 efficiency > ref，经验突破 24 上限，保底/上限两条算术保证同时失效）。 */
function computeLevelXp(startHp, endHp) {
  const hpLoss = Math.max(0, startHp - endHp);
  const ref = xpDamageRef(startHp);
  const eff = Math.max(0, Math.min(XP_EFF_CAP, ref - hpLoss));
  return { hpLoss, ref, eff, gain: XP_CLEAR_BASE + eff * XP_PER_STEP };
}
/* 通关时按经验排队升级次数（heroLevel 由 openLevelUp 逐次推进，这里只扣经验） */
function queueLevelUps() {
  let n = 0;
  while (n < XP_MAX_LEVELUPS_PER_CLEAR && xp >= xpThresholdForLevel(heroLevel + n)) {
    xp -= xpThresholdForLevel(heroLevel + n);
    n += 1;
  }
  pendingLevelUps = n;
  return n;
}
// buff 层数统计（同一 buff 可重复获得，效果累加）
let buffs = { kettle: 0, blade: 0, sass: 0, kit: 0, pill: 0, scout: 0 };

const BUFF_POOL = [
  { id: 'kettle', name: '热水壶', icon: '☕', desc: 'HP 上限 +2（并回复等量生命）' },
  { id: 'blade',  name: '锈蚀刀片', icon: '🗡️', desc: '近战伤害 +1' },
  { id: 'sass',   name: '香草沙士', icon: '🥤', desc: '获得技力时有 30% 概率额外获得 1 点技力' },
  { id: 'kit',    name: '急救药箱', icon: '🧰', desc: '每张地图必定额外出现一个恢复地块 ❤️' },
  { id: 'pill',   name: '药枚', icon: '💊', desc: '每关开始时获得 1 层护盾（抵消一次任意伤害）' },
  { id: 'scout',  name: '探测先锋', icon: '🔭', desc: '每回合动作上限 +1（可多放一次攻击/技能/闪避）' },
];
const BUFF_BY_ID = Object.fromEntries(BUFF_POOL.map(b => [b.id, b]));

/* 香草沙士：每次获得技力时 30% 额外 +1（返回额外点数） */
const SASS_CHANCE = 0.3;
function sassExtraSp() {
  return (buffs.sass > 0 && rng() < SASS_CHANCE) ? 1 : 0;
}
function buffMeleeBonus() { return buffs.blade; }
function buffHpBonus() { return buffs.kettle * 2; }

/* 统一的玩家受伤入口：有护盾（药枚）先消耗 1 层抵消整次伤害。
   返回 { dmg: 实际掉血, shielded: 是否被护盾抵消, immune: 调试无敌 } */
function damagePlayer(amount, label = '') {
  if (debugMode) return { dmg: 0, shielded: false, immune: true };
  if (!player || !player.alive) return { dmg: 0, shielded: false, immune: false };
  if (amount <= 0) return { dmg: 0, shielded: false, immune: false };
  if (playerShield > 0) {
    playerShield -= 1;
    floatText(player.x, player.y, '护盾抵消', '#ffffff');
    ringFx(player.x, player.y, '#ffffff');
    log(`🛡️ 护盾抵消了${label ? `「${label}」的` : ''}${amount} 点伤害（剩余 ${playerShield} 层）。`);
    updateStats();
    return { dmg: 0, shielded: true, immune: false };
  }
  player.hp = Math.max(0, player.hp - amount);
  return { dmg: amount, shielded: false, immune: false };
}
