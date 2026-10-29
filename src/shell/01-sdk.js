/* @slot:shell */
/* #SHELL_START */
/* ============================================================================
 * 外壳 · 平台层（ISSUE-20261029-45）
 * ----------------------------------------------------------------------------
 * 把原 index.html 的「Telegram 能力判定」搬进单文件，并改了一处关键实现：
 *
 *   Telegram SDK 由本文件**运行时按需注入**，不再是 index.html 里那行
 *   外链 script 标签（src=…telegram-web-app.js）。因为外壳内联后，那行外链会让
 *   NB-04（离线自包含）直接失败 —— 游戏本体必须能双击离线跑。
 *
 *   语义是「有则增强、无则降级」，不是偷偷绕闸门：
 *     · 加载成功 → Mini App 能力（initData 验签身份、sendData 上报）
 *     · 失败/超时  → 网页游客通道（localStorage 设备 id），功能不残缺
 *   build/verify.mjs 的 NB-04 注释里已显式写下这条例外。
 *
 * 所有模块各自独立 IIFE，只通过 window.ArkShell 命名空间通信 ——
 * 避免与游戏侧已有的 ~26 个模块抢全局名（曾实测 paintBoard / hideHint 撞名）。
 * ========================================================================== */
(function () {
  'use strict';
  var NS = window.ArkShell = window.ArkShell || {};

  /* ---- UI 占位：04-panel 会覆盖成真实实现，保证 02/03 先写也不报错 ---- */
  NS.ui = NS.ui || {};
  if (!NS.ui.toast) NS.ui.toast = function () {};
  if (!NS.ui.showHint) NS.ui.showHint = function () {};
  if (!NS.ui.hideHint) NS.ui.hideHint = function () {};

  var SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
  /* Telegram 的 WebView 里 SDK 一般 <300ms；普通浏览器/离线要等到失败才知道，
     这里按 UA 给两档超时，避免网页模式干等。 */
  var TIMEOUT_MS = /Telegram/i.test(navigator.userAgent || '') ? 3000 : 1200;

  NS.sdkReady = new Promise(function (resolve) {
    if (window.Telegram && window.Telegram.WebApp) return resolve(window.Telegram.WebApp);
    var settled = false;
    function done(v) { if (settled) return; settled = true; resolve(v || null); }
    try {
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () { done(window.Telegram && window.Telegram.WebApp); };
      s.onerror = function () { done(null); };
      document.head.appendChild(s);
      setTimeout(function () { done(window.Telegram && window.Telegram.WebApp); }, TIMEOUT_MS);
    } catch (e) { done(null); }
  }).then(function (W) {
    /* 纯浏览器里 telegram-web-app.js 也会注入 WebApp，但 platform === 'unknown'
       且 sendData 是空壳 —— 不排除这种情况会把「已提交」变成「实际没记录」。*/
    var HAS_SDK = !!W;
    var HAS_INIT = !!(W && W.initData);
    var IN_TG = HAS_SDK && W.platform !== 'unknown';
    NS.plat = {
      W: W || null,
      HAS_SDK: HAS_SDK,
      HAS_INIT: HAS_INIT,
      IN_TG: IN_TG,
      CAN_REPORT: IN_TG && !HAS_INIT,   // 键盘按钮入口：sendData 可用
      IS_WEB: !HAS_INIT,                // 无 initData（含纯浏览器）→ 走设备身份
    };
    return NS.plat;
  });

  /* ---- 小工具 ---- */
  NS.$ = function (id) { return document.getElementById(id); };

  /** 设备身份（网页直接打开时用，替代 initData）。 */
  NS.deviceId = function () {
    var k = 'ark_device_id';
    try {
      var v = localStorage.getItem(k);
      if (v && v.length >= 8) return v;
      var id = '';
      if (window.crypto && crypto.randomUUID) id = crypto.randomUUID().replace(/-/g, '');
      else {
        var s = 'abcdef0123456789';
        for (var i = 0; i < 32; i++) id += s.charAt(Math.floor(Math.random() * 16));
      }
      localStorage.setItem(k, id);
      return id;
    } catch (e) { return ''; }
  };
})();
