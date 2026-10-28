/* P0.1-4 拆分 · 20261028b 基线 524-594 行 · 角色数据与派生查询 */
const CHARACTERS = {
  wheelchair: {
    name: '风笛', icon: '🤺',
    attackType: 'melee',
    abilities: { str: 12, dex: 10, con: 10, int: 8, wis: 8, cha: 6 },
    profMelee: true, profRanged: false,
    desc: '沿直线连续移动攒技力；满 5 点后在路径节点双击设置技能节点，到达该步即发动冲锋「高效冲击」。',
    tips: [
      '技力：同方向连续移动 ≥2 步获得技力',
      '技能：双击路径节点设置技能节点 → 到达该步发动「高效冲击」（占一次动作）',
      '[高效冲击]：冲锋距离 = 本回合剩余移动步数，冲几格就打几次（每次近战伤害 ×2），只打朝向直线上的敌人',
      '[高效冲击]：被没秒掉的敌人挡住会立即停下，但剩余次数继续打朝向前方 3 格内的敌人；冲锋期间免疫一切伤害；一次都没造成伤害就撞墙会失去一半 HP',
      '[闪避]：第一个等待节点 = 闪避，本回合 AC +3（占一次动作）'
    ]
  },
  vampire: {
    name: '华法琳', icon: '🧛‍♂️',
    attackType: 'ranged',
    abilities: { str: 8, dex: 10, con: 10, int: 12, wis: 8, cha: 6 },
    profMelee: false, profRanged: true,
    desc: '远程输出，靠满地血迹攒技力；满 5 点后在路径节点双击设置技能节点，发动「不稳定血浆」。',
    tips: [
      '技力：获得血迹 +1 技力',
      '技能：双击路径节点设置技能节点 → 到达该步发动（占一次动作）',
      '[不稳定血浆]：本关内远程攻击必定命中、必定暴击、必定触发血迹，但每次攻击后失去 1 HP',
      '被动：远程攻击命中后 50% 在目标格留下血迹，战斗结束时获得全场血迹（血迹：恢复 2 HP）',
      '[闪避]：第一个等待节点 = 闪避，本回合 AC +3（占一次动作）'
    ]
  },
  fencer: {
    name: '泥岩', icon: '⚙️',
    attackType: 'melee',
    abilities: { str: 12, dex: 8, con: 10, int: 6, wis: 8, cha: 8 },
    profMelee: true, profRanged: false,
    desc: '用技能节点进入反击：满技力后双击路径节点发动「岩崩锤」，挨打就回敬暴击。',
    tips: [
      '技力：受到攻击时 +1 技力',
      '技能：双击路径节点设置技能节点 → 到达该步进入反击（占一次动作）',
      '[岩崩锤]：反击期间免疫攻击，受到攻击时攻击周围 8 格所有单位并造成眩晕 2 回合 + 回复 1/2 最大 HP',
      '[闪避]：第一个等待节点 = 闪避，本回合 AC +3（占一次动作）'
    ]
  },
  amiya: {
    name: '阿米娅', icon: '🥳',
    attackType: 'ranged',
    abilities: { str: 6, dex: 8, con: 8, int: 12, wis: 10, cha: 10 },
    profMelee: false, profRanged: true,
    desc: '击败敌人攒技力（上限 = 感知）；满技力后在路径节点双击设置技能节点，到达该步发动「精神爆发」。',
    tips: [
      '技力：每击败 1 个敌人 +2 技力，每次攻击 +1 技力',
      '技能：双击路径节点设置技能节点 → 到达该步倾泻全部技力（占一次动作）',
      '[精神爆发]：消耗已有技力，进行等量次数必定命中、必定暴击的远程攻击（范围同普通射程，击杀不获得技力）',
      '被动：被阿米娅攻击的单位，额外显示移动意图',
      '[闪避]：第一个等待节点 = 闪避，本回合 AC +3（占一次动作）'
    ]
  },
  /* ISSUE-20261028-19：第五个角色「预备干员」—— 全 8 白板 + 选角时 5 点自由分配。
   * ★ dynamicProf: true 是它与前四人的唯一结构差别：熟练 / 攻击类型不再写死，
   *   一律由 `int > str ? 远程 : 近战` 现算（严格大于，相等算近战 —— 人类 2026-10-28 23:54 拍板）。
   *   `attackType: 'melee'` 只是「不做动态判定时的兜底值」（联机快照、旧存档、纯函数调用），
   *   不要把它当成它的真实类型 —— 真实类型只认 charAttackTypeOf()。 */
  rookie: {
    /* 图标用 💂 而不是 🪖：🪖 是 Emoji 13.0（2020），Windows 的 Segoe UI Emoji 老版本没有，
     * 实测在本机 Chrome 里渲染成豆腐块「□」，界面上就是「预备干员 □」。
     * 💂 是 Emoji 1.0，四角色现用的都是同代，同一套字体栈下必然可显示。 */
    name: '预备干员', icon: '💂',
    attackType: 'melee',
    abilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    profMelee: true, profRanged: false,
    startAbilityPoints: 5,
    dynamicProf: true,
    desc: '六维全 8 的白板，选角时给 5 点自由分配，靠玩家自己堆成型：智力高于力量走远程熟练，否则近战熟练。',
    tips: [
      '自由分配：选角时可用 5 点任加六维（没加完的点带进第 1 关继续加）',
      '熟练与攻击方式由分配结果决定：智力 > 力量 → 远程熟练，否则（含相等）近战熟练',
      '两者都不加点时相等 → 按近战算，这不是缺陷，是规则',
      '没有专属技能与技力：强度全靠那 5 点堆在哪',
      '[闪避]：第一个等待节点 = 闪避，本回合 AC +3（占一次动作）'
    ]
  }
};

