/* P0.1-4 机械拆分：从 game.html（20261028b 基线）第 596-671 行原样搬移（敌人类型 / L1 基础面板 / 成长推演（computeEnemyGrowth））。
 * 纯移动未改逻辑；顺序由 build/manifest.json 保证与拆分前一致。 */
const ENEMY_TYPES = ['skeleton', 'ghost', 'alien', 'shield', 'bomber'];

/* =========================================================
 * 敌人基础面板（L1 起点，实际数值由 computeEnemyGrowth 推演，ISSUE-20261028-03）
 *
 * ★ ISSUE-20261028-04：伤害改为**骰子**。
 *   旧口径 `Math.max(1, 1 + abilityMod(力))` 把三类型的伤害全截平成 1
 *   （骷髅力10→0、幽灵力8→-1、外星的远程智10→0，全被 max(1,…) 兜底），
 *   玩家挨打完全分不出是谁打的。现在按类型给不同骰子：
 *     骷髅 1d2（1–2，期望 1.5，硬碰硬最疼）
 *     幽灵 1d1（恒 1，最快但最轻）
 *     外星 远程 1d2（期望 1.5），近战 1
 *   骰子仍走全局 rng()，与既有随机序列同一来源。
 *
 *   ⚠️ 强度校准记录：首版用 1d3/1d2/1d3，实测 40 局通关层数 1.10 → 0.35（-68%），
 *   远超 issue 的 40% 回调线（单关承伤从每回合 1.09 涨到 2.0，玩家 HP10 撑不过 5 回合）。
 *   故整体下调一档，保持「骷髅 > 幽灵」的感知差（1d2 vs 1d1）而不破坏前期可玩性。
 *
 * ★ 新类型追加在数组末尾：computeEnemyGrowth 用 ENEMY_TYPES.indexOf(type) 派生种子，
 *   追加不影响前三种的 typeIdx（既有存档/种子下的成长序列保持一致）。
 * ========================================================= */
const ENEMY_STATS = {
  skeleton: {
    name: '骷髅', icon: '💀',
    // 力10 智6 敏6 感6 魅3 体10
    abilities: { str: 10, int: 6, dex: 6, wis: 6, cha: 3, con: 10 },
    prof: 1,
    dice: { melee: [1, 2] },
  },
  ghost: {
    name: '幽灵', icon: '👻',
    // 力8 智8 敏10 感8 魅6 体6
    abilities: { str: 8, int: 8, dex: 10, wis: 8, cha: 6, con: 6 },
    prof: 2,
    dice: { melee: [1, 1] },
  },
  alien: {
    name: '外星人', icon: '👾',
    // 力0 智10 敏8 感8 魅6 体8
    abilities: { str: 0, int: 10, dex: 8, wis: 8, cha: 6, con: 8 },
    prof: 2,
    dice: { melee: [1, 1], ranged: [1, 2] },
  },
  /* 盾卫（L8+）：慢、硬、不疼。AC 由 (敏4+体18)/4 → 5+5 = 10 起步，
   * 是唯一 AC 明显高于基础三类的类型，逼玩家绕后或用远程磨。 */
  shield: {
    name: '盾卫', icon: '🛡️',
    // 力10 智4 敏6 感8 魅4 体18
    abilities: { str: 10, int: 4, dex: 6, wis: 8, cha: 4, con: 18 },
    prof: 1,
    dice: { melee: [1, 2] },
  },
  /* 自爆虫（L12+）：极脆、极快，贴到身边就自爆（固定 3 伤害，不吃命中检定）。
   * 逼玩家拉开距离，而不是像对其它类型那样站着换血。 */
  bomber: {
    name: '自爆虫', icon: '💣',
    // 力6 智2 敏12 感6 魅2 体4
    abilities: { str: 6, int: 2, dex: 12, wis: 6, cha: 2, con: 4 },
    prof: 1,
    dice: { melee: [1, 1] },
    explode: 4,
  }
};

/* =========================================================
 * 类型解锁与权重（ISSUE-20261028-04）
 * 旧口径是 `ENEMY_TYPES[randInt(3)]` 均匀随机 → 第 1 关就有 33% 外星人（远程狙击），
 * 新手关挨狙且毫无节奏。现在按关卡分批解锁，前期只有近战骷髅。
 * ========================================================= */
const ENEMY_UNLOCK = [
  { from: 1,  type: 'skeleton', w: 4 },
  { from: 3,  type: 'ghost',    w: 3 },
  { from: 5,  type: 'alien',    w: 2 },
  { from: 8,  type: 'shield',   w: 2 },
  { from: 12, type: 'bomber',   w: 2 },
];

