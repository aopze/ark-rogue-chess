/* P0.1-4 机械拆分：从 game.html 第 622-673 行原样搬移（运行时状态：关卡 / 路径 / 技力 / 升级 / UI 缓存）。
 * 纯移动未改逻辑；顺序由 build/manifest.json 保证与拆分前一致。 */
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
let debugMode = false;
let lastPathSignature = '';
let playerChargingThisTurn = false;
let playerAttacksDone = 0;
// 闪避机制：回合内第一次「等待」= 闪避动作（AC 加成，持续到回合结束）
let playerDodging = false;
let playerDodgeACBonus = 0;
// 本回合闪避触发的路径下标（-1 = 本回合不闪避）
let dodgeTriggerIndex = -1;
// 本回合已使用的「动作」数：一回合只能进行一次动作（闪避 / 攻击 / 技能）
let playerActionsUsed = 0;
let fencerCounterActive = false;
let playerStats = {};
let playerChargeStopReason = null;
let playerChargeCausedDamage = false;
let pendingAttack = false;
let pendingChargeInfo = null;
let amiyaBonusTargets = 0;
let levelHpBonus = 0;
// 点角色卡里的「近战伤害 / 远程伤害」→ 在地块上叠蓝色显示攻击范围
let showRangeOverlay = false;