/* 每个角色只有一种伤害方式，由攻击节点类型决定：
 *   近战 → 风笛、泥岩（用力量，面板显示「近战伤害」）
 *   远程 → 华法琳、阿米娅（用智力，面板显示「远程伤害」）
 * 因此 UI 只显示与角色对应的那一个伤害数值。
 * 注：远程角色被贴身时的趁乱打击固定 1 点保底伤害（不吃暴击/倍率），不读取近战伤害面板。
 */
function charAttackType(id) {
  const c = CHARACTERS[id];
  if (!c) return 'melee';
  return c.attackType || (c.profRanged ? 'ranged' : 'melee');
}
function isRangedChar(id) { return charAttackType(id) === 'ranged'; }
function charDmgLabel(id) { return isRangedChar(id) ? '远程伤害' : '近战伤害'; }

/* ISSUE-20261028-19：动态角色（预备干员）── 熟练与攻击类型由六维现算。
 *
 * 为什么不直接改 charAttackType()：它是纯函数、签名只有 id，读的是静态对象。
 * 硬改成「读当前 playerStats」会让 6 个消费点在选角 / 联机 / 结算不同相位下读到不同的东西。
 * 所以保留它原样给四个静态角色用，另开一个**可传六维**的版本，由调用方决定拿哪份数据。
 * 规则只有一句：int > str → 远程；否则（含相等）→ 近战。严格大于，不为相等单开分支。 */
function charIsDynamic(id) {
  const c = CHARACTERS[id];
  return !!(c && c.dynamicProf);
}
function dynamicAttackTypeOf(abilities) {
  return (abilities && abilities.int > abilities.str) ? 'ranged' : 'melee';
}
function charAttackTypeOf(id, abilities) {
  if (charIsDynamic(id)) {
    /* 动态角色必须给六维：缺省时退回静态兜底（attackType 写的是 melee，即「不加点」的结果） */
    return dynamicAttackTypeOf(abilities || CHARACTERS[id].abilities);
  }
  return charAttackType(id);
}
function isRangedCharOf(id, abilities) { return charAttackTypeOf(id, abilities) === 'ranged'; }
function charDmgLabelOf(id, abilities) {
  return isRangedCharOf(id, abilities) ? '远程伤害' : '近战伤害';
}
