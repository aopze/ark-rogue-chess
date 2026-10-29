/* @slot:shell */
/* ============================================================================
 * 外壳 · 账号层（ISSUE-20261029-45）
 * ----------------------------------------------------------------------------
 * 搬自 index.html，业务逻辑**逐字未改**（账号串解析、本机存储、身份判定、上报），
 * 只做了两处结构性调整：
 *   1. 全局单例 APP → NS.app（避免与游戏侧 ~26 个模块抢全局名）
 *   2. 直接调用的 toast/showHint → NS.ui.*（由 04-panel 覆盖成真实实现）
 *
 * 身份模型（与服务端 bot_rank.py 一致，勿单方面改）：
 *   · Telegram 入口 → initData 验签 → uid = tg user id（跨设备稳定）
 *   · 网页游客     → localStorage 设备 id → uid = dev_<uuid>（换设备即换 uid，已知限制）
 *
 * 「改名不新注册」：走 kind:'rename' → bot 侧 rename_user(uid, name) 按 uid 更新，
 * 保留 best_level/best_kills/runs，只有该 uid 从未出现过才新建。服务端语义已满足，
 * 前端要做的只是**别传错身份**（始终用同一个 uid，不因改名而重置设备 id）。
 * ========================================================================== */
(function () {
  'use strict';
  var NS = window.ArkShell;
  if (!NS) return;

  var ACCT_KEY = 'ark_account';        // 完整账号串（含数字口令），只存本机
  var NAME_KEY = 'ark_player_name';    // 显示名（兼容旧字段与上报）
  var ACCT_RE = /^([\u4e00-\u9fa5A-Za-z]{1,12})(\d{4,8})$/;
  var REPORT_URL_FALLBACK = '';
  var BOT_USER_FALLBACK = 'yu7_bot';

  var app = NS.app = {
    data: null,          // leaderboard 数据
    myId: 0,             // Telegram user id 或 dev_<uuid>
    myName: '',          // 显示名
    myAccount: '',       // 完整账号 = 显示名 + 数字口令
    isNewAccount: false,
    reportUrl: '',
    botUser: '',
  };
  NS.myScore = null;

  function $(id) { return document.getElementById(id); }
  function ui() { return NS.ui; }

  /* ===== 账号串解析 / 校验（失败必须给具体原因，绝不静默截断） ===== */
  function parseAccount(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: false, reason: '请输入「名字 + 4–8 位数字口令」，例如 阿米娅1234' };
    if (/\s/.test(s)) return { ok: false, reason: '不能包含空格：名字后面直接跟数字' };
    if (/^\d+$/.test(s)) return { ok: false, reason: '名字不能全是数字：开头请用汉字或英文字母' };
    var m = s.match(ACCT_RE);
    if (m) return { ok: true, name: m[1], code: m[2] };
    var tail = s.match(/(\d+)$/);
    var head = tail ? s.slice(0, s.length - tail[1].length) : s;
    if (!/[\u4e00-\u9fa5A-Za-z]/.test(head)) return { ok: false, reason: '名字只能用汉字或英文字母' };
    if (/\d/.test(head)) return { ok: false, reason: '数字只能放在最后当口令，不能夹在名字里' };
    if (head.length > 12) return { ok: false, reason: '名字最多 12 个字' };
    if (!tail) return { ok: false, reason: '结尾需要 4–8 位数字口令（例如 阿米娅1234）' };
    if (tail[1].length < 4) return { ok: false, reason: '数字口令至少 4 位' };
    if (tail[1].length > 8) return { ok: false, reason: '数字口令最多 8 位' };
    return { ok: false, reason: '格式是「名字 + 4–8 位数字」，中间不要加字符' };
  }

  function displayNameOf(acct) {
    var p = parseAccount(acct);
    return p.ok ? p.name : '';
  }

  /* 公开显示名：老数据可能把口令写在名字里（如 阿米娅1234），公开位置一律剥掉 4–8 位纯数字尾巴。
     只影响显示，不回写 leaderboard.json（那是 bot 的事）。 */
  function publicName(raw) {
    var s = String(raw == null ? '' : raw);
    var stripped = s.replace(/\d{4,8}$/, '');
    return stripped || s;
  }

  /* ===== 本机账号 ===== */
  function loadAccount() {
    try { app.myAccount = localStorage.getItem(ACCT_KEY) || ''; } catch (e) { app.myAccount = ''; }
    if (!app.myAccount) {
      var legacy = '';
      try { legacy = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
      if (legacy && parseAccount(legacy).ok) app.myAccount = legacy;
    }
    if (!app.myAccount) {
      // 首次进入：自动生成「玩家 + 4 位数字」
      var code = String(1000 + Math.floor(Math.random() * 9000));
      app.myAccount = '玩家' + code;
      app.isNewAccount = true;
      saveAccount(app.myAccount);
    }
    app.myName = displayNameOf(app.myAccount);
  }

  function saveAccount(acct) {
    app.myAccount = acct;
    app.myName = displayNameOf(acct) || app.myName;
    try {
      localStorage.setItem(ACCT_KEY, acct);
      if (app.myName) localStorage.setItem(NAME_KEY, app.myName);
    } catch (e) {}
  }

  /* ===== 我的身份 ===== */
  function resolveMyId() {
    var p = NS.plat || {};
    if (p.HAS_INIT && p.W && p.W.initDataUnsafe && p.W.initDataUnsafe.user) {
      app.myId = p.W.initDataUnsafe.user.id || 0;
    } else {
      var dev = NS.deviceId();
      app.myId = dev ? ('dev_' + dev) : 0;
    }
  }

  /* ===== 接口地址 ===== */
  function onOurDomain() {
    var h = (location.hostname || '').toLowerCase();
    return h === 'arkroguelike.top' || /\.arkroguelike\.top$/.test(h);
  }
  function apiBase() {
    if (onOurDomain()) return location.origin;
    var u = app.reportUrl || '';
    return u.replace(/\/api\/score\/?$/i, '');
  }

  /* ===== 配置与静态榜单兜底 ===== */
  /**
   * 没有 fetch 的环境（老 Safari、jsdom 门禁、离线裁剪版）直接走回调，
   * 不要抛异常 —— 外壳现在内联在产物里，一旦在这里冒泡就会把整个游戏打白。
   * 榜单显示为「还没有人上榜」，游戏照常可玩。
   */
  function hasFetch() { return typeof fetch === 'function'; }

  function loadConfig(cb) {
    if (!hasFetch()) { if (cb) cb(); return; }
    fetch('leaderboard.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        app.data = d || app.data;
        if (app.data) {
          app.reportUrl = app.data.report_url || REPORT_URL_FALLBACK || '';
          app.botUser = app.data.bot_username || BOT_USER_FALLBACK || app.botUser || '';
          if (onOurDomain()) app.reportUrl = location.origin + '/api/score';
        }
        if (cb) cb();
      })
      .catch(function () { if (cb) cb(); });
  }

  /* ===== 上报 ===== */
  function deepLinkScore(level, kills) {
    try {
      var bot = app.botUser || BOT_USER_FALLBACK;
      if (!bot) {
        ui().toast('未配置 bot 用户名，无法回传成绩。\n用 /play 的键盘按钮重开一局即可记录。', 9000);
        return;
      }
      var dl = 'https://t.me/' + bot + '?start=score:' + level + '_' + kills;
      var W = (NS.plat || {}).W;
      if (W && W.openTelegramLink) W.openTelegramLink(dl);
      else window.location.href = dl;
      ui().toast('正在记录成绩…（已切到聊天）\n点机器人回复里的 /rank 看排行榜', 5000);
    } catch (e) {
      ui().toast('当前入口无法回传成绩。\n用 /play 的键盘按钮重开一局即可记录。', 9000);
    }
  }

  function reportScore(level, kills) {
    var p = NS.plat || {};
    var W = p.W;
    NS.myScore = { level: level, kills: kills };
    if (NS.board && NS.board.pushMyScore) NS.board.pushMyScore();

    if (p.CAN_REPORT && W && W.sendData) {
      try {
        W.sendData(JSON.stringify({ type: 'rogue_score', level: level, kills: kills, tg_id: 0, tg_name: app.myName || '', initData: '' }));
        ui().toast('成绩已提交：第 ' + level + ' 层 / 击杀 ' + kills + '\n点棋盘左上角 👤 可看排行榜', 5000);
        return;
      } catch (e) { /* 落到下面的 fetch 通道 */ }
    }

    if (app.reportUrl && (p.HAS_INIT || p.IS_WEB)) {
      var body = { kind: 'score', level: level, kills: kills, name: app.myName || '', account: app.myAccount || '' };
      if (p.HAS_INIT) { body.initData = W.initData; }
      else {
        var dev = NS.deviceId();
        if (!dev) { ui().toast('浏览器禁用了本地存储，无法识别身份。\n请在 Telegram 内打开。', 9000); return; }
        body.device = dev;
      }
      fetch(app.reportUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.ok) {
          ui().toast('成绩已记录：第 ' + level + ' 层 / 击杀 ' + kills + '\n点棋盘左上角 👤 可看排行榜', 5000);
          if (j.leaderboard && NS.board && NS.board.apply(j.leaderboard)) NS.board.paint();
          else if (NS.board) NS.board.refresh();
          if (NS.board) setTimeout(function () { NS.board.refresh(); }, 3000);
        } else if (p.HAS_INIT) { deepLinkScore(level, kills); }
        else { ui().toast('成绩记录失败（服务器拒绝了请求）。\n稍后再打一局试试。', 8000); }
      }).catch(function () {
        if (p.HAS_INIT) { deepLinkScore(level, kills); }
        else { ui().toast('连不上成绩服务器。\n确认 bot 正在运行后重试。', 8000); }
      });
      return;
    }

    if (p.HAS_INIT && app.botUser) { deepLinkScore(level, kills); return; }
    if (p.IN_TG) {
      ui().toast('当前入口无法回传成绩。\n用 /play 的键盘按钮重开一局即可记录。', 9000);
    } else if (!app.reportUrl) {
      ui().toast('成绩服务器地址还没加载到（bot 可能没启动）。\n你的成绩：第 ' + level + ' 层 / 击杀 ' + kills, 8000);
    } else {
      ui().toast('浏览器预览模式，成绩不会记录。\n（你的成绩：第 ' + level + ' 层 / 击杀 ' + kills + '）', 7000);
    }
  }

  /**
   * 改名字 + 口令。
   * 「直接视为修改，不新注册」靠两点：
   *   1. 前端不动设备 id / initData（uid 不变）
   *   2. 上报 kind:'rename'（不是 kind:'score'），服务端 rename_user(uid) 只改 name 字段
   * 因此历史成绩（best_level / best_kills / runs）全部保留在同一条记录上。
   */
  function renameAccount(name, code) {
    var p = NS.plat || {};
    var W = p.W;
    if (p.CAN_REPORT && W && W.sendData) {
      try {
        W.sendData(JSON.stringify({ type: 'rename', name: name, account: name + code }));
        ui().toast('账号已保存，回聊天确认同步', 4000);
        return;
      } catch (e) { ui().toast('账号已在本机保存', 3000); return; }
    }
    if (app.reportUrl && (p.HAS_INIT || p.IS_WEB)) {
      var body = { kind: 'rename', name: name, account: name + code, code: code };
      if (p.HAS_INIT) { body.initData = W.initData; }
      else { body.device = NS.deviceId(); }
      fetch(app.reportUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.ok) {
          ui().toast('账号已同步到排行榜', 4000);
          if (NS.board) NS.board.refresh();
        } else {
          ui().toast('账号已在本机保存（同步失败）', 4000);
        }
      }).catch(function () { ui().toast('账号已在本机保存（同步失败）', 4000); });
    } else {
      ui().toast('账号已在本机保存', 3000);
    }
  }

  /* 我是否在榜单里（先按 id，再按显示名兜底） */
  function findMe() {
    if (!app.data || !app.data.entries) return null;
    var list = app.data.entries;
    if (app.myId) {
      for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(app.myId)) return list[i];
    }
    if (app.myName) {
      for (var j = 0; j < list.length; j++) if (publicName(list[j].name) === app.myName) return list[j];
    }
    return null;
  }

  NS.account = {
    app: app,
    parseAccount: parseAccount,
    displayNameOf: displayNameOf,
    publicName: publicName,
    hasFetch: hasFetch,
    loadAccount: loadAccount,
    saveAccount: saveAccount,
    resolveMyId: resolveMyId,
    onOurDomain: onOurDomain,
    apiBase: apiBase,
    loadConfig: loadConfig,
    reportScore: reportScore,
    renameAccount: renameAccount,
    deepLinkScore: deepLinkScore,
    findMe: findMe,
  };
})();
