/* P0.1-4 拆分 · 20261028c 基线 2005-2050 行 · 角色选择流程：initCharSelect / selectCharacter
 * 2026-10-28 追加「非战斗相位平滑自由移动」（ISSUE-20261028-12）与「大厅无障碍」（ISSUE-20261028-13）。 */
function initCharSelect() {
  phase = PHASE.CHAR_SELECT;
  setDebugMode(false);
  lastPathSignature = '';
  /* 新的一局 = 新的种子（ISSUE-20261028-03）：敌人成长按 RUN_SEED 推演，
   * 不重掷的话「重开」会得到和上一局完全相同的敌人面板序列。联机进入房间后由服务器再覆盖。 */
  seedRng(Date.now());
  resetTurnState({ clearCounter: true });
  resetRunProgress();
  isMoving = false;
  dragging = false;
  dragDownCell = null;
  hasDragged = false;
  clearTimeout(pressTimer);
  clearUnitLayer();
  ROWS = BOARD_ROWS; COLS = BOARD_COLS;
  /* ★ ISSUE-20261029-29：选角厅改版（人类 04:42）
   *   「选角界面改成角色在最后一行并列，第一行中间的位置放开始游戏的出口」。
   * 旧布局：外圈四周全是墙，5 个角色散在左上区域，出口在右侧中间 (7,4)。
   * 新布局：
   *   - 左右两列仍是墙（保留「厅堂有边界」的框感，也避免角色走出画面）；
   *   - 第 0 行整行可走 → 中间那格 (4,0) 放出口 🚪；
   *   - 最后一行（ROWS-1）整行可走 → 5 个角色在这一行居中并列（x = 2..6）。
   * ★ 上下两行必须显式开成可走：freeMove 的夹取范围与「墙」判定都读 selMap，
   *   若留着旧的外圈墙，角色会卡在 y=1..7，永远够不到第 0 行的出口。 */
  selMap = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (let i = 0; i < ROWS; i++) { selMap[i][0] = 1; selMap[i][COLS - 1] = 1; }
  /* 内部不再摆任何阻挡物（ISSUE-20261028-13 方案 A）：大厅是选角厅，不是战场。
   * 联机 9×9 竞技场不再复用这张图，改用 buildPvpArena() 的独立快照，联机地形一格不变。 */
  selExit = { x: 4, y: 0 };
  selMap[selExit.y][selExit.x] = 0;
  /* 5 个角色在最后一行并列：9 列去掉两侧墙剩 7 格，取中间 5 格（x = 2..6）居中。
   * 顺序沿用原顺序（风笛 / 华法琳 / 泥岩 / 阿米娅 / 预备干员），索引变了不影响任何逻辑。 */
  charCandidates = ['wheelchair', 'vampire', 'fencer', 'amiya', 'rookie'].map((id, i) => {
    const x = 2 + i, y = ROWS - 1;
    return { id, x, y, fx: x, fy: y, alive: true };
  });
  selectedCandidate = null;
  /* 回大厅 = 说明层必须收起（charSheetOpen 是下面声明的 let，本函数在运行时才被调用，无 TDZ 风险） */
  charSheetOpen = false;
  /* ISSUE-20261028-19：新的一局 → 清空候选属性副本与剩余点数。
   * 只在 initCharSelect 清（B4）：切到别的角色再切回来，已分配的点必须还在。 */
  candidateAbilities = null;
  candidatePoints = 0;
  clearLog();
  log('请点击选择一个角色，然后通过点击或 WASD 移动至 🚪 出口。');
  setTimeout(() => {
    updateCellSize();
    render();
    /* 自由移动层要等格子布局稳定后才能量出格子间距，所以跟着这次重绘一起初始化 */
    initFreeMoveLobby();
  }, 50);
}

