/* P0.1-4 机械拆分：从 game.html 第 593-620 行原样搬移（敌人类型与固定面板）。
 * 纯移动未改逻辑；顺序由 build/manifest.json 保证与拆分前一致。 */
const ENEMY_TYPES = ['skeleton', 'ghost', 'alien'];

/* =========================================================
 * 敌人固定面板（无成长）
 * ========================================================= */
const ENEMY_STATS = {
  skeleton: {
    name: '骷髅',
    // 力10 智6 敏6 感6 魅3 体10
    abilities: { str: 10, int: 6, dex: 6, wis: 6, cha: 3, con: 10 },
    prof: 1,
    hpFixed: null,
  },
  ghost: {
    name: '幽灵',
    // 力8 智8 敏10 感8 魅6 体6
    abilities: { str: 8, int: 8, dex: 10, wis: 8, cha: 6, con: 6 },
    prof: 2,
    hpFixed: 2,
  },
  alien: {
    name: '外星人',
    // 力0 智10 敏8 感8 魅6 体8
    abilities: { str: 0, int: 10, dex: 8, wis: 8, cha: 6, con: 8 },
    prof: 2,
    hpFixed: null,
  }
};
