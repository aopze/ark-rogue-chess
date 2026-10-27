/* P0.1-4 拆分 · 20261028b 基线 1185-1350 行 · 六维雷达图 drawRadar */
/* =========================================================
 * 六维雷达图
 * ========================================================= */
function drawRadar() {
  if (!radarCanvas) return;
  const ctx = radarCanvas.getContext('2d');
  if (!ctx) return;
  radarLabelHits = [];
  const dpr = window.devicePixelRatio || 1;
  const cssW = radarCanvas.clientWidth || 120;
  const cssH = radarCanvas.clientHeight || 120;
  if (radarCanvas.width !== Math.round(cssW * dpr) || radarCanvas.height !== Math.round(cssH * dpr)) {
    radarCanvas.width = Math.round(cssW * dpr);
    radarCanvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const cx = cssW / 2, cy = cssH / 2;
  const n = ABILITY_ORDER.length;
  const max = ABILITY_CAP;
  // 轴上是 2 字全称，±30° 那两根轴最容易被裁 → 按横向余量反推半径
  const labelFont = Math.max(8, Math.round(Math.min(cssW, cssH) / 13));
  const pad = 3;
  const R = Math.min(
    Math.min(cssW, cssH) / 2 - labelFont * 0.95 - pad,
    (Math.min(cssW, cssH) / 2 - labelFont * 2.45) / 0.87 - pad
  );

  let abilities = null;
  if (phase === PHASE.CHAR_SELECT) {
    if (selectedCandidate) abilities = CHARACTERS[selectedCandidate.id].abilities;
  } else if (player) {
    abilities = player.abilities;
  } else if (playerStats && playerStats.abilities) {
    abilities = playerStats.abilities;
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 3; ring++) {
    const r = R * ring / 3;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }

  if (abilities) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const k = ABILITY_ORDER[i];
      const v = Math.max(0, Math.min(max, abilities[k] || 0));
      const r = R * v / max;
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(78, 205, 196, 0.30)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(78, 205, 196, 0.95)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 最高属性（并列时都算）：数值用与「熟练项」相同的绿色，其余与属性名同色
    const LABEL_NORMAL = '#9aa';
    const LABEL_PROF = '#8fe28a';
    let topV = -1;
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(max, abilities[ABILITY_ORDER[i]] || 0));
      if (v > topV) topV = v;
    }

    // 顶点：小圆点 + 该属性的数值（沿轴外推，空间不足时往内收）
    const vFont = Math.max(8, Math.round(labelFont * 1.05));
    ctx.font = `bold ${vFont}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const k = ABILITY_ORDER[i];
      const v = Math.max(0, Math.min(max, abilities[k] || 0));
      const r = R * v / max;
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
      const ca = Math.cos(a), sa = Math.sin(a);
      const px = cx + ca * r, py = cy + sa * r;
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#4ecdc4';
      ctx.fill();
      const outward = r + vFont * 1.25 < R;
      const off = outward ? vFont * 0.72 : -vFont * 1.0;
      const tx = px + ca * off, ty = py + sa * off;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,10,18,0.92)';
      ctx.strokeText(String(v), tx, ty);
      ctx.fillStyle = (v === topV) ? LABEL_PROF : LABEL_NORMAL;
      ctx.fillText(String(v), tx, ty);
    }
  }

  // 轴名：2 字全称，按左右方向对齐向外排版（避免被画布裁切）
  ctx.font = `bold ${labelFont}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const canAlloc = !!(playerStats && playerStats.abilityPoints > 0 && (phase === PHASE.PLANNING || phase === PHASE.LEVELCLEAR));
  for (let i = 0; i < n; i++) {
    const k = ABILITY_ORDER[i];
    const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const dist = R + pad + labelFont * 0.2;
    const lx = cx + ca * dist, ly = cy + sa * dist;
    ctx.textAlign = ca > 0.2 ? 'left' : (ca < -0.2 ? 'right' : 'center');
    const inSelect = phase === PHASE.CHAR_SELECT;
    const profMelee = inSelect ? !!(selectedCandidate && CHARACTERS[selectedCandidate.id].profMelee) : !!(playerStats && playerStats.profMelee);
    const profRanged = inSelect ? !!(selectedCandidate && CHARACTERS[selectedCandidate.id].profRanged) : !!(playerStats && playerStats.profRanged);
    const profMark = abilities && ((k === 'str' && profMelee) || (k === 'int' && profRanged));
    let col = profMark ? '#8fe28a' : '#9aa';
    if (canAlloc) col = '#cfe6ff';           // 可加点时整体提亮，提示可点击
    ctx.fillStyle = col;
    ctx.fillText(ABILITY_FULL[k], lx, ly);
    radarLabelHits.push({ k, x: lx, y: ly, r: labelFont });
    // 可加点且未达上限：在属性名外画一圈金色方框，明确「点我加点」
    if (canAlloc && abilities && abilities[k] < ABILITY_CAP) {
      const tw = ctx.measureText(ABILITY_FULL[k]).width;
      const padX = Math.max(3, labelFont * 0.34);
      const padY = Math.max(2, labelFont * 0.22);
      const bw = tw + padX * 2;
      const bh = labelFont + padY * 2;
      let bx = (ca > 0.2) ? (lx - padX)
             : (ca < -0.2) ? (lx - tw - padX)
             : (lx - tw / 2 - padX);
      bx = Math.max(1, Math.min(cssW - 1 - bw, bx));      // 贴边时收进画布，避免被裁
      let by = ly - bh / 2;
      by = Math.max(1, Math.min(cssH - 1 - bh, by));
      const rr = Math.min(4, bh / 2);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx + rr, by);
      ctx.lineTo(bx + bw - rr, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rr);
      ctx.lineTo(bx + bw, by + bh - rr);
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rr, by + bh);
      ctx.lineTo(bx + rr, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rr);
      ctx.lineTo(bx, by + rr);
      ctx.quadraticCurveTo(bx, by, bx + rr, by);
      ctx.stroke();
    }
  }

  // 等级已移到角色卡「名字右侧」显示（金色 Lv.N），六维图中心不再绘制，保持留白。
}
