/* 布局与外壳行为回归测试（P0.1-4 第七批：layout / chrome 搬出模板后）
 *
 * 为什么单独写：这两组代码在模板里是**两段不连续**的（layout 在 1078 与 3382 行、
 * chrome 在 3268 与 3893 行），靠多点注入落回原位。文本等价只能证明「代码没变」，
 * 不能证明「搬完之后仍然被正确调用」—— 例如槽位标记错位会让 `setLayout` 在
 * `logRotateBtn` 声明之前执行（TDZ），归一化比对看不出来，但页面会白屏。
 *
 * 覆盖：
 *   [1] 横竖版切换：setLayout / currentLayout / localStorage['ark_layout']
 *   [2] 正方形棋盘：updateCellSize 写同一像素宽高 / 竖版拖动条已废弃
 *   [3] 抽屉体系：drawerOpen / drawerClose / 互斥 / Esc / ♟️ 角色面板六维加点
 *   [3.5] 手机圆钮挂载判据：非纯触屏环境不建 DOM
 *   [4] DLC 外壳接管：单文件独立运行（无父窗口）时必须自动跳过，不得报错
 *
 * 用法：
 *   npm i jsdom  （任意目录，然后用 NODE_PATH 指过去）
 *   NODE_PATH=/path/to/node_modules ARK_GAME_HTML=<产物绝对路径> node net/layout_chrome_test.mjs
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.error('缺少 jsdom：先 npm i jsdom，再用 NODE_PATH 指向它的 node_modules');
  process.exit(2);
}

const GAME_URL = process.env.ARK_GAME_HTML
  ? new URL('file:///' + process.env.ARK_GAME_HTML.replace(/\\/g, '/').replace(/^\//, ''))
  : new URL('../game.html', import.meta.url);
const html = fs.readFileSync(GAME_URL, 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/game.html',
  virtualConsole: vc,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = function () {
      const base = {
        measureText: () => ({ width: 8 }),
        canvas: this,
        createLinearGradient: () => ({ addColorStop() {} }),
        getImageData: () => ({ data: [] }),
      };
      return new Proxy(base, {
        get: (t, k) => (k in t ? t[k] : function () {}),
        set: (t, k, v) => { t[k] = v; return true; },
      });
    };
    if (!window.matchMedia) {
      window.matchMedia = () => ({
        matches: false, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {},
      });
    }
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    // 竖屏 390×844：pinch 到手机宽度，验证 layout-v 分支（模块里多处按 innerWidth <= 760 分流）
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  },
});

const { window } = dom;
const doc = window.document;

const ok = [], bad = [];
function check(name, cond, detail = '') {
  (cond ? ok : bad).push(name);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  <' + detail + '>' : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await sleep(400);
console.log('产物：' + GAME_URL.pathname.split('/').pop());

console.log('\n[1] 横竖版切换（setLayout / currentLayout）');
check('初始化无报错', errors.length === 0, errors.slice(0, 3).join(' | '));
check('setLayout 是全局可调用函数', typeof window.eval('typeof setLayout') === 'string' && window.eval('typeof setLayout') === 'function');
{
  window.eval("setLayout('v', true)");
  check('切到竖版：body 带 layout-v', doc.body.classList.contains('layout-v'));
  check('切到竖版：body 去掉 layout-h', !doc.body.classList.contains('layout-h'));
  check('currentLayout() 返回 v', window.eval('currentLayout()') === 'v');
  check("localStorage['ark_layout'] = 'v'", window.localStorage.getItem('ark_layout') === 'v',
    String(window.localStorage.getItem('ark_layout')));

  window.eval("setLayout('h', true)");
  check('切回横版：body 带 layout-h', doc.body.classList.contains('layout-h'));
  check('切回横版：body 去掉 layout-v', !doc.body.classList.contains('layout-v'));
  check("localStorage['ark_layout'] = 'h'", window.localStorage.getItem('ark_layout') === 'h');
}

console.log('\n[2] 正方形棋盘（updateCellSize / boardAvailSize）');
{
  window.eval("setLayout('v', true)");
  const boardWrap = doc.getElementById('boardWrap');
  check('boardWrap 存在', !!boardWrap);

  // jsdom 没有真实布局：clientWidth/Height 都是 0，updateCellSize 落到 120px 兜底，
  // 但「宽高写成同一像素值」这件事是能验的。
  window.eval('updateCellSize()');
  const w = parseFloat(boardWrap.style.width), h = parseFloat(boardWrap.style.height);
  check('boardWrap 宽高都被写成 px', /px$/.test(boardWrap.style.width) && /px$/.test(boardWrap.style.height),
    boardWrap.style.width + ' × ' + boardWrap.style.height);
  check('棋盘是正方形（宽 == 高，±2px）', Math.abs(w - h) <= 2, w + ' vs ' + h);

  /* ISSUE-20261029-43：上面那条量的是 #boardWrap 的 inline style —— 那是 JS 写的同一个
   * 像素数，恒等，所以 53 项全绿也一直没发现「棋盘本体不方」。真正渲染出来的 #board
   * 用 getBoundingBox() 的行列数，box 不方棋盘就不方，这里直接比行列次数。 */
  const boardForShape = doc.getElementById('board');
  const gCols = ((boardForShape && boardForShape.style.gridTemplateColumns) || '').match(/repeat\((\d+)/);
  const gRows = ((boardForShape && boardForShape.style.gridTemplateRows) || '').match(/repeat\((\d+)/);
  check('渲染出来的棋盘是正方形（#board 列数 == 行数）',
    !!gCols && !!gRows && gCols[1] === gRows[1],
    (gCols ? gCols[1] : '?') + ' 列 × ' + (gRows ? gRows[1] : '?') + ' 行');

  /* 上面两条都依赖「这一局的包围盒恰好不方才走到正方形化分支」—— 把逻辑本身直接测一遍：
   * 10 列 × 11 行的紧包围盒必须被撑成 11×11（扩展优先、越界平移）。 */
  const sqA = window.eval('JSON.stringify(squareifyBox(1, 10, 0, 10))');
  const sqB = window.eval('JSON.stringify(squareifyBox(0, 10, 0, 9))');
  const okSq = o => (o.maxX - o.minX) === (o.maxY - o.minY) && o.minX >= 0 && o.minY >= 0;
  check('squareifyBox：10×11 与 11×10 都被撑成正方形', okSq(JSON.parse(sqA)) && okSq(JSON.parse(sqB)),
    sqA + ' / ' + sqB);

  // 竖版高度比例拖动已废除（ISSUE-20261028-09 硬约束 5）
  window.eval('applyMapVHeight(120, true)');
  check('竖版高度比例已废弃（不再写 ark_map_v_ratio）',
    window.localStorage.getItem('ark_map_v_ratio') === null,
    String(window.localStorage.getItem('ark_map_v_ratio')));
  check('竖版没有拖动条（#dragHandle 被隐藏）',
    window.getComputedStyle(doc.getElementById('dragHandle')).display === 'none',
    window.getComputedStyle(doc.getElementById('dragHandle')).display);

  // 格子必须正方：模板里的 .cell 规则不再乘 1.12
  const cellRule = (html.match(/\.cell \{[^}]*\}/) || [''])[0];
  check('格子不再乘 1.12（.cell height == var(--cell)）', !/1\.12/.test(cellRule), cellRule.slice(0, 70));
}

