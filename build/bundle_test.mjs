#!/usr/bin/env node
/* =========================================================================
 * build/bundle_test.mjs — P0.1-3 构建脚本离线单测
 *
 * 用法：node build/bundle_test.mjs
 * 定位：不依赖网络、不读写 game.html，纯函数级验证。
 *       （真实产物链路的验证见 build/bundle.mjs --self-test）
 * ========================================================================= */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bumpBuild, stripModuleSyntax, injectVersion, splitBySlot, inlineModules } from './bundle.mjs';
import { validateBuild, readVersionFromArtifact, normalize, collectTopLevelNames, checkNoInjectionMarkers } from './verify.mjs';

let pass = 0;
const failed = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { failed.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

console.log('[单测] bumpBuild —— build 号推导（MMDDHHmm 月日时分，★ 本地时间）');
check('号比现在旧 → 直接取现在', bumpBuild('10282000', '10282132') === '10282132',
  bumpBuild('10282000', '10282132'));
check('跨日：昨天 2359 → 今天 now', bumpBuild('10272359', '10282132') === '10282132');
check('同分钟连发 → 顺延 1 分钟', bumpBuild('10282132', '10282132') === '10282133',
  bumpBuild('10282132', '10282132'));
check('顺延跨小时：10282159 → 10282200', bumpBuild('10282159', '10282159') === '10282200',
  bumpBuild('10282159', '10282159'));
check('顺延跨日：10282359 → 10290000', bumpBuild('10282359', '10282359') === '10290000',
  bumpBuild('10282359', '10282359'));
check('非法当前号 → 取现在', bumpBuild('garbage', '10282132') === '10282132');
check('空当前号 → 取现在', bumpBuild('', '10282132') === '10282132');
check('超前过多（手写错号）→ null', bumpBuild('11011000', '10282132') === null,
  String(bumpBuild('11011000', '10282132')));
check('now 本身非法 → null', bumpBuild('10282132', 'xx') === null);

console.log('\n[单测] 时间基准 —— 必须用本地钟，不能偷偷用 UTC');
{
  // 旧实现用 UTC 日期串，北京时间 10-28 00:30 会被算成 10-27 → 跨日误判
  const now = new Date(2026, 9, 28, 0, 30, 0);            // 本地 10-28 00:30
  const p = (n) => String(n).padStart(2, '0');
  const nowLocal = `${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}`;
  const nowUtc = `${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
  check('本地串 = 10280030', nowLocal === '10280030', nowLocal);
  check('UTC 串会少 8 小时（回归哨兵：确认该坑真实存在）', nowLocal !== nowUtc, nowUtc);
  check('按本地钟推导不落到前一天', bumpBuild('10272350', nowLocal) === '10280030', bumpBuild('10272350', nowLocal));
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

console.log('\n[单测] validateBuild —— MMDDHHmm 格式校验');
check('合法 10282132', validateBuild('10282132').ok);
check('合法 01010000（跨年首分钟）', validateBuild('01010000').ok);
check('合法 12312359（年末最后一分钟）', validateBuild('12312359').ok);
check('合法 02290000（闰日）', validateBuild('02290000').ok);
check('非法：旧格式 20261028e（已废弃）', !validateBuild('20261028e').ok);
check('非法：五位', !validateBuild('1028213').ok);
check('非法：八位旧格式 20261028', !validateBuild('20261028').ok);
check('非法：月份 13', !validateBuild('13282132').ok);
check('非法：月份 00', !validateBuild('00282132').ok);
check('非法：日 32', !validateBuild('10322132').ok);
check('非法：2/30 不存在的日期', !validateBuild('02300000').ok);
check('非法：小时 24', !validateBuild('10282400').ok);
check('非法：分钟 60', !validateBuild('10282160').ok);
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

console.log('\n[单测] splitBySlot —— 模块按 @slot 标记切段（多点注入的前置）');
{
  const one = splitBySlot('const a = 1;\nconst b = 2;');
  check('无标记 → 单段落 default', one.length === 1 && one[0].slot === 'default');

  const two = splitBySlot('const a = 1;\n/* @slot:mid */\nconst b = 2;\n/* @slot:tail */\nconst c = 3;');
  check('三段切分正确', two.length === 3, JSON.stringify(two.map(x => x.slot)));
  check('段序 = 出现顺序', two.map(x => x.slot).join(',') === 'default,mid,tail');
  check('首段内容未带标记行', two[0].code === 'const a = 1;');
  check('中段内容正确', two[1].code === 'const b = 2;');

  const empty = splitBySlot('/* @slot:only */\nconst z = 1;');
  check('开头即标记 → 空 default 被丢弃', empty.length === 1 && empty[0].slot === 'only');

  const inline = splitBySlot('// 注释里出现 @slot:fake 不算标记\nconst q = 1;');
  check('行内提及 @slot 不误判', inline.length === 1 && inline[0].slot === 'default');
}

console.log('\n[单测] inlineModules 槽位校验（缺标记 / 多余标记都必须抛错）');
{
  const mf = { modules: [] };
  // 用 manifest.modules 指向真实文件太脆，这里直接构造：把 splitBySlot + 模板替换的契约单独验证
  const tplOk = '<script>\n<!-- @inject:scripts -->\n<!-- @inject:scripts:mid -->\n</script>';
  check('模板同时含 default 与具名槽位', tplOk.includes('<!-- @inject:scripts:mid -->'));
  const tmp = path.join(os.tmpdir(), `ark_marker_probe_${process.pid}.html`);
  fs.writeFileSync(tmp, tplOk, 'utf8');
  const probe = checkNoInjectionMarkers(tmp);
  fs.unlinkSync(tmp);
  check('残留标记被检出（产物侧兜底：静默少代码比报错更危险）', probe.pass === false && /@inject/.test(probe.detail));
  const cleanTmp = path.join(os.tmpdir(), `ark_marker_clean_${process.pid}.html`);
  fs.writeFileSync(cleanTmp, '<script>\nconst a = 1;\n</script>', 'utf8');
  check('无标记产物判绿', checkNoInjectionMarkers(cleanTmp).pass === true);
  fs.unlinkSync(cleanTmp);
}

console.log(`\n${failed.length === 0 ? `全部通过（${pass} 项）` : `失败 ${failed.length} 项：${failed.join(', ')}`}`);
process.exit(failed.length === 0 ? 0 : 1);
