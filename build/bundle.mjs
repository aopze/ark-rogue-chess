#!/usr/bin/env node
/* =========================================================================
 * build/bundle.mjs — 单文件产物构建（P0.1-3）
 *
 * 把 src/** 按 build/manifest.json 的顺序内联进模板，产出根目录 game.html。
 *
 * ★ 三条硬约束（违反即失败）：
 *   1. NB-04：产物离线自包含，不得引入运行时外部依赖
 *   2. AC-23：产物 __ARK_VERSION__.build 由构建注入，且必须等于 index.html 的 var BUILD
 *   3. §0.0：写根目录 game.html 属发版动作，必须显式 --out game.html 且需人类授权
 *
 * 用法：
 *   node build/bundle.mjs                          # 试构建 → build/out/game.html（默认，安全）
 *   node build/bundle.mjs --out game.html          # ★发版：写根目录（需人类明确授权）
 *   node build/bundle.mjs --bump                   # 只算出下一个 build 号并打印，不改任何文件
 *   node build/bundle.mjs --prev <旧产物>          # 附带产物一致性比对（仅注释/空白差异）
 *   node build/bundle.mjs --no-build-check         # 跳过 AC-23（仅本地试构建，发布链路禁用）
 *   node build/bundle.mjs --self-test              # 用 tests/fixtures 迷你样例跑通内联管线
 *   node build/bundle.mjs --dry-run                # 只打印计划，不写文件
 * ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { ROOT, VER_OBJ_RE, readBuildFromIndex, validateBuild, runVerify, printVerify } from './verify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'out');
const DEFAULT_TEMPLATE = path.join(ROOT, 'templates', 'game.html');
const FALLBACK_TEMPLATE = path.join(ROOT, 'game.html');
const MANIFEST = path.join(__dirname, 'manifest.json');
const INDEX_HTML = path.join(ROOT, 'index.html');

/* ---------------------------------------------------------------- 参数 */

function parseArgs(argv) {
  const a = {
    template: null, out: path.join(OUT_DIR, 'game.html'), manifest: MANIFEST,
    prev: null, bump: false, selfTest: false, dryRun: false, noBuildCheck: false, force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    switch (s) {
      case '--template': a.template = argv[++i]; break;
      case '--out': a.out = argv[++i]; break;
      case '--manifest': a.manifest = argv[++i]; break;
      case '--prev': a.prev = argv[++i]; break;
      case '--bump': a.bump = true; break;
      case '--self-test': a.selfTest = true; break;
      case '--dry-run': a.dryRun = true; break;
      case '--no-build-check': a.noBuildCheck = true; break;
      case '--force': a.force = true; break;
      case '--help': a.help = true; break;
      default:
        if (s.startsWith('--') && s !== '--') { console.error('未知参数：' + s); process.exit(2); }
    }
  }
  return a;
}

/* ------------------------------------------------------------ build 号 */

const BUILD_FMT_RE = /^(\d{4})(\d{2})(\d{2})([a-z])$/;

/**
 * 今天的日期串。★ 用【本地日期】而非 UTC：
 * 人类维护 index.html 的 BUILD 时写的是本地日期（如北京时间 2026-10-28 凌晨写 20261028a，
 * 此时 UTC 仍是 10-27）。若这里用 UTC，会把同日发版误判为「跨日」甚至「未来日期」。
 */
function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 下一个 build 号：同日递增后缀（a→b），跨日重置为 'a'。 */
export function bumpBuild(current, today = todayStr()) {
  const m = String(current || '').match(BUILD_FMT_RE);
  if (!m) return `${today}a`;
  const [, y, mo, d, suffix] = m;
  const date = `${y}${mo}${d}`;
  if (date > today) return null;              // 未来日期，视为异常
  if (date < today) return `${today}a`;
  if (suffix >= 'z') return null;             // 一天发 26 版，明显异常
  return date + String.fromCharCode(suffix.charCodeAt(0) + 1);
}