/* 按本关可用类型 + 权重抽一个。仍走全局 rng()，与旧版同一随机来源。 */
function pickEnemyType(level) {
  const pool = ENEMY_UNLOCK.filter(u => level >= u.from);
  if (pool.length === 0) return 'skeleton';
  let total = 0;
  for (const u of pool) total += u.w;
  let r = randInt(total);
  for (const u of pool) {
    if (r < u.w) return u.type;
    r -= u.w;
  }
  return pool[0].type;
}

/* 伤害骰：dice 形如 [n, sides]。未定义时退回面板常量的兜底。 */
function rollEnemyDamage(e, kind) {
  const dd = kind === 'ranged' ? e.rangedDice : e.meleeDice;
  if (!dd) return kind === 'ranged' ? e.rangedDmg : e.meleeDmg;
  let total = 0;
  for (let i = 0; i < dd.n; i++) total += 1 + randInt(dd.s);
  return total;
}

/* 骰子期望值（面板展示 / AI 估算用）：n × (sides+1) / 2，四舍五入且至少 1。 */
function diceAvg(dd) {
  if (!dd) return 1;
  return Math.max(1, Math.round(dd.n * (dd.s + 1) / 2));
}
function diceLabel(dd) {
  if (!dd) return '';
  return `${dd.n}d${dd.s}`;
}

/* =========================================================
 * ★ 敌人成长推演（ISSUE-20261028-03）
 * 敌人每关都会整批重建（initLevel 里 enemies = []），没有跨关的个体身份，
 * 所以「第 6 关的敌人提了 6 次属性」不能靠运行时记忆，只能在生成时从 L1 推演到第 L 关。
 *
 * 随机源必须与全局 rng() 隔离：全局 rng() 有滚动状态，用它算成长会导致
 * 每次重绘敌人面板都换一批数值（本项目的硬要求是「意图可预判」）。
 * 因此按「本局种子 + 关卡 + 实例下标 + 类型」派生一颗固定种子。
 * ========================================================= */
function enemyGrowthRng(seed) {
  let a = (seed >>> 0) || 0x9E3779B9;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 生成第 level 关的第 idx 个敌人时，从 L1 逐关推演到 level：
 *   每关 1) 在当前「最高的 4 项」里随机 +1（排除上一次选的那项，相邻两次不重复）
 *        2) 每 3 关升 1 级 → HP 加成 += max(0, 体质调整值)（与角色升级算法同构）
 * 返回成长后的六维、HP 上限与敌人等级。 */
function computeEnemyGrowth(type, level, idx, runSeed) {
  const base = ENEMY_STATS[type].abilities;
  const a = { str: base.str, dex: base.dex, con: base.con, int: base.int, wis: base.wis, cha: base.cha };
  const typeIdx = Math.max(0, ENEMY_TYPES.indexOf(type));
  /* 种子**不含 level**：这样「第 L 关的第 i 个敌人」就是「第 1 关第 i 个敌人」连续成长 L 次的结果
   * （前缀稳定）。若把 level 混进种子，每次换关都会重掷一整条序列，同一只敌人前后不连贯。 */
  const rnd = enemyGrowthRng((((runSeed >>> 0) + idx * 977 + typeIdx * 7919) >>> 0));
  let hpBonus = 0;
  let lastKey = null;

  for (let lv = 1; lv <= level; lv++) {
    /* 1) 属性提升：候选池 = 当时最高的 4 项（并列按 ABILITY_ORDER 稳定排序），再排除上一次的选择 */
    const top4 = ABILITY_ORDER
      .filter(k => a[k] < ABILITY_CAP)
      .sort((x, y) => (a[y] - a[x]) || (ABILITY_ORDER.indexOf(x) - ABILITY_ORDER.indexOf(y)))
      .slice(0, 4)
      .filter(k => k !== lastKey);
    if (top4.length > 0) {
      const pick = top4[Math.floor(rnd() * top4.length)];
      a[pick] += 1;
      lastKey = pick;
    }
    /* 2) 每 3 关升级一次：HP 上限 += max(0, 体质调整值)，与角色 openLevelUp 完全同构 */
    if (lv % LEVELUP_EVERY_N_LEVELS === 0) hpBonus += Math.max(0, abilityMod(a.con));
  }
  return { abilities: a, maxHp: a.con + hpBonus, level: Math.floor(level / LEVELUP_EVERY_N_LEVELS), hpBonus };
}
