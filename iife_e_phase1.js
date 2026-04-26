// =============================================================
// OMIM Phase I — Knowledge graph + Personalized PageRank
// HPO seeds → ontology bridge → graph traversal → ranked candidates
// =============================================================
(function omimPhase1() {
  const canvas = document.getElementById('omim-phase1');
  if (!canvas) return;
  let { ctx, w, h } = setupCanvas(canvas);
  const readout = document.getElementById('readout-phase1');

  function rand(a, b) { return a + Math.random() * (b - a); }

  const DISEASE_POOL = [
    { id: 'OMIM:614019', name: 'Pitt-Hopkins-like syndrome',
      hpo: ['HP:0001263', 'HP:0001249', 'HP:0001999'],
      candidates: [
        { name: 'TBR1',    pr: 0.082, tier: 1 },
        { name: 'SLC6A18', pr: 0.071, tier: 1 },
        { name: 'GRIN2B',  pr: 0.058, tier: 1 },
        { name: 'FOXG1',   pr: 0.044, tier: 1 },
        { name: 'ARID1B',  pr: 0.033, tier: 2 },
        { name: 'CHD7',    pr: 0.027, tier: 2 },
        { name: 'POGZ',    pr: 0.022, tier: 2 },
        { name: 'KMT2D',   pr: 0.018, tier: 2 }
      ]},
    { id: 'OMIM:615281', name: 'STALE syndrome',
      hpo: ['HP:0003254', 'HP:0001288', 'HP:0002066'],
      candidates: [
        { name: 'NSD1',    pr: 0.078, tier: 1 },
        { name: 'EHMT1',   pr: 0.064, tier: 1 },
        { name: 'MED13L',  pr: 0.052, tier: 1 },
        { name: 'ANKRD11', pr: 0.041, tier: 1 },
        { name: 'TCF20',   pr: 0.033, tier: 2 },
        { name: 'SETD5',   pr: 0.026, tier: 2 },
        { name: 'MEF2C',   pr: 0.020, tier: 2 },
        { name: 'DEAF1',   pr: 0.017, tier: 2 }
      ]},
    { id: 'OMIM:613950', name: 'Coffin-Siris-like',
      hpo: ['HP:0000252', 'HP:0001263', 'HP:0001388'],
      candidates: [
        { name: 'ARID1A',  pr: 0.084, tier: 1 },
        { name: 'SOX11',   pr: 0.067, tier: 1 },
        { name: 'BICRA',   pr: 0.054, tier: 1 },
        { name: 'SMARCB1', pr: 0.043, tier: 1 },
        { name: 'SMARCA4', pr: 0.034, tier: 2 },
        { name: 'SS18L1',  pr: 0.027, tier: 2 },
        { name: 'PHF6',    pr: 0.022, tier: 2 },
        { name: 'KMT2A',   pr: 0.018, tier: 2 }
      ]}
  ];

  // Knowledge graph nodes
  const N_NODES = 130;
  const NODE_TYPES = ['gene', 'enhancer', 'lncRNA', 'miRNA'];
  const TYPE_W = [0.55, 0.20, 0.15, 0.10];
  function pickType() {
    const r = Math.random(); let cum = 0;
    for (let i = 0; i < NODE_TYPES.length; i++) { cum += TYPE_W[i]; if (r < cum) return NODE_TYPES[i]; }
    return 'gene';
  }
  const CLUSTERS = [
    { cx: 0.25, cy: 0.32, sd: 0.13 }, { cx: 0.72, cy: 0.30, sd: 0.13 },
    { cx: 0.30, cy: 0.74, sd: 0.13 }, { cx: 0.76, cy: 0.72, sd: 0.13 }
  ];
  const nodes = [];
  for (let i = 0; i < N_NODES; i++) {
    const cl = CLUSTERS[i % CLUSTERS.length];
    const u = Math.random(), v = Math.random();
    const gx = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v) * cl.sd;
    const gy = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.sin(2 * Math.PI * v) * cl.sd;
    let x = cl.cx + gx, y = cl.cy + gy;
    x = Math.max(0.04, Math.min(0.96, x)); y = Math.max(0.04, Math.min(0.96, y));
    nodes.push({ x, y, type: pickType(), prob: 0, isSeed: false, pulse: 0 });
  }
  const edges = [];
  for (let i = 0; i < N_NODES; i++) {
    const dists = [];
    for (let j = 0; j < N_NODES; j++) {
      if (i === j) continue;
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
      dists.push({ j, d: Math.sqrt(dx * dx + dy * dy) });
    }
    dists.sort((a, b) => a.d - b.d);
    const k = 2 + Math.floor(Math.random() * 2);
    for (let m = 0; m < k && m < dists.length; m++) {
      const j = dists[m].j;
      if (!edges.find(e => (e.a === i && e.b === j) || (e.a === j && e.b === i))) {
        edges.push({ a: i, b: j, weight: rand(0.4, 1.0) });
      }
    }
  }

  const particles = [];
  const MAX_PARTICLES = 90;
  let particleSpawnTimer = 0;

  let cycleN = 0;
  let currentDisease = DISEASE_POOL[0];
  let seedNodeIndices = [];
  let cycleTimer = 0;
  const CYCLE_DUR = 7.5;

  function setupCycle() {
    currentDisease = DISEASE_POOL[cycleN % DISEASE_POOL.length];
    seedNodeIndices = [];
    while (seedNodeIndices.length < 5) {
      const idx = Math.floor(Math.random() * N_NODES);
      if (seedNodeIndices.indexOf(idx) === -1) seedNodeIndices.push(idx);
    }
    for (const n of nodes) { n.prob = 0; n.isSeed = false; n.pulse = 0; }
    for (const idx of seedNodeIndices) { nodes[idx].isSeed = true; nodes[idx].prob = 1; }
    particles.length = 0; particleSpawnTimer = 0;
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

    // Pulse seeds
    for (const idx of seedNodeIndices) { nodes[idx].pulse += dt; nodes[idx].prob = 1; }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; const e = edges[p.edgeIdx];
      if (!e) { particles.splice(i, 1); continue; }
      p.t += dt * p.speed;
      if (p.t >= 1) {
        const targetIdx = p.dir > 0 ? e.b : e.a;
        nodes[targetIdx].prob = Math.min(1, nodes[targetIdx].prob + 0.10);
        if (Math.random() < 0.6 && particles.length < MAX_PARTICLES) {
          const outE = [];
          for (let k = 0; k < edges.length; k++) {
            const ek = edges[k];
            if (ek.a === targetIdx || ek.b === targetIdx) outE.push(k);
          }
          if (outE.length > 0) {
            const ek = outE[Math.floor(Math.random() * outE.length)];
            const ee = edges[ek];
            p.edgeIdx = ek; p.t = 0;
            p.dir = ee.a === targetIdx ? 1 : -1;
            p.speed = 1.0 + Math.random() * 0.8; continue;
          }
        }
        particles.splice(i, 1);
      }
    }
    // Spawn
    particleSpawnTimer += dt;
    while (particleSpawnTimer >= 0.022 && particles.length < MAX_PARTICLES) {
      particleSpawnTimer -= 0.022;
      const energetic = [];
      for (let i = 0; i < N_NODES; i++) if (nodes[i].prob > 0.12) energetic.push(i);
      if (energetic.length === 0) break;
      const srcIdx = energetic[Math.floor(Math.random() * energetic.length)];
      const outE = [];
      for (let k = 0; k < edges.length; k++) {
        const ek = edges[k];
        if (ek.a === srcIdx || ek.b === srcIdx) outE.push(k);
      }
      if (outE.length === 0) continue;
      const ek = outE[Math.floor(Math.random() * outE.length)];
      const ee = edges[ek];
      particles.push({
        edgeIdx: ek, t: 0, speed: 1.0 + Math.random() * 0.8,
        dir: ee.a === srcIdx ? 1 : -1
      });
    }
    // Decay
    for (let i = 0; i < N_NODES; i++) if (!nodes[i].isSeed) nodes[i].prob *= (1 - dt * 0.20);

    // ---- Drawing ----
    ctx.clearRect(0, 0, w, h);
    const padTop = 30, padBot = 16, padLR = 18;
    const innerT = padTop, innerB = h - padBot;
    const tierColW = 130;
    const graphLeft = padLR, graphRight = w - tierColW - padLR;
    const graphTop = innerT + 50, graphBot = innerB - 16;

    // disease label (top right)
    ctx.fillStyle = 'rgba(110,31,34,0.85)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(currentDisease.id + ' · ' + currentDisease.name, w - padLR, 14);

    // HPO seeds banner
    ctx.fillStyle = 'rgba(26,22,18,0.55)';
    ctx.font = 'italic 9.5px "Crimson Pro", "Instrument Serif", serif';
    ctx.textAlign = 'left';
    ctx.fillText('HPO seed terms', padLR, innerT + 12);
    ctx.font = '9.5px "JetBrains Mono", monospace';
    let hpoX = padLR;
    const hpoY = innerT + 30;
    for (const term of currentDisease.hpo) {
      const tw = ctx.measureText(term).width;
      ctx.fillStyle = 'rgba(245,241,232,0.85)';
      ctx.fillRect(hpoX - 2, hpoY - 9, tw + 4, 12);
      ctx.strokeStyle = 'rgba(110,31,34,0.55)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(hpoX - 2, hpoY - 9, tw + 4, 12);
      ctx.fillStyle = 'rgba(110,31,34,0.85)';
      ctx.fillText(term, hpoX, hpoY);
      hpoX += tw + 10;
    }

    // edges
    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      const ax = graphLeft + a.x * (graphRight - graphLeft);
      const ay = graphTop + a.y * (graphBot - graphTop);
      const bx = graphLeft + b.x * (graphRight - graphLeft);
      const by = graphTop + b.y * (graphBot - graphTop);
      const ep = Math.max(a.prob, b.prob);
      ctx.strokeStyle = 'rgba(26,22,18,' + (0.06 + ep * 0.30).toFixed(3) + ')';
      ctx.lineWidth = 0.4 + ep * 0.7;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    // particles
    for (const p of particles) {
      const e = edges[p.edgeIdx]; if (!e) continue;
      const a = nodes[e.a], b = nodes[e.b];
      const ax = graphLeft + a.x * (graphRight - graphLeft);
      const ay = graphTop + a.y * (graphBot - graphTop);
      const bx = graphLeft + b.x * (graphRight - graphLeft);
      const by = graphTop + b.y * (graphBot - graphTop);
      const tt = p.dir > 0 ? p.t : (1 - p.t);
      const px = ax + (bx - ax) * tt, py = ay + (by - ay) * tt;
      ctx.fillStyle = 'rgba(190,151,72,0.9)';
      ctx.beginPath(); ctx.arc(px, py, 1.7, 0, Math.PI * 2); ctx.fill();
      const tx = ax + (bx - ax) * Math.max(0, tt - 0.10);
      const ty = ay + (by - ay) * Math.max(0, tt - 0.10);
      ctx.strokeStyle = 'rgba(190,151,72,0.40)';
      ctx.lineWidth = 1.0;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
    }
    // nodes
    for (let i = 0; i < N_NODES; i++) {
      const n = nodes[i];
      const nx = graphLeft + n.x * (graphRight - graphLeft);
      const ny = graphTop + n.y * (graphBot - graphTop);
      const r = n.isSeed ? 3.5 : 1.5 + n.prob * 2.5;
      const baseAlpha = (0.30 + n.prob * 0.65);
      let color;
      if (n.type === 'gene')          color = 'rgba(26,22,18,' + baseAlpha.toFixed(3) + ')';
      else if (n.type === 'enhancer') color = 'rgba(30,77,62,' + baseAlpha.toFixed(3) + ')';
      else if (n.type === 'lncRNA')   color = 'rgba(110,31,34,' + baseAlpha.toFixed(3) + ')';
      else                            color = 'rgba(190,151,72,' + baseAlpha.toFixed(3) + ')';
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2); ctx.fill();
      if (n.isSeed) {
        const pulseR = 5.6 + Math.sin(n.pulse * 4) * 1.7;
        ctx.strokeStyle = 'rgba(190,151,72,0.92)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(nx, ny, pulseR, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // tier candidates column (right)
    const tierLeft = graphRight + 16;
    const tierRight = w - padLR;
    ctx.fillStyle = 'rgba(26,22,18,0.65)';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('RANKED CANDIDATES', tierLeft, graphTop - 6);
    const revealN = Math.min(8, Math.floor((cycleTimer / CYCLE_DUR) * 9));
    const tierH = (graphBot - graphTop) / 8;
    for (let i = 0; i < Math.min(8, currentDisease.candidates.length); i++) {
      const c = currentDisease.candidates[i];
      const ry = graphTop + (i + 0.5) * tierH;
      const va = i < revealN ? 1 : 0;
      ctx.fillStyle = c.tier === 1
        ? 'rgba(190,151,72,' + (0.95 * va).toFixed(3) + ')'
        : 'rgba(26,22,18,' + (0.50 * va).toFixed(3) + ')';
      ctx.font = 'bold 7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('T' + c.tier, tierLeft, ry + 3);
      ctx.fillStyle = 'rgba(26,22,18,' + (0.88 * va).toFixed(3) + ')';
      ctx.font = 'italic 11px "Crimson Pro", "Instrument Serif", serif';
      ctx.fillText(c.name, tierLeft + 22, ry + 3);
      ctx.fillStyle = 'rgba(26,22,18,' + (0.50 * va).toFixed(3) + ')';
      ctx.font = '7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(c.pr.toFixed(3), tierRight, ry + 3);
    }

    if (readout) {
      readout.textContent = 'cycle ' + (cycleN + 1) + ' · ' + currentDisease.id + ' · phase I · scoring · ' + particles.length + ' active flows · ' + seedNodeIndices.length + ' HPO seeds';
    }

    requestAnimationFrame(frame);
  }
  gate.frameFn = frame;
  gate.running = true;
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { ({ ctx, w, h } = setupCanvas(canvas)); });
})();
