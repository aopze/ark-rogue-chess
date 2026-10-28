/* =========================================================================
 * ISSUE-20261028-09 D · 手机虚拟圆钮
 *
 * 挂载判据（决定「建不建 DOM」，与 layout-h/v 解耦）：
 *   (pointer: coarse) 成立 且 (any-pointer: fine) 不成立 → 纯触屏设备才建。
 *   桌面、带鼠标的触屏笔记本（any-pointer: fine 成立）一律不渲染。
 *   浏览器不支持媒体查询时退回 innerWidth <= 760。
 *
 * 行为约定：三键与键盘 Q/E/R 走同一个出口（handleKvAction），方向键与 WASD 走同一个出口
 * （stepPathByDir）—— 不允许出现第二套语义。
 * 形状：圆形 = 交互（仅手机）；「开始行动」是胶囊，不在这里。
 * ========================================================================= */
const vpadHostEl = document.getElementById('vpadHost');
let vpadMounted = false;

function vpadShouldMount() {
  if (typeof window.matchMedia !== 'function') return window.innerWidth <= 760;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const fine = window.matchMedia('(any-pointer: fine)').matches;
  if (coarse && !fine) return true;
  // 部分老浏览器不识别 any-pointer，此时 fine 恒 false：用宽度兜底
  if (!fine && coarse && window.innerWidth <= 760) return true;
  return false;
}

function vpadArc(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: +(cx + r * Math.cos(rad)).toFixed(2), y: +(cy + r * Math.sin(rad)).toFixed(2) };
}
/* 技力环：按 spMax 等分成 spMax 个扇段，前 spNow 段点亮（满 = 完整闭合环） */
function vpadRingSvg(cur, max) {
  const n = Math.max(1, Math.min(24, Math.round(max) || 1));
  const lit = Math.max(0, Math.min(n, Math.round(cur) || 0));
  const step = 360 / n;
  let paths = '';
  for (let i = 0; i < n; i++) {
    // 每段留 12% 空隙做分隔（spMax 不整除 360 时也按角度均分，视觉一致）
    const a0 = step * i - 90 + step * 0.12;
    const a1 = step * (i + 1) - 90 - step * 0.12;
    const p0 = vpadArc(26, 26, 24, a0), p1 = vpadArc(26, 26, 24, a1);
    paths += '<path d="M ' + p0.x + ' ' + p0.y + ' A 24 24 0 0 1 ' + p1.x + ' ' + p1.y +
      '" fill="none" stroke="' + (i < lit ? '#5cc9f5' : 'rgba(90,110,150,.42)') +
      '" stroke-width="3" stroke-linecap="butt"/>';
  }
  return '<svg class="vring" viewBox="0 0 52 52" aria-hidden="true">' + paths + '</svg>';
}

function vpadSpInfo() {
  if (!player) return null;
  if (selectedChar === 'fencer') return { cur: fencerSp, max: FENCER_SP_MAX };
  if (selectedChar === 'amiya') return { cur: amiyaBonusTargets, max: amiyaSpMax() };
  if (selectedChar === 'wheelchair') return { cur: wheelchairPreviewSp(), max: WHEELCHAIR_SP_MAX };
  if (selectedChar === 'vampire') return { cur: vampireSp, max: VAMPIRE_SP_MAX };
  return null;
}

function vpadDamageValue() {
  if (!player) return '—';
  /* 显示骰子文案（2d4+1 / 1d8+1）而不是定值：实际每次出手都掷骰，写死数字会骗人 */
  const ranged = playerIsRanged();   /* ISSUE-20261028-19：动态角色按六维现算 */
  return ranged ? playerRangedDmgLabel() : playerMeleeDmgLabel();
}

