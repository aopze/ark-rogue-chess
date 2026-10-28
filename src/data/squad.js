/* ISSUE-20261029-28 · 预备干员「增援召唤」数据层
 *
 * 需求（人类 2026-10-29 03:59 一次性给全）：
 *   - 预备干员每造成一次朝向攻击 +1 技力，上限 5；满了可以在技能节点发动召唤
 *   - 召唤：在周围 8 格里挑一个空位，随机放一个「小队成员」
 *   - 小队成员六维全部 = 预备干员六维里最低的那一项（最低值 = 它的强度天花板）
 *   - 四种成员、随机、不连续重复；击杀敌人时给预备干员不同回报
 *
 * ⚠️ 图标全部是 Emoji 1.0/2.0（😎 U+1F60E / 😑 U+1F611 / 😇 U+1F607 / 🤠 U+1F920 都是 2010 前后），
 *    不要换成 🪖 / 🪨 这类 Emoji 13.0 —— 本机 Chrome 的 Segoe UI Emoji 没有字形，会渲染成豆腐块。
 *    （血泪：ISSUE-19 的 🪖 → 💂、10-B 的 🪨 → ⛰️。） */
const ROOKIE_SP_MAX = 5;
/* 「每次造成朝向攻击」给多少技力。近战 = 命中朝向扇形内的目标；远程没有朝向概念，
 * 按「本次出手至少命中一个目标」等价处理（否则远程形态的预备干员永远攒不到技力 = 废角色）。 */
const ROOKIE_SP_PER_ATTACK = 1;

/* 击杀回报枚举 —— 结算在 src/rules/squad.js#squadOnKill，这里只描述。 */
const SQUAD_TYPES = {
  vanguard: {
    id: 'vanguard', name: '预备先锋', icon: '😎', ranged: false,
    onKill: 'sp', onKillText: '预备干员 +3 技力',
    desc: '近战熟练；击杀敌人后预备干员获得 3 点技力',
  },
  defender: {
    id: 'defender', name: '预备重装', icon: '😑', ranged: false,
    onKill: 'shield', onKillText: '预备干员获得 1 层护盾',
    desc: '近战熟练；击杀敌人后预备干员获得 1 层护盾',
  },
  medic: {
    id: 'medic', name: '预备医疗', icon: '😇', ranged: true,
    onKill: 'heal', onKillText: '预备干员恢复 2 HP',
    desc: '远程熟练；击杀敌人后预备干员恢复 2 HP',
  },
  sniper: {
    id: 'sniper', name: '预备狙击', icon: '🤠', ranged: true,
    onKill: 'extraNode', onKillText: '预备干员获得 1 个额外攻击节点',
    desc: '远程熟练；击杀敌人后预备干员获得 1 个额外攻击节点',
  },
};
/* 抽取顺序固定（与对象键序解耦）：randInt 的下标必须稳定，否则同一个 RUN_SEED 下
 * 「这次召唤谁」会随对象字面量的书写顺序变化而漂移。 */
const SQUAD_TYPE_ORDER = ['vanguard', 'defender', 'medic', 'sniper'];
const SQUAD_KILL_SP = 3;
const SQUAD_KILL_HEAL = 2;