console.log('\n[3] 抽屉体系（drawerOpen / drawerClose / 互斥 / Esc / ♟️ 角色面板六维加点）');
{
  const settings = doc.getElementById('drawerSettings');
  const char = doc.getElementById('drawerChar');
  const levelup = doc.getElementById('drawerLevelUp');
  const mask = doc.getElementById('drawerMask');
  const btn = doc.getElementById('setOpenBtn');
  check('三个抽屉（设置/升级/角色） + 遮罩 + ⚙ 按钮都在', !!settings && !!char && !!levelup && !!mask && !!btn);

  check('初始没有抽屉打开', !settings.classList.contains('on') && !mask.classList.contains('on'));

  window.eval("drawerOpen('settings')");
  check('打开设置：抽屉带 .on', settings.classList.contains('on'));
  check("打开设置：⚙ 变 ✕ 且 aria-expanded = 'true'",
    (btn.textContent || '').trim() === '✕' && btn.getAttribute('aria-expanded') === 'true', btn.textContent);
  check('打开设置：遮罩出现', mask.classList.contains('on'));

  window.eval("drawerOpen('char')");
  check('互斥：打开角色面板时设置自动收起', !settings.classList.contains('on') && char.classList.contains('on'));
  check('角色面板打开时遮罩仍在', mask.classList.contains('on'));
  check('角色面板含六维图画布', !!doc.getElementById('charRadarCanvas'));
  /* ISSUE-20261029-42：删掉「角色」标题栏与 ✕，右下改成 BUFF 奖励池 */
  check('角色面板没有标题栏与 ✕（只靠点外部 / Esc 关）',
    !char.querySelector('.drawer-head') && !char.querySelector('.drawer-corner-x') && !char.querySelector('.drawer-title'));
  check('角色面板右下是 BUFF 池容器', !!doc.getElementById('charBuffs'));
  check('分配入口 allocateAbilityPoint 是全局函数', typeof window.allocateAbilityPoint === 'function');

  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc 关闭当前抽屉', !char.classList.contains('on'));
  check('Esc 关闭后遮罩收起', !mask.classList.contains('on'));

  /* ISSUE-20261029-42：✕ 删掉之后，「点面板外部」就是唯一的鼠标关闭方式，必须验到。 */
  window.eval("drawerOpen('char')");
  mask.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('点面板外部（遮罩）关闭角色面板', !char.classList.contains('on') && !mask.classList.contains('on'));

  window.eval("drawerOpen('char')");
  let clickThrew = false;
  try { doc.getElementById('charRadarCanvas').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
  catch (e) { clickThrew = true; }
  check('点六维图不抛错（命中判定无几何时为空操作）', !clickThrew);

  window.eval('drawerClose()');
  check('关闭后遮罩与抽屉都收起', !mask.classList.contains('on') && !char.classList.contains('on'));
}

console.log('\n[3.5] 手机虚拟圆钮的挂载判据');
{
  // 本环境 matchMedia 全部返回 false（等同「没有触屏」），因此一个圆钮 DOM 都不该建
  check('非纯触屏环境不建任何圆钮 DOM', doc.querySelectorAll('.vbtn').length === 0,
    String(doc.querySelectorAll('.vbtn').length));
  check('#vpadHost 没有 .on（不占位）', !doc.getElementById('vpadHost').classList.contains('on'));
}

console.log('\n[4] DLC 外壳接管（单文件独立运行时必须自动跳过）');
{
  // patchDLCChrome 是**命名函数表达式**（(function patchDLCChrome(){...})()），
  // 名字不会外泄到全局 —— 这与搬移前完全一致，保持它是为了断点调试时能看出栈帧名。
  check('patchDLCChrome 不外泄全局（命名函数表达式，与原状一致）',
    window.eval('typeof patchDLCChrome') === 'undefined');
  check('无父窗口时不触碰自身 document（设置抽屉仍在）', !!doc.getElementById('drawerSettings'));
  check('无父窗口时没有凭空创建外壳元素', doc.getElementById('hint') === null && doc.getElementById('ghint') === null);
}

console.log('\n[5] DLC 外壳（同源 iframe）接管真实行为');
{
  const dir = process.cwd().replace(/\\/g, '/');
  const toFileUrl = (p) => 'file:///' + p.split('/').map((s) => encodeURIComponent(s)).join('/').replace(/^file:\/%2F/, 'file:///');
  const target = toFileUrl(dir + '/build/out/game.html');
  const shellHtml = `<!doctype html><html><body>
<button id="btnHome">🏠</button>
<div id="hint" class="hint">提示</div>
<div id="ghint"></div>
<iframe id="f" src="${target}"></iframe>
<script>window.__origShowHint = window.showHint = function () { window.__hintCalls = (window.__hintCalls || 0) + 1; };</script>
</body></html>`;
  const shellErrors = [];
  const svc = new VirtualConsole();
  // canvas 是 jsdom 的已知限制（未装 node-canvas），与本测试无关，过滤掉
  const isCanvasNoise = (s) => /getContext|Not implemented/.test(s);
  svc.on('jsdomError', (e) => { const m = 'jsdomError: ' + (e && e.message ? e.message : e); if (!isCanvasNoise(m)) shellErrors.push(m); });
  svc.on('error', (...a) => { const m = 'console.error: ' + a.join(' '); if (!isCanvasNoise(m)) shellErrors.push(m); });

  const shell = new JSDOM(shellHtml, {
    url: target.replace('build/out/game.html', 'tests/fixtures/_shell.html'),
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: svc,
  });
  const sw = shell.window;
  const sdoc = sw.document;
  // 等 iframe 里的 game.html 真正跑完（体量大，给足时间；再兜底等到 setLayout 可见）
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const cw = sdoc.getElementById('f') && sdoc.getElementById('f').contentWindow;
    if (cw && (() => { try { return cw.eval('typeof setLayout') === 'function'; } catch (_) { return false; } })()) break;
    await sleep(120);
  }
  const frame = sdoc.getElementById('f');
  const cw = frame && frame.contentWindow;
  check('外壳 iframe 内的游戏已初始化', !!cw && (() => { try { return cw.eval('typeof setLayout') === 'function'; } catch (_) { return false; } })());

  check('外壳悬浮「🏠 主页」被隐藏', sdoc.getElementById('btnHome').style.display === 'none',
    JSON.stringify(sdoc.getElementById('btnHome').style.display));
  check('#ghint 无文字时隐藏（不压标题栏）', sdoc.getElementById('ghint').style.display === 'none',
    JSON.stringify(sdoc.getElementById('ghint').style.display));

  const gh = sdoc.getElementById('ghint');
  gh.textContent = '已保存';
  await sleep(120);
  check('#ghint 有文字后恢复显示（MutationObserver 同步）', gh.style.display === '',
    JSON.stringify(gh.style.display));
  check('#ghint 被挪到右上角', gh.style.right === '8px' && gh.style.left === 'auto',
    `left=${gh.style.left} right=${gh.style.right}`);

  check('外壳 showHint 被劫持（弹出的提示也会变短）', sw.showHint !== sw.__origShowHint);
  check('#hint 被接管后可点击收起（cursor:pointer）', sdoc.getElementById('hint').style.cursor === 'pointer',
    sdoc.getElementById('hint').style.cursor);
  check('外壳侧无异常', shellErrors.length === 0, shellErrors.slice(0, 3).join(' | '));
  shell.window.close();
}