function selectCharacter(charId) {
  stopFreeMove();          /* 进关前务必停掉 rAF，否则战斗里还在写大厅元素的 transform */
  freeMoveClearEls();      /* 大厅角色层是独立的绝对定位节点，进关前必须清干净 */
  selectedChar = charId;
  setDebugMode(false);
  playerStats = createPlayerStats(charId);
  /* ISSUE-20261028-19：把选角时加的 5 点交给正式面板，剩余点数一并带进第 1 关（B5）。
   * 只有动态角色才可能有副本；没加完的点不清零 —— 大厅出口判定已经够敏感，再拦「必须先加完」会卡人。 */
  if (candidateAbilities && charIsDynamic(charId)) {
    playerStats.abilities = { ...candidateAbilities };
    playerStats.abilityPoints = candidatePoints;
  }
  level = 1;
  resetRunProgress();
  recomputePlayerDerivedStats();
  playerStats.currentHp = playerStats.maxHp;
  initLevel();
}

/* =========================================================
 * 选角阶段的「候选属性副本」（ISSUE-20261028-19）
 *
 * ★ 绝对不许直接往 CHARACTERS.rookie.abilities 里写加点：那是模块级常量对象，
 *   雷达图、面板、联机快照都直接读它 → 一写就是全局污染（重开一局、甚至下一局选别人都会带着）。
 *   所以选中动态角色时建一份副本，加点只改副本；selectCharacter() 确认时才写进 playerStats。
 * ========================================================= */
let candidateAbilities = null;   /* 动态角色在选角阶段的六维副本 */
let candidatePoints = 0;         /* 选角阶段剩余可分配点数 */

/* 当前候选人的六维：动态角色读副本，静态角色读常量（后者永远不该被写） */
function candidateAbilitiesOf(id) {
  if (charIsDynamic(id) && candidateAbilities) return candidateAbilities;
  return CHARACTERS[id] ? CHARACTERS[id].abilities : null;
}
/* 切到某个候选人（点角色时调用）：动态角色首次选中时建副本并发放点数 */
function candidateSelect(id) {
  if (!charIsDynamic(id)) return;
  if (!candidateAbilities) {
    candidateAbilities = { ...CHARACTERS[id].abilities };
    candidatePoints = CHARACTERS[id].startAbilityPoints || 0;
  }
}
function candidateIsDynamic() {
  return !!(selectedCandidate && charIsDynamic(selectedCandidate.id));
}
function candidatePointsLeft() {
  return candidateIsDynamic() ? candidatePoints : 0;
}
/* 选角阶段加点：只动副本，不碰 playerStats（那时它还不该存在） */
function allocateCandidatePoint(k) {
  if (!candidateIsDynamic()) return false;
  if (candidatePoints <= 0) return false;
  if (!candidateAbilities || !(k in candidateAbilities)) return false;
  if (candidateAbilities[k] >= ABILITY_CAP) return false;
  candidateAbilities[k] += 1;
  candidatePoints -= 1;
  return true;
}

/* =========================================================
 * 非战斗相位的「平滑自由移动」（ISSUE-20261028-12）
 *
 * 位置模型：charCandidates[n].fx / fy = 连续坐标，单位是「格」，
 *           整数即该格中心（fx=2 就是 selMap[·][2] 的正中间）。
 *           整数 x / y 仍然同步维护（取整），供旧逻辑/测试读取。
 * 渲染：每帧只写「当前角色」那一个元素的 transform，绝不整盘重绘
 *       （paintBoard() 会 innerHTML 重建 81 格，60fps 调它必卡）。
 * 输入：点击（设目标点，可随时改向）与 WASD（按住连续走），
 *       两者共用同一套向量/位移代码；虚拟摇杆本轮不做（见 issue §待确认 1）。
 * ========================================================= */
