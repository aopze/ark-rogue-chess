#!/usr/bin/env node
/* =========================================================================
 * build/verify.mjs — 产物校验（P0.1-3）
 *
 * 职责（可被 bundle.mjs 调用，也可独立运行）：
 *   1. AC-23：产物 __ARK_VERSION__.build == index.html 的 var BUILD
 *   2. NB-04：离线自包含 —— 不得存在运行时外部依赖
 *   3. 产物一致性：与上一版对比，仅允许注释/空白差异（机械拆分阶段的关键护栏）
 *   4. 体积与基本结构检查
 *
 * 用法：
 *   node build/verify.mjs <产物.html>                    # 校验单个产物
 *   node build/verify.mjs <新产物> --prev <旧产物>       # 附带一致性对比
 *   node build/verify.mjs <新产物> --no-build-check      # 跳过 AC-23（仅本地试构建）
 * ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

/* ---------------------------------------------------------------- 基础 */

export function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

export const BUILD_RE = /var\s+BUILD\s*=\s*['"]([^'"]+)['"]/;
export const VER_OBJ_RE = /window\.__ARK_VERSION__\s*=\s*\{([\s\S]*?)\};/;
export const BUILD_FIELD_RE = /\bbuild\s*:\s*['"]([^'"]*)['"]/;
const BUILD_FMT_RE = /^(\d{4})(\d{2})(\d{2})([a-z])$/;

/** 从 index.html 读出 var BUILD —— 双 BUILD 的唯一真值来源（§0.9）。 */
export function readBuildFromIndex(indexPath = path.join(ROOT, 'index.html')) {
  if (!fs.existsSync(indexPath)) {
    return { ok: false, build: null, reason: 'index.html 不存在' };
  }
  const src = readText(indexPath);
  const m = src.match(BUILD_RE);
  if (!m) return { ok: false, build: null, reason: '未找到 var BUILD' };
  return { ok: true, build: m[1], raw: m[0] };
}

/** 校验 YYYYMMDDx 格式（§0.9）。 */
export function validateBuild(build) {
  if (!build) return { ok: false, reason: 'build 为空' };
  if (!BUILD_FMT_RE.test(build)) {
    return { ok: false, reason: `build 格式应为 YYYYMMDDx（如 20261028a），实际为 '${build}'` };
  }
  const [, y, mo, d] = build.match(BUILD_FMT_RE);
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) {
    return { ok: false, reason: `build '${build}' 的日期部分不是合法日期` };
  }
  return { ok: true };
}

/** 从产物中读出 __ARK_VERSION__ 的各字段。 */
export function readVersionFromArtifact(p) {
  if (!fs.existsSync(p)) return { ok: false, reason: '产物不存在：' + p };
  const src = readText(p);
  const m = src.match(VER_OBJ_RE);
  if (!m) return { ok: false, reason: '产物中未找到 window.__ARK_VERSION__ = {...}' };
  const body = m[1];
  const pick = (k) => {
    const r = new RegExp(`\\b${k}\\s*:\\s*'([^']*)'`);
    const mm = body.match(r);
    return mm ? mm[1] : null;
  };
  return {
    ok: true,
    version: pick('version'),
    build: pick('build'),
    commit: pick('commit'),
    builtAt: pick('builtAt'),
  };
}

/* ------------------------------------------------- 1. AC-23 双 BUILD */

/**
 * AC-23：产物 build 必须等于 index.html 的 var BUILD。
 * index.html 是只读资产（NB-01），这里只校验不改写；不一致时打印应改的值。
 */
export function checkBuildConsistency(artifactPath, { indexPath } = {}) {
  const idx = readBuildFromIndex(indexPath);
  if (!idx.ok) {
    return { pass: false, title: 'AC-23 双 BUILD', detail: `读 index.html 失败：${idx.reason}` };
  }
  const fmt = validateBuild(idx.build);
  if (!fmt.ok) {
    return { pass: false, title: 'AC-23 双 BUILD', detail: `index.html 的 BUILD 不合法 —— ${fmt.reason}` };
  }
  const art = readVersionFromArtifact(artifactPath);
  if (!art.ok) {
    return { pass: false, title: 'AC-23 双 BUILD', detail: art.reason };
  }
  if (art.build !== idx.build) {
    return {
      pass: false,
      title: 'AC-23 双 BUILD',
      detail: `产物 build='${art.build}' 与 index.html 的 BUILD='${idx.build}' 不一致。\n`
        + `        → 请把 index.html 的 var BUILD 改为 '${art.build}'（index.html 只读，需人工改），\n`
        + `          或重新构建使产物 build = '${idx.build}'。`,
    };
  }
  return {
    pass: true,
    title: 'AC-23 双 BUILD',
    detail: `产物 build = index.html BUILD = '${art.build}'`,
  };
}

