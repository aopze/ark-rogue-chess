#!/usr/bin/env node
/* =========================================================================
 * build/bundle_test.mjs — P0.1-3 构建脚本离线单测
 *
 * 用法：node build/bundle_test.mjs
 * 定位：不依赖网络、不读写 game.html，纯函数级验证。
 *       （真实产物链路的验证见 build/bundle.mjs --self-test）
 * ========================================================================= */
import { bumpBuild, stripModuleSyntax, injectVersion } from './bundle.mjs';
import { validateBuild, readVersionFromArtifact, normalize, collectTopLevelNames } from './verify.mjs';

let pass = 0;
const failed = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { failed.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

console.log('[单测] bumpBuild —— build 号推导（★ 本地日期，非 UTC）');
check('同日递增：20261028a → 20261028b', bumpBuild('20261028a', '20261028') === '20261028b',
  bumpBuild('20261028a', '20261028'));
check('同日递增：20261028b → 20261028c', bumpBuild('20261028b', '20261028') === '20261028c');
check('跨日重置：20261027c (today=20261028) → 20261028a', bumpBuild('20261027c', '20261028') === '20261028a',
  bumpBuild('20261027c', '20261028'));
check('跨日重置：20261001z (today=20261028) → 20261028a', bumpBuild('20261001z', '20261028') === '20261028a');
check('非法输入 → 当天 a', bumpBuild('garbage', '20261028') === '20261028a');
check('空输入 → 当天 a', bumpBuild('', '20261028') === '20261028a');
check('未来日期 → null（视为异常，不推导）', bumpBuild('20261231a', '20261028') === null,
  String(bumpBuild('20261231a', '20261028')));
check('后缀到 z 再加 → null（一天 26 版属异常）', bumpBuild('20261028z', '20261028') === null);

console.log('\n[单测] 时区回归 —— 曾因用 UTC 把「同日发版」误判为未来日期');
{
  // 北京时间 2026-10-28 凌晨，UTC 仍是 10-27；人类写的是 20261028a
  const utcDay = '20261027';
  const localDay = '20261028';
  const byUtc = bumpBuild('20261028a', utcDay);           // 旧实现：null（错误）
  const byLocal = bumpBuild('20261028a', localDay);        // 正确：20261028b
  check('UTC 日期会误判（回归哨兵：确认该场景确实会被旧逻辑判死）', byUtc === null);
  check('本地日期推导正确', byLocal === '20261028b');
}

console.log('\n[单测] stripModuleSyntax —— ESM 语法剥离');
{
  const code = `import { A } from './a.js';
export const B = 1;
export function f() { return A + B; }
export class C {}
export { B as BB };
const keep = 1;`;
  const out = stripModuleSyntax(code, 'test');
  check('剥离 import', !/import\s/.test(out));
  check('剥离 export（保留声明）', /const B = 1/.test(out) && /function f\(\)/.test(out) && /class C/.test(out));
  check('无 export 残留', !/^\s*export\s/m.test(out));
  check('保留普通代码', /const keep = 1/.test(out));
}
{
  // export default 无法安全内联，必须拦下而不是静默产出坏产物
  let threw = false;
  try { stripModuleSyntax('export default function(){}', 'test'); } catch { threw = true; }
  check('export default → 抛错（不静默产出坏产物）', threw);
}
{
  // 多行 import 会被跨行正则剥离 —— 这里要验证的是「剥离干净且没误删后续代码」
  const multi = `import {
  a,
  b
} from './x.js';
const y = 1;
const z = 2;`;
  const out = stripModuleSyntax(multi, 'test');
  check('多行 import 被剥离', !/import\s/.test(out));
  check('多行 import 后紧跟的代码保留（未误删）', /const y = 1/.test(out));
  check('更靠后的代码保留（未越界吞掉）', /const z = 2/.test(out));
}
{
  // 只有 export default 是真正无法安全内联的（语义需改名），必须拦下
  let threw = false;
  try { stripModuleSyntax('export default function(){}', 'test'); } catch { threw = true; }
  check('export default → 抛错（语义无法自动迁移）', threw);
}

console.log('\n[单测] injectVersion —— 版本注入幂等性');
{
  const withObj = `<script>\nwindow.__ARK_VERSION__ = {\n  version: 'old',\n  build: 'old',\n  commit: 'old',\n  builtAt: 'old'\n};\n</script>`;
  const r1 = injectVersion(withObj, { version: 'v1', build: '20261028b', commit: 'abc1234', builtAt: 'T' });
  check('重写既有对象', r1.mode === 'rewrote' && r1.html.includes("build:   '20261028b'"));
  check('重写后只剩一个版本对象', (r1.html.match(/window\.__ARK_VERSION__/g) || []).length === 1);
  const r2 = injectVersion(r1.html, { version: 'v2', build: '20261028c', commit: 'def', builtAt: 'T2' });
  check('二次注入仍只有一个对象（幂等）', (r2.html.match(/window\.__ARK_VERSION__/g) || []).length === 1);
  check('二次注入更新了值', r2.html.includes("build:   '20261028c'"));
}
{
  const withPh = `<script><!-- @inject:version --></script>`;
  const r = injectVersion(withPh, { version: 'v', build: 'b', commit: 'c', builtAt: 'd' });
  check('无对象时插入占位处', r.mode === 'inserted' && r.html.includes("build:   'b'"));
}
{
  const none = `<script>const a = 1;</script>`;
  const r = injectVersion(none, { version: 'v', build: 'b', commit: 'c', builtAt: 'd' });
  check('无锚点 → skipped（不破坏文件）', r.mode === 'skipped' && r.html === none);
}

console.log('\n[单测] validateBuild —— 格式校验');
check('合法 20261028a', validateBuild('20261028a').ok);
check('合法 20261231z', validateBuild('20261231z').ok);
check('非法：小写日期缺失后缀', !validateBuild('20261028').ok);
check('非法：后缀为数字', !validateBuild('202610281').ok);
check('非法：月份 13', !validateBuild('20261328a').ok);
check('非法：空', !validateBuild('').ok);

console.log('\n[单测] normalize —— 一致性比对的归一化');
{
  const a = `<!-- c -->const x = 1; /* y */ window.__ARK_VERSION__ = { build: '20261028a' };`;
  const b = `const x = 1; window.__ARK_VERSION__ = { build: '20261028b' };`;
  check('抹平注释与版本差异后应一致', normalize(a) === normalize(b));
  const c = `const x = 2;`;
  check('实质改动仍能被检出', normalize(a) !== normalize(c));
  check('不抹平版本时差异可见', normalize(a, { stripVersion: false }) !== normalize(b, { stripVersion: false }));
}

console.log('\n[单测] collectTopLevelNames —— 顶层定义名提取（无重复定义校验的前置）');
{
  const body = `function alpha(a) {\n  const beta = 1;\n  function gamma() {}\n}\nconst delta = { x: 1 };\nlet eps = 2;`;
  const names = collectTopLevelNames(body);
  check('顶层 function 被提取', names.includes('alpha'));
  check('顶层 const / let 被提取', names.includes('delta') && names.includes('eps'));
  check('函数内嵌套定义不算顶层', !names.includes('beta') && !names.includes('gamma'));
  check('async function 被提取', collectTopLevelNames('async function zeta() {}').includes('zeta'));
}

console.log(`\n${failed.length === 0 ? `全部通过（${pass} 项）` : `失败 ${failed.length} 项：${failed.join(', ')}`}`);
process.exit(failed.length === 0 ? 0 : 1);