const FREE_MOVE_SPEED = 4.5;    /* 格/秒，与 ISSUE-12 §待确认 2 的建议值一致 */
const FREE_MOVE_ARRIVE = 0.05;  /* 点击到位的到达判定：距目标 < 0.05 格即停，避免抖动 */
const FREE_MOVE_EXIT_EPS = 0.5; /* 与出口格矩形相交（中心距 <= 0.5 格）即算踩到 */
const FREE_MOVE_KEYS = ['w', 'a', 's', 'd'];
/* ISSUE-20261028-18 跟随指针 */
const FREE_MOVE_FOLLOW_DEADZONE = 0.18;  /* 跟随模式的到达半径：指针永远在微动，0.05 会每帧抖 */
const FREE_MOVE_EXIT_DWELL = 0.15;       /* 在出口格连续停留这么久才进关（人类 23:42 拍板 B 方案） */
const FREE_MOVE_DRAG_THRESHOLD = 8;      /* 触屏位移超过 8px 才算「拖动跟随」，否则仍算点击（B4） */
const FREE_MOVE_TOUCH_LIFT = 1.2;        /* 触屏拖动时目标点上移 1.2 格，别让手指盖住角色（§待确认 2 推荐 B） */

let freeMoveActive = false;     /* 大厅里是否启用自由移动 */
let freeMoveRaf = 0;
let freeMoveLast = 0;           /* 上一帧时间戳，dt 用它算（不能按固定步长） */
let freeMoveTarget = null;      /* 移动目标 {fx, fy, follow}；follow=true 表示由指针跟随写入 */
let freeMoveExitDwell = 0;      /* 在出口格内已连续停留的秒数（ISSUE-18 D1） */
let freeMoveExiting = false;    /* 已触发进关，防重复 */
let freeMoveGeom = null;        /* { ox, oy, sx, sy, cw, ch } 像素几何 */
const freeMoveKeys = { w: false, a: false, s: false, d: false };
const candEls = new Map();      /* 角色 id → 绝对定位元素 */

/* 将来 ISSUE-06 的「关卡间事件」也是非战斗相位，一并放进这里即可 */
function isFreeMovePhase() {
  return phase === PHASE.CHAR_SELECT;
}

function freeMoveClearKeys() {
  for (const k of FREE_MOVE_KEYS) freeMoveKeys[k] = false;
}

/* 量一次格子几何：用两个对角格子的中心点反推「格间距」，
 * 比 rect.width/COLS 精确（后者会把 grid gap 摊进格宽，右端误差最大可到十几像素）。 */
function freeMoveMeasure() {
  if (!(COLS >= 4 && ROWS >= 4)) return false;
  const a = getCellEl(1, 1);
  const b = getCellEl(COLS - 2, ROWS - 2);
  if (!a || !b) return false;
  const lr = unitLayer.getBoundingClientRect();
  const ar = a.getBoundingClientRect();
  const br = b.getBoundingClientRect();
  if (!(ar.width > 0) || !(br.width > 0)) return false;
  const ax = ar.left - lr.left + ar.width / 2;
  const ay = ar.top - lr.top + ar.height / 2;
  const bx = br.left - lr.left + br.width / 2;
  const by = br.top - lr.top + br.height / 2;
  freeMoveGeom = {
    ox: ax, oy: ay,
    sx: (bx - ax) / (COLS - 3),
    sy: (by - ay) / (ROWS - 3),
    cw: ar.width, ch: ar.height,
    /* 把 unitLayer 的视口偏移也缓存下来：pointermove 里要按每秒 500+ 次换算坐标，
       每次都 getBoundingClientRect() 会强制重排（ISSUE-18 约束 1）。
       页面滚动 / 尺寸变化时统一重测（见文件末尾的 scroll / resize 监听）。 */
    lx: lr.left, ly: lr.top,
  };
  return Math.abs(freeMoveGeom.sx) > 0.5 && Math.abs(freeMoveGeom.sy) > 0.5;
}

function freeMoveToPixels(fx, fy) {
  const g = freeMoveGeom;
  return { x: g.ox + (fx - 1) * g.sx - g.cw / 2, y: g.oy + (fy - 1) * g.sy - g.ch / 2 };
}

