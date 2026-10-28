/* 用 jsdom 把 game.html 完整加载一遍，验证改造后页面仍能正常初始化。
 *
 * 这能抓到静态检查看不见的东西：TDZ、函数名拼错、初始化顺序、
 * 以及「联机」面板是否真的挂到了 DOM 上。
 *
 * 需要 jsdom：
 *   npm i jsdom            （在任意目录，然后用 NODE_PATH 指过去）
 *   NODE_PATH=/path/to/node_modules node net/dom_load_test.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.error('缺少 jsdom：先 npm i jsdom，再用 NODE_PATH 指向它的 node_modules');
  process.exit(2);
}

// 默认测根目录产物；设 ARK_GAME_HTML 可指向构建产物（如 build/out/game.html），
// 用于验证「拆分后重新内联的产物」确实能跑，而不只是文本等价。
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
    // jsdom 没有 canvas 实现，用空壳顶替（游戏只用它画雷达图）
    // 注意 measureText 必须返回 {width}，否则 ctx.measureText(x).width 会炸，
    // 连带 updateStats() 中断、paintBoard() 不执行（看起来像"单位没渲染"）。
    window.HTMLCanvasElement.prototype.getContext = function () {
      const base = {
        measureText: function () { return { width: 8 }; },
        canvas: this,
        createLinearGradient: function () { return { addColorStop: function () {} }; },
        getImageData: function () { return { data: [] }; },
      };
      return new Proxy(base, {
        get: (t, k) => (k in t ? t[k] : function () {}),
        set: (t, k, v) => { t[k] = v; return true; },
      });
    };
    if (!window.matchMedia) {
      window.matchMedia = function () {
        return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
      };
    }
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  },
});

const { window } = dom;
const doc = window.document;

const ok = [], bad = [];
function check(name, cond, detail = '') {
  (cond ? ok : bad).push(name);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  <' + detail + '>' : ''}`);
}

await new Promise((r) => setTimeout(r, 400));

console.log('[1] 初始化无异常');
check('jsdom 没有报错', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log('\n[2] 单人流程仍然正常起来');
const cells = doc.querySelectorAll('.cell');
check('棋盘已渲染', cells.length > 0, cells.length + ' 格');
check('角色选择界面有角色卡', doc.querySelectorAll('.candidate, .char-card, [data-char]').length > 0 ||
      doc.body.textContent.indexOf('机制') >= 0, 'body 长度 ' + doc.body.textContent.length);

console.log('\n[3] 联机入口按 PVP 开关处置（ISSUE-20261029-27 起默认关闭）');
// 人类 2026-10-29 04:0x 拍板「先关闭联机系统，PVP 搁置」。
// 关闭不是删代码，而是 templates/game.html 里的常量 PVP_ENABLED = false：
// 按钮留在 DOM 里但 hidden + display:none，且 #pvpMask 根本不会被创建。
// 注：不能用 window.eval('PVP_ENABLED') —— jsdom 的 window.eval 看不到顶层 const
// （实测 ReferenceError），改为直接读源码里的开关声明 + 用行为断言兜第二道。
const pvpEnabled = /const PVP_ENABLED = false\s*;/.test(html);
const pvpBtn = doc.querySelector('#setPvpBtn') || doc.querySelector('#pvpBtn');
check('PVP 开关存在且当前是关闭（搁置中）', pvpEnabled === true, '源码里 PVP_ENABLED = false');
check('「联机」按钮留在 DOM 但已隐藏',
      !!pvpBtn && pvpBtn.hidden === true && pvpBtn.style.display === 'none',
      pvpBtn ? ('hidden=' + pvpBtn.hidden + ' display=' + pvpBtn.style.display) : 'null');
check('联机面板未被注入（#pvpMask 不存在）', doc.querySelector('#pvpMask') === null,
      doc.querySelector('#pvpMask') ? '仍存在' : 'null');
check('点隐藏按钮也打不开任何联机界面',
      (pvpBtn && pvpBtn.click(), doc.querySelector('#pvpMask') === null));

console.log('\n[4] 关闭期的残留与可恢复性');
check('页面里没有 #pvpCreate / #pvpJoin（连死按钮都不留）',
      !doc.querySelector('#pvpCreate') && !doc.querySelector('#pvpJoin'));
// 用 html 而不是 src：src 在 [6] 才声明（const 有 TDZ，这里提前用会 ReferenceError）
check('源码仍完整保留联机协议调用（改开关即可恢复）',
      /PVP_NET\.create\(/.test(html) && /PVP_NET\.join\(/.test(html));

console.log('\n[5] 单人流程仍然能进入关卡（随机数种子化后回归）');
{
  window.eval("selectCharacter('vampire')");
  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && window.eval("phase") !== 'planning') {
    await new Promise((r) => setTimeout(r, 60));
  }
  check('进入规划阶段', window.eval("phase") === 'planning', window.eval("phase"));
  check('地图已生成', window.eval("ROWS * COLS") > 0, window.eval("ROWS + 'x' + COLS"));
  check('敌人已生成', window.eval("enemies.length") > 0, window.eval("enemies.length"));
  check('玩家已就位且血量正常', window.eval("!!player && player.hp > 0"),
        window.eval("player ? player.hp + '/' + player.maxHp : 'null'"));
  const bboxCells = window.eval("(function(){var b=getBoundingBox();return (b.maxX-b.minX+1)*(b.maxY-b.minY+1);})()");
  // 进关后棋盘由后续的一次 render 重建，等它落地再数格子
  const t1 = Date.now();
  while (Date.now() - t1 < 3000 && doc.querySelectorAll('.cell').length !== bboxCells) {
    await new Promise((r) => setTimeout(r, 60));
  }
  check('棋盘格数与可视包围盒一致', doc.querySelectorAll('.cell').length === bboxCells,
        doc.querySelectorAll('.cell').length + ' vs ' + bboxCells);
}

console.log('\n[6] 改造点自查');
const src = html;
check('随机数已全部走 rng()', !/Math\.random\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
check('PvP 核心标记成对存在', (src.match(/\/\/#PVP_CORE_START/g) || []).length === 1 &&
      (src.match(/\/\/#PVP_CORE_END/g) || []).length === 1);
check('confirmAction 有联机分流', /function confirmAction\(\)[\s\S]{0,200}mode === 'pvp'/.test(src));
check('renderUnits 会渲染对手', /mode === 'pvp' && peer && peer\.alive/.test(src));

console.log('\n[7] P0.1-1 版本号（AC-02：页面可读出且与 tag 一致）');
{
  const V = window.__ARK_VERSION__;
  check('window.__ARK_VERSION__ 可读', !!V && typeof V === 'object');
  check('version 字段非空', !!(V && V.version), V && V.version);
  check('commit 是 40 位 sha', !!(V && /^[0-9a-f]{40}$/.test(V.commit || '')), V && V.commit);
  check('builtAt 是 ISO 时间', !!(V && /^\d{4}-\d{2}-\d{2}T/.test(V.builtAt || '')), V && V.builtAt);
  const verEl = doc.getElementById('setVer');
  const txt = verEl ? (verEl.textContent || '') : '';
  const tip = verEl ? (verEl.getAttribute('title') || '') : '';
  // 兼容两种形态：
  //   旧 —— #setVer 直接显示 "v0.1.0-prototype · <commit> · <date>"
  //   新（v2.2 起）—— 显示 "v<build>"，完整信息移入 title（版本号移到标题栏「设置」右侧）
  check('设置面板显示版本号（页内可查）',
        !!verEl && !!V &&
        (txt.indexOf(V.version) >= 0 || txt.indexOf(V.build || '\u0000') >= 0 || tip.indexOf(V.version) >= 0),
        verEl ? (txt + (tip ? '  (title: ' + tip.split('\n')[0] + ')' : '')) : '(无 #setVer)');

  // §0.9「双 BUILD 必须同时改」依赖 build 字段；它若丢失，index.html 的 ?v= 将失去对照。
  // 格式两版都认：旧版 YYYYMMDDx（八位数字 + 字母）、2026-10-28 起的 MMDDHHmm（八位数字）。
  check('build 字段存在（§0.9 双 BUILD 依赖）',
        !!(V && (/^\d{8}[a-z]$/.test(V.build || '') || /^\d{8}$/.test(V.build || ''))), V && V.build);
}

console.log(`\n${bad.length === 0 ? '全部通过（' + ok.length + ' 项）' : '失败 ' + bad.length + ' 项：' + bad.join(', ')}`);
if (errors.length) {
  console.log('\n捕获到的错误：');
  errors.slice(0, 8).forEach((e) => console.log('  - ' + e));
}
process.exit(bad.length ? 1 : 0);
