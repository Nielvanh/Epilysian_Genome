// =============================================================
// OMIM Phase III — Finalist × Mechanism evaluation
// 3 finalists × 6 mechanisms (LoF, GoF, Dom-Neg, Haplo, Splice, Reg)
// In-silico tests fill cells one by one. The (gene, mechanism) pair
// with highest evidence is crowned with a gold ring + final answer.
// =============================================================
(function omimPhase3() {
  const canvas = document.getElementById('omim-phase3');
  if (!canvas) return;
  let { ctx, w, h } = setupCanvas(canvas);
  const readout = document.getElementById('readout-phase3');

  function rand(a, b) { return a + Math.random() * (b - a); }

  const MECH_NAMES = ['LoF', 'GoF', 'Dom-Neg', 'Haplo', 'Splice', 'Reg'];
  const MECH_FULL = {
    'LoF':     'loss-of-function',
    'GoF':     'gain-of-function',
    'Dom-Neg': 'dominant-negative',
    'Haplo':   'haploinsufficiency',
    'Splice':  'splicing defect',
    'Reg':     'regulatory disruption'
  };
  const N_MECH = MECH_NAMES.length;

  // Each disease defines 3 finalists (the candidates that survived Phase II)
  // and a "winner" mechanism. The winner finalist × winner mechanism cell
  // is the highest-scoring combination at the end.
  const DISEASE_POOL = [
    {
      id: 'OMIM:614019', name: 'Pitt-Hopkins-like',
      finalists: [
        { name: 'TBR1',   confidence: 0.85 },
        { name: 'GRIN2B', confidence: 0.50 },
        { name: 'TWIST2', confidence: 0.72, late: true }
      ],
      winner: 'TBR1', mechanism: 'Haplo'
    },
    {
      id: 'OMIM:615281', name: 'STALE syndrome',
      finalists: [
        { name: 'EHMT1',  confidence: 0.83 },
        { name: 'NSD1',   confidence: 0.55 },
        { name: 'DPF2',   confidence: 0.69, late: true }
      ],
      winner: 'EHMT1', mechanism: 'LoF'
    },
    {
      id: 'OMIM:613950', name: 'Coffin-Siris-like',
      finalists: [
        { name: 'BICRA',  confidence: 0.86 },
        { name: 'ARID1A', confidence: 0.58 },
        { name: 'ARID2',  confidence: 0.71, late: true }
      ],
      winner: 'BICRA', mechanism: 'Dom-Neg'
    }
  ];

  let cycleN = 0;
  let currentDisease = DISEASE_POOL[0];
  let finalists = [];
  let mechRow = 0, mechCol = 0;
  let mechTimer = 0;
  const MECH_CELL_TIME = 0.20;
  let bestFinalIdx = -1, bestMechIdx = -1;
  let cycleTimer = 0;
  const CYCLE_DUR = 11.0;

  function setupCycle() {
    currentDisease = DISEASE_POOL[cycleN % DISEASE_POOL.length];
    finalists = currentDisease.finalists.map(f => ({
      name: f.name, confidence: f.confidence, late: !!f.late,
      mechCells: new Array(N_MECH).fill(0).map(() => ({ filled: false, score: 0 }))
    }));
    mechRow = 0; mechCol = 0; mechTimer = 0;
    bestFinalIdx = -1; bestMechIdx = -1;
  }
  setupCycle();

  let lastT = performance.now();
  const gate = makeVisibilityGate(canvas);

  function frame() {
    if (!gate.visible) { gate.running = false; return; }
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;

    cycleTimer += dt;
    if (cycleTimer > CYCLE_DUR) { cycleN++; cycleTimer = 0; setupCycle(); }

    // Agent fills mechanism cells
    mechTimer += dt;
    let safety = 0;
    while (mechTimer >= MECH_CELL_TIME && mechRow < finalists.length && safety++ < 20) {
      mechTimer -= MECH_CELL_TIME;
      const f = finalists[mechRow];
      const mechName = MECH_NAMES[mechCol];
      const isWinner = f.name === currentDisease.winner;
      const isLate = f.late;
      const isCorrectMech = mechName === currentDisease.mechanism;
      let score;
      if (isWinner && isCorrectMech) score = rand(0.86, 0.98);
      else if (isWinner)             score = rand(0.10, 0.32);
      else if (isLate && isCorrectMech) score = rand(0.40, 0.65);
      else if (isCorrectMech)        score = rand(0.25, 0.55);
      else                           score = rand(0.10, 0.45);
      f.mechCells[mechCol].filled = true;
      f.mechCells[mechCol].score = score;
      mechCol++;
      if (mechCol >= N_MECH) { mechRow++; mechCol = 0; }
    }
    if (mechRow >= finalists.length && bestFinalIdx === -1) {
      let bestS = 0;
      for (let i = 0; i < finalists.length; i++) {
        for (let j = 0; j < N_MECH; j++) {
          const s = finalists[i].mechCells[j].score;
          if (s > bestS) { bestS = s; bestFinalIdx = i; bestMechIdx = j; }
        }
      }
    }

    // ---- Drawing ----
    ctx.clearRect(0, 0, w, h);
    const padTop = 30, padBot = 56, padLR = 18;
    const innerT = padTop, innerB = h - padBot;

    // disease label
    ctx.fillStyle = 'rgba(110,31,34,0.85)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(currentDisease.id + ' · ' + currentDisease.name, w - padLR, 14);

    const fT = innerT + 36, fB = innerB - 8;
    const fLeft = padLR;
    const fRight = w - padLR;
    const nameColW = 130;
    const mCellStart = fLeft + nameColW + 4;
    const mCellEnd = fRight - 4;
    const mCellW = (mCellEnd - mCellStart) / N_MECH;
    const fRowH = (fB - fT) / Math.max(3, finalists.length);

    // Mechanism column headers (rotated)
    ctx.font = '9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(26,22,18,0.65)';
    for (let j = 0; j < N_MECH; j++) {
      const cx = mCellStart + (j + 0.5) * mCellW;
      ctx.save();
      ctx.translate(cx, fT - 6);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'left';
      ctx.fillText(MECH_NAMES[j], 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'left';
    ctx.fillText('FINALIST', fLeft, fT - 6);

    // Finalist rows
    for (let i = 0; i < finalists.length; i++) {
      const f = finalists[i];
      const ry = fT + i * fRowH;
      ctx.fillStyle = 'rgba(30,77,62,0.06)';
      ctx.fillRect(fLeft, ry, fRight - fLeft, fRowH);

      ctx.fillStyle = 'rgba(26,22,18,0.90)';
      ctx.font = 'italic 13px "Crimson Pro", "Instrument Serif", serif';
      ctx.textAlign = 'left';
      ctx.fillText(f.name, fLeft, ry + fRowH * 0.45);
      ctx.fillStyle = 'rgba(26,22,18,0.55)';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('p2 conf ' + (f.confidence * 100).toFixed(0) + '%' + (f.late ? ' · NEW' : ''),
                   fLeft, ry + fRowH * 0.45 + 12);

      for (let j = 0; j < N_MECH; j++) {
        const cx = mCellStart + j * mCellW;
        const cy = ry + fRowH * 0.40 - 6;
        const cellInnerW = mCellW - 4;
        const cellInnerH = 13;
        ctx.strokeStyle = 'rgba(26,22,18,0.20)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx + 1, cy, cellInnerW, cellInnerH);
        if (f.mechCells[j].filled) {
          const sc = f.mechCells[j].score;
          let color;
          if (sc > 0.80) color = 'rgba(190,151,72,0.92)';
          else if (sc > 0.55) color = 'rgba(30,77,62,0.75)';
          else if (sc > 0.30) color = 'rgba(26,22,18,0.55)';
          else color = 'rgba(110,31,34,0.50)';
          ctx.fillStyle = color;
          ctx.fillRect(cx + 1, cy, cellInnerW * sc, cellInnerH);
          if (sc > 0.80) {
            ctx.fillStyle = 'rgba(26,22,18,0.95)';
            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText((sc * 100).toFixed(0), cx + cellInnerW / 2, cy + cellInnerH * 0.78);
          }
        }
      }
    }

    // Agent cursor
    if (mechRow < finalists.length) {
      const cx = mCellStart + (mechCol + 0.5) * mCellW;
      const cy = fT + (mechRow + 0.5) * fRowH - fRowH * 0.05;
      ctx.strokeStyle = 'rgba(190,151,72,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(190,151,72,0.85)';
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(110,31,34,0.85)';
      ctx.font = 'italic 9px "Crimson Pro", "Instrument Serif", serif';
      ctx.textAlign = 'right';
      ctx.fillText('simulating…', fRight, fB + 14);
    }

    // Reveal — final answer
    if (bestFinalIdx >= 0) {
      const f = finalists[bestFinalIdx];
      const ry = fT + bestFinalIdx * fRowH;
      const cx = mCellStart + bestMechIdx * mCellW;
      const cy = ry + fRowH * 0.40 - 6;
      const cellInnerW = mCellW - 4;
      const cellInnerH = 13;
      // gold ring around the winning cell
      ctx.strokeStyle = 'rgba(190,151,72,0.95)';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(cx - 1, cy - 2, cellInnerW + 4, cellInnerH + 4);
      // softer ring around the row
      ctx.strokeStyle = 'rgba(190,151,72,0.55)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(fLeft - 2, ry - 1, fRight - fLeft + 4, fRowH);
      // banner at bottom
      const bannerY = innerB + 8;
      ctx.fillStyle = 'rgba(190,151,72,0.18)';
      ctx.fillRect(padLR, bannerY, w - 2 * padLR, 36);
      ctx.strokeStyle = 'rgba(190,151,72,0.85)';
      ctx.lineWidth = 1;
      ctx.strokeRect(padLR, bannerY, w - 2 * padLR, 36);
      ctx.fillStyle = 'rgba(110,31,34,0.95)';
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('★ FINAL ANSWER', padLR + 8, bannerY + 13);
      ctx.fillStyle = 'rgba(26,22,18,0.95)';
      ctx.font = 'italic 13px "Crimson Pro", "Instrument Serif", serif';
      ctx.fillText(f.name + ' · ' + MECH_FULL[MECH_NAMES[bestMechIdx]],
                   padLR + 8, bannerY + 30);
    }

    if (readout) {
      const fillM = finalists.reduce((s, f) => s + f.mechCells.filter(cl => cl.filled).length, 0);
      const totalM = finalists.length * N_MECH;
      if (bestFinalIdx >= 0) {
        readout.textContent = 'cycle ' + (cycleN + 1) + ' · ' + currentDisease.id + ' · CONVERGED · ' + finalists[bestFinalIdx].name + ' · ' + MECH_FULL[MECH_NAMES[bestMechIdx]];
      } else {
        readout.textContent = 'cycle ' + (cycleN + 1) + ' · ' + currentDisease.id + ' · phase III · mechanism · ' + finalists.length + ' finalists · ' + fillM + '/' + totalM + ' tests';
      }
    }

    requestAnimationFrame(frame);
  }
  gate.frameFn = frame;
  gate.running = true;
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { ({ ctx, w, h } = setupCanvas(canvas)); });
})();
