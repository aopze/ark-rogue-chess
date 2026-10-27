/* P0.1-4 拆分 · 20261028b 基线 1623-1768 行 · 动作预算与单位渲染 */
/* ★ 动作预算：一回合只能进行一次动作。
 * 闪避节点与攻击节点互斥 —— 闪避后不能再攻击，攻击后也不能再闪避。
 * scout 奖励提供的额外攻击次数同样受动作预算限制。
 * playerActionsUsed = 本回合已消耗的动作数（闪避占 1，攻击每执行一次占 1）。 */
function maxActionsThisTurn() {
  return 1 + (player ? player.extraAttacks : 0);
}
function canPerformAttackAction() {
  return playerActionsUsed < maxActionsThisTurn();
}
function clearUnitLayer() {
  unitEls.forEach(rec => rec.el.remove());
  unitEls.clear();
}
function getUnitIcon() {
  const c = CHARACTERS[selectedChar];
  return c ? c.icon : '🧝';
}
function getPlayerRenderFacing() {
  if (!player) return null;
  if (phase === PHASE.PLANNING) {
    return previewFacing(playerPath, player.x, player.y) || player.facing;
  }
  return player.facing;
}
function isPlayerPreviewCharging() {
  if (phase !== PHASE.PLANNING) return playerChargingThisTurn || fencerCounterActive;
  return skillReadyInfo(playerPath).ready || vampireSkillActive;
}

function renderUnits() {
  if (phase === PHASE.CHAR_SELECT || !player) { clearUnitLayer(); return; }
  const lr = unitLayer.getBoundingClientRect();
  const toRender = [];
  if (player.alive) {
    toRender.push({
      key: 'player', x: player.x, y: player.y,
      icon: getUnitIcon(), hp: player.hp, maxHp: player.maxHp,
      isPlayer: true, isGhost: false, facing: getPlayerRenderFacing(),
      stunTurns: 0,
    });
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    /* 图标统一由数据层提供（ISSUE-20261028-04 新增盾卫/自爆虫） */
    const stat = ENEMY_STATS[e.type] || {};
    const icon = stat.icon || '💀';
    const isGhost = e.type === 'ghost';
    toRender.push({
      key: 'enemy-' + e.id, x: e.x, y: e.y,
      icon, hp: e.hp, maxHp: e.maxHp,
      isPlayer: false, isGhost, facing: e.facing,
      stunTurns: e.stunTurns || 0,
      /* 词缀 / 精英（ISSUE-20261028-05）：标签文字由数据层拼，渲染层只负责显示 */
      isElite: !!e.isElite,
      affixTag: enemyAffixLabel(e),
    });
  }
  /* 联机对战：对手是玩家控制的单位，不是敌人，单独一个渲染条目 */
  if (mode === 'pvp' && peer && peer.alive) {
    toRender.push({
      key: 'peer', x: peer.x, y: peer.y,
      icon: (CHARACTERS[peer.charId] && CHARACTERS[peer.charId].icon) || '❓',
      hp: peer.hp, maxHp: peer.maxHp,
      isPlayer: false, isPeer: true, isGhost: false,
      facing: peer.facing, stunTurns: 0,
    });
  }
  for (const u of toRender) {
    if (unitEls.has(u.key)) continue;
    const el = document.createElement('div');
    el.className = 'unit-abs';
    el.style.transition = 'none';
    el.innerHTML = `
      <div class="facing-ind" style="display:none"></div>
      <div class="icon"></div>
      <div class="hp-bar"><div class="hp-fill"></div></div>
      <div class="affix-tag" style="display:none"></div>
    `;
    unitLayer.appendChild(el);
    unitEls.set(u.key, {
      el,
      icon: el.querySelector('.icon'),
      hpFill: el.querySelector('.hp-fill'),
      facingEl: el.querySelector('.facing-ind'),
      affixEl: el.querySelector('.affix-tag'),
      lastPos: null,
    });
  }
  const positions = new Map();
  for (const u of toRender) {
    const cell = getCellEl(u.x, u.y);
    if (cell) {
      const r = cell.getBoundingClientRect();
      positions.set(u.key, {
        left: r.left - lr.left, top: r.top - lr.top,
        w: r.width, h: r.height,
      });
    }
  }
  const maxAtk = 1 + player.extraAttacks;
  const playerCharging = isPlayerPreviewCharging();
  const playerAttacked = playerAttacksDone >= maxAtk;
  for (const u of toRender) {
    const rec = unitEls.get(u.key);
    const pos = positions.get(u.key);
    if (!rec || !pos) continue;
    rec.el.style.width = pos.w + 'px';
    rec.el.style.height = pos.h + 'px';
    if (rec.lastPos === null) {
      rec.el.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
      void rec.el.offsetWidth;
      rec.el.style.transition = '';
    } else if (rec.lastPos.left !== pos.left || rec.lastPos.top !== pos.top) {
      rec.el.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
    }
    rec.lastPos = { left: pos.left, top: pos.top };
    if (rec.icon.textContent !== u.icon) rec.icon.textContent = u.icon;
    rec.icon.classList.toggle('ghost-icon', !!u.isGhost);
    /* 词缀标签：无词缀时藏起来，避免空格子挂一个空胶囊 */
    if (rec.affixEl) {
      const tagText = u.affixTag || '';
      if (rec.affixEl.textContent !== tagText) rec.affixEl.textContent = tagText;
      rec.affixEl.style.display = tagText ? 'flex' : 'none';
    }
    const pct = u.maxHp > 0 ? Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100)) : 0;
    rec.hpFill.style.width = pct + '%';
    rec.hpFill.style.background = u.isPlayer ? '#3b9eff' : (u.isPeer ? '#e8a33d' : '#e74c3c');
    if (u.facing) {
      const v = FACING_GLYPH[u.facing.dx + ',' + u.facing.dy];
      if (v) {
        rec.facingEl.style.display = 'flex';
        rec.facingEl.textContent = v[0];
        rec.facingEl.className = 'facing-ind ' + v[1];
      } else rec.facingEl.style.display = 'none';
    } else {
      rec.facingEl.style.display = 'none';
    }
    if (u.isPlayer) {
      rec.el.classList.add('ua-player');
      rec.el.classList.remove('ua-enemy', 'ua-debug', 'ua-stunned');
      rec.el.classList.toggle('ua-charging', playerCharging);
      rec.el.classList.toggle('ua-attacked', playerAttacked && !playerCharging);
    } else if (u.isPeer) {
      rec.el.classList.add('ua-peer');
      rec.el.classList.remove('ua-player', 'ua-enemy', 'ua-charging', 'ua-attacked', 'ua-debug', 'ua-stunned');
    } else {
      rec.el.classList.add('ua-enemy');
      rec.el.classList.remove('ua-player', 'ua-charging', 'ua-attacked');
      rec.el.classList.toggle('ua-debug', debugMode);
      rec.el.classList.toggle('ua-stunned', u.stunTurns > 0);
      rec.el.classList.toggle('ua-elite', !!u.isElite);
    }
  }
  const seen = new Set(toRender.map(u => u.key));
  for (const [k, rec] of unitEls) {
    if (!seen.has(k)) { rec.el.remove(); unitEls.delete(k); }
  }
}
