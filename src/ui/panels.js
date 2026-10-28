/* =========================================================================
 * ISSUE-20261028-09 G2 · 属性抽屉（六维 + 剩余点数）与属性说明卡
 *
 * 说明卡的数值公式必须与代码现状一致，不许凭印象写（本文件的文案照 issue 表格抄）。
 * 加点入口保留在说明卡里（一个方形「+1」），不挪进别的抽屉 —— 否则手机端要两次点击才能加一点。
 * 六维图上的金色方框提示仍由 drawRadar() 画，状态与「+1」按钮一致。
 * ========================================================================= */
const ABILITY_INFO = {
  str: { name: '力量', desc: '近战伤害与近战命中。近战伤害 = <code>1 + 力量修正</code>；风笛 / 泥岩 用这一条。' },
  dex: { name: '敏捷', desc: '移动力与防御等级。移动力 = <code>⌊敏捷 / 2⌋</code>；AC = <code>5 + ⌊(敏捷 + 体质) / 4⌋</code>。' },
  con: { name: '体质', desc: '生命上限。maxHp = <code>体质 + 4 + 等级加成</code>；同时参与 AC 公式。' },
  int: { name: '智力', desc: '远程伤害与远程命中。远程伤害 = <code>1 + 智力修正</code>；阿米娅 / 华法琳 用这一条。' },
  wis: { name: '感知', desc: '战场预判与技力上限。敌人意图可见步数 = <code>1 + max(0, 感知修正)</code>；部分角色的技力上限 = 感知值。' },
  cha: { name: '魅力', desc: '当前版本无任何数值作用（只显示、只参与面板展示）。' }
};

/* 当前该属性的数值：选角时看候选人，局内看 playerStats */
function currentAbilityValue(k) {
  if (phase === PHASE.CHAR_SELECT && selectedCandidate && CHARACTERS[selectedCandidate.id]) {
    return CHARACTERS[selectedCandidate.id].abilities[k] || 0;
  }
  if (playerStats && playerStats.abilities) return playerStats.abilities[k] || 0;
  if (player && player.abilities) return player.abilities[k] || 0;
  return 0;
}

function canAllocateNow() {
  return !!(playerStats && playerStats.abilityPoints > 0
    && (phase === PHASE.PLANNING || phase === PHASE.LEVELCLEAR));
}

/* 属性抽屉第一层：剩余点数 + 一句说明 */
function renderAbilityDrawer() {
  const row = document.getElementById('abilityPointsRow');
  const tip = document.getElementById('statsDrawerTip');
  const inSelect = phase === PHASE.CHAR_SELECT;
  const pts = playerStats ? (playerStats.abilityPoints || 0) : 0;
  if (row) {
    row.textContent = (!inSelect && pts > 0) ? ('剩余 ' + pts + ' 点 · 点属性名加点') : '';
    row.style.display = (!inSelect && pts > 0) ? '' : 'none';
  }
  if (tip) {
    tip.textContent = inSelect
      ? '六维越高越强：绿色 = 熟练项与最高属性。点属性名可看具体作用。'
      : '点属性名查看作用与数值公式；有剩余点数时可原地加点（金色方框 = 还能加）。';
  }
  const title = document.getElementById('drawerStatsTitle');
  if (title) title.textContent = inSelect ? '角色属性' : '属性 · 加点';
}

/* 说明卡：填内容 + 滑入二层。同一点属性名可原地刷新，不关闭卡片 */
function openAbilityInfo(k) {
  const info = ABILITY_INFO[k];
  if (!info) return;
  const body = document.getElementById('abilityInfoBody');
  const layer = document.getElementById('abilityInfoLayer');
  if (!body || !layer) return;
  const v = currentAbilityValue(k);
  const canAdd = canAllocateNow() && v < ABILITY_CAP;
  body.innerHTML =
    '<div class="ab-info-name">' + info.name + '</div>' +
    '<div class="ab-info-val">当前 <b>' + v + '</b> · 修正 <b>' + abilityLabel(v) + '</b></div>' +
    '<div class="ab-info-desc">' + info.desc + '</div>' +
    '<div style="display:flex;align-items:center;gap:10px;margin-top:2px;">' +
      '<button class="ab-plus" id="abilityInfoPlus"' + (canAdd ? '' : ' disabled') + '>+1</button>' +
      '<span class="mini">' + (canAllocateNow()
        ? ('剩余 ' + playerStats.abilityPoints + ' 点')
        : (v >= ABILITY_CAP ? '已达上限 ' + ABILITY_CAP : '没有可分配的点数')) + '</span>' +
    '</div>';
  const plus = document.getElementById('abilityInfoPlus');
  if (plus) plus.onclick = function () {
    if (!canAllocateNow() || currentAbilityValue(k) >= ABILITY_CAP) return;
    allocateAbilityPoint(k);
    openAbilityInfo(k);                 // 原地刷新数值，说明卡不关闭
    renderAbilityDrawer();
    try { drawRadar(); } catch (_) {}
    render();                           // 同步右侧控件（通关闸门按钮随点数归零启用）
  };
  layer.classList.add('on');
  layer.setAttribute('aria-hidden', 'false');
}

/* 抽屉已开时若数值变了（加点 / 进入下一关），刷新说明卡里的数字 */
function syncAbilityInfoIfOpen() {
  const layer = document.getElementById('abilityInfoLayer');
  if (!layer || !layer.classList.contains('on')) return;
  const nameEl = layer.querySelector('.ab-info-name');
  if (!nameEl) return;
  for (const k in ABILITY_INFO) {
    if (ABILITY_INFO[k].name === nameEl.textContent) { openAbilityInfo(k); return; }
  }
}

const abilityInfoBackBtn = document.getElementById('abilityInfoBack');
if (abilityInfoBackBtn) abilityInfoBackBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  const layer = document.getElementById('abilityInfoLayer');
  if (layer) { layer.classList.remove('on'); layer.setAttribute('aria-hidden', 'true'); }
});
