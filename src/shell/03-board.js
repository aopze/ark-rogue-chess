/* @slot:shell */
/* ============================================================================
 * 外壳 · 榜单层（ISSUE-20261029-45）
 * ----------------------------------------------------------------------------
 * 数据来源与原实现一致（优先 /api/leaderboard 实时接口，失败回退 leaderboard.json）。
 *
 * 渲染按人类 2026-10-29 的新规格重写：
 *   · 面板内**只显示排行榜**（原左 1/3 账号卡整块删除）
 *   · 自己那行：名字右侧 [我] 徽标 → [编辑] 按钮
 *   · 点 [编辑] → 在**该行下方**插入 editRow（输入框 + 保存 + 说明文字），不换屏不弹窗
 *   · 未上榜 → 榜单底部 setRow 提供同一套入口
 *   · 打开面板自动滚到自己那行（scrollTop 居中，不用 scrollIntoView，避免连带滚动整页）
 *
 * 密度：每项 ≈38px（原 ≈62px），竖屏 390x844 下至少 8 名完整可见（ISSUE-45 AC-7）。
 * ========================================================================== */
(function () {
  'use strict';
  var NS = window.ArkShell;
  if (!NS) return;

  var editAnchor = null;      // 当前展开编辑抽屉所依附的 <li>

  function $(id) { return document.getElementById(id); }
  function acct() { return NS.account; }
  function ui() { return NS.ui; }

  /* 按显示名合并同名账户（公开 leaderboard.json 只有显示名、无口令）。
     口径：最高层、最高击杀、游玩次数累加；代表 id 取最高层那条。 */
  function mergeByName(entries) {
    var map = {}, order = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i] || {};
      var key = acct().publicName(e.name) || '匿名';
      var m = map[key];
      if (!m) {
        m = map[key] = { id: e.id, name: key, level: (e.level || 0), kills: (e.kills || 0), runs: (e.runs || 0) };
        order.push(key);
      } else {
        if ((e.level || 0) > m.level) { m.level = (e.level || 0); m.id = e.id; }
        if ((e.kills || 0) > m.kills) m.kills = (e.kills || 0);
        m.runs += (e.runs || 0);
      }
    }
    return order.map(function (k) { return map[k]; });
  }

  function sortedList() {
    var app = NS.app;
    var raw = (app.data && app.data.entries) ? app.data.entries.slice() : [];
    return mergeByName(raw).sort(function (a, b) {
      if ((b.level || 0) !== (a.level || 0)) return (b.level || 0) - (a.level || 0);
      return (b.kills || 0) - (a.kills || 0);
    });
  }

  function isMine(u) {
    var app = NS.app;
    if (app.myId && String(u.id) === String(app.myId)) return true;
    return !!(app.myName && u.name === app.myName);
  }

  /* ===== 渲染 ===== */
  function render() {
    var ol = $('miniBoard'), empty = $('boardEmpty'), meta = $('boardMeta');
    if (!ol) return;
    closeEdit();
    ol.innerHTML = '';

    var list = sortedList();
    if (!list.length) {
      if (empty) empty.hidden = false;
      if (meta) meta.textContent = '';
      return;
    }
    if (empty) empty.hidden = true;

    var data = NS.app.data;
    if (data && data.updated_at && meta) {
      var dt = new Date(data.updated_at * 1000);
      function p(n) { return n < 10 ? '0' + n : '' + n; }
      meta.textContent = '更新 ' + (dt.getMonth() + 1) + '-' + p(dt.getDate()) + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes());
    }

    var meFound = false;
    list.forEach(function (u, i) {
      var mine = isMine(u);
      if (mine) meFound = true;

      var li = document.createElement('li');
      if (mine) li.className = 'me';

      var rk = document.createElement('div');
      rk.className = 'rk';
      rk.textContent = (i + 1);

      var who = document.createElement('div');
      who.className = 'who';
      var nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = u.name;
      /* 副信息（击杀 / 次数）在 ≤420px 由 CSS 隐藏，把宽度让给名字 */
      var sc = document.createElement('div');
      sc.className = 'sc';
      sc.textContent = (u.kills || 0) + '杀 · ' + (u.runs || 0) + '次';
      who.appendChild(nm);
      who.appendChild(sc);

      var lv = document.createElement('div');
      lv.className = 'lv';
      lv.textContent = '第 ' + (u.level || 0) + ' 层';

      li.appendChild(rk);
      li.appendChild(who);
      li.appendChild(lv);

      /* 自己那行：原来的 [我] 徽标 → [编辑]（ISSUE-45） */
      if (mine) {
        var btn = document.createElement('button');
        btn.className = 'meEdit';
        btn.type = 'button';
        btn.textContent = '编辑';
        btn.setAttribute('aria-label', '编辑账号');
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (editAnchor === li) { closeEdit(); return; }
          openEdit(li);
        });
        li.appendChild(btn);
      }
      ol.appendChild(li);
    });

    /* 未上榜：底部给一行入口，点开同一套编辑抽屉。
       没有它，新玩家在「只显示排行榜」的面板里就找不到改名字的地方。 */
    if (!meFound) {
      var row = document.createElement('li');
      row.className = 'setRow';
      var b = document.createElement('button');
      b.id = 'btnSetName';
      b.type = 'button';
      b.textContent = '你还没上榜 · 设置名字';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (editAnchor === row) { closeEdit(); return; }
        openEdit(row);
      });
      row.appendChild(b);
      ol.appendChild(row);
    }
  }

  /* ===== 编辑抽屉（内联展开在自己那一行下方） ===== */
  function openEdit(anchorLi) {
    closeEdit();
    var st = acct();
    var li = document.createElement('li');
    li.className = 'editRow';
    li.innerHTML =
      '<div class="edline">'
      + '<input class="pname" id="pName" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="例如 阿米娅1234" />'
      + '<button class="psave" id="pSave" type="button">保存</button>'
      + '</div>'
      + '<div class="perr" id="pErr" hidden></div>'
      + '<div class="ednote">名字只能用<b>汉字或英文</b>，后面的数字是<b>口令</b>：只在你编辑时显示，<b>永远不会出现在排行榜上</b>。记住整串（如「阿米娅1234」），换设备输入同一串就能找回同一账号</div>';

    anchorLi.parentNode.insertBefore(li, anchorLi.nextSibling);
    editAnchor = anchorLi;

    var inp = $('pName'), save = $('pSave'), err = $('pErr');
    if (inp) {
      inp.value = st.app.myAccount || '';
      /* 移动端键盘弹起会压缩可视区，滚一下保证输入框不被遮挡 */
      try {
        inp.focus();
        if (inp.setSelectionRange) inp.setSelectionRange(inp.value.length, inp.value.length);
      } catch (e) {}
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); closeEdit(); }
      });
      setTimeout(function () {
        try { li.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      }, 60);
    }
    function showErr(msg) {
      if (!err) return;
      err.textContent = msg || '';
      err.hidden = !msg;
    }
    function submit() {
      var p = st.parseAccount(inp ? inp.value : '');
      if (!p.ok) { showErr(p.reason); return; }
      showErr('');
      var next = p.name + p.code;
      var changed = next !== st.app.myAccount;
      st.saveAccount(next);
      st.app.isNewAccount = false;
      closeEdit();
      render();                       // 名字变了要重绘（自己那行的高亮跟着走）
      if (!changed) { ui().toast('账号未变', 2500); return; }
      st.renameAccount(p.name, p.code);
    }
    if (save) save.addEventListener('click', submit);
  }

  function closeEdit() {
    if (!editAnchor) return;
    var row = editAnchor.nextElementSibling;
    if (row && row.classList && row.classList.contains('editRow')) row.parentNode.removeChild(row);
    editAnchor = null;
  }

  /* ===== 滚动到「我」 ===== */
  function scrollToMe() {
    var ol = $('miniBoard'), sc = $('rankScroll');
    if (!ol || !sc) return;
    var me = ol.querySelector('li.me');
    if (!me) return;
    var top = me.offsetTop - (sc.clientHeight - me.offsetHeight) / 2;
    sc.scrollTop = Math.max(0, top);
  }

  /* ===== 数据接入 ===== */
  function apply(d) {
    if (!d || !d.entries) return false;
    var app = NS.app;
    app.data = {
      updated_at: d.updated_at || Math.floor(Date.now() / 1000),
      entries: d.entries,
      bot_username: d.bot_username || app.botUser || 'yu7_bot',
      report_url: d.report_url || app.reportUrl,
    };
    if (d.report_url && !acct().onOurDomain()) app.reportUrl = d.report_url;
    if (d.bot_username) app.botUser = d.bot_username;
    return true;
  }

  /* 推给完整排行榜 iframe（leaderboard.html 是独立页面，这条 iframe 边界保留） */
  function pushToFrame(msg) {
    var f = $('rankFrame');
    try { if (f && f.contentWindow) f.contentWindow.postMessage(msg, '*'); } catch (e) {}
  }
  function pushMyScore() {
    if (!NS.myScore) return;
    pushToFrame({ type: 'my_score', level: NS.myScore.level, kills: NS.myScore.kills });
    pushMyId();
  }
  function pushMyId() {
    if (NS.app.myId) pushToFrame({ type: 'my_id', id: NS.app.myId });
  }
  function pushSnapshot() {
    if (NS.app.data && NS.app.data.entries) pushToFrame({ type: 'board', data: NS.app.data });
  }
  function pushApiBase() {
    var b = acct().apiBase();
    if (b) pushToFrame({ type: 'api_base', base: b });
  }

  function paint() {
    render();
    pushSnapshot();
    pushApiBase();
    if (NS.panel && NS.panel.syncCorner) NS.panel.syncCorner();
  }

  function refresh() {
    if (!acct().hasFetch()) { render(); return; }
    var b = acct().apiBase();
    if (!b) { acct().loadConfig(paint); return; }
    fetch(b + '/api/leaderboard?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (apply(d)) paint();
        else acct().loadConfig(paint);
      })
      .catch(function () { acct().loadConfig(paint); });
  }

  NS.board = {
    render: render,
    apply: apply,
    paint: paint,
    refresh: refresh,
    mergeByName: mergeByName,
    sortedList: sortedList,
    isMine: isMine,
    scrollToMe: scrollToMe,
    closeEdit: closeEdit,
    pushMyScore: pushMyScore,
    pushMyId: pushMyId,
    pushSnapshot: pushSnapshot,
    pushApiBase: pushApiBase,
  };
})();