console.log('\n[6] 手机圆钮：纯触屏环境才挂载（第二个实例，把 matchMedia 伪装成 coarse）');
{
  const vc2 = new VirtualConsole();
  vc2.on('jsdomError', (e) => errors.push('vpad jsdomError: ' + (e && e.message ? e.message : e)));
  vc2.on('error', (...a) => errors.push('vpad console.error: ' + a.join(' ')));
  const mapDom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/game.html',
    virtualConsole: vc2,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () {
        const base = {
          measureText: () => ({ width: 8 }), canvas: this,
          createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: [] }),
        };
        return new Proxy(base, {
          get: (t, k) => (k in t ? t[k] : function () {}),
          set: (t, k, v) => { t[k] = v; return true; },
        });
      };
      // 纯触屏设备：pointer:coarse 命中、any-pointer:fine 不命中
      window.matchMedia = (q) => ({
        media: q,
        matches: /\(pointer:\s*coarse\)/.test(q) && !/any-pointer/.test(q),
        addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      });
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
    },
  });
  const w2 = mapDom.window;
  const d2 = w2.document;
  await sleep(300);

  check('纯触屏：建出 4 方向 + 4 动作（含重置路径）= 8 个圆钮', d2.querySelectorAll('.vbtn').length === 8,
    String(d2.querySelectorAll('.vbtn').length));
  check('#vpadHost 带 .on（参与布局，不悬浮）', d2.getElementById('vpadHost').classList.contains('on'));
  const firstBtn = d2.querySelector('.vbtn');
  check('圆钮是圆形（border-radius:50%）',
    /50%/.test(w2.getComputedStyle(firstBtn).borderRadius || ''),
    w2.getComputedStyle(firstBtn).borderRadius);

  // 数值只在战斗里有意义（选角阶段没有 player）
  w2.eval("selectCharacter('vampire')");
  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && w2.eval('phase') !== 'planning') await sleep(50);
  check('已进入规划阶段', w2.eval('phase') === 'planning', w2.eval('phase'));

  const waitShown = (d2.querySelector('[data-vact="wait"] [data-k="wait"]') || {}).textContent;
  const waitExp = w2.eval('player.move - countWaitSteps(playerPath)');
  check('等待键 = 剩余可等待步数', String(waitExp) === String(waitShown), waitShown + ' vs ' + waitExp);

  const atkShown = (d2.querySelector('[data-vact="attack"] [data-k="atk"]') || {}).textContent;
  /* 2026-10-29 起伤害是骰子（近战 2d4+修正 / 远程 1d8+修正），虚拟键显示的是骰子文案而不是定值 */
  const atkExp = w2.eval('(isRangedChar(selectedChar) ? playerRangedDmgLabel() : playerMeleeDmgLabel())');
  check('攻击键 = 该角色对应伤害骰文案（2d4+修正 / 1d8+修正）',
    String(atkExp) === String(atkShown) && /^[12]d[48]/.test(String(atkShown)),
    atkShown + ' vs ' + atkExp);

  const ring = d2.querySelector('[data-vact="skill"] .vring');
  check('技能键上有技力环', !!ring);
  const ringSegs = ring ? ring.querySelectorAll('path').length : 0;
  const spMax = w2.eval('VAMPIRE_SP_MAX');
  check('技力环按 spMax 等分段数', ringSegs === spMax, ringSegs + ' 段 vs spMax ' + spMax);

  const up = d2.querySelector('[data-vdir="w"]');
  check('规划阶段方向键可用（未 disabled）', up && !up.disabled);
  const before = w2.eval('playerPath.length');
  up.dispatchEvent(new w2.Event('pointerdown', { bubbles: true, cancelable: true }));
  const after = w2.eval('playerPath.length');
  check('点方向键走的是同一条路径逻辑（不报错、长度不为负）', after >= before, before + ' → ' + after);

  mapDom.window.close();
}

await sleep(200);
check('全程无 console.error / jsdomError', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${bad.length === 0 ? `全部通过（${ok.length} 项）` : `失败 ${bad.length} 项：${bad.join('、')}`}`);
process.exit(bad.length === 0 ? 0 : 1);