/* 视口坐标 → 连续格坐标。只用缓存的几何，不读布局（约束 1：pointermove 高频调用） */
function freeMoveClientToCell(clientX, clientY) {
  const g = freeMoveGeom;
  if (!g) return { fx: 1, fy: 1 };
  return {
    fx: 1 + (clientX - g.lx - g.ox) / g.sx,
    fy: 1 + (clientY - g.ly - g.oy) / g.sy,
  };
}

function freeMoveEnsureEls() {
  for (const c of charCandidates) {
    const old = candEls.get(c.id);
    if (old && old.isConnected) continue;
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'cand-unit';
    const iconEl = document.createElement('div');
    iconEl.className = 'cand-icon';
    iconEl.textContent = (CHARACTERS[c.id] && CHARACTERS[c.id].icon) || '❓';
    el.appendChild(iconEl);
    unitLayer.appendChild(el);
    candEls.set(c.id, el);
  }
}

function freeMoveClearEls() {
  for (const [, el] of candEls) el.remove();
  candEls.clear();
}

function freeMovePlace(c) {
  const el = candEls.get(c.id);
  if (!el || !freeMoveGeom) return;
  const w = freeMoveGeom.cw + 'px';
  const h = freeMoveGeom.ch + 'px';
  if (el.style.width !== w) el.style.width = w;
  if (el.style.height !== h) el.style.height = h;
  const p = freeMoveToPixels(c.fx, c.fy);
  el.style.transform = `translate(${p.x}px, ${p.y}px)`;
}

/* 选中态 / 初始摆位：只在「选择变化、初始化、尺寸变化」时调，不进每帧循环 */
function freeMoveRenderAll() {
  for (const c of charCandidates) {
    const el = candEls.get(c.id);
    if (!el) continue;
    el.classList.toggle('sel', selectedCandidate === c);
    freeMovePlace(c);
  }
}

function initFreeMoveLobby() {
  stopFreeMove();
  freeMoveExiting = false;
  freeMoveExitDwell = 0;   /* ISSUE-18：进出关都要清停留计时 */
  freeMoveEnsureEls();
  if (!freeMoveMeasure()) {
    /* 布局还没稳定（例如刚切横竖屏）：下一帧再试一次，量不到就保持静止 */
    requestAnimationFrame(() => {
      if (!isFreeMovePhase() || !freeMoveMeasure()) return;
      freeMoveRenderAll();
    });
  }
  freeMoveActive = true;
  freeMoveRenderAll();
}

function freeMoveKick() {
  if (!freeMoveActive || freeMoveRaf) return;
  freeMoveLast = 0;
  freeMoveRaf = requestAnimationFrame(freeMoveTick);
}

function stopFreeMove() {
  freeMoveActive = false;
  if (freeMoveRaf) cancelAnimationFrame(freeMoveRaf);
  freeMoveRaf = 0;
  freeMoveLast = 0;
  freeMoveTarget = null;
  freeMoveExitDwell = 0;
  freeMoveClearKeys();
}

/* 单一入口：点击补位（follow=false）与指针跟随（follow=true）都走这里。
 * ★ 只写目标点，绝不直接写 c.fx / c.fy —— 位移永远由 freeMoveTick 用
 *   Math.min(d, FREE_MOVE_SPEED * dt) 封顶（ISSUE-18 约束 6 / A0）。 */
function freeMoveSetTarget(fx, fy, follow) {
  if (!freeMoveActive) return;
  if (!freeMoveGeom && !freeMoveMeasure()) return;
  /* 选角厅上下两行现在是可走的（出口在第 0 行、角色站在最后一行），
   * y 的夹取范围必须跟着放开（ISSUE-20261029-29）—— 留着旧的 1..ROWS-2 就永远走不到出口。 */
  freeMoveTarget = {
    fx: Math.max(1, Math.min(COLS - 2, fx)),
    fy: Math.max(0, Math.min(ROWS - 1, fy)),
    follow: !!follow,
  };
  /* 开始走动了就把技能说明收起来：它还盖在棋盘中部，挡着看走路 */
  closeCharInfoSheet();
  freeMoveKick();
}