/* --------------------------------------------------------- 元信息注入 */

/** 取当前提交 sha：git → 环境变量 → unknown。git 不通是本环境常态，故不致命。 */
function resolveCommit() {
  try {
    const sha = execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return { sha, source: 'git' };
  } catch { /* git 不可用，继续降级 */ }
  if (process.env.ARK_COMMIT && /^[0-9a-f]{7,40}$/.test(process.env.ARK_COMMIT)) {
    return { sha: process.env.ARK_COMMIT, source: 'env ARK_COMMIT' };
  }
  return { sha: 'unknown', source: '不可用（git 与环境均未给出）' };
}

/**
 * 幂等注入版本对象：
 *   - 已存在 window.__ARK_VERSION__ = {...}; → 重写该对象字面量
 *   - 否则在 <!-- @inject:version --> 占位处插入
 */
export function injectVersion(html, { version, build, commit, builtAt }) {
  const block = [
    'window.__ARK_VERSION__ = {',
    `  version: '${version}',`,
    `  build:   '${build}',`,
    `  commit:  '${commit}',`,
    `  builtAt: '${builtAt}'`,
    '};',
  ].join('\n');
  if (VER_OBJ_RE.test(html)) {
    return { html: html.replace(VER_OBJ_RE, block), mode: 'rewrote' };
  }
  const ph = /<!--\s*@inject:version\s*-->/;
  if (ph.test(html)) {
    return { html: html.replace(ph, block), mode: 'inserted' };
  }
  return { html, mode: 'skipped', reason: '既无既有版本对象，也无 <!-- @inject:version --> 占位' };
}

/* -------------------------------------------------------------- 内联 */

/** 剥离 ESM 语法：内联进同一个 <script> 上下文，不能保留 import/export。 */
export function stripModuleSyntax(code, fileLabel) {
  let out = code;
  out = out.replace(/^[ \t]*import\s+[\s\S]*?from\s*['"][^'"]+['"]\s*;?[ \t]*\r?\n?/gm, '');
  out = out.replace(/^[ \t]*import\s*['"][^'"]+['"]\s*;?[ \t]*\r?\n?/gm, '');
  out = out.replace(/^[ \t]*export\s+(?=(const|let|var|function|class|async)\b)/gm, '');
  out = out.replace(/^[ \t]*export\s*\{[^}]*\}\s*;?[ \t]*\r?\n?/gm, '');
  // 残留检测：内联进非 module script 会直接语法错误，必须拦下
  const leftover = out.split('\n').findIndex((l) => /^[ \t]*(import|export)\s/.test(l));
  if (leftover >= 0) {
    throw new Error(
      `${fileLabel} 存在无法自动剥离的模块语法（第 ${leftover + 1} 行）：${out.split('\n')[leftover].trim()}\n`
      + '        → 拆分阶段请避免多行 import / export default，或手工改写后再构建。'
    );
  }
  return out;
}

/** 按清单顺序内联模块到模板占位处。 */
export function inlineModules(templateHtml, manifest, label = 'manifest') {
  const modules = Array.isArray(manifest.modules) ? manifest.modules : [];
  const placeholder = manifest.placeholder || '<!-- @inject:scripts -->';

  if (modules.length === 0) {
    return { html: templateHtml, count: 0, warning: `${label} 的 modules 为空（P0.1-4 拆分前属正常）` };
  }

  const chunks = [];
  for (const mod of modules) {
    const rel = typeof mod === 'string' ? mod : mod.path;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) throw new Error(`清单中的模块不存在：${rel}`);
    const code = stripModuleSyntax(fs.readFileSync(abs, 'utf8'), rel);
    chunks.push(`/* ---- src: ${rel} ---- */\n${code.trim()}`);
  }
  const joined = chunks.join('\n\n');

  const ph = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!ph.test(templateHtml)) {
    throw new Error(`模板中未找到占位符：${placeholder}`);
  }
  return { html: templateHtml.replace(ph, joined), count: modules.length };
}

