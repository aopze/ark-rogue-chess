/* 实战回归：新 UI（正方形棋盘 / 抽屉 / 手机圆钮 / 右键技能节点）在真实回合里不炸
 *
 * 为什么要单独写：`layout_chrome_test` 只验证「组件本身」正确（开合、互斥、数值、判据），
 * 全部在**静止**的 planning 界面上测。而本版改动里最危险的是**结算期间**的状态：
 *   - render() 每帧调 updateStats() → 末尾还会调 syncVirtualPad() 与 renderAbilityDrawer()，
 *     抽屉开着时若某个数值函数依赖已清空的 enemies / playerPath，结算中途就会抛异常；
 *   - 抽屉遮罩 + pointer-events 会吞掉棋盘事件，若某条路径在结算中重新打开抽屉，可能递归；
 *   - 圆钮在 resolving / levelclear 阶段必须 disable，但**不禁用就点了**会走进 PLAN 分支。
 * 这些只有真的打几回合才暴露，所以这里跑「4 角色 × 3 回合」的实操，而不是断言数值。
 *
 * 判据只看「有没有炸」：pageError / jsdomError / console.error 计数为 0，
 * 且每回合结束后 phase 必须落回 planning / levelclear / gameover 三者之一。
 * 平衡数值不在这里测（本版未改任何规则与数值，平衡口径见 README §平衡与门禁）。
 *
 * 用法：
 *   NODE_PATH=/path/to/node_modules ARK_GAME_HTML=<产物绝对路径> node net/battle_ui_test.mjs
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

const GAME_URL = process.env.ARK_GAME_HTML
  ? new URL('file:///' + process.env.ARK_GAME_HTML.replace(/\\/g, '/').replace(/^\//, ''))
  : new URL('../game.html', import.meta.url);
const html = fs.readFileSync(GAME_URL, 'utf8');

const ok = [], bad = [];
const check = (name, cond, extra) => {
  (cond ? ok : bad).push(name);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? `  <${extra}>` : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 确定性随机（NB-06 禁 Math.random 是给游戏代码的，测试里也照样用 LCG，
 * 免得「今天过明天红」——回归必须可复现） */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeWindow({ coarse = false } = {}) {
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
          measureText: () => ({ width: 8 }), canvas: this,
          createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: [] }),
        };
        return new Proxy(base, {
          get: (t, k) => (k in t ? t[k] : function () {}),
          set: (t, k, v) => { t[k] = v; return true; },
        });
      };
      window.matchMedia = (q) => ({
        media: q,
        matches: coarse ? (/\(pointer:\s*coarse\)/.test(q) && !/any-pointer/.test(q)) : /\(any-pointer:\s*fine\)/.test(q),
        addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      });
      /* 结算靠 setTimeout(300) 起步 + 逐格动画：真等的话 12 回合要好几分钟。
       * 这里把定时器压扁到 1ms（保留「异步顺序」这一点，只压缩墙钟）。 */
      const rawTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...rest) => rawTimeout(fn, Math.min(ms || 0, 1), ...rest);
      window.requestAnimationFrame = (cb) => rawTimeout(() => cb(Date.now()), 1);
      /* jsdom 没有 Web Animations API：board-fx.js 的 floatTextAt / ringFx 都靠
       * `el.animate(...).finished` 决定何时移除节点。真实浏览器（Chrome 84+ / Safari 13.1+ /
       * Firefox 75+）都有，所以这是**测试环境缺口**而不是游戏缺陷 —— 补最小实现即可，
       * 不要去给游戏代码加 guard（会掩盖真正的老浏览器兼容问题）。 */
      if (!window.Element.prototype.animate) {
        window.Element.prototype.animate = function (frames, opts) {
          const dur = (opts && opts.duration) || 0;
          return {
            finished: new Promise((res) => rawTimeout(res, Math.min(dur, 1))),
            cancel() {}, finish() {}, play() {}, pause() {}, reverse() {},
            currentTime: 0, playState: 'running',
          };
        };
      }
      Object.defineProperty(window, 'innerWidth', { value: coarse ? 390 : 1280, configurable: true, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: coarse ? 844 : 800, configurable: true, writable: true });
    },
  });
  return { dom, w: dom.window, d: dom.window.document, errors };
}

/* 等 phase 落到某处（结算链是纯异步的，只能等） */
async function waitPhase(w, want, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (want.includes(w.eval('phase'))) return w.eval('phase');
    await sleep(10);
  }
  return w.eval('phase');
}

/* 一回合：随机点几下方向键（能走就走），再确认 */
function planTurn(w, rand) {
  const dirs = ['w', 'a', 's', 'd'];
  const n = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const k = dirs[Math.floor(rand() * 4)];
    try { w.eval(`stepPathByDir('${k}')`); } catch (e) { return String(e); }
  }
  return null;
}