/* 清掉目标点（指针离开棋盘 / 中断 / 松手）：只清目标，不停表 ——
   停表交给 freeMoveTick 的自然静止分支，避免这里和 tick 抢 rAF 句柄。 */
function freeMoveClearTarget() {
  freeMoveTarget = null;
}

/* ISSUE-20261029-44 第2项：当前是否处于「跟随指针」的移动（拖动中）。
 * 松开鼠标/手指时用它判断要不要立即停 —— 纯点击（follow=false）不算，保留点击补位。 */
function freeMoveIsFollowing() {
  return !!(freeMoveTarget && freeMoveTarget.follow);
}

function freeMoveKeyDown(k) {
  if (!freeMoveActive || !selectedCandidate) return false;
  if (!FREE_MOVE_KEYS.includes(k)) return false;
  freeMoveKeys[k] = true;
  closeCharInfoSheet();      /* 键盘移动同样要收起说明，理由同 freeMoveSetTarget */
  freeMoveKick();
  return true;
}

function freeMoveKeyUp(k) {
  if (FREE_MOVE_KEYS.includes(k)) freeMoveKeys[k] = false;
}

/* 点击命中角色：按「中心距 <= 0.75 格」判定，角色不在格中心也能点中 */
/* =========================================================================
 * ★ 选角厅「技能说明展开层」（ISSUE-20261029-29，人类 04:42）
 *   「点击角色之后，角色这一行以上的部分展开角色技能说明文字，可以滚轮滑动查看，
 *     删掉之前的技能说明面板」。
 *
 * 形态：一块盖在棋盘「第 1 行 ~ 倒数第 2 行」上的半透明卡片（出口所在的第一行不遮，
 *   否则玩家看不见、也走不到出口），内容 = 角色简介 + tips，超出高度可滚轮 / 触摸滑动。
 * 为什么做成棋盘上的覆盖层而不是侧栏卡片：需求就写在棋盘上；且手机端侧栏在下方，
 *   说明放那儿要低头找，放棋盘中部是拇指区。
 * 收起时机（三条，都是「玩家要开始操作了」的信号）：
 *   ① 点面板空白处（位移 ≤8px 且 ≤700ms 才算「点」，滚动手指不会误触）
 *   ② 点地图设目标（freeMoveSetTarget）
 *   ③ 按 WASD（freeMoveKeyDown）
 * 位置靠量单元格 (1,1) 与 (COLS-2, ROWS-2) 的矩形算，不用 --cell 反推公式
 *   —— 后者要在 CSS 里复述一遍 gap 与居中偏移，两处一旦不同步就会错位半格。
 * ========================================================================= */
let charSheetOpen = false;

function openCharInfoSheet() {
  charSheetOpen = true;
  renderCharInfoSheet();
}

function closeCharInfoSheet() {
  if (!charSheetOpen) return;
  charSheetOpen = false;
  renderCharInfoSheet();
}

function layoutCharInfoSheet() {
  const el = document.getElementById('charInfoSheet');
  if (!el || el.hidden) return;
  const a = getCellEl(1, 1);
  const b = getCellEl(COLS - 2, ROWS - 2);
  if (!a || !b) return;
  const lr = boardWrap.getBoundingClientRect();
  const ar = a.getBoundingClientRect();
  const br = b.getBoundingClientRect();
  if (!(ar.width > 0) || !(br.width > 0)) return;
  el.style.left = (ar.left - lr.left) + 'px';
  el.style.top = (ar.top - lr.top) + 'px';
  el.style.width = (br.left + br.width - ar.left) + 'px';
  el.style.height = (br.top + br.height - ar.top) + 'px';
}