/* ------------------------------------------------------------ 主流程 */

function resolveTemplate(explicit) {
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`--template 指定的文件不存在：${explicit}`);
    return { path: explicit, fallback: false };
  }
  if (fs.existsSync(DEFAULT_TEMPLATE) && fs.statSync(DEFAULT_TEMPLATE).size > 1024) {
    return { path: DEFAULT_TEMPLATE, fallback: false };
  }
  return {
    path: FALLBACK_TEMPLATE,
    fallback: true,
    warning: 'templates/game.html 尚未产出（P0.1-4 机械拆分时从 game.html 剥离），本次使用根目录 game.html 作为基底（直通模式：只做版本注入与校验，不内联模块）',
  };
}

function build(args) {
  console.log('[构建] 方舟战棋 · 单文件产物');

  // 1) build 号：index.html 的 var BUILD 是唯一真值来源（§0.9）
  const idx = readBuildFromIndex(INDEX_HTML);
  if (!idx.ok) throw new Error(`读取 index.html 的 var BUILD 失败：${idx.reason}`);
  const fmt = validateBuild(idx.build);
  if (!fmt.ok) throw new Error(`index.html 的 var BUILD 不合法 —— ${fmt.reason}`);
  console.log(`  真值来源 index.html: var BUILD = '${idx.build}'`);

  const next = bumpBuild(idx.build);
  if (args.bump) {
    console.log(`\n  下一个 build 号：${next || '（无法推导，请检查 index.html 的 BUILD）'}`);
    console.log('  提示：index.html 是只读资产（NB-01），本脚本不会改写它 —— 需人工改后再构建。');
    return 0;
  }

  // 2) 模板
  const tpl = resolveTemplate(args.template);
  console.log(`  模板：${path.relative(ROOT, tpl.path)}${tpl.fallback ? '  ⚠️ 直通模式' : ''}`);
  if (tpl.warning) console.log(`  ⚠️  ${tpl.warning}`);

  // 3) 清单与内联
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  let html = fs.readFileSync(tpl.path, 'utf8');
  const inlined = inlineModules(html, manifest, path.relative(ROOT, args.manifest));
  html = inlined.html;
  console.log(`  内联模块：${inlined.count} 个${inlined.warning ? `  （${inlined.warning}）` : ''}`);

  // 4) 版本注入（AC-23：build 由构建注入，人工不得手改）
  const commit = resolveCommit();
  const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const version = manifest.version || '0.1.0-prototype';
  const iv = injectVersion(html, { version, build: idx.build, commit: commit.sha, builtAt });
  html = iv.html;
  console.log(`  版本注入：${iv.mode}  version='${version}' build='${idx.build}'  commit=${commit.sha.slice(0, 10)}（来源 ${commit.source}） builtAt=${builtAt}`);
  if (iv.mode === 'skipped') console.log(`  ⚠️  ${iv.reason}`);

  // 5) 输出
  const outAbs = path.resolve(ROOT, args.out);
  const isRoot = outAbs === path.join(ROOT, 'game.html');
  if (isRoot) {
    console.log('\n  🔴 目标为根目录 game.html —— 这属于发版动作（§0.0 / NB-12），需人类明确授权。');
    console.log('     若非发版，请去掉 --out game.html，默认会安全输出到 build/out/game.html。');
    if (!args.force && !process.env.ARK_RELEASE_OK) {
      console.log('     未检测到授权（--force 或 ARK_RELEASE_OK=1），已中止，未写入。');
      return 4;
    }
  }

  if (args.dryRun) {
    console.log(`\n  --dry-run：不写文件（目标 ${path.relative(ROOT, outAbs)}，${Buffer.byteLength(html, 'utf8')} B）`);
  } else {
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, html, 'utf8');
    console.log(`\n  已写出：${path.relative(ROOT, outAbs)}  ${fs.statSync(outAbs).size} B`);
    if (args.prev) console.log(`  比对基线：${path.relative(ROOT, path.resolve(ROOT, args.prev))}`);
  }

  // 6) 校验（AC-23 / NB-04 / 结构 / 一致性）
  if (args.dryRun) {
    console.log('  --dry-run：跳过产物校验');
    return 0;
  }
  console.log('\n[校验]');
  const v = runVerify(outAbs, { prev: args.prev, noBuildCheck: args.noBuildCheck, indexPath: INDEX_HTML });
  printVerify(v);
  const failed = v.results.filter((r) => !r.pass);
  if (failed.length) {
    console.log(`\n❌ 构建未完成：${failed.length} 项校验未通过`);
    return 1;
  }
  console.log('\n✅ 构建完成');
  if (!isRoot) {
    console.log(`   试构建产物在 ${path.relative(ROOT, outAbs)}；发版需显式 --out game.html 且经人类授权。`);
  }
  return 0;
}

