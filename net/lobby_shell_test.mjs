/* 外壳（已内联进 game.html）行为回归 —— ISSUE-20261029-45 重写
 * ----------------------------------------------------------------------------
 * 这个文件的前身测的是「index.html 外壳 + iframe 里装 game.html」，
 * 合并成单文件后那个结构不存在了，所以整体重写为「单文档」口径：
 *
 *   [1] 单文件结构：iframe 边界确实没了
 *   [2] 打开即进游戏（无主页）
 *   [3] 面板开合：arkOpenLobby / 角标 / 遮罩 / Esc 四条路径
 *   [4] 榜单：同名合并、自己高亮、[我]→[编辑]、未上榜兜底入口
 *   [5] 编辑抽屉：内联展开在自己那行下方、说明文字口径、改名不新注册
 *   [6] 竖屏密度：390x844 下面板高度够放 8 名
 *   [7] 滚动条：细窄半透明，非系统白色
 *   [8] 全程无报错
 *
 * 用法：
 *   NODE_PATH=/path/to/node_modules node net/lobby_shell_test.mjs
 *   ARK_SHELL_HTML=<产物绝对路径> 可指定被测文件（默认 build/out/game.html）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.error('缺少 jsdom：先 npm i jsdom，再用 NODE_PATH 指向它的 node_modules');
  process.exit(2);
}

const SHELL = process.env.ARK_SHELL_HTML || 'build/out/game.html';
const html = fs.readFileSync(SHELL, 'utf8');

const errors = [];
const vc = new VirtualConsole();
const isCanvasNoise = (s) => /getContext|Not implemented/.test(s);
vc.on('jsdomError', (e) => {
  const m = e && e.message ? e.message : String(e);
  if (!isCanvasNoise(m)) errors.push('jsdomError: ' + m);
});
vc.on('error', (...a) => {
  const m = a.join(' ');
  if (!isCanvasNoise(m)) errors.push('console.error: ' + m);
});

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/game.html',
  virtualConsole: vc,
  beforeParse(window) {
    /* 外壳只读 leaderboard.json / api/leaderboard：测试里一律当离线处理 */
    window.fetch = () => Promise.reject(new Error('offline'));
    window.matchMedia = (q) => ({
      media: q, matches: false,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    });
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.HTMLCanvasElement.prototype.getContext = function () {
      const base = {
        measureText: () => ({ width: 8 }), canvas: this,
        createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: [] }),
      };
      return new Proxy(base, { get: (t, k) => (k in t ? t[k] : function () {}), set: (t, k, v) => { t[k] = v; return true; } });
    };
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  },
});