function renderCharInfoSheet() {
  const el = document.getElementById('charInfoSheet');
  if (!el) return;
  if (phase !== PHASE.CHAR_SELECT || !selectedCandidate || !charSheetOpen) {
    el.hidden = true;
    return;
  }
  const char = CHARACTERS[selectedCandidate.id];
  if (!char) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML =
    '<div class="cis-head">' +
      '<span class="cis-ico">' + char.icon + '</span>' +
      '<span class="cis-name">' + char.name + '</span>' +
      '<span class="cis-hint">滚轮 / 上下滑动查看 · 点空白处收起</span>' +
    '</div>' +
    '<div class="cis-desc">' + char.desc + '</div>' +
    '<ul class="tips cis-tips">' + renderTips(char.tips) + '</ul>';
  layoutCharInfoSheet();
}

(function bindCharInfoSheet() {
  const el = document.getElementById('charInfoSheet');
  if (!el) return;
  let down = null;
  el.addEventListener('pointerdown', function (e) {
    down = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  el.addEventListener('pointerup', function (e) {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = Date.now() - down.t;
    down = null;
    if (moved <= 8 && dt <= 700) closeCharInfoSheet();
  });
  el.addEventListener('pointercancel', function () { down = null; });
  /* 滚轮只在本层滚，别把页面带着一起滚（body 是 overflow:hidden，这里只是保险） */
  el.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
})();

function freeMoveCandidateAt(x, y, radius) {
  let best = null;
  let bestD = radius || 0.75;
  for (const c of charCandidates) {
    const d = Math.hypot(c.fx - x, c.fy - y);
    if (d <= bestD) { bestD = d; best = c; }
  }
  return best;
}

/* 纯检测：角色中心是否落在出口格判定区内（不再直接触发，ISSUE-18 D1 要累计停留） */
function freeMoveInExitZone(c) {
  if (!c) return false;
  if (Math.abs(c.fx - selExit.x) > FREE_MOVE_EXIT_EPS) return false;
  if (Math.abs(c.fy - selExit.y) > FREE_MOVE_EXIT_EPS) return false;
  return true;
}

function freeMoveTouchesExit(c) {
  if (freeMoveExiting || !c) return false;
  if (!freeMoveInExitZone(c)) return false;
  freeMoveExiting = true;
  const id = c.id;
  stopFreeMove();          /* E2：先停表，否则进关后 rAF 还在跑 */
  log(`你选择了 ${CHARACTERS[id].name}！进入关卡。`);
  /* 保留原有 400ms 过渡延迟（与旧的逐格动画收尾一致） */
  setTimeout(() => {
    if (isFreeMovePhase()) selectCharacter(id);
  }, 400);
  return true;
}

function freeMoveTick(ts) {
  freeMoveRaf = 0;
  if (!freeMoveActive || !isFreeMovePhase()) return;
  const c = selectedCandidate;
  /* dt 必须用 rAF 时间戳：120Hz 屏按固定步长会让速度翻倍 */
  const dt = freeMoveLast ? Math.min(0.05, Math.max(0, (ts - freeMoveLast) / 1000)) : 0;
  freeMoveLast = ts;
  let moving = false;

  if (c) {
    let dx = (freeMoveKeys.d ? 1 : 0) - (freeMoveKeys.a ? 1 : 0);
    let dy = (freeMoveKeys.s ? 1 : 0) - (freeMoveKeys.w ? 1 : 0);
    if (dx || dy) {
      freeMoveTarget = null;                        /* C4：键盘优先，按下即取消点击目标 */
      const len = Math.hypot(dx, dy);               /* C2：斜向归一化，速度与直向相同 */
      c.fx += (dx / len) * FREE_MOVE_SPEED * dt;
      c.fy += (dy / len) * FREE_MOVE_SPEED * dt;
      moving = true;
    } else if (freeMoveTarget) {
      const tx = freeMoveTarget.fx - c.fx;
      const ty = freeMoveTarget.fy - c.fy;
      const d = Math.hypot(tx, ty);
      /* 跟随模式用更大的死区：指针永远在微动，0.05 会让角色在指针附近每帧微抖（ISSUE-18 约束 2） */
      const arrive = freeMoveTarget.follow ? FREE_MOVE_FOLLOW_DEADZONE : FREE_MOVE_ARRIVE;
      if (d <= arrive) {
        freeMoveTarget = null;                      /* B3：到点就停，不抖 */
      } else {
        const step = Math.min(d, FREE_MOVE_SPEED * dt);
        c.fx += (tx / d) * step;
        c.fy += (ty / d) * step;
        moving = true;
      }
    }
    /* F1：中心点夹在可行走区域内 —— 左右两列仍是墙，上下两行可走（出口行 / 角色行） */
    const minX = 1, maxX = COLS - 2, minY = 0, maxY = ROWS - 1;
    if (c.fx < minX) { c.fx = minX; freeMoveTarget = null; }
    if (c.fx > maxX) { c.fx = maxX; freeMoveTarget = null; }
    if (c.fy < minY) { c.fy = minY; freeMoveTarget = null; }
    if (c.fy > maxY) { c.fy = maxY; freeMoveTarget = null; }
    /* 兼容：整数格坐标跟着小数坐标走（其他逻辑/测试仍读 x / y） */
    c.x = Math.round(c.fx);
    c.y = Math.round(c.fy);
    freeMovePlace(c);
    /* 出口判定每帧都做：可能「刚好停进出口格」而没有位移（E1）。
     * ISSUE-18 D1：改成「在出口格内连续停留 0.15s 才进关」，中途离开立刻清零。
     * ★ 这里还有一个必须处理的坑（约束 5）：角色停在出口格上时是静止的，
     *   旧代码静止就停 rAF → dwell 永远累加不到 0.15s，表现为「出口点了没反应」。
     *   所以下面的续帧条件必须带上 inExit。 */
    const inExit = freeMoveInExitZone(c);
    if (inExit) {
      freeMoveExitDwell += dt;
      if (freeMoveExitDwell >= FREE_MOVE_EXIT_DWELL && freeMoveTouchesExit(c)) return;
    } else {
      freeMoveExitDwell = 0;
    }
    if (moving || freeMoveTarget || inExit) {
      freeMoveRaf = requestAnimationFrame(freeMoveTick);
    } else {
      freeMoveLast = 0;   /* 静止且不在出口区：停表，等下一次输入再 kick，不空转烧 CPU */
    }
    return;
  }
  freeMoveLast = 0;
}

/* 按键松开 / 失焦都要清空按键表，否则切窗口回来角色会一直朝一个方向跑（C3） */
document.addEventListener('keyup', (e) => {
  if (!isFreeMovePhase()) return;
  freeMoveKeyUp(String(e.key || '').toLowerCase());
});
window.addEventListener('blur', () => { if (isFreeMovePhase()) freeMoveClearKeys(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isFreeMovePhase()) freeMoveClearKeys();
});

/* 尺寸变化（含横竖屏切换）后格间距会变，重量一次几何再整体摆位 */
window.addEventListener('resize', () => {
  if (!isFreeMovePhase()) return;
  setTimeout(() => {
    if (!isFreeMovePhase()) return;
    if (!freeMoveMeasure()) return;
    freeMoveRenderAll();
  }, 140);
});

/* ISSUE-18：pointermove 用缓存的视口偏移换算坐标，页面一滚缓存就偏了 → 滚动时重测。
 * passive + 只在自由移动相位里干活，不阻塞滚动。 */
window.addEventListener('scroll', () => {
  if (!isFreeMovePhase()) return;
  freeMoveMeasure();
}, { passive: true });
