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
  if (selectedChar === 'rookie') return { cur: rookieSp, max: ROOKIE_SP_MAX };
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
    /* ★ ISSUE-20261029-29：整块改成「独立底栏面板」—— 上排开始行动，下排方向键 / 三键。
     * #vpadStartSlot 是给 renderControls() 的注入点：开始行动按钮不再另找槽位，
     * 手机端一律出现在面板顶部，与方向键同处一个拇指区。 */
    '<div class="vpad-top" id="vpadStartSlot"></div>' +
    '<div class="vpad-bot">' +
      '<div class="vpad-dir">' +
        '<button class="vbtn" data-vdir="w" aria-label="上">▲</button>' +
        '<button class="vbtn" data-vdir="a" aria-label="左">◀</button>' +
        '<button class="vbtn" data-vdir="s" aria-label="下">▼</button>' +
        '<button class="vbtn" data-vdir="d" aria-label="右">▶</button>' +
      '</div>' +
      '<div class="vpad-act">' +
        '<button class="vbtn" data-vact="wait" aria-label="等待"><span>⏳</span><span class="vnum" data-k="wait">0</span></button>' +
        '<div class="vact-col">' +
          '<button class="vbtn vbtn-reset" data-vact="reset" aria-label="重置路径"><span>↺</span></button>' +
          '<button class="vbtn" data-vact="attack" aria-label="攻击"><span>⚔️</span><span class="vnum" data-k="atk">0</span></button>' +
        '</div>' +
        '<button class="vbtn" data-vact="skill" aria-label="技能"><span>✦</span><span class="vlab" data-k="sp">0</span></button>' +
      '</div>' +
    '</div>';

  /* 方向键：pointerdown 立即生效（click 会有 300ms 延迟感）
   *
   * ★ ISSUE-20261029-30（线上 P0）：选角大厅里虚拟方向钮**完全没反应**，
   *   手机上等于「进得去大厅、出不了大厅」—— 游戏在触屏设备上直接不可玩。
   * 根因有两条，必须一起修：
   *   ① 这里只判了 `phase === PLANNING`，而选角大厅是 CHAR_SELECT → 按下后什么都不做；
   *      键盘 WASD 走的是 handleKeyDown 里的 `isFreeMovePhase() → freeMoveKeyDown()`，
   *      所以电脑端能走、手机端不能走 —— 同一个动作有两个出口，其中一个漏了大厅。
   *   ② syncVirtualPad() 里 `if (!vpadMounted || !player) return;` 加上
   *      `b.disabled = !planning`，大厅里 player 为 null 且 planning 为假
   *      → 方向钮被置成 disabled，而 CSS 里 .vbtn:disabled 是 pointer-events:none，
   *        连事件都收不到（就算①修好了也照样点不动）。
   * 修法：按下/松开直接对接键盘用的同一对函数 freeMoveKeyDown / freeMoveKeyUp，
   *   语义与电脑端 WASD 逐字对齐 —— 按住 = 连续走，松手 = 停；
   *   战斗相位仍走原路径 stepPathByDir（一步一格地规划，与之前完全一致）。 */
  vpadHostEl.querySelectorAll('[data-vdir]').forEach(function (b) {
    const dir = b.dataset.vdir;                 // 'w' | 'a' | 's' | 'd'，与 KEY_DIRS / WASD 同键位
    const onPress = function (e) {
      e.preventDefault();
      if (phase === PHASE.PLANNING && !isMoving) { stepPathByDir(dir); return; }
      if (typeof isFreeMovePhase === 'function' && isFreeMovePhase()) freeMoveKeyDown(dir);
    };
    /* 松手 / 手指划出按钮 / 系统接管（来电、下拉通知）都要松开按键，
     * 否则键表里的方向会一直为真 —— 角色松手后还在自己走（与键盘 blur 清表同一个坑）。 */
    const onRelease = function (e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof freeMoveKeyUp === 'function') freeMoveKeyUp(dir);
    };
    b.addEventListener('pointerdown', onPress);
    b.addEventListener('pointerup', onRelease);
    b.addEventListener('pointercancel', onRelease);
    b.addEventListener('pointerleave', onRelease);
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

  /* ★ ISSUE-20261029-31：CSS 的 user-select/callout 挡不住的部分
   * （Android WebView、部分国产浏览器长按会先弹 contextmenu；还有老 WebKit 的 selectstart）。
   * 在面板根节点上再拦一次，捕获阶段拦住，避免事件继续往下穿透到棋盘。 */
  const swallow = function (e) { e.preventDefault(); };
  vpadHostEl.addEventListener('contextmenu', swallow);
  vpadHostEl.addEventListener('selectstart', swallow);

  syncVirtualPad();
  syncVpadInset();
}

