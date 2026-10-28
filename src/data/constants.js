/* P0.1-4 机械拆分：从 game.html（20261028b 基线）第 487-522 行原样搬移（常量与方向表）。
 * 纯移动未改逻辑；顺序由 build/manifest.json 保证与拆分前一致。 */
const SPAWN_CLEAR_RADIUS = 2;
const OBSTACLE_MAX_GROUP = 4;
const OBSTACLE_GROUPS_TRY = 8;
const UNIT_MOVE_MS = 120;
const ABILITY_CAP = 20;
/* 属性点改为绑定「升级」发放：每 LEVELUP_EVERY_N_LEVELS 关升 1 级时给 2 点（ISSUE-20261028-03）。
 * 旧常量 ABILITY_POINTS_PER_LEVEL = 1 已移除（曾每通关 1 关给 1 点）。 */
const ABILITY_POINTS_PER_LEVELUP = 2;
const PLAYER_RANGE = 3;   // 远程角色的攻击节点射程（近战角色攻击节点只打相邻 1 格）
/* 玩家基础 HP 加成（ISSUE-20261028-04 配套）。
 * 敌人伤害从「常量 1」改为骰子后，首关承伤期望从每回合 0.99 涨到 1.38（+39%），
 * 玩家 HP10 撑不到清场，实测「第 1 关即死」比例 40% → 55%。补 4 点基础 HP 把它拉回来：
 * 前期收益最大（10→14，+40%），后期被 con/升级稀释（20→24，+20%），符合「前期该更宽容」。
 * 校准记录：+2 时 80 局测试仍为 -43%（旧 1.21 关 → 新 0.69 关），故提到 +4。 */
const BASE_HP_BONUS = 4;

const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_FULL = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' };

/* =========================================================
 * ★ 玩家经验制（ISSUE-20261028-10）
 * 升级不再按关卡号硬绑（旧：每 LEVELUP_EVERY_N_LEVELS 关升 1 级），改为：
 *   本关经验 = 保底 12 + 效率加成，效率 = 「该关允许的失血」− 实际失血。
 * 失血口径：关卡开始时血量 − 关卡结束时血量（关内回血会抵消，取 0 下限）。
 *
 * 为什么用「加法保底」而不是纯效率制：单关经验下限恒为 12，
 * 于是 12×3 = 36 = XP_TABLE[1]，第 3 关必升是纯算术保证，与玩家水平无关。
 * 单关上限 24 < 36 → 第 1 关永远升不了；两关满 48 ≥ 36 → 零失血可第 2 关升。
 *
 * 注意：这些常量与 enemies.js 的 LEVELUP_EVERY_N_LEVELS（敌人成长用）完全无关，
 * 禁止复用那个常量，改它会让 22 关所有敌人同时变形。
 * ========================================================= */
const XP_CLEAR_BASE = 12;        // 每关保底经验（决定保底升级的算术下限）
const XP_DMG_REF_RATIO = 0.40;   // 失血基准 = 本关开始血量 × 40%
const XP_DMG_REF_MIN = 2;        // 基准下限（残血进关时不至于 0 宽容度）
const XP_DMG_REF_MAX = 8;        // 基准上限
const XP_PER_STEP = 2;           // 少失 1 血 = +2 经验
const XP_EFF_CAP = 6;            // 效率步数封顶 → 最多 +12
const XP_MAX_LEVELUPS_PER_CLEAR = 3;  // 单次通关最多连升 3 级（防死循环）
/* 下标 = 当前等级，值 = 升到下一级所需经验。超出表长时按表尾 +100 递增。 */
const XP_TABLE = [0, 36, 64, 98, 140, 190, 250, 320, 400, 500];

/* =========================================================
 * 全局常量：阶段名 / 方向 / 朝向符号
 * 以前这些字面量散落在 60 多处（'planning'、[[1,0],...]、'▶' 等），
 * 改名或调整方向顺序时极易漏改。统一收在这里。
 * ========================================================= */
const PHASE = Object.freeze({
  CHAR_SELECT: 'char_select',
  PLANNING:    'planning',
  RESOLVING:   'resolving',
  LEVELCLEAR:  'levelclear',
  GAMEOVER:    'gameover',
  // 联机专用结束态。必须与 GAMEOVER 区分：正式版主页（index.html）会把
  // phase === 'gameover' 当成单人死亡，向排行榜上报 {level, kills}。
  // 联机局没有关卡与击杀语义，复用 'gameover' 会往榜单灌假成绩。
  PVP_OVER:    'pvp_over',
});
// 四方向表。顺序会影响 BFS 的先验路径（同距离时先探哪格），因此保留两套原始顺序，勿随意合并。
const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];      // 邻格扫描 / 连通性
const DIR4_BFS = [[0, -1], [0, 1], [-1, 0], [1, 0]];  // 寻路展开顺序
const KEY_DIRS = { w: { dx: 0, dy: -1 }, s: { dx: 0, dy: 1 }, a: { dx: -1, dy: 0 }, d: { dx: 1, dy: 0 } };
const FACING_GLYPH = { '1,0': ['▶', 'r'], '-1,0': ['◀', 'l'], '0,1': ['▼', 'd'], '0,-1': ['▲', 'u'] };
const ARROW_CHARS = { '0,-1': '↑', '0,1': '↓', '-1,0': '←', '1,0': '→', '1,-1': '↗', '1,1': '↘', '-1,-1': '↙', '-1,1': '↖' };
const DIR_NAMES = { '0,-1': '上', '0,1': '下', '-1,0': '左', '1,0': '右' };
