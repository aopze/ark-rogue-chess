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

const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_FULL = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' };

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