console.log('[1] 桌面端（any-pointer:fine）：4 角色 × 3 回合实战 + 抽屉/说明卡/右键技能节点');

{
  const { dom, w, d, errors } = makeWindow();
  await sleep(300);
  const rand = lcg(20261028);
  const chars = ['fencer', 'amiya', 'wheelchair', 'vampire'];
  const planErr = [];

  for (const c of chars) {
    w.eval(`selectCharacter('${c}')`);
    let ph = await waitPhase(w, ['planning']);
    if (ph !== 'planning') { planErr.push(`${c}: 进关 phase=${ph}`); continue; }

    let turns = 0, guard = 0;
    while (turns < 3 && guard++ < 40) {
      ph = w.eval('phase');
      if (ph === 'levelclear') {
        /* 通关路径：奖励弹窗 → 属性闸门 → 下一关，这三处都可能开抽屉 */
        try {
          w.eval('proceedNextLevel()');
        } catch (e) { planErr.push(`${c}: proceedNextLevel ${e}`); break; }
        await waitPhase(w, ['planning', 'levelclear']);
        continue;
      }
      if (ph !== 'planning') break;

      /* 每回合轮着开抽屉，制造「抽屉开着时结算」的最坏情况 */
      const which = turns % 3;
      try {
        if (which === 0) { w.eval("drawerOpen('stats')"); w.eval("openAbilityInfo('str')"); w.eval('drawerCloseLayer()'); }
        else if (which === 1) { w.eval("drawerOpen('settings')"); }
        else { w.eval("drawerOpen('stats')"); }
      } catch (e) { planErr.push(`${c}: drawer ${which} ${e}`); }

      const e1 = planTurn(w, rand);
      if (e1) { planErr.push(`${c}: stepPathByDir ${e1}`); break; }

      /* 右键技能节点：只在路径长度 >1 时成立（起点不算） */
      try {
        const len = w.eval('playerPath.length');
        if (len >= 2) w.eval('toggleSkill(1)');
      } catch (e) { planErr.push(`${c}: toggleSkill ${e}`); }

      try { w.eval('confirmAction()'); }
      catch (e) { planErr.push(`${c}: confirmAction ${e}`); break; }

      /* 结算中抽屉还开着 → 直接关掉，验证遮罩/焦点不会卡住流程 */
      try { w.eval('drawerClose()'); } catch (e) { planErr.push(`${c}: drawerClose ${e}`); }

      ph = await waitPhase(w, ['planning', 'levelclear', 'gameover']);
      if (ph === 'gameover') break;
      turns++;
    }
    console.log(`    ${c}: 打了 ${turns} 回合，结束 phase=${w.eval('phase')} 关卡=${w.eval('level')}`);
  }

  check('4 个角色都能进关并进入 planning', planErr.filter(x => /进关/.test(x)).length === 0,
    planErr.slice(0, 2).join(' | '));
  check('回合驱动全程无调用异常', planErr.length === 0, planErr.slice(0, 2).join(' | ') || 'ok');
  check('全程无 jsdomError / console.error', errors.length === 0, errors.slice(0, 2).join(' | ') || '0');
  /* jsdom 不做布局，offsetWidth 恒为 0 —— 必须读 style 上被写进去的像素值，
   * 否则这条断言永远「0 == 0」等于没测（正方形真正的判据在 layout_chrome_test [2]）。 */
  check('棋盘仍是正方形（结算后没有被写坏）', (() => {
    const bw = d.getElementById('boardWrap');
    const w2 = parseFloat(bw.style.width), h2 = parseFloat(bw.style.height);
    return w2 > 0 && Math.abs(w2 - h2) <= 2;
  })(), (() => {
    const bw = d.getElementById('boardWrap');
    return (bw.style.width || '∅') + ' × ' + (bw.style.height || '∅');
  })());

  /* 奖励弹窗：直接走 openLevelUp 的展示面，验证它不再自建 .lv-mask 而是进 drawer */
  w.eval('phase = "levelclear"');
  try { w.eval('pendingLevelUps = 1; openLevelUp()'); } catch (e) { errors.push('openLevelUp: ' + e); }
  check('升级弹窗进抽屉（不再创建 .lv-mask）', d.querySelectorAll('.lv-mask').length === 0);
  check('升级抽屉有内容', (d.getElementById('drawerLevelUpBody') || {}).innerHTML ?
    d.getElementById('drawerLevelUpBody').innerHTML.length > 40 : false);

  try { dom.window.close(); } catch (e) {}
}