/* =========================================================================
 * ★ 底栏面板的高度补偿（ISSUE-20261029-29）
 * 面板是 position:fixed，脱离文档流 → 不补偿的话它会直接盖住侧栏末尾。
 * 做法：把实测高度写进 --vpad-h，#game 用它加一圈 padding-bottom；
 * boardAvailSize() 算的是 clientHeight − padding，棋盘因此自动变小、自动让位，
 * 不需要在那边再写一遍「减面板高度」（两处各减一次会重复扣）。
 * ========================================================================= */
function syncVpadInset() {
  if (!vpadMounted || !vpadHostEl) return;
  const h = vpadHostEl.offsetHeight || 0;
  if (h <= 0) return;                       // 还没布局出来（首次挂载时可能为 0）
  document.body.classList.add('vpad-on');
  document.documentElement.style.setProperty('--vpad-h', h + 'px');
}

/* 「开始行动」按钮的注入点：renderControls() 用它把按钮放进面板顶部 */
function vpadStartSlotEl() {
  return (vpadMounted && vpadHostEl) ? document.getElementById('vpadStartSlot') : null;
}

/* 面板高度会随「开始行动」按钮出现/消失、横竖屏切换而变，尺寸变化时重测一次 */
window.addEventListener('resize', function () {
  if (!vpadMounted) return;
  setTimeout(syncVpadInset, 140);
});

/* 数值同步：只在数值变化时写 DOM，避免每帧重排
 * ★ 这里的 `if (!player) return` 是 ISSUE-20261029-30 的第二个坑（已修）：
 *   选角大厅里 player 还没创建，原写法直接整段返回 → 方向钮停在上一次的 disabled 状态，
 *   .vbtn:disabled 的 pointer-events:none 会让按钮连事件都收不到。
 *   现在拆成两段：先刷「按钮可用性」（不依赖 player），再刷数值（大厅跳过）。 */
function syncVirtualPad() {
  if (!vpadMounted) return;
  const planning = phase === PHASE.PLANNING && !isMoving;
  const lobby = (typeof isFreeMovePhase === 'function') ? isFreeMovePhase() : false;
  const canMove = planning || lobby;            /* 方向键：战斗里规划路径、大厅里操控角色 */

  vpadHostEl.querySelectorAll('[data-vdir]').forEach(function (b) { b.disabled = !canMove; });
  const waitBtn = vpadHostEl.querySelector('[data-vact="wait"]');
  const atkBtn = vpadHostEl.querySelector('[data-vact="attack"]');
  const spBtn = vpadHostEl.querySelector('[data-vact="skill"]');
  const resetBtn = vpadHostEl.querySelector('[data-vact="reset"]');
  /* 等待 / 攻击 / 技能 / 重置路径 是战斗语义，大厅里没有意义 → 保持禁用 */
  if (waitBtn) waitBtn.disabled = !planning;
  if (atkBtn) atkBtn.disabled = !planning;
  if (spBtn) spBtn.disabled = !planning;
  if (resetBtn) resetBtn.disabled = !planning;
  /* ★ ISSUE-20261029-35：大厅里没有对局数据，三键数字清成「—」。
   * 注意不能只看 `!player` —— 回大厅时 player 还留着上一局的残留对象，
   * 直接读它会显示上一局的伤害骰 / 技力环（看起来像「还能用」，其实是脏数据）。 */
  if (!player || lobby) {
    /* 大厅：把三键上的数字清成「—」，免得留着上一局的残留 */
    const wn = waitBtn && waitBtn.querySelector('[data-k="wait"]');
    if (wn && wn.textContent !== '—') wn.textContent = '—';
    const an = atkBtn && atkBtn.querySelector('[data-k="atk"]');
    if (an && an.textContent !== '—') an.textContent = '—';
    const sn = spBtn && spBtn.querySelector('[data-k="sp"]');
    if (sn && sn.textContent !== '—') sn.textContent = '—';
    const oldRing = spBtn && spBtn.querySelector('.vring');
    if (oldRing) oldRing.remove();
    return;
  }
  const waitLeft = Math.max(0, player.move - countWaitSteps(playerPath));
  const atkCount = attackIndices.length;
  const sp = vpadSpInfo();
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
