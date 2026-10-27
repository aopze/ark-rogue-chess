/* P0.1-4 机械拆分：从 game.html（20261028b 基线）第 596-671 行原样搬移（敌人类型 / L1 基础面板 / 成长推演（computeEnemyGrowth））。
 * 纯移动未改逻辑；顺序由 build/manifest.json 保证与拆分前一致。 */
const ENEMY_TYPES = ['skeleton', 'ghost', 'alien'];

/* =========================================================
 * 敌人基础面板（L1 起点，实际数值由 computeEnemyGrowth 推演，ISSUE-20261028-03）
 * ========================================================= */
const ENEMY_STATS = {
  skeleton: {
    name: '骷髅',
    // 力10 智6 敏6 感6 魅3 体10
    abilities: { str: 10, int: 6, dex: 6, wis: 6, cha: 3, con: 10 },
    prof: 1,
  },
  ghost: {
    name: '幽灵',
    // 力8 智8 敏10 感8 魅6 体6
    abilities: { str: 8, int: 8, dex: 10, wis: 8, cha: 6, con: 6 },
    prof: 2,
  },
  alien: {
    name: '外星人',
    // 力0 智10 敏8 感8 魅6 体8
    abilities: { str: 0, int: 10, dex: 8, wis: 8, cha: 6, con: 8 },
    prof: 2,
  }
};

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