console.log('\n[2] 手机端（pointer:coarse）：3 回合全用圆钮操作');

{
  const { dom, w, d, errors } = makeWindow({ coarse: true });
  await sleep(300);
  const rand = lcg(10282321);
  w.eval("selectCharacter('vampire')");
  const ph0 = await waitPhase(w, ['planning']);
  check('触屏环境进关即 planning', ph0 === 'planning', ph0);

  const btns = d.querySelectorAll('[data-vdir]');
  check('7 个圆钮就位', d.querySelectorAll('.vbtn').length === 7, String(d.querySelectorAll('.vbtn').length));

  let turns = 0;
  for (let i = 0; i < 3; i++) {
    if (w.eval('phase') !== 'planning') break;
    /* 点方向键（真实 pointerdown） */
    for (let k = 0; k < 2; k++) {
      const b = btns[Math.floor(rand() * btns.length)];
      if (b) b.dispatchEvent(new w.Event('pointerdown', { bubbles: true, cancelable: true }));
    }
    /* 攻击键短按 = 走 handleKvAction('attack') 的同一分支 */
    const atk = d.querySelector('[data-vact="attack"]');
    if (atk) {
      atk.dispatchEvent(new w.Event('pointerdown', { bubbles: true, cancelable: true }));
      atk.dispatchEvent(new w.Event('pointerup', { bubbles: true, cancelable: true }));
    }
    try { w.eval('confirmAction()'); } catch (e) { errors.push('confirmAction: ' + e); break; }
    const ph = await waitPhase(w, ['planning', 'levelclear', 'gameover']);
    if (ph === 'gameover') break;
    turns++;
  }
  check('圆钮驱动的回合能正常结算', w.eval('phase') !== 'resolving', w.eval('phase'));
  check('打了至少 1 回合', turns >= 1, String(turns));
  check('圆钮全程无异常', errors.length === 0, errors.slice(0, 2).join(' | ') || '0');
  check('结算后圆钮回到可用（planning）', w.eval('phase') === 'planning'
    ? Array.from(d.querySelectorAll('[data-vdir]')).every(b => !b.disabled) : true);

  try { dom.window.close(); } catch (e) {}
}

console.log('\n[3] 通关链路：onLevelClear → 属性闸门 → 下一关（新 UI 三处开抽屉都在这条路上）');

{
  const { dom, w, d, errors } = makeWindow();
  await sleep(300);
  w.eval("selectCharacter('amiya')");
  const ph0 = await waitPhase(w, ['planning']);
  check('第 1 关 planning', ph0 === 'planning', ph0);

  /* 前面 12 回合没人活到通关，所以这里直接清场触发，专测通关链 */
  w.eval('enemies.forEach(function (e) { e.alive = false; }); onLevelClear()');
  const ph1 = await waitPhase(w, ['levelclear', 'planning'], 4000);
  check('清场后进入 levelclear', ph1 === 'levelclear', ph1);

  /* 属性闸门：有点数时必须弹属性抽屉（且不覆盖通关面板） */
  w.eval('playerStats.abilityPoints = 1; enterAllocGate()');
  const statsOpen = w.eval("drawerIsOpen('stats')");
  check('属性闸门自动打开属性抽屉', statsOpen === true, String(statsOpen));
  /* drawerOpen('stats') 里的文案刷新走 requestAnimationFrame（要等滑入后画雷达 ·
   * clientWidth 才是非 0），所以这里必须让出一拍再读，否则读到的是空行。 */
  await sleep(60);
  check('抽屉里能读到剩余点数（#abilityPointsRow）',
    ((d.getElementById('abilityPointsRow') || {}).textContent || '').indexOf('剩余 1 点') === 0,
    ((d.getElementById('abilityPointsRow') || {}).textContent || '∅'));
  w.eval("allocateAbilityPoint('str'); playerStats.abilityPoints = 0; drawerClose()");

  w.eval('proceedNextLevel()');
  const ph2 = await waitPhase(w, ['planning'], 4000);
  check('下一关重新进入 planning', ph2 === 'planning', ph2);
  check('关卡号推进到 2', Number(w.eval('level')) === 2, String(w.eval('level')));
  check('新关路径已重置为单点起点', w.eval('playerPath.length') === 1, String(w.eval('playerPath.length')));
  check('通关链路无异常', errors.length === 0, errors.slice(0, 2).join(' | ') || '0');

  try { dom.window.close(); } catch (e) {}
}

console.log(`\n${bad.length === 0 ? `全部通过（${ok.length} 项）` : `失败 ${bad.length} 项：${bad.join('、')}`}`);
process.exit(bad.length === 0 ? 0 : 1);
