// =============================================================
// OMIM Phase II — Candidate × Database deep-investigation matrix
// Agent walks each cell, fills score, rejects pseudogenes / below-threshold,
// surfaces a late candidate from literature, marks top-3 advancing.
// =============================================================
(function omimPhase2() {
  const canvas = document.getElementById('omim-phase2');
  if (!canvas) return;
  let { ctx, w, h } = setupCanvas(canvas);
  const readout = document.getElementById('readout-phase2');

  function rand(a, b) { return a + Math.random() * (b - a); }

  const DB_NAMES = ['gnomAD', 'GTEx', 'mouse', 'ClinVar', 'DECIPHER', 'Hi-C', 'scAtlas', 'consrv', 'GWAS', 'PPI'];
  const N_DBS = DB_NAMES.length;

  const DISEASE_POOL = [
    { id: 'OMIM:614019', name: 'Pitt-Hopkins-like',
      candidates: [
        { name: 'TBR1',    pr: 0.082, tier: 1 },
        { name: 'SLC6A18', pr: 0.071, tier: 1 },
        { name: 'GRIN2B',  pr: 0.058, tier: 1 },
        { name: 'FOXG1',   pr: 0.044, tier: 1 },
        { name: 'ARID1B',  pr: 0.033, tier: 2 },
        { name: 'CHD7',    pr: 0.027, tier: 2 },
        { name: 'POGZ',    pr: 0.022, tier: 2 },
        { name: 'KMT2D',   pr: 0.018, tier: 2 }
      ], winner: 'TBR1', rejected: 'SLC6A18', missed: 'TWIST2' },
    { id: 'OMIM:615281', name: 'STALE syndrome',
      candidates: [
        { name: 'NSD1',    pr: 0.078, tier: 1 },
        { name: 'EHMT1',   pr: 0.064, tier: 1 },
        { name: 'MED13L',  pr: 0.052, tier: 1 },
        { name: 'ANKRD11', pr: 0.041, tier: 1 },
        { name: 'TCF20',   pr: 0.033, tier: 2 },
        { name: 'SETD5',   pr: 0.026, tier: 2 },
        { name: 'MEF2C',   pr: 0.020, tier: 2 },
        { name: 'DEAF1',   pr: 0.017, tier: 2 }
      ], winner: 'EHMT1', rejected: 'TCF20', missed: 'DPF2' },
    { id: 'OMIM:613950', name: 'Coffin-Siris-like',
      candidates: [
        { name: 'ARID1A',  pr: 0.084, tier: 1 },
        { name: 'SOX11',   pr: 0.067, tier: 1 },
        { name: 'BICRA',   pr: 0.054, tier: 1 },
        { name: 'SMARCB1', pr: 0.043, tier: 1 },
        { name: 'SMARCA4', pr: 0.034, tier: 2 },
        { name: 'SS18L1',  pr: 0.027, tier: 2 },
        { name: 'PHF6',    pr: 0.022, tier: 2 },
        { name: 'KMT2A',   pr: 0.018, tier: 2 }
      ], winner: 'BICRA', rejected: 'SS18L1', missed: 'ARID2' }
  ];

  let cycleN = 0;
  let currentDisease = DISEASE_POOL[0];
  let candidates = [];
  let agentRow = 0, agentCol = 0;
  let agentTimer = 0;
  const AGENT_CELL_TIME = 0.13;
  let lateAdded = false;
  let cycleTimer = 0;
  const CYCLE_DUR = 12.0;

  function setupCycle() {
    currentDisease = DISEASE_POOL[cycleN % DISEASE_POOL.length];
    candidates = currentDisease.candidates.map(c => ({
      name: c.name, tier: c.tier, pr: c.pr,
      cells: new Array(N_DBS).fill(0).map(() => ({ filled: false, score: 0 })),
      confidence: 0, rejected: false, rejectReason: null, late: false, advancing: false
    }));
    const rejIdx = candidates.findIndex(c => c.name === currentDisease.rejected);
    if (rejIdx >= 0) candidates[rejIdx].rejectReason = 'pseudogene';
    agentRow = 0; agentCol = 0; agentTimer = 0; lateAdded = false;
  }
  setupCycle();

  function pickAdvancing() {
    const survivors = candidates.filter(c => !c.rejected);
    survivors.sort((a, b) => b.confidence - a.confidence);
    const top = survivors.slice(0, 3);
    for (const c of top) c.advancing = true;
  }

  let lastT = performance.now();
  const gate = makeVisibilityGate(canvas);

  function frame() {
    if (!gate.visible) { gate.running = false; return; }
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;

    cycleTimer += dt;
    if (cycleTimer > CYCLE_DUR) {
      cycleN++; cycleTimer = 0; setupCycle();
    }

    // Agent fills cells
    agentTimer += dt;
    let safety = 0;
    while (agentTimer >= AGENT_CELL_TIME && agentRow < candidates.length && safety++ < 30) {
      agentTimer -= AGENT_CELL_TIME;
      const c = candidates[agentRow];
      if (c.rejected) { agentRow++; agentCol = 0; continue; }
      let score;
      if (c.name === currentDisease.winner) score = rand(0.70, 0.96);
      else if (c.name === currentDisease.missed) score = rand(0.55, 0.85);
      else if (c.rejectReason === 'pseudogene') {
        if (agentCol === 0 || agentCol === 7) score = rand(0.0, 0.10);
        else score = rand(0.05, 0.28);
      } else if (c.tier === 1) score = rand(0.30, 0.62);
      else score = rand(0.15, 0.48);
      c.cells[agentCol].filled = true;
      c.cells[agentCol].score = score;
      agentCol++;
      if (agentCol >= N_DBS) {
        const sum = c.cells.reduce((s, cl) => s + cl.score, 0);
        c.confidence = sum / N_DBS;
        if (c.rejectReason === 'pseudogene' && c.confidence < 0.30) c.rejected = true;
        else if (c.confidence < 0.38) {
          c.rejected = true;
          if (!c.rejectReason) c.rejectReason = 'below threshold';
        }
        agentRow++; agentCol = 0;
        if (!lateAdded && agentRow === currentDisease.candidates.length && currentDisease.missed) {
          lateAdded = true;
          candidates.push({
            name: currentDisease.missed, tier: 0, pr: 0,
            cells: new Array(N_DBS).fill(0).map(() => ({ filled: false, score: 0 })),
            confidence: 0, rejected: false, rejectReason: null, late: true, advancing: false
          });
        }
        if (agentRow >= candidates.length) pickAdvancing();
      }
    }

    // ---- Drawing ----
    ctx.clearRect(0, 0, w, h);
    const padTop = 30, padBot = 16, padLR = 18;
    const innerT = padTop, innerB = h - padBot;

    // disease label
    ctx.fillStyle = 'rgba(110,31,34,0.85)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(currentDisease.id + ' · ' + currentDisease.name, w - padLR, 14);

    const matT = innerT + 36, matB = innerB - 8;
    const candCol = padLR, candColW = 130;
    const confColW = 56;
    const dbColStart = candCol + candColW + 4;
    const dbColEnd = w - padLR - confColW - 4;
    const cellW = (dbColEnd - dbColStart) / N_DBS;
    const visCands = Math.min(candidates.length, 9);
    const cellH = (matB - matT) / Math.max(visCands, 8);

    // Headers
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(26,22,18,0.65)';
    for (let j = 0; j < N_DBS; j++) {
      const cx = dbColStart + (j + 0.5) * cellW;
      ctx.save();
      ctx.translate(cx, matT - 6);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'left';
      ctx.fillText(DB_NAMES[j], 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.fillText('CONF', dbColEnd + confColW / 2, matT - 6);
    ctx.textAlign = 'left';
    ctx.fillText('CANDIDATE', candCol, matT - 6);

    // Rows
    for (let i = 0; i < visCands; i++) {
      const c = candidates[i];
      const ry = matT + i * cellH;
      // background tint by status
      if (c.advancing) {
        ctx.fillStyle = 'rgba(30,77,62,0.10)';
        ctx.fillRect(padLR, ry, w - 2 * padLR, cellH);
      } else if (c.rejected) {
        ctx.fillStyle = 'rgba(110,31,34,0.06)';
        ctx.fillRect(padLR, ry, w - 2 * padLR, cellH);
      } else if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(26,22,18,0.025)';
        ctx.fillRect(padLR, ry, w - 2 * padLR, cellH);
      }
      // tier label
      const tierLbl = c.late ? 'NEW' : 'T' + c.tier;
      ctx.fillStyle = c.late ? 'rgba(30,77,62,0.85)'
                    : c.tier === 1 ? 'rgba(190,151,72,0.85)'
                    : 'rgba(26,22,18,0.55)';
      ctx.font = 'bold 7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(tierLbl, candCol, ry + cellH * 0.42);
      // name
      ctx.fillStyle = c.rejected ? 'rgba(26,22,18,0.40)' : 'rgba(26,22,18,0.90)';
      ctx.font = 'italic 12px "Crimson Pro", "Instrument Serif", serif';
      ctx.fillText(c.name, candCol + 22, ry + cellH * 0.55);
      // status badge
      if (c.rejected) {
        ctx.strokeStyle = 'rgba(110,31,34,0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(candCol + 22, ry + cellH * 0.50);
        ctx.lineTo(candCol + candColW - 4, ry + cellH * 0.50);
        ctx.stroke();
        const reason = c.rejectReason === 'pseudogene' ? '✕ pseudogene' : '✕ < threshold';
        ctx.fillStyle = 'rgba(110,31,34,0.75)';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText(reason, candCol + 22, ry + cellH * 0.55 + 11);
      } else if (c.advancing) {
        ctx.fillStyle = 'rgba(30,77,62,0.85)';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText('▶ to phase III', candCol + 22, ry + cellH * 0.55 + 11);
      } else if (c.late) {
        ctx.fillStyle = 'rgba(30,77,62,0.65)';
        ctx.font = 'italic 8px "Crimson Pro", "Instrument Serif", serif';
        ctx.fillText('newly surfaced', candCol + 22, ry + cellH * 0.55 + 11);
      }
      // cells
      for (let j = 0; j < N_DBS; j++) {
        const cx = dbColStart + j * cellW;
        const cy = ry + cellH * 0.50 - 6;
        const cellInnerW = cellW - 3;
        const cellInnerH = 11;
        ctx.strokeStyle = 'rgba(26,22,18,0.20)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx + 1, cy, cellInnerW, cellInnerH);
        if (c.cells[j].filled) {
          const sc = c.cells[j].score;
          let cellColor;
          if (c.rejected) cellColor = 'rgba(110,31,34,0.45)';
          else if (sc > 0.7) cellColor = 'rgba(190,151,72,0.85)';
          else if (sc > 0.4) cellColor = 'rgba(26,22,18,0.65)';
          else cellColor = 'rgba(110,31,34,0.55)';
          ctx.fillStyle = cellColor;
          ctx.fillRect(cx + 1, cy, cellInnerW * sc, cellInnerH);
        }
      }
      // confidence
      const allFilled = c.cells.every(cl => cl.filled);
      if (allFilled) {
        ctx.fillStyle = c.rejected ? 'rgba(110,31,34,0.65)'
                      : c.confidence > 0.65 ? 'rgba(190,151,72,0.95)'
                      : 'rgba(26,22,18,0.70)';
        ctx.font = (c.confidence > 0.65 && !c.rejected) ? 'bold 11px "JetBrains Mono", monospace'
                                                        : '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText((c.confidence * 100).toFixed(0) + '%', dbColEnd + confColW / 2, ry + cellH * 0.58);
      }
    }
    // Agent cursor
    if (agentRow < visCands) {
      const cx = dbColStart + (agentCol + 0.5) * cellW;
      const cy = matT + (agentRow + 0.5) * cellH;
      ctx.strokeStyle = 'rgba(190,151,72,0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(190,151,72,0.85)';
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    if (readout) {
      const fillN = candidates.reduce((s, c) => s + c.cells.filter(cl => cl.filled).length, 0);
      const totalCells = candidates.length * N_DBS;
      const rejN = candidates.filter(c => c.rejected).length;
      readout.textContent = 'cycle ' + (cycleN + 1) + ' · ' + currentDisease.id + ' · phase II · investigation · ' + fillN + '/' + totalCells + ' cells · ' + rejN + ' rejected';
    }

    requestAnimationFrame(frame);
  }
  gate.frameFn = frame;
  gate.running = true;
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { ({ ctx, w, h } = setupCanvas(canvas)); });
})();
