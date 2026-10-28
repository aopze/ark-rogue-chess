/* =========================================================================
 * ISSUE-20261028-09 G · 抽屉组件（一套组件，四处复用）
 *
 * 设计约束（都是踩过或算过的坑，改之前先读）：
 *  1. 抽屉节点挂在 <body> 直属，不能挂进 #sidebar —— render() 每次都会重刷侧栏，
 *     挂里面的话玩家点一次「+1」，说明卡就被冲掉了。
 *  2. 只用 transform 过渡，不用 display:none —— 雷达画布在 display:none 的容器里
 *     clientWidth === 0，会画成 0×0 且不留痕。
 *  3. 同一时刻只允许一个抽屉：打开新的自动收起旧的（含二层）。
 *  4. Esc 用捕获阶段拦截并 stopPropagation，避免顺带触发 X（重置路径）等快捷键。
 *  5. 遮罩只挡游戏区：视觉上全屏，但抽屉 z-index 更高，露在遮罩之上。
 * ========================================================================= */
const DRAWER_IDS = ['settings', 'stats', 'levelup'];
const drawerEls = {};
DRAWER_IDS.forEach(function (id) {
  const el = document.getElementById('drawer' + id.charAt(0).toUpperCase() + id.slice(1));
  if (el) drawerEls[id] = el;
});
const drawerMaskEl = document.getElementById('drawerMask');
let drawerCurrent = null;

function drawerIsOpen(id) { return drawerCurrent === id; }

/* ⚙ 按钮与遮罩跟随状态：入口按钮保持可见并进入高亮态（aria-expanded） */
function drawerSyncChrome() {
  const btn = document.getElementById('setOpenBtn');
  if (btn) {
    const on = drawerCurrent === 'settings';
    btn.classList.toggle('on', on);
    btn.textContent = on ? '✕' : '⚙';
    btn.title = on ? '收起设置' : '设置';
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  const sbtn = document.getElementById('statsOpenBtn');
  if (sbtn) {
    const on = drawerCurrent === 'stats';
    sbtn.classList.toggle('on', on);
    sbtn.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  if (drawerMaskEl) drawerMaskEl.classList.toggle('on', !!drawerCurrent);
}

/* 关闭二层（属性说明卡）而不关抽屉本身；返回是否真的关掉了一层 */
function drawerCloseLayer() {
  const layer = document.getElementById('abilityInfoLayer');
  if (layer && layer.classList.contains('on')) {
    layer.classList.remove('on');
    layer.setAttribute('aria-hidden', 'true');
    return true;
  }
  return false;
}

function drawerClose() {
  if (!drawerCurrent) { drawerCloseLayer(); return false; }
  const el = drawerEls[drawerCurrent];
  if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
  drawerCurrent = null;
  drawerCloseLayer();
  drawerSyncChrome();
  return true;
}

function drawerOpen(id) {
  const el = drawerEls[id];
  if (!el) return;
  // 互斥：先收起别的抽屉与所有二层
  if (drawerCurrent && drawerCurrent !== id) {
    const prev = drawerEls[drawerCurrent];
    if (prev) { prev.classList.remove('on'); prev.setAttribute('aria-hidden', 'true'); }
  }
  drawerCloseLayer();
  drawerCurrent = id;
  el.classList.add('on');
  el.setAttribute('aria-hidden', 'false');
  drawerSyncChrome();
  if (id === 'stats') {
    // 抽屉必须在「已经滑入」之后画：下一帧 clientWidth 才是真实值
    requestAnimationFrame(function () {
      try { if (typeof renderAbilityDrawer === 'function') renderAbilityDrawer(); } catch (_) {}
      try { drawRadar(); } catch (_) {}
      try { if (typeof syncAbilityInfoIfOpen === 'function') syncAbilityInfoIfOpen(); } catch (_) {}
    });
  }
}

function drawerToggle(id) {
  if (drawerCurrent === id) drawerClose();
  else drawerOpen(id);
}

if (drawerMaskEl) drawerMaskEl.addEventListener('click', function () { drawerClose(); });
document.querySelectorAll('[data-drawer-close]').forEach(function (b) {
  b.addEventListener('click', function (e) { e.stopPropagation(); drawerClose(); });
});
// 角色卡下方的「属性」入口（六维图搬走后它是唯一入口，手机也用它）
const statsOpenBtnEl = document.getElementById('statsOpenBtn');
if (statsOpenBtnEl) statsOpenBtnEl.addEventListener('click', function (e) {
  e.stopPropagation();
  drawerToggle('stats');
});
/* Esc：先关二层，再关抽屉。捕获阶段 + stopPropagation，避免落到 handleKeyDown 的其它键位 */
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (drawerCloseLayer()) { e.stopPropagation(); e.preventDefault(); return; }
  if (drawerCurrent) { drawerClose(); e.stopPropagation(); e.preventDefault(); }
}, true);
