/* P0.1-4 机械拆分：从 game.html（20261028b 基线）第 525-551 行原样搬移（可播种伪随机 mulberry32：seedRng / rng / randInt、RNG_SEED 与本局种子 RUN_SEED）。
 * 纯移动未改逻辑；顺序由 build/manifest.json 保证与拆分前一致。 */
/* =========================================================
 * ★ 可播种伪随机（mulberry32）
 * 原来直接用 Math.random，导致同一份输入无法复现同一局：
 * 联机时两端各掷各的骰子，结果必然对不上。
 * 现在所有随机都走 rng()，单人用时间播种（行为与旧版一致），
 * 联机时由服务器下发种子，两端 seedRng(同一颗) 即可完全一致。
 * ========================================================= */
let RNG_SEED = 1;
/* ★ 本局初始种子（ISSUE-20261028-03 新增）。
 * 敌人成长要「同一局同一关永远算出同一套面板」，所以需要一颗**不滚动**的种子；
 * RNG_SEED 每一次 rng() 都在变，不能当种子用，必须在 seedRng() 里单独记一份。 */
let RUN_SEED = 1;
function seedRng(s) {
  RNG_SEED = (s >>> 0) || 0x9E3779B9;
  if (RNG_SEED === 0) RNG_SEED = 0x9E3779B9;
  RUN_SEED = RNG_SEED;                       // ← 锁定本局种子（关卡内不会重掷）
}
function rng() {
  RNG_SEED = (RNG_SEED + 0x6D2B79F5) | 0;
  let t = RNG_SEED;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
seedRng(Date.now());   // 单人默认：时间播种

function randInt(n) { return Math.floor(rng() * n); }
