/* P0.1-4 拆分 · 20261028c 基线 2005-2050 行 · 角色选择流程：initCharSelect / selectCharacter */
function initCharSelect() {
  phase = PHASE.CHAR_SELECT;
  debugMode = false;
  lastPathSignature = '';
  /* 新的一局 = 新的种子（ISSUE-20261028-03）：敌人成长按 RUN_SEED 推演，
   * 不重掷的话「重开」会得到和上一局完全相同的敌人面板序列。联机进入房间后由服务器再覆盖。 */
  seedRng(Date.now());
  resetTurnState({ clearCounter: true });
  resetRunProgress();
  isMoving = false;
  dragging = false;
  dragDownCell = null;
  hasDragged = false;
  clearTimeout(pressTimer);
  clearUnitLayer();
  ROWS = 9; COLS = 9;
  selMap = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (let i = 0; i < ROWS; i++) { selMap[i][0] = 1; selMap[i][COLS-1] = 1; }
  for (let i = 0; i < COLS; i++) { selMap[0][i] = 1; selMap[ROWS-1][i] = 1; }
  selMap[2][3] = 1; selMap[2][5] = 1; selMap[6][3] = 1; selMap[6][5] = 1;
  selMap[3][4] = 1; selMap[5][4] = 1;
  selExit = { x: 7, y: 4 };
  selMap[selExit.y][selExit.x] = 0;
  charCandidates = [
    { id: 'wheelchair', x: 2, y: 2, alive: true },
    { id: 'vampire', x: 2, y: 4, alive: true },
    { id: 'fencer', x: 2, y: 6, alive: true },
    { id: 'amiya', x: 4, y: 2, alive: true }
  ];
  selectedCandidate = null;
  clearLog();
  log('请点击选择一个角色，然后通过点击或 WASD 移动至 🚪 出口。');
  log('💡 提示：F12 切换调试模式 · X 一键重置路径');
  setTimeout(() => { updateCellSize(); render(); }, 50);
}

function selectCharacter(charId) {
  selectedChar = charId;
  debugMode = false;
  playerStats = createPlayerStats(charId);
  level = 1;
  resetRunProgress();
  recomputePlayerDerivedStats();
  playerStats.currentHp = playerStats.maxHp;
  initLevel();
}