/* ------------------------------------------- 2. NB-04 离线自包含 */

/**
 * NB-04：game.html 必须能双击离线运行 —— 不得有运行时外部依赖。
 * 只检查会真正发起网络请求的形式：外链 <script src>、<link href>、import from http。
 */
export function checkOfflineSelfContained(artifactPath) {
  const src = readText(artifactPath);
  const problems = [];

  const scriptSrc = [...src.matchAll(/<script\b[^>]*\ssrc\s*=\s*['"]([^'"]+)['"]/gi)].map((m) => m[1]);
  for (const s of scriptSrc) {
    if (/^(https?:)?\/\//i.test(s)) problems.push(`外链 <script src="${s}">`);
  }
  const linkHref = [...src.matchAll(/<link\b[^>]*\shref\s*=\s*['"]([^'"]+)['"]/gi)].map((m) => m[1]);
  for (const h of linkHref) {
    if (/^(https?:)?\/\//i.test(h)) problems.push(`外链 <link href="${h}">`);
  }
  const imports = [...src.matchAll(/\bimport\s[\s\S]{0,200}?from\s*['"](https?:\/\/[^'"]+)['"]/g)].map((m) => m[1]);
  for (const i of imports) problems.push(`运行时 import from ${i}`);

  return {
    pass: problems.length === 0,
    title: 'NB-04 离线自包含',
    detail: problems.length ? problems.join('; ') : '无外部运行时依赖',
  };
}

/* ------------------------------------- 3. 产物一致性（仅注释/空白） */

/**
 * 归一化：去掉 HTML 注释、JS 块注释/行注释与多余空白，用于「机械拆分未改行为」的比对。
 * 默认先抹平 __ARK_VERSION__ 对象 —— 版本号每次构建都变，不该污染行为比对。
 */
export function normalize(html, { stripVersion = true } = {}) {
  let s = stripVersion ? html.replace(VER_OBJ_RE, 'window.__ARK_VERSION__={};') : html;
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** 与上一版产物比对：归一化后应完全一致，否则说明机械拆分引入了实质改动。 */
export function checkArtifactEquivalence(newPath, prevPath) {
  if (!fs.existsSync(prevPath)) {
    return { pass: true, skipped: true, title: '产物一致性', detail: `无上一版（${path.basename(prevPath)} 不存在），跳过` };
  }
  const a = normalize(readText(prevPath));
  const b = normalize(readText(newPath));
  if (a === b) {
    return { pass: true, title: '产物一致性', detail: '与上一版归一化后完全一致（仅注释/空白差异）' };
  }
  // 给出首个差异位置，便于定位
  let i = 0;
  const len = Math.min(a.length, b.length);
  while (i < len && a[i] === b[i]) i++;
  const ctx = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
  return {
    pass: false,
    title: '产物一致性',
    detail: `归一化后与上一版存在差异（首处偏移 ${i}）：\n        prev: ${ctx(a)}\n        new : ${ctx(b)}`,
  };
}

/* --------------------------------------------------- 4. 结构检查 */

export function checkStructure(artifactPath) {
  const src = readText(artifactPath);
  const problems = [];
  if (!/^\s*<!DOCTYPE html>/i.test(src) && !/<html[\s>]/i.test(src)) {
    problems.push('缺少 <html> 结构');
  }
  const open = (src.match(/<script\b/gi) || []).length;
  const close = (src.match(/<\/script>/gi) || []).length;
  if (open !== close) problems.push(`<script> 标签不配对：${open} 开 / ${close} 闭`);
  return {
    pass: problems.length === 0,
    title: '结构完整性',
    detail: problems.length ? problems.join('; ') : `<script> 配对正常（${open} 对）`,
  };
}

/* ------------------------------------------- 4. 无重复定义（NB-12 防回归） */

/**
 * 机械拆分期的典型事故：模块已搬进 src/，但模板里那段代码忘了删，
 * 于是产物里同一个函数被定义两次（2026-10-28 build 20261028c 真实事故：
 * `function isWalkable` 在产物中出现 2 次，模板被回退成旧版所致）。
 *
 * 本检查扫描 manifest 里每个模块的顶层定义名，要求它们在产物中**各只定义 1 次**。
 */
export function collectTopLevelNames(moduleBody) {
  const names = new Set();
  const re = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm;
  let m;
  while ((m = re.exec(moduleBody))) names.add(m[1] || m[2]);
  return [...names];
}

export function checkNoDuplicateDefinitions(artifactPath, { manifestPath = null } = {}) {
  const mp = manifestPath || path.join(ROOT, 'build', 'manifest.json');
  if (!fs.existsSync(mp)) {
    return { pass: true, skipped: true, title: '无重复定义', detail: 'manifest.json 不存在，跳过' };
  }
  const manifest = JSON.parse(readText(mp));
  const art = readText(artifactPath);
  const dup = [];
  for (const rel of manifest.modules || []) {
    const body = readText(path.join(ROOT, rel));
    for (const name of collectTopLevelNames(body)) {
      // 只匹配「顶层定义」：行首无缩进，避免把函数内的同名局部变量算进来
      const pats = [
        new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g'),
        new RegExp(`(?:^|\\n)(?:const|let|var)\\s+${name}\\s*=`, 'g'),
      ];
      const n = pats.reduce((acc, p) => acc + (art.match(p) || []).length, 0);
      if (n > 1) dup.push(`${name} ×${n}`);
    }
  }
  return {
    pass: dup.length === 0,
    title: '无重复定义',
    detail: dup.length ? `重复定义（模板残留已拆代码？）：${dup.join('、')}` : 'manifest 各模块顶层定义均唯一',
  };
}

/* ------------------------------------------------ 4. 注入标记残留检查 */

/**
 * 多槽位注入（`<!-- @inject:scripts:<id> -->`）的兜底：
 * 标记若没被替换就留在产物里，虽然因为 `<!--` 在 JS 里等同行注释而**不会报错**，
 * 但意味着某段代码没被内联 —— 静默少代码比报错更危险。
 */
export function checkNoInjectionMarkers(artifactPath) {
  const src = readText(artifactPath);
  const hits = src.match(/<!--\s*@inject:[A-Za-z0-9_.:-]+\s*-->/g) || [];
  const uniq = [...new Set(hits)];
  return {
    pass: uniq.length === 0,
    title: '注入标记无残留',
    detail: uniq.length ? `产物中残留未替换的占位符：${uniq.join('、')}` : '模板占位符已全部替换',
  };
}

/* ------------------------------------------------------- 汇总入口 */

export function runVerify(artifactPath, opts = {}) {
  const { prev = null, noBuildCheck = false, indexPath } = opts;
  const results = [];

  if (!noBuildCheck) results.push(checkBuildConsistency(artifactPath, { indexPath }));
  else results.push({ pass: true, skipped: true, title: 'AC-23 双 BUILD', detail: '--no-build-check 已跳过' });

  results.push(checkOfflineSelfContained(artifactPath));
  results.push(checkStructure(artifactPath));
  results.push(checkNoInjectionMarkers(artifactPath));
  results.push(checkNoDuplicateDefinitions(artifactPath));
  if (prev) results.push(checkArtifactEquivalence(artifactPath, prev));

  const size = fs.existsSync(artifactPath) ? fs.statSync(artifactPath).size : 0;
  return { results, size, artifactPath };
}

export function printVerify(v) {
  for (const r of v.results) {
    const tag = r.pass ? (r.skipped ? '⏭️ ' : '✅') : '❌';
    console.log(`  ${tag} ${r.title} — ${r.detail}`);
  }
  console.log(`  📦 产物体积：${v.size} B`);
}

/* ------------------------------------------------------ CLI 入口 */

function parseArgs(argv) {
  const a = { _: [], noBuildCheck: false, prev: null, indexPath: path.join(ROOT, 'index.html') };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s === '--no-build-check') a.noBuildCheck = true;
    else if (s === '--prev') a.prev = argv[++i];
    else if (s === '--index') a.indexPath = argv[++i];
    else a._.push(s);
  }
  return a;
}

export function main(argv) {
  const args = parseArgs(argv);
  const target = args._[0];
  if (!target) {
    console.error('用法：node build/verify.mjs <产物.html> [--prev <旧产物>] [--no-build-check]');
    return 2;
  }
  if (!fs.existsSync(target)) {
    console.error('❌ 产物不存在：' + target);
    return 2;
  }
  console.log(`[校验] ${target}`);
  const v = runVerify(target, args);
  printVerify(v);
  const failed = v.results.filter((r) => !r.pass);
  if (failed.length) {
    console.log(`\n校验未通过：${failed.length} 项`);
    return 1;
  }
  console.log('\n校验全部通过');
  return 0;
}

// 直接运行时才走 CLI（被 import 时不执行）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