const { window } = dom;
const doc = window.document;
const NS = () => window.ArkShell;
const $ = (id) => doc.getElementById(id);
const ok = [], bad = [];
function check(name, cond, detail = '') {
  (cond ? ok : bad).push(name);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  <' + detail + '>' : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await sleep(300);
console.log('被测产物：' + SHELL + '\n');

/* ---------------------------------------------------------------- [1] */
console.log('[1] 单文件结构：iframe 边界确实没了');
{
  check('没有 #gameWrap 容器', $('gameWrap') === null);
  check('没有 game iframe', doc.querySelector('iframe#game') === null);
  check('没有 #hooksrc 注入块', $('hooksrc') === null);
  check('没有 #loading 遮罩', $('loading') === null);
  check('#arkUi 外壳容器存在', !!$('arkUi'));
  const iframes = doc.querySelectorAll('iframe');
  check('只剩 1 条 iframe（完整排行榜）', iframes.length === 1,
    iframes.length ? iframes[0].id : '0');
  check('ArkShell 命名空间已建立', !!NS() && !!NS().panel && !!NS().board && !!NS().account);
}

/* ---------------------------------------------------------------- [2] */
console.log('\n[2] 打开即进游戏（无主页）');
{
  check('没有 #home 屏', $('home') === null);
  check('没有「开始游戏」按钮', $('btnStart') === null);
  check('棋盘已建出格子', doc.querySelectorAll('#board .cell').length > 0,
    String(doc.querySelectorAll('#board .cell').length));
  check('当前在选角相位', window.eval('typeof phase !== "undefined" ? phase : ""') === 'char_select',
    window.eval('typeof phase !== "undefined" ? phase : ""'));
}

/* ---------------------------------------------------------------- [3] */
console.log('\n[3] 面板开合：四条路径');
{
  const d = $('lobbyDrawer'), m = $('lobbyMask'), btn = $('lobbyOpenBtn');
  check('初始未打开', !d.classList.contains('on'));

  window.arkOpenLobby();
  check('arkOpenLobby() 打开面板', d.classList.contains('on'));
  check('遮罩同步打开', m.classList.contains('on'));
  check('游戏侧角标同步高亮（.on + aria-expanded）',
    btn.classList.contains('on') && btn.getAttribute('aria-expanded') === 'true');
  check('属性 aria-hidden 同步为 false', d.getAttribute('aria-hidden') === 'false');

  window.arkOpenLobby();
  check('再按一次角标关闭', !d.classList.contains('on') && btn.getAttribute('aria-expanded') === 'false');

  window.arkOpenLobby();
  m.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('点遮罩关闭', !d.classList.contains('on'));

  window.arkOpenLobby();
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc 关闭', !d.classList.contains('on'));

  window.arkOpenLobby();
  $('lobbyCornerClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('左上角 ✕ 角标关闭', !d.classList.contains('on'));
}

/* ---------------------------------------------------------------- [4] */
console.log('\n[4] 榜单：同名合并 / 自己高亮 / [编辑] / 未上榜兜底');
{
  const entries = [
    { id: 'dev_me', name: '阿米娅1234', level: 9, kills: 12, runs: 3 },
    { id: 'u2', name: '凯尔希', level: 8, kills: 20, runs: 5 },
    { id: 'u3', name: '阿米娅', level: 6, kills: 40, runs: 2 },   // 与第一条同名（剥口令后）
    { id: 'u4', name: '能天使', level: 7, kills: 9, runs: 1 },
    { id: 'u5', name: '德克萨斯', level: 5, kills: 3, runs: 2 },
    { id: 'u6', name: '闪灵', level: 4, kills: 30, runs: 1 },
    { id: 'u7', name: '夜莺', level: 3, kills: 2, runs: 1 },
    { id: 'u8', name: '星熊', level: 2, kills: 1, runs: 1 },
    { id: 'u9', name: '塞雷娅', level: 1, kills: 0, runs: 1 },
  ];
  NS().app.myId = 'dev_me';
  NS().app.myName = '阿米娅';
  NS().board.apply({ entries: entries, updated_at: 1761744000 });
  NS().board.paint();

  const lis = doc.querySelectorAll('#miniBoard > li');
  /* 9 条原始 → 阿米娅合并 1 条 = 8 条榜单行；自己在榜所以不需要 setRow */
  check('同名账户合并为一条（9 条 → 8 行）', lis.length === 8, String(lis.length));
  const names = [...lis].map((li) => (li.querySelector('.nm') || {}).textContent);
  check('合并后取最高层（阿米娅 = 第 9 层）',
    names.includes('阿米娅') && lis[names.indexOf('阿米娅')].querySelector('.lv').textContent === '第 9 层');
  check('公开位置不出现口令数字', !names.join(',').match(/阿米娅\d{4}/));

  const me = doc.querySelector('#miniBoard > li.me');
  check('自己那行有 .me 高亮', !!me);
  const editBtn = me && me.querySelector('.meEdit');
  check('名字右侧是 [编辑] 按钮（不再是 [我] 徽标）', !!editBtn && editBtn.textContent === '编辑',
    editBtn ? editBtn.textContent : '');
  check('不再有 .tag [我] 徽标', doc.querySelector('#miniBoard .tag') === null);
  check('未上榜兜底行不该出现（自己在榜）', $('btnSetName') === null);

  /* 未上榜场景 */
  NS().app.myId = 'dev_nobody';
  NS().app.myName = '还没上榜的人';
  NS().board.paint();
  check('未上榜时出现「设置名字」入口', !!$('btnSetName'),
    $('btnSetName') ? $('btnSetName').textContent : '');
  check('未上榜时没有 .me 行', doc.querySelector('#miniBoard > li.me') === null);
}

/* ---------------------------------------------------------------- [5] */
console.log('\n[5] 编辑抽屉：内联展开在自己那行下方 + 改名不新注册');
{
  /* 回到「我在榜上」的场景 */
  NS().app.myId = 'dev_me';
  NS().app.myName = '阿米娅';
  NS().app.myAccount = '阿米娅1234';
  NS().board.apply({ entries: [{ id: 'dev_me', name: '阿米娅1234', level: 9, kills: 12, runs: 3 }] });
  NS().board.paint();

  const me = doc.querySelector('#miniBoard > li.me');
  check('重新渲染后自己在榜', !!me);

  me.querySelector('.meEdit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const row = doc.querySelector('#miniBoard > li.editRow');
  check('点 [编辑] 后出现内联编辑行', !!row);
  check('编辑行紧跟在「自己那一行」后面', !!row && row.previousElementSibling === me);
  check('编辑行里有名字输入框', !!$('pName'));
  check('编辑行里的输入框预填当前账号',
    $('pName') && $('pName').value === '阿米娅1234', $('pName') ? $('pName').value : '');
  check('编辑行里有保存按钮', !!$('pSave'));

  const note = row.querySelector('.ednote');
  const noteText = note ? note.textContent.replace(/\s+/g, '') : '';
  const expected = '名字只能用汉字或英文，后面的数字是口令：只在你编辑时显示，永远不会出现在排行榜上。记住整串（如「阿米娅1234」），换设备输入同一串就能找回同一账号';
  check('说明文字与需求原文一致', noteText === expected.replace(/\s+/g, ''),
    noteText === expected.replace(/\s+/g, '') ? '' : noteText.slice(0, 40) + '…');

  /* 非法输入 → 就地报错，不改账号 */
  $('pName').value = '1234';
  $('pSave').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('非法输入就地报错', $('pErr') && !$('pErr').hidden && !!$('pErr').textContent,
    $('pErr') ? $('pErr').textContent : '');
  check('非法输入不改本机账号', NS().app.myAccount === '阿米娅1234', NS().app.myAccount);

  /* 合法输入 → 改名走 renameAccount（不是新建账号） */
  let renameArgs = null;
  const origRename = NS().account.renameAccount;
  NS().account.renameAccount = function (name, code) { renameArgs = [name, code]; };
  $('pName').value = '罗德岛博士5678';
  $('pSave').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('合法输入后调用 renameAccount', !!renameArgs && renameArgs[0] === '罗德岛博士' && renameArgs[1] === '5678',
    renameArgs ? renameArgs.join(' / ') : 'null');
  check('本机账号已更新', NS().app.myAccount === '罗德岛博士5678', NS().app.myAccount);
  check('改名后不标记为新账号（不新注册）', NS().app.isNewAccount === false);
  check('保存后编辑行收起', doc.querySelector('#miniBoard > li.editRow') === null);
  NS().account.renameAccount = origRename;
}

/* ---------------------------------------------------------------- [6] */
console.log('\n[6] 竖屏密度：390x844 下面板够放 8 名');
{
  const board = $('board');
  /* jsdom 不做真实布局，量出来的 rect 全是 0 —— 这里按 iPhone 12 竖屏打桩：
     棋盘正方形 390x390，顶栏之下从 y=40 开始 */
  board.getBoundingClientRect = () => ({ left: 0, top: 40, width: 390, height: 390, right: 390, bottom: 430 });
  NS().panel.place();
  const d = $('lobbyDrawer');
  const h = parseInt(d.style.height, 10);
  check('面板高度至少容得下 8 行（8 × 42 + 96 = 432）', h >= 432, d.style.height);
  check('面板高度不超出视口（844 - 40 - 6 = 798）', h <= 798, d.style.height);
  check('面板贴到棋盘左上角', d.style.left === '0px' && d.style.top === '40px',
    d.style.left + ',' + d.style.top);
  check('面板宽度 = 棋盘宽度', d.style.width === '390px', d.style.width);

  /* 单行高度：CSS 里 min-height:38 + margin-bottom:4 → 8 行 = 336，加头部/底部 96 = 432 */
  const cssLi = html.match(/#arkUi #miniBoard > li \{[^}]*\}/);
  check('榜单行 min-height 压到 38px', !!cssLi && /min-height:38px/.test(cssLi[0]),
    cssLi ? cssLi[0].replace(/\s+/g, ' ').slice(0, 70) : '');
}

/* ---------------------------------------------------------------- [7] */
console.log('\n[7] 滚动条：细窄半透明，非系统白色');
{
  check('声明 scrollbar-width:thin（Firefox / 新 Chromium）', /scrollbar-width:\s*thin/.test(html));
  check('声明 scrollbar-color 半透明', /scrollbar-color:\s*rgba\(255,255,255,\.22\)\s*transparent/.test(html));
  check('接管 ::-webkit-scrollbar（覆盖系统白色默认样式）', /::-webkit-scrollbar\s*\{[^}]*width:\s*6px/.test(html));
  check('thumb 是半透明圆角', /::-webkit-scrollbar-thumb\s*\{[^}]*rgba\(255,255,255,\.22\)[^}]*border-radius/.test(html));
  check('轨道透明（不画白底）', /::-webkit-scrollbar-track\s*\{\s*background:\s*transparent/.test(html));
}

/* ---------------------------------------------------------------- [8] */
console.log('\n[8] 全程无报错');
check('无 jsdomError / console.error（canvas 噪声已过滤）', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n全部通过（${ok.length} 项）`);
if (bad.length) {
  console.log(`失败 ${bad.length} 项：` + bad.join('、'));
  process.exit(1);
}
/* 不用 dom.window.close()：产物里有 300ms 轮询与延迟回调，关窗后仍可能触发一次
   render()，会在 document 已销毁时抛 TypeError 把退出码弄脏。直接硬退出。 */
process.exit(0);