function mountVirtualPad() {
  if (vpadMounted || !vpadHostEl) return;
  if (!vpadShouldMount()) return;      // PC：一个节点都不建
  vpadMounted = true;
  vpadHostEl.classList.add('on');
  vpadHostEl.innerHTML =
    '<div class="vpad-dir">' +
      '<button class="vbtn" data-vdir="w" aria-label="上">▲</button>' +
      '<button class="vbtn" data-vdir="a" aria-label="左">◀</button>' +
      '<button class="vbtn" data-vdir="s" aria-label="下">▼</button>' +
      '<button class="vbtn" data-vdir="d" aria-label="右">▶</button>' +
    '</div>' +
    '<div class="vpad-act">' +
      '<button class="vbtn" data-vact="wait" aria-label="等待"><span>⏳</span><span class="vnum" data-k="wait">0</span></button>' +
      '<button class="vbtn" data-vact="attack" aria-label="攻击"><span>⚔️</span><span class="vnum" data-k="atk">0</span></button>' +
      '<button class="vbtn" data-vact="skill" aria-label="技能"><span>✦</span><span class="vlab" data-k="sp">0</span></button>' +
    '</div>';

  // 方向键：pointerdown 立即生效（click 会有 300ms 延迟感）
  vpadHostEl.querySelectorAll('[data-vdir]').forEach(function (b) {
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (phase === PHASE.PLANNING && !isMoving) stepPathByDir(b.dataset.vdir);
    });
  });

  // 三键：等待 / 攻击 / 技能（与键盘 Q/E/R 同一出口）
  vpadHostEl.querySelectorAll('[data-vact]').forEach(function (b) {
    const act = b.dataset.vact;
    if (act === 'attack') {
      // 长按 ≥400ms = 切换攻击范围显示（替代被移除的「点伤害格」），短按仍是设攻击节点
      let timer = null, longFired = false;
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        longFired = false;
        timer = setTimeout(function () { longFired = true; handleKvAction('range'); }, 400);
      });
      const end = function (e) {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!longFired) { e.preventDefault(); handleKvAction('attack'); }
      };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', function () { if (timer) { clearTimeout(timer); timer = null; } });
    } else {
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); handleKvAction(act); });
    }
  });

  syncVirtualPad();
}

/* 数值同步：只在数值变化时写 DOM，避免每帧重排 */
function syncVirtualPad() {
  if (!vpadMounted || !player) return;
  const planning = phase === PHASE.PLANNING && !isMoving;
  const waitLeft = Math.max(0, player.move - countWaitSteps(playerPath));
  const atkCount = attackIndices.length;
  const sp = vpadSpInfo();
  vpadHostEl.querySelectorAll('[data-vdir]').forEach(function (b) { b.disabled = !planning; });
  const waitBtn = vpadHostEl.querySelector('[data-vact="wait"]');
  const atkBtn = vpadHostEl.querySelector('[data-vact="attack"]');
  const spBtn = vpadHostEl.querySelector('[data-vact="skill"]');
  if (waitBtn) {
    waitBtn.disabled = !planning;
    const n = waitBtn.querySelector('[data-k="wait"]');
    if (n && n.textContent !== String(waitLeft)) n.textContent = String(waitLeft);
  }
  if (atkBtn) {
    atkBtn.disabled = !planning;
    const n = atkBtn.querySelector('[data-k="atk"]');
    if (n && n.textContent !== vpadDamageValue()) n.textContent = vpadDamageValue();
    // 多个攻击节点时右上角「×N」
    let badge = atkBtn.querySelector('.vbadge');
    if (atkCount > 1) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'vbadge'; atkBtn.appendChild(badge); }
      if (badge.textContent !== '×' + atkCount) badge.textContent = '×' + atkCount;
    } else if (badge) badge.remove();
  }
  if (spBtn) {
    spBtn.disabled = !planning;
    const n = spBtn.querySelector('[data-k="sp"]');
    const cur = sp ? sp.cur : 0, max = sp ? sp.max : 0;
    if (n && n.textContent !== String(cur)) n.textContent = String(cur);
    const old = spBtn.querySelector('.vring');
    if (old) old.remove();
    if (sp && max > 0) spBtn.insertAdjacentHTML('afterbegin', vpadRingSvg(cur, max));
  }
}

mountVirtualPad();
