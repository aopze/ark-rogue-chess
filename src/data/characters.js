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
