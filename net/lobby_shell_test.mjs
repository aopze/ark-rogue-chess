/* 外壳（index.html）行为回归：ISSUE-20261028-10
 *   打开即选角大厅 / 左侧抽屉 / 账号 =「显示名 + 数字口令」
 *
 * 为什么单独测：这一版把首屏整个删了，又动了身份模型。首屏删错会让页面直接白屏，
 * 账号校验写松会让口令漏进公开位置 —— 两类都不能只靠肉眼看。
 *
 * 用法：
 *   NODE_PATH=/path/to/node_modules node net/lobby_shell_test.mjs
 *   （可选 ARK_SHELL_HTML 指定 index.html 路径）
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

const SHELL = process.env.ARK_SHELL_HTML || 'index.html';
const html = fs.readFileSync(SHELL, 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/index.html',
  virtualConsole: vc,
  beforeParse(window) {
    // 外壳只读 leaderboard.json / api/leaderboard：一律当离线处理，走 catch 分支
    window.fetch = () => Promise.reject(new Error('offline'));
    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {} });
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(200);

console.log('外壳：' + SHELL + '\n');

console.log('[1] 打开即选角大厅（旧主页已删除）');
{
  check('没有 #home 屏', doc.getElementById('home') === null);
  check('没有「开始游戏」按钮', doc.getElementById('btnStart') === null);
  check('#gameWrap 可见（不是 hidden）', !doc.getElementById('gameWrap').hidden);
  const src = doc.getElementById('game').getAttribute('src') || '';
  check('iframe 已指向 game.html?v=BUILD', /game\.html\?v=\d{8}/.test(src), src);
  /* BUILD 不再硬编码：每次发版都会变（MMDDHHmm），写死等于给下一版埋雷。
   * 正确的口径是「iframe 的 ?v= 必须等于 index.html 自己的 var BUILD」，
   * 这正是 AC-23 缓存刷新的要害（不一致 → 用户拿到旧的 game.html）。 */
  const shellBuild = (html.match(/var BUILD\s*=\s*'(\d{8})'/) || [])[1] || '';
  check('iframe 的 ?v= 等于 index.html 的 BUILD（AC-23）',
    shellBuild && src.indexOf('v=' + shellBuild) > 0, src + ' vs BUILD=' + (shellBuild || '∅'));
  check('没有 console.error / jsdomError', errors.length === 0, errors.slice(0, 2).join(' | '));
}

