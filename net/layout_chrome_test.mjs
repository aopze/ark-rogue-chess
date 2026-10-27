/* 布局与外壳行为回归测试（P0.1-4 第七批：layout / chrome 搬出模板后）
 *
 * 为什么单独写：这两组代码在模板里是**两段不连续**的（layout 在 1078 与 3382 行、
 * chrome 在 3268 与 3893 行），靠多点注入落回原位。文本等价只能证明「代码没变」，
 * 不能证明「搬完之后仍然被正确调用」—— 例如槽位标记错位会让 `setLayout` 在
 * `logRotateBtn` 声明之前执行（TDZ），归一化比对看不出来，但页面会白屏。
 *
 * 覆盖：
 *   [1] 横竖版切换：setLayout / currentLayout / localStorage['ark_layout']
 *   [2] 竖版地图高度比例：applyMapVHeight / syncMapVHeight / clearMapVHeight
 *       + localStorage['ark_map_v_ratio']（拖动与旋屏保留）
 *   [3] 设置面板开合：setSettingsOpen / clampLogPanelPos
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

console.log('\n[2] 竖版地图高度比例（applyMapVHeight / syncMapVHeight / clearMapVHeight）');
{
  window.eval("setLayout('v', true)");
  const boardWrap = doc.getElementById('boardWrap');
  check('boardWrap 存在', !!boardWrap);

  const h = window.eval('applyMapVHeight(120, true)');
  check('applyMapVHeight 返回数值高度', typeof h === 'number' && h > 0, String(h));
  check('boardWrap 高度已写成 px', /px$/.test(boardWrap.style.height), boardWrap.style.height);

  const raw = window.localStorage.getItem('ark_map_v_ratio');
  const ratio = parseFloat(raw);
  check("localStorage['ark_map_v_ratio'] 已写入", raw !== null, String(raw));
  check('比例落在允许区间 0.2~0.86（超出会被 initLayoutMode 丢弃）', ratio >= 0.2 && ratio <= 0.86, String(ratio));

  // 旋屏 / 重算：syncMapVHeight 应沿用同一比例（竖版下不清空）
  window.eval('clearMapVHeight()');
  check('clearMapVHeight 清掉内联高度', boardWrap.style.height === '', JSON.stringify(boardWrap.style.height));
  window.eval('syncMapVHeight()');
  check('syncMapVHeight 在竖版下恢复高度（旋屏后比例保留）', /px$/.test(boardWrap.style.height), boardWrap.style.height);

  // 切到横版后应清空（横版不用这个高度）
  window.eval("setLayout('h', true)");
  await sleep(60);
  check('切到横版后内联高度被清掉', boardWrap.style.height === '', JSON.stringify(boardWrap.style.height));
  check("横版不改 localStorage['ark_map_v_ratio']（比例留给下次竖版）",
    window.localStorage.getItem('ark_map_v_ratio') === raw, window.localStorage.getItem('ark_map_v_ratio'));
}

console.log('\n[3] 设置面板开合（setSettingsOpen / clampLogPanelPos）');
{
  const panel = doc.getElementById('logPanel');
  const btn = doc.getElementById('setOpenBtn');
  check('设置面板与开关按钮都在', !!panel && !!btn);

  window.eval('setSettingsOpen(false)');
  check('收起后面板带 collapsed', panel.classList.contains('collapsed'));
  check('收起后按钮显示 ⚙', (btn.textContent || '').trim() === '⚙', btn.textContent);
  check("收起后按钮 aria-expanded = 'false'", btn.getAttribute('aria-expanded') === 'false');

  window.eval('setSettingsOpen(true)');
  check('展开后面板去掉 collapsed', !panel.classList.contains('collapsed'));
  check('展开后按钮显示 ✕', (btn.textContent || '').trim() === '✕', btn.textContent);
  check("展开后按钮 aria-expanded = 'true'", btn.getAttribute('aria-expanded') === 'true');

  const before = doc.getElementById('setOpenBtn').style.left + '|' + doc.getElementById('setOpenBtn').style.top;
  window.eval('clampLogPanelPos()');
  const after = doc.getElementById('setOpenBtn').style.left + '|' + doc.getElementById('setOpenBtn').style.top;
  check('clampLogPanelPos 不抛错且不改按钮像素位置', before === after, `${before} -> ${after}`);
}

console.log('\n[4] DLC 外壳接管（单文件独立运行时必须自动跳过）');
{
  // patchDLCChrome 是**命名函数表达式**（(function patchDLCChrome(){...})()），
  // 名字不会外泄到全局 —— 这与搬移前完全一致，保持它是为了断点调试时能看出栈帧名。
  check('patchDLCChrome 不外泄全局（命名函数表达式，与原状一致）',
    window.eval('typeof patchDLCChrome') === 'undefined');
  check('无父窗口时不触碰自身 document（设置面板仍在）', !!doc.getElementById('logPanel'));
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

await sleep(200);
check('全程无 console.error / jsdomError', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${bad.length === 0 ? `全部通过（${ok.length} 项）` : `失败 ${bad.length} 项：${bad.join('、')}`}`);
process.exit(bad.length === 0 ? 0 : 1);