/* -------------------------------------------------------- 自测（fixtures） */

function selfTest() {
  const fx = path.join(ROOT, 'tests', 'fixtures');
  const tpl = path.join(fx, 'mini-template.html');
  const mf = path.join(fx, 'mini-manifest.json');
  for (const f of [tpl, mf]) {
    if (!fs.existsSync(f)) { console.error('❌ 缺少 fixture：' + f); return 2; }
  }
  const out = path.join(OUT_DIR, 'mini-game.html');
  console.log('[自测] 用 tests/fixtures 迷你样例跑通内联管线');
  const rc = build({
    template: tpl, out, manifest: mf, prev: null,
    bump: false, dryRun: false, noBuildCheck: false, force: false,
  });
  if (rc !== 0) return rc;

  const html = fs.readFileSync(out, 'utf8');
  const checks = [];
  const ck = (name, cond, extra = '') => checks.push({ name, pass: !!cond, extra });

  const i1 = html.indexOf('FIRST_MODULE_MARKER');
  const i2 = html.indexOf('SECOND_MODULE_MARKER');
  ck('模块按清单顺序内联', i1 > 0 && i2 > i1, `first@${i1} second@${i2}`);
  ck('剥离 export 关键字', !/^[ \t]*export\s/m.test(html));
  ck('版本对象已注入', /window\.__ARK_VERSION__\s*=\s*\{/.test(html));

  // 幂等：对产物再注入一次，内容应不变
  const again = injectVersion(html, { version: 'x', build: '20260101a', commit: 'y', builtAt: 'z' });
  ck('版本注入幂等（重跑不叠加）', (again.html.match(/window\.__ARK_VERSION__/g) || []).length === 1);

  console.log('\n[自测断言]');
  let bad = 0;
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}${c.extra ? ' — ' + c.extra : ''}`);
    if (!c.pass) bad++;
  }
  console.log(bad === 0 ? `\n自测通过（${checks.length} 项）` : `\n自测失败 ${bad} 项`);
  return bad === 0 ? 0 : 1;
}

/* ------------------------------------------------------------- 入口 */

function usage() {
  console.log(`用法：node build/bundle.mjs [选项]

  （无参数）              试构建 → build/out/game.html（默认，安全）
  --out <路径>            输出路径；写根目录 game.html 属发版，需 --force 或 ARK_RELEASE_OK=1
  --template <路径>       模板，默认 templates/game.html（缺失时回退根目录 game.html）
  --manifest <路径>       内联清单，默认 build/manifest.json
  --prev <路径>           与上一版产物做一致性比对（仅允许注释/空白差异）
  --bump                  只打印下一个 build 号，不写文件
  --no-build-check        跳过 AC-23 双 BUILD 校验（仅本地试构建）
  --dry-run               只打印计划
  --self-test             用 tests/fixtures 迷你样例验证内联管线
`);
}

export function main(argv) {
  const args = parseArgs(argv);
  if (args.help) { usage(); return 0; }
  if (args.selfTest) return selfTest();
  try {
    return build(args);
  } catch (e) {
    console.error('\n❌ 构建失败：' + e.message);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