console.log('\n[2] 左侧抽屉（入口 = 游戏内 ♟ 角标的 postMessage，2026-10-29 起外壳不再挂左边缘把手）');
{
  const mask = doc.getElementById('lobbyMask');
  const drawer = doc.getElementById('lobbyDrawer');
  const frame = doc.getElementById('game');
  check('旧把手 #lobbyHandle 已删除（入口只留 ♟ 角标）', doc.getElementById('lobbyHandle') === null);
  check('遮罩 / 抽屉都在', !!mask && !!drawer);
  check('抽屉默认收起', !drawer.classList.contains('on') && !mask.classList.contains('on'));

  const openViaGame = () => window.dispatchEvent(
    new window.MessageEvent('message', { data: { type: 'ark_open_lobby' } }));
  openViaGame();
  check("游戏发 'ark_open_lobby' → 抽屉滑出", drawer.classList.contains('on'));
  check("aria-hidden 变为 'false'", drawer.getAttribute('aria-hidden') === 'false');
  check('遮罩出现', mask.classList.contains('on'));
  check('抽屉打开时游戏输入被暂停（iframe pointer-events:none）',
    frame.style.pointerEvents === 'none', frame.style.pointerEvents);
  check('角标式关闭钮 #lobbyCornerClose 存在', !!doc.getElementById('lobbyCornerClose'));

  mask.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('点遮罩 → 关闭', !drawer.classList.contains('on'));
  check('关闭后游戏输入恢复', frame.style.pointerEvents === '', frame.style.pointerEvents);

  openViaGame();
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc → 关闭', !drawer.classList.contains('on'));

  openViaGame();
  doc.getElementById('lobbyCornerClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('点左上角 ✕ → 关闭', !drawer.classList.contains('on'));
}

console.log('\n[3] 账号校验（拒绝要写清原因，不得静默截断）');
{
  const good = window.eval("parseAccount('阿米娅1234')");
  check('阿米娅1234 → 通过，名字=阿米娅', good.ok === true && good.name === '阿米娅' && good.code === '1234');
  const en = window.eval("parseAccount('Amiya9876')");
  check('Amiya9876 → 通过，名字=Amiya', en.ok === true && en.name === 'Amiya' && en.code === '9876');

  const cases = [
    ['阿米娅123', '口令 3 位'],
    ['Amiya', '完全没有数字'],
    ['阿米娅 1234', '含空格'],
    ['1234', '只有数字没有名字'],
    ['阿米娅123456789', '口令 9 位'],
    ['阿米1娅1234', '数字夹在名字中间'],
    ['', '空输入'],
  ];
  cases.forEach(([input, why]) => {
    const r = window.eval('parseAccount(' + JSON.stringify(input) + ')');
    check('拒绝「' + (input || '空') + '」（' + why + '）', r.ok === false && !!r.reason, r.reason || '(无原因)');
  });

  check('maxlength = 20（12 名字 + 8 口令）', doc.getElementById('pName').getAttribute('maxlength') === '20');
}

console.log('\n[4] 首次进入自动生成账号，且公开位置不含数字');
{
  const acct = window.localStorage.getItem('ark_account') || '';
  check('已生成本机账号', /^[\u4e00-\u9fa5]{2}\d{4}$/.test(acct), acct);
  check('显示名不含数字', !/\d/.test(window.eval('APP.myName')), window.eval('APP.myName'));
  check('账号卡只显示显示名', !/\d/.test(doc.getElementById('pNameLine').textContent || ''),
    doc.getElementById('pNameLine').textContent);

  // 改成自定义账号
  window.eval("saveAccount('阿米娅9012'); renderPlayer();");
  check('改成阿米娅9012 后显示名 = 阿米娅', doc.getElementById('pNameLine').textContent === '阿米娅',
    doc.getElementById('pNameLine').textContent);
  // 只查「玩家能看见的文本」：整个 body.textContent 会把 <script> 源码也算进去（示例字符串里有 1234）
  const visibleText = ['pNameLine', 'pStats', 'miniBoard']
    .map((id) => { const el = doc.getElementById(id); return el ? el.textContent : ''; })
    .concat([(doc.querySelector('.acct-note') || {}).textContent || ''])
    .join(' ');
  check('账号卡与榜单的可见文本里搜不到口令 9012',
    visibleText.indexOf('9012') < 0,
    visibleText.indexOf('9012') >= 0 ? '出现在：' + visibleText.slice(0, 60) : '');

  // 编辑时输入框回填完整串（含数字）
  window.eval('toggleEdit(true)');
  check('编辑时输入框回填完整账号（含口令）', doc.getElementById('pName').value === '阿米娅9012',
    doc.getElementById('pName').value);
  window.eval('toggleEdit(false)');
}

console.log('\n[5] 排行榜只显示显示名（老数据里带口令也要剥掉）');
{
  window.eval(`APP.data = { updated_at: 1, entries: [
    { id: 1, name: '阿米娅1234', level: 9, kills: 30, runs: 2 },
    { id: 2, name: '雨', level: 7, kills: 20, runs: 1 },
    { id: 3, name: '阿米娅5678', level: 5, kills: 10, runs: 1 }
  ]}; renderMiniBoard();`);
  const names = Array.from(doc.querySelectorAll('#miniBoard .nm')).map((el) => el.textContent);
  check('榜上没有 4–8 位数字尾巴', !names.some((n) => /\d{4,8}/.test(n)), names.join(' | '));
  // ISSUE-20261029-44 第4项：同名账户改为合并成一条（不再用 ·2 序号区分）
  check('同名账户合并为一条（不再 ·2）',
        names.filter((n) => n.indexOf('阿米娅') === 0).length === 1 && !names.some((n) => n.indexOf('·2') >= 0),
        names.join(' | '));
  check('无数字的老名字原样显示', names.indexOf('雨') >= 0, names.join(' | '));
}

console.log('\n[6] 完整排行榜仍复用原浮层');
{
  const p = doc.getElementById('rankPanel');
  const f = doc.getElementById('rankFrame');
  check('#rankPanel 与 #rankFrame 都在', !!p && !!f);
  window.eval('openRank()');
  check('openRank 打开浮层', p.classList.contains('open'));
  check('iframe 带时间戳强制刷新', /leaderboard\.html\?t=\d+/.test(f.getAttribute('src') || ''), f.getAttribute('src'));
  window.eval('closeRank()');
  check('closeRank 关闭浮层', !p.classList.contains('open'));
}

console.log('\n[7] 关闭角标与游戏内 👤 角标像素级对齐（ISSUE-20261029-44 补丁①）');
{
  /* 为什么测：外壳的 ✕ 必须「原地变成」游戏里那颗 👤 —— 同尺寸、同左上角位置。
     尺寸随 --cell（16~80px）变，写死 36px 必然对不上，所以要抄 iframe 内 #lobbyOpenBtn 的 rect。
     jsdom 不做布局（rect 全 0），这里直接打桩验证换算与写入，真浏览器对齐靠肉眼 + 线上回归。 */
  const corner = doc.getElementById('lobbyCornerClose');
  const fr = doc.getElementById('game');
  const dr = doc.getElementById('lobbyDrawer');
  check('syncCornerToGame 已导出', typeof window.syncCornerToGame === 'function');

  const fdoc = fr.contentDocument || (fr.contentWindow && fr.contentWindow.document);
  /* jsdom 不加载 iframe 资源（contentDocument 常为 null），且不做布局 —— 这里打桩：
     一个只有 getElementById('lobbyOpenBtn') 的最小文档 + 带 rect 的假角标。
     syncCornerToGame 只依赖这一处读 DOM，桩掉它就能精确验证换算与写入。 */
  let fakeRect = { left: 120, top: 40, width: 64, height: 64, right: 184, bottom: 104 };
  const fakeBtn = { id: 'lobbyOpenBtn', getBoundingClientRect: () => fakeRect };
  Object.defineProperty(fr, 'contentDocument', {
    configurable: true,
    get: () => ({ getElementById: (id) => (id === 'lobbyOpenBtn' ? fakeBtn : null) }),
  });
  void fdoc;
  // 游戏内：👤 在 iframe 内 (120,40)，边长 64（--cell=64 时的典型值）
  fr.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800 });
  // 抽屉被贴在棋盘的 (100,30) 上（placeLobbyOverBoard 的产物）
  dr.getBoundingClientRect = () => ({ left: 100, top: 30, width: 420, height: 420, right: 520, bottom: 450 });

  window.lobbyOpen = true;
  window.syncCornerToGame();
  check('宽度 = 👤 角标宽度（不再是写死的 36px）', corner.style.width === '64px', corner.style.width);
  check('左对齐 👤（120-100=20）', corner.style.left === '20px', corner.style.left);
  check('上对齐 👤（40-30=10）', corner.style.top === '10px', corner.style.top);
  check('✕ 字号随格子缩放（width × 0.5）', corner.style.fontSize === '32.00px', corner.style.fontSize);

  // 角标被游戏隐藏（rect 为 0，如直开 game.html）时不得写出 0 尺寸 / NaN
  fakeRect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
  window.syncCornerToGame();
  check('量不到时不改写（保留上一次的 64px）', corner.style.width === '64px', corner.style.width);
  check('量不到时 left 保持上一次的 20px（不写 NaN / 0）',
    corner.style.left === '20px' && !/NaN/.test(corner.style.left), corner.style.left);

  // 样式层面：白圈 + 绿光晕必须与游戏 `.on` 角标一字不差，否则一眼看出不是同一颗
  const css = Array.from(doc.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  check('角标带白圈（与游戏 .on 态同款 inset）', /0 0 0 2px #fff inset/.test(css));
  check('角标带绿色光晕 + 同款过渡', /0 2px 8px rgba\(46,204,113,\.5\)/.test(css) && /transition:filter \.15s/.test(css));
  window.lobbyOpen = false;
}

console.log('\n[8] 全程无报错');
check('无 console.error / jsdomError', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n通过 ${ok.length} 项，失败 ${bad.length} 项`);
// 外壳里有 setInterval(syncBattleMode) 轮询，不显式退出会让 node 挂着不结束
try { dom.window.close(); } catch (e) {}
if (bad.length) { console.log('失败项：\n  ' + bad.join('\n  ')); process.exit(1); }
process.exit(0);
