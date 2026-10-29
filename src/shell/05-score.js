/* @slot:shell */
/* ============================================================================
 * 外壳 · 成绩触发（ISSUE-20261029-45）
 * ----------------------------------------------------------------------------
 * 这是原 index.html 里那段 `#hooksrc` 的等价实现，做了两处关键降级：
 *   原：外壳把一段 script 注入 iframe 的 body，靠 parent.postMessage 回传
 *   现：同在本文档，直接读顶层变量、直接调 window.arkReportScore()
 *
 * ⚠ 已知遗留（如实记录，不在本次解决）：仍然是 300ms 轮询 + 依赖顶层变量名
 *   `phase` / `level` / `enemies`。彻底的做法是在 `initLevel()` 里累加、在
 *   `phase = PHASE.GAMEOVER` 处直接调用 —— 但那要动游戏核心状态机，
 *   本次合并的首要目标是"不改变玩法行为"，所以先把注入与跨文档这两层去掉，
 *   轮询留到下一个 issue 再做事件化。改名风险仍由本文件的常量引用收敛。
 * ========================================================================== */
(function () {
  'use strict';
  var NS = window.ArkShell;
  if (!NS) return;

  var sent = false;
  var prevEnemies = null;
  var prevDead = 0;
  var carry = 0;        // 跨关累计的已击杀数
  var prevLevel = 0;

  function collect() {
    var p = (typeof phase !== 'undefined') ? phase : null;
    var lvl = (typeof level !== 'undefined') ? level : 0;
    var en = (typeof enemies !== 'undefined') ? enemies : null;

    /* 换关时 enemies 会被整个替换 → 上一关的死亡数先结转，再清零本关计数 */
    if (prevEnemies !== null && en !== prevEnemies) { carry += prevDead; prevDead = 0; }
    /* 重开一局（关卡回退）→ 整局累计清零 */
    if (lvl < prevLevel) { carry = 0; prevDead = 0; }
    prevLevel = lvl;

    var dead = (en && en.filter) ? en.filter(function (e) { return !e.alive; }).length : 0;
    prevEnemies = en;
    prevDead = dead;
    return { phase: p, level: lvl, kills: carry + dead };
  }

  function isGameOver(phaseName) {
    if (typeof PHASE !== 'undefined' && PHASE && PHASE.GAMEOVER) return phaseName === PHASE.GAMEOVER;
    return phaseName === 'gameover';
  }

  function tick() {
    try {
      var s = collect();
      if (isGameOver(s.phase)) {
        if (!sent) {
          sent = true;
          if (typeof window.arkReportScore === 'function') window.arkReportScore(s.level, s.kills);
        }
      } else {
        sent = false;
      }
    } catch (e) {}
    setTimeout(tick, 300);
  }

  setTimeout(tick, 300);
})();
