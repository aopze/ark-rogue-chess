/* P0.1-4 拆分 · 20261028b 基线 673-728 行 · 运行时状态（关卡 / 路径 / 技力 / 闪避 / 冲锋额度） */
let phase = PHASE.CHAR_SELECT;
/* 联机模式开关：'solo' 单人 / 'pvp' 对战。
 * 必须在这里声明（而不是写在文件末尾的联机区块里）：
 * renderUnits / confirmAction 定义在前，而 setLayout 在顶层就会被调用，
 * 那时若 mode 还处于 TDZ，会直接抛 ReferenceError。 */
let mode = 'solo';
let peer = null;              // 联机时的对手显示单位
let charCandidates = [];
let selectedCandidate = null;
let isMoving = false;
let selMap = [];
let selExit = { x: 7, y: 4 };
let selectedChar = null;
let level = 1;
let ROWS = 11, COLS = 11;
let map = [];
/* ★ ISSUE-20261028-10-B：粗圆岩（Boss 每 2 回合落的动态墙）。
 * 记的是 "x,y" 字符串集合；`map[y][x]` 同步置 1，所以**所有既有的墙判定
 * （寻路 / 视线 / 站位）自动把它当墙**，不需要在别处再加判断。
 * 这个集合只用来做三件事：① 渲染成石头而不是灰墙 ② 被 Boss 撞碎时还原地板 ③ 关卡重置时清空。
 * ⚠️ initLevel 里必须 clear()：map 是新生成的，但集合是跨关的全局状态。 */
let roughRocks = new Set();
let player = null;
let enemies = [];
let rewardItems = [];
let bloodDrops = [];
let playerPath = [];
/* 路径节点：下标 = playerPath 下标。attackIndices = 攻击节点，skillIndices = 技能节点；
 * 同一个下标只能属于其中一种（单击攻击 / 双击技能）。 */
let attackIndices = [];
let skillIndices = [];
let enemyPaths = [];
// 寻路时的处理顺序（离玩家近的优先）。结算层必须用同一顺序落位，
// 否则「跟到同伴刚腾出的格子」这种合法走位会因为顺序错位被误判受阻。
let enemyPathOrder = [];
let logLines = [];
let enemyArrows = [];
// 调试模式：无敌 + 点击秒杀（ISSUE-20261028-11）。状态仅通过连点设置面板版本号 5 次切换，
// 且只在控制台暴露 window.__ARK_DEBUG__，游戏内无任何提示/日志/视觉标记（纯隐藏开关）。
let debugMode = false;
// 控制台可读隐藏开关状态（非玩家可见提示）。
Object.defineProperty(window, '__ARK_DEBUG__', { get: () => debugMode, configurable: true });
// 统一入口：切换/重置调试开关。改这里即可同步 window.__ARK_DEBUG__。
function setDebugMode(on) { debugMode = !!on; }
let lastPathSignature = '';
let playerChargingThisTurn = false;
let playerAttacksDone = 0;
// 闪避机制：回合内第一次「等待」= 闪避动作（AC 加成，持续到回合结束）
let playerDodging = false;
let playerDodgeACBonus = 0;
// 本回合闪避触发的路径下标（-1 = 本回合不闪避）
let dodgeTriggerIndex = -1;
/* ISSUE-20261029-40：闪避的「到达闪避格即生效」改在落地 tick 判定后，等待步不再负责触发。
 * 这个标记表示本回合的闪避已经**结算过**（成功或动作不足被否决都算），
 * 防止后续等待步 tick 重复扣动作 / 重复刷日志。 */
let dodgeResolved = false;
// 本回合已使用的「动作」数：上限 = maxActionsThisTurn() = BASE_ACTIONS_PER_TURN(2) + extraAttacks，
// 闪避 / 攻击 / 技能各占 1 个（ISSUE-20261029-25 起不再是「一回合只做一件事」）
let playerActionsUsed = 0;
let fencerCounterActive = false;
let playerStats = {};
let playerChargeStopReason = null;
let playerChargeCausedDamage = false;
/* 冲锋额度（ISSUE-20261028-01）：剩余攻击次数 / 已命中次数 / 冲锋朝向（停下后按朝向找补充目标） */
let playerChargeBudget = 0;
let playerChargeHits = 0;
let playerChargeDir = { dx: 1, dy: 0 };
let pendingAttack = false;
/* ★ ISSUE-20261029-34：原地技能（技能节点落在起点 idx 0）——本回合第一个 tick 就发动，不移动。
 * 与 pendingAttack 同类：都是一个「先于路径步结算」的一次性标记。 */
let pendingStartSkill = false;
let pendingChargeInfo = null;
let amiyaBonusTargets = 0;
/* ★ ISSUE-20261029-28 预备干员「增援召唤」
 * rookieSp     技力（每次造成朝向攻击 +1，上限 5；跨关继承，换角色 / 重开清零）
 * squadUnits   场上小队成员（**不入 enemies 数组**：它们不是敌人，不该被 AI 当目标、也不参加相杀结算）
 * lastSquadType 上一次召唤的类型（「不连续重复」靠它排除）
 * squadSeq     成员 uid 自增源（渲染层拿它当 key，不能用数组下标 —— 数组会 filter） */
let rookieSp = 0;
let squadUnits = [];
let lastSquadType = null;
let squadSeq = 0;
let levelHpBonus = 0;
// 点角色卡里的「近战伤害 / 远程伤害」→ 在地块上叠蓝色显示攻击范围
let showRangeOverlay = false;
