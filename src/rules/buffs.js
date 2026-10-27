/* P0.1-4 机械拆分：从 game.html（20261028b 基线）第 730-777 行原样搬移（升级与奖励池 buff + 玩家受伤统一入口）。
 * 纯移动未改逻辑；顺序由 build/manifest.json 保证与拆分前一致。 */
/* =========================================================
 * ★ 升级与奖励池（buff）
 * 每 3 关（通关第 3/6/9… 关）提升 1 级：HP 上限 + 体质加值、回满血，并从奖励池 3 选 1。
 * ========================================================= */
const LEVELUP_EVERY_N_LEVELS = 3;
let heroLevel = 1;
let playerShield = 0;                 // 药枚：护盾层数（抵消一次任意伤害）
let levelUpOpen = false;
let levelUpPending = false;           // 已通关、等待升级结算（防止定时器丢失导致卡在通关界面）
let lastLevelUpConMod = 0;
// buff 层数统计（同一 buff 可重复获得，效果累加）
let buffs = { kettle: 0, blade: 0, sass: 0, kit: 0, pill: 0, scout: 0 };

const BUFF_POOL = [
  { id: 'kettle', name: '热水壶', icon: '☕', desc: 'HP 上限 +2（并回复等量生命）' },
  { id: 'blade',  name: '锈蚀刀片', icon: '🗡️', desc: '近战伤害 +1，趁乱攻击伤害 +1' },
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
  player.hp -= amount;
  return { dmg: amount, shielded: false, immune: false };
}
