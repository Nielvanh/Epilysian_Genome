(function draftE_OMIMSolver() {
    const canvas = document.getElementById('draft-e');
    if (!canvas) return;
    let { ctx, w, h } = setupCanvas(canvas);
    const wrap = canvas.parentElement;
    const readout = document.getElementById('readout-e');
    let mouse = { x: 0.5, y: 0.5, inside: false };
    wrap.addEventListener('mousemove', (e) => {
      const r = wrap.getBoundingClientRect();
      mouse.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      mouse.y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      mouse.inside = true;
    });
    wrap.addEventListener('mouseleave', () => { mouse.inside = false; });

    function rand(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // ---- Disease cycle data (each cycle queries one OMIM disease) ----
    const DISEASE_POOL = [
      {
        id: 'OMIM:614019', name: 'Pitt-Hopkins-like syndrome',
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
        ],
        winner: 'TBR1', rejected: 'SLC6A18', missed: 'TWIST2',
        mechanism: 'Haplo'
      },
      {
        id: 'OMIM:615281', name: 'STALE syndrome',
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
        ],
        winner: 'EHMT1', rejected: 'TCF20', missed: 'DPF2',
        mechanism: 'LoF'
      },
      {
        id: 'OMIM:613950', name: 'Coffin-Siris-like',
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
        ],
        winner: 'BICRA', rejected: 'SS18L1', missed: 'ARID2',
        mechanism: 'Dom-Neg'
      }
    ];
    const DB_NAMES = ['gnomAD', 'GTEx', 'mouse', 'ClinVar', 'DECIPHER', 'Hi-C', 'scAtlas', 'consrv', 'GWAS', 'PPI'];
    const N_DBS = DB_NAMES.length;
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

    // ---- Knowledge graph (Phase I) — ~130 nodes in 4 clusters ----
    const N_GRAPH_NODES = 130;
    const NODE_TYPES = ['gene', 'enhancer', 'lncRNA', 'miRNA'];
    const TYPE_WEIGHTS = [0.55, 0.20, 0.15, 0.10];
    function pickType() {
      const r = Math.random();
      let cum = 0;
      for (let i = 0; i < NODE_TYPES.length; i++) {
        cum += TYPE_WEIGHTS[i];
        if (r < cum) return NODE_TYPES[i];
      }
      return 'gene';
    }
    const CLUSTERS_E = [
      { cx: 0.22, cy: 0.30, sd: 0.13 },
      { cx: 0.74, cy: 0.28, sd: 0.13 },
      { cx: 0.30, cy: 0.72, sd: 0.14 },
      { cx: 0.78, cy: 0.74, sd: 0.13 }
    ];
    const nodes = [];
    for (let i = 0; i < N_GRAPH_NODES; i++) {
      const cl = CLUSTERS_E[i % CLUSTERS_E.length];
      const u = Math.random(), v = Math.random();
      const gx = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v) * cl.sd;
      const gy = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.sin(2 * Math.PI * v) * cl.sd;
      let x = cl.cx + gx, y = cl.cy + gy;
      x = Math.max(0.04, Math.min(0.96, x));
      y = Math.max(0.04, Math.min(0.96, y));
      nodes.push({ x, y, type: pickType(), prob: 0, isSeed: false });
    }
    // Edges: each node connects to its 2-3 nearest neighbours
    const edges = [];
    for (let i = 0; i < N_GRAPH_NODES; i++) {
      const dists = [];
      for (let j = 0; j < N_GRAPH_NODES; j++) {
        if (i === j) continue;
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        dists.push({ j, d: Math.sqrt(dx * dx + dy * dy) });
      }
      dists.sort((a, b) => a.d - b.d);
      const k = 2 + Math.floor(Math.random() * 2);
      for (let m = 0; m < k && m < dists.length; m++) {
        const j = dists[m].j;
        const exists = edges.find(e => (e.a === i && e.b === j) || (e.a === j && e.b === i));
        if (!exists) edges.push({ a: i, b: j, weight: rand(0.4, 1.0) });
      }
    }

    // ---- Phase II — candidates × databases matrix state (per cycle) ----
    let candidates = [];

    // ---- Phase III — finalists × mechanism matrix state (per cycle) ----
    let finalists = [];
    let mechRow = 0, mechCol = 0;
    let mechTimer = 0;
    const MECH_CELL_TIME = 0.22;
    let bestFinalIdx = -1;
    let bestMechIdx = -1;

    // ---- Phase I — particle flow state ----
    const particles = [];
    const MAX_PARTICLES = 110;
    let particleSpawnTimer = 0;

    // ---- Phase state ----
    const PHASE_DUR_E = { phase1: 4.5, phase2: 10.0, phase3: 9.0, reveal: 4.5 };
    let phase = 'phase1';
    let phaseTimer = 0;
    let cycleN = 0;
    let currentDisease = DISEASE_POOL[0];
    let seedNodeIndices = [];
    let agentRow = 0, agentCol = 0;
    let agentTimer = 0;
    const AGENT_CELL_TIME = 0.14;
    let lateAdded = false;

    function setupCycle() {
      currentDisease = DISEASE_POOL[cycleN % DISEASE_POOL.length];
      seedNodeIndices = [];
      while (seedNodeIndices.length < 5) {
        const idx = Math.floor(Math.random() * N_GRAPH_NODES);
        if (seedNodeIndices.indexOf(idx) === -1) seedNodeIndices.push(idx);
      }
      for (const n of nodes) { n.prob = 0; n.isSeed = false; n.pulse = 0; }
      for (const idx of seedNodeIndices) {
        nodes[idx].isSeed = true;
        nodes[idx].prob = 1;
      }
      candidates = currentDisease.candidates.map((c) => ({
        name: c.name, tier: c.tier, pr: c.pr,
        cells: new Array(N_DBS).fill(0).map(() => ({ filled: false, score: 0 })),
        confidence: 0,
        rejected: false, rejectReason: null, late: false,
        advancing: false
      }));
      const rejIdx = candidates.findIndex(c => c.name === currentDisease.rejected);
      if (rejIdx >= 0) candidates[rejIdx].rejectReason = 'pseudogene';
      agentRow = 0;
      agentCol = 0;
      agentTimer = 0;
      lateAdded = false;
      particles.length = 0;
      particleSpawnTimer = 0;
      finalists = [];
      mechRow = 0;
      mechCol = 0;
      mechTimer = 0;
      bestFinalIdx = -1;
      bestMechIdx = -1;
    }
    setupCycle();

    function resetCycle() {
      cycleN++;
      setupCycle();
    }

    function pickFinalists() {
      // Take all non-rejected candidates, sort by confidence, take top 3
      const survivors = candidates.filter(c => !c.rejected);
      survivors.sort((a, b) => b.confidence - a.confidence);
      const top = survivors.slice(0, 3);
      for (const c of top) c.advancing = true;
      finalists = top.map(c => ({
        name: c.name,
        tier: c.tier,
        late: c.late,
        confidence: c.confidence,
        mechCells: new Array(N_MECH).fill(0).map(() => ({ filled: false, score: 0 }))
      }));
    }

    // ===== NEW: full-width two-phase frame =====
    let lastT = performance.now();
    const gate = makeVisibilityGate(canvas);

    function frame() {
      if (!gate.visible) { gate.running = false; return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // Phase transitions
      phaseTimer += dt;
      if (phase === 'phase1' && phaseTimer > PHASE_DUR_E.phase1) {
        phase = 'phase2';
        phaseTimer = 0;
      } else if (phase === 'phase2' && phaseTimer > PHASE_DUR_E.phase2) {
        // Hand off to Phase III: pick finalists from non-rejected candidates
        pickFinalists();
        phase = 'phase3';
        phaseTimer = 0;
      } else if (phase === 'phase3' && phaseTimer > PHASE_DUR_E.phase3) {
        phase = 'reveal';
        phaseTimer = 0;
      } else if (phase === 'reveal' && phaseTimer > PHASE_DUR_E.reveal) {
        phase = 'phase1';
        phaseTimer = 0;
        resetCycle();
      }

      // Layout — three columns
      const padTop = 30, padBot = 16, padLR = 16;
      const div1 = w * 0.34, div2 = w * 0.67;
      const p1L = padLR, p1R = div1 - 6;
      const p2L = div1 + 6, p2R = div2 - 6;
      const p3L = div2 + 6, p3R = w - padLR;
      const innerT = padTop, innerB = h - padBot;

      // Phase I — Personalized PageRank as traveling probability particles
      if (phase === 'phase1') {
        // Pulse seed nodes
        for (const idx of seedNodeIndices) {
          nodes[idx].pulse = (nodes[idx].pulse || 0) + dt;
          nodes[idx].prob = 1;
        }

        // Update existing particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          const e = edges[p.edgeIdx];
          if (!e) { particles.splice(i, 1); continue; }
          p.t += dt * p.speed;
          if (p.t >= 1) {
            const targetIdx = p.dir > 0 ? e.b : e.a;
            // Deposit probability at target node
            nodes[targetIdx].prob = Math.min(1, nodes[targetIdx].prob + 0.10);
            // 60% chance to continue from this node
            if (Math.random() < 0.6 && particles.length < MAX_PARTICLES) {
              const outEdges = [];
              for (let k = 0; k < edges.length; k++) {
                const ek = edges[k];
                if (ek.a === targetIdx || ek.b === targetIdx) outEdges.push(k);
              }
              if (outEdges.length > 0) {
                const ek = outEdges[Math.floor(Math.random() * outEdges.length)];
                const ee = edges[ek];
                p.edgeIdx = ek;
                p.t = 0;
                p.dir = ee.a === targetIdx ? 1 : -1;
                p.speed = 0.6 + Math.random() * 0.6;
                continue;
              }
            }
            particles.splice(i, 1);
          }
        }

        // Spawn new particles from energetic nodes (fast so the graph
        // visibly fills with motion right away)
        particleSpawnTimer += dt;
        while (particleSpawnTimer >= 0.022 && particles.length < MAX_PARTICLES) {
          particleSpawnTimer -= 0.022;
          // Weight by node prob (seeds always have prob=1)
          const energetic = [];
          for (let i = 0; i < N_GRAPH_NODES; i++) {
            if (nodes[i].prob > 0.12) energetic.push(i);
          }
          if (energetic.length === 0) break;
          const srcIdx = energetic[Math.floor(Math.random() * energetic.length)];
          // Find adjacent edges
          const outEdges = [];
          for (let k = 0; k < edges.length; k++) {
            const ek = edges[k];
            if (ek.a === srcIdx || ek.b === srcIdx) outEdges.push(k);
          }
          if (outEdges.length === 0) continue;
          const ek = outEdges[Math.floor(Math.random() * outEdges.length)];
          const ee = edges[ek];
          particles.push({
            edgeIdx: ek,
            t: 0,
            speed: 1.0 + Math.random() * 0.8,
            dir: ee.a === srcIdx ? 1 : -1
          });
        }

        // Slow decay so non-renewed nodes fade
        for (let i = 0; i < N_GRAPH_NODES; i++) {
          if (!nodes[i].isSeed) nodes[i].prob = nodes[i].prob * (1 - dt * 0.20);
        }
      }

      // Phase II — agent fills cells (selective rejection)
      if (phase === 'phase2') {
        agentTimer += dt;
        let safety = 0;
        while (agentTimer >= AGENT_CELL_TIME && agentRow < candidates.length && safety++ < 30) {
          agentTimer -= AGENT_CELL_TIME;
          const c = candidates[agentRow];
          if (c.rejected) { agentRow++; agentCol = 0; continue; }
          let score;
          if (c.name === currentDisease.winner) score = rand(0.70, 0.96);
          else if (c.name === currentDisease.missed) score = rand(0.55, 0.85); // late candidate also strong
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
            // Stronger selectivity:
            //  - pseudogene rejected outright if confidence < 0.30
            //  - any candidate with confidence < 0.38 rejected as below threshold
            if (c.rejectReason === 'pseudogene' && c.confidence < 0.30) {
              c.rejected = true;
            } else if (c.confidence < 0.38) {
              c.rejected = true;
              if (!c.rejectReason) c.rejectReason = 'below threshold';
            }
            agentRow++;
            agentCol = 0;
            if (!lateAdded && agentRow === currentDisease.candidates.length && currentDisease.missed) {
              lateAdded = true;
              candidates.push({
                name: currentDisease.missed, tier: 0, pr: 0,
                cells: new Array(N_DBS).fill(0).map(() => ({ filled: false, score: 0 })),
                confidence: 0, rejected: false, rejectReason: null, late: true, advancing: false
              });
            }
          }
        }
      }

      // Phase III — mechanism-test agent fills mechanism cells for finalists
      if (phase === 'phase3') {
        mechTimer += dt;
        let safety = 0;
        while (mechTimer >= MECH_CELL_TIME && mechRow < finalists.length && safety++ < 30) {
          mechTimer -= MECH_CELL_TIME;
          const f = finalists[mechRow];
          const mechName = MECH_NAMES[mechCol];
          const isWinner = f.name === currentDisease.winner;
          const isLateMissed = f.name === currentDisease.missed;
          const isCorrectMech = mechName === currentDisease.mechanism;
          let score;
          if (isWinner && isCorrectMech) score = rand(0.86, 0.98);
          else if (isWinner)             score = rand(0.10, 0.32);
          else if (isLateMissed && isCorrectMech) score = rand(0.40, 0.65);
          else if (isCorrectMech)        score = rand(0.25, 0.55);
          else                           score = rand(0.10, 0.45);
          f.mechCells[mechCol].filled = true;
          f.mechCells[mechCol].score = score;
          mechCol++;
          if (mechCol >= N_MECH) {
            mechRow++;
            mechCol = 0;
          }
        }
        // After all cells filled, compute final answer
        if (mechRow >= finalists.length && bestFinalIdx === -1) {
          let bestS = 0;
          for (let i = 0; i < finalists.length; i++) {
            for (let j = 0; j < N_MECH; j++) {
              const s = finalists[i].mechCells[j].score;
              if (s > bestS) {
                bestS = s;
                bestFinalIdx = i;
                bestMechIdx = j;
              }
            }
          }
        }
      }

      // Drawing
      ctx.clearRect(0, 0, w, h);
      const phase1Dim = phase === 'phase1' ? 1.0
                      : phase === 'phase2' ? 0.32
                      : phase === 'phase3' ? 0.22 : 0.32;
      const phase2Dim = phase === 'phase1' ? 0.15
                      : phase === 'phase2' ? 1.0
                      : phase === 'phase3' ? 0.55 : 0.55;
      const phase3Dim = phase === 'phase1' ? 0.10
                      : phase === 'phase2' ? 0.18
                      : phase === 'phase3' ? 1.0 : 1.0;

      // Phase indicator + disease label
      const phaseLbl = phase === 'phase1' ? 'PHASE I · COMPUTATIONAL SCORING'
                    : phase === 'phase2' ? 'PHASE II · DEEP INVESTIGATION'
                    : phase === 'phase3' ? 'PHASE III · MECHANISM EVALUATION'
                    : 'CONVERGED · DISCOVERY REPORT';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = phase === 'reveal' ? 'rgba(190,151,72,0.95)' : 'rgba(110,82,38,0.85)';
      ctx.textAlign = 'left';
      ctx.fillText(phaseLbl, padLR, 14);
      ctx.fillStyle = 'rgba(110,31,34,0.85)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(currentDisease.id + ' · ' + currentDisease.name, w - padLR, 14);

      // Vertical dividers
      ctx.strokeStyle = 'rgba(26,22,18,0.30)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(div1, innerT);
      ctx.lineTo(div1, innerB);
      ctx.moveTo(div2, innerT);
      ctx.lineTo(div2, innerB);
      ctx.stroke();

      // Subtitles
      ctx.font = 'italic 10.5px "Crimson Pro", serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(26,22,18,' + (0.55 * Math.max(0.42, phase1Dim)).toFixed(3) + ')';
      ctx.fillText('I — Graph + PageRank', p1L, innerT + 12);
      ctx.fillStyle = 'rgba(26,22,18,' + (0.55 * Math.max(0.42, phase2Dim)).toFixed(3) + ')';
      ctx.fillText('II — Candidate × Database', p2L, innerT + 12);
      ctx.fillStyle = 'rgba(26,22,18,' + (0.55 * Math.max(0.42, phase3Dim)).toFixed(3) + ')';
      ctx.fillText('III — Finalist × Mechanism', p3L, innerT + 12);

      // ===== PHASE I — graph (full column, tier list at bottom) =====
      const graphTop = innerT + 58;
      const graphBot = innerT + (innerB - innerT) * 0.62;
      const graphLeft = p1L + 4, graphRight = p1R - 4;

      // HPO term banner
      ctx.fillStyle = 'rgba(26,22,18,' + (0.50 * phase1Dim).toFixed(3) + ')';
      ctx.font = 'italic 9px "Crimson Pro", serif';
      ctx.textAlign = 'left';
      ctx.fillText('HPO seed terms', p1L, innerT + 28);
      ctx.font = '8.5px "JetBrains Mono", monospace';
      let hpoX = p1L;
      const hpoY = innerT + 42;
      for (const term of currentDisease.hpo) {
        const tw = ctx.measureText(term).width;
        ctx.fillStyle = 'rgba(245,241,232,' + (0.85 * phase1Dim).toFixed(3) + ')';
        ctx.fillRect(hpoX - 2, hpoY - 8, tw + 4, 11);
        ctx.strokeStyle = 'rgba(110,31,34,' + (0.55 * phase1Dim).toFixed(3) + ')';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(hpoX - 2, hpoY - 8, tw + 4, 11);
        ctx.fillStyle = 'rgba(110,31,34,' + (0.85 * phase1Dim).toFixed(3) + ')';
        ctx.fillText(term, hpoX, hpoY);
        hpoX += tw + 8;
      }

      // edges
      for (const e of edges) {
        const a = nodes[e.a], b = nodes[e.b];
        const ax = graphLeft + a.x * (graphRight - graphLeft);
        const ay = graphTop + a.y * (graphBot - graphTop);
        const bx = graphLeft + b.x * (graphRight - graphLeft);
        const by = graphTop + b.y * (graphBot - graphTop);
        const ep = Math.max(a.prob, b.prob);
        const alpha = (0.05 + ep * 0.30) * phase1Dim;
        ctx.strokeStyle = 'rgba(26,22,18,' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 0.4 + ep * 0.7;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      // particles (drawn over edges, under nodes)
      for (const p of particles) {
        const e = edges[p.edgeIdx];
        if (!e) continue;
        const a = nodes[e.a], b = nodes[e.b];
        const ax = graphLeft + a.x * (graphRight - graphLeft);
        const ay = graphTop + a.y * (graphBot - graphTop);
        const bx = graphLeft + b.x * (graphRight - graphLeft);
        const by = graphTop + b.y * (graphBot - graphTop);
        const tt = p.dir > 0 ? p.t : (1 - p.t);
        const px = ax + (bx - ax) * tt;
        const py = ay + (by - ay) * tt;
        ctx.fillStyle = 'rgba(190,151,72,' + (0.85 * phase1Dim).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
        // tail
        const tailX = ax + (bx - ax) * Math.max(0, tt - 0.10);
        const tailY = ay + (by - ay) * Math.max(0, tt - 0.10);
        ctx.strokeStyle = 'rgba(190,151,72,' + (0.40 * phase1Dim).toFixed(3) + ')';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(px, py);
        ctx.stroke();
      }

      // nodes
      for (let i = 0; i < N_GRAPH_NODES; i++) {
        const n = nodes[i];
        const nx = graphLeft + n.x * (graphRight - graphLeft);
        const ny = graphTop + n.y * (graphBot - graphTop);
        const r = n.isSeed ? 3.4 : 1.4 + n.prob * 2.6;
        const baseAlpha = (0.28 + n.prob * 0.68) * phase1Dim;
        let color;
        if (n.type === 'gene')          color = 'rgba(26,22,18,' + baseAlpha.toFixed(3) + ')';
        else if (n.type === 'enhancer') color = 'rgba(30,77,62,' + baseAlpha.toFixed(3) + ')';
        else if (n.type === 'lncRNA')   color = 'rgba(110,31,34,' + baseAlpha.toFixed(3) + ')';
        else                            color = 'rgba(190,151,72,' + baseAlpha.toFixed(3) + ')';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fill();
        if (n.isSeed) {
          // Pulsing seed ring
          const pulseR = 5.5 + Math.sin((n.pulse || 0) * 4) * 1.6;
          ctx.strokeStyle = 'rgba(190,151,72,' + (0.90 * phase1Dim).toFixed(3) + ')';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(nx, ny, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Ranked candidates list under the graph
      const tierTop = graphBot + 16, tierBot = innerB - 6;
      ctx.fillStyle = 'rgba(26,22,18,' + (0.60 * phase1Dim).toFixed(3) + ')';
      ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('RANKED CANDIDATES', p1L, tierTop - 4);
      // Progressive reveal: more candidates appear over phase1 time
      const revealN = phase === 'phase1'
        ? Math.min(8, Math.floor((phaseTimer / PHASE_DUR_E.phase1) * 9))
        : 8;
      const tierH = (tierBot - tierTop) / 8;
      for (let i = 0; i < Math.min(8, currentDisease.candidates.length); i++) {
        const c = currentDisease.candidates[i];
        const ry = tierTop + (i + 0.5) * tierH;
        const visible = i < revealN ? 1 : 0;
        const va = visible * phase1Dim;
        ctx.fillStyle = c.tier === 1
          ? 'rgba(190,151,72,' + (0.95 * va).toFixed(3) + ')'
          : 'rgba(26,22,18,' + (0.50 * va).toFixed(3) + ')';
        ctx.font = 'bold 7.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('T' + c.tier, p1L, ry + 3);
        ctx.fillStyle = 'rgba(26,22,18,' + (0.88 * va).toFixed(3) + ')';
        ctx.font = 'italic 10px "Crimson Pro", serif';
        ctx.fillText(c.name, p1L + 18, ry + 3);
        ctx.fillStyle = 'rgba(26,22,18,' + (0.50 * va).toFixed(3) + ')';
        ctx.font = '7.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(c.pr.toFixed(3), p1R - 4, ry + 3);
      }

      // ===== PHASE II — matrix (selective) =====
      const matT = innerT + 76, matB = innerB - 16;
      const candCol = p2L, candColW = 70;
      const confColW = 38;
      const dbColStart = candCol + candColW + 2;
      const dbColEnd = p2R - confColW - 2;
      const cellW = (dbColEnd - dbColStart) / N_DBS;
      const visCands = Math.min(candidates.length, 9);
      const cellH = (matB - matT) / Math.max(visCands, 8);

      // DB column headers (rotated)
      ctx.font = '7.5px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(26,22,18,' + (0.65 * phase2Dim).toFixed(3) + ')';
      for (let j = 0; j < N_DBS; j++) {
        const cx = dbColStart + (j + 0.5) * cellW;
        ctx.save();
        ctx.translate(cx, matT - 6);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'left';
        ctx.fillText(DB_NAMES[j], 0, 0);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(26,22,18,' + (0.65 * phase2Dim).toFixed(3) + ')';
      ctx.font = '7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CONF', dbColEnd + confColW / 2, matT - 6);
      ctx.textAlign = 'left';
      ctx.fillText('CANDIDATE', candCol, matT - 6);

      // candidate rows
      for (let i = 0; i < visCands; i++) {
        const c = candidates[i];
        const ry = matT + i * cellH;
        // Row background — green tint for advancing, red tint for rejected
        if (c.advancing && phase !== 'phase1') {
          ctx.fillStyle = 'rgba(30,77,62,' + (0.10 * phase2Dim).toFixed(3) + ')';
          ctx.fillRect(p2L, ry, p2R - p2L, cellH);
        } else if (c.rejected) {
          ctx.fillStyle = 'rgba(110,31,34,' + (0.06 * phase2Dim).toFixed(3) + ')';
          ctx.fillRect(p2L, ry, p2R - p2L, cellH);
        } else if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(26,22,18,' + (0.025 * phase2Dim).toFixed(3) + ')';
          ctx.fillRect(p2L, ry, p2R - p2L, cellH);
        }
        const tierLbl = c.late ? 'NEW' : 'T' + c.tier;
        ctx.fillStyle = c.late
          ? 'rgba(30,77,62,' + (0.85 * phase2Dim).toFixed(3) + ')'
          : c.tier === 1
            ? 'rgba(190,151,72,' + (0.85 * phase2Dim).toFixed(3) + ')'
            : 'rgba(26,22,18,' + (0.55 * phase2Dim).toFixed(3) + ')';
        ctx.font = 'bold 7px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(tierLbl, candCol, ry + cellH * 0.42);
        ctx.fillStyle = c.rejected
          ? 'rgba(26,22,18,' + (0.38 * phase2Dim).toFixed(3) + ')'
          : 'rgba(26,22,18,' + (0.88 * phase2Dim).toFixed(3) + ')';
        ctx.font = 'italic 10px "Crimson Pro", serif';
        ctx.fillText(c.name, candCol + 18, ry + cellH * 0.55);
        if (c.rejected) {
          // Strikethrough
          ctx.strokeStyle = 'rgba(110,31,34,' + (0.85 * phase2Dim).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(candCol + 18, ry + cellH * 0.50);
          ctx.lineTo(candCol + candColW - 2, ry + cellH * 0.50);
          ctx.stroke();
          // Reason badge
          const reason = c.rejectReason === 'pseudogene' ? '✕ pseudogene' : '✕ < threshold';
          ctx.fillStyle = 'rgba(110,31,34,' + (0.70 * phase2Dim).toFixed(3) + ')';
          ctx.font = '7.5px "JetBrains Mono", monospace';
          ctx.fillText(reason, candCol + 18, ry + cellH * 0.55 + 10);
        } else if (c.advancing && phase !== 'phase1' && phase !== 'phase2') {
          ctx.fillStyle = 'rgba(30,77,62,' + (0.85 * phase2Dim).toFixed(3) + ')';
          ctx.font = '7.5px "JetBrains Mono", monospace';
          ctx.fillText('▶ to phase III', candCol + 18, ry + cellH * 0.55 + 10);
        } else if (c.late) {
          ctx.fillStyle = 'rgba(30,77,62,' + (0.65 * phase2Dim).toFixed(3) + ')';
          ctx.font = 'italic 7.5px "Crimson Pro", serif';
          ctx.fillText('newly surfaced', candCol + 18, ry + cellH * 0.55 + 10);
        }
        for (let j = 0; j < N_DBS; j++) {
          const cx = dbColStart + j * cellW;
          const cy = ry + cellH * 0.50 - 5;
          const cellInnerW = cellW - 2;
          const cellInnerH = 9;
          ctx.strokeStyle = 'rgba(26,22,18,' + (0.18 * phase2Dim).toFixed(3) + ')';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(cx + 0.5, cy, cellInnerW, cellInnerH);
          if (c.cells[j].filled) {
            const sc = c.cells[j].score;
            let cellColor;
            if (c.rejected) cellColor = 'rgba(110,31,34,' + (0.45 * phase2Dim).toFixed(3) + ')';
            else if (sc > 0.7) cellColor = 'rgba(190,151,72,' + (0.85 * phase2Dim).toFixed(3) + ')';
            else if (sc > 0.4) cellColor = 'rgba(26,22,18,' + (0.62 * phase2Dim).toFixed(3) + ')';
            else cellColor = 'rgba(110,31,34,' + (0.55 * phase2Dim).toFixed(3) + ')';
            ctx.fillStyle = cellColor;
            ctx.fillRect(cx + 0.5, cy, cellInnerW * sc, cellInnerH);
          }
        }
        const allFilled = c.cells.every(cl => cl.filled);
        if (allFilled) {
          ctx.fillStyle = c.rejected
            ? 'rgba(110,31,34,' + (0.65 * phase2Dim).toFixed(3) + ')'
            : c.confidence > 0.65
              ? 'rgba(190,151,72,' + (0.95 * phase2Dim).toFixed(3) + ')'
              : 'rgba(26,22,18,' + (0.70 * phase2Dim).toFixed(3) + ')';
          ctx.font = (c.confidence > 0.65 && !c.rejected)
            ? 'bold 10px "JetBrains Mono", monospace'
            : '9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText((c.confidence * 100).toFixed(0) + '%', dbColEnd + confColW / 2, ry + cellH * 0.58);
        }
      }

      // Agent cursor
      if (phase === 'phase2' && agentRow < visCands) {
        const cx = dbColStart + (agentCol + 0.5) * cellW;
        const cy = matT + (agentRow + 0.5) * cellH;
        ctx.strokeStyle = 'rgba(190,151,72,0.95)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(190,151,72,0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== PHASE III — finalists × mechanism matrix =====
      const fT = innerT + 76, fB = innerB - 16;
      const fNameW = 50, fConfW = 0;
      const fLeft = p3L, fRight = p3R;
      const mCellStart = fLeft + fNameW + 2;
      const mCellEnd = fRight - 2;
      const mCellW = (mCellEnd - mCellStart) / N_MECH;
      const fRowsN = Math.max(3, finalists.length);
      const fRowH = (fB - fT) / fRowsN;

      // Mechanism column headers (rotated)
      ctx.font = '7.5px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(26,22,18,' + (0.65 * phase3Dim).toFixed(3) + ')';
      for (let j = 0; j < N_MECH; j++) {
        const cx = mCellStart + (j + 0.5) * mCellW;
        ctx.save();
        ctx.translate(cx, fT - 6);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'left';
        ctx.fillText(MECH_NAMES[j], 0, 0);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(26,22,18,' + (0.65 * phase3Dim).toFixed(3) + ')';
      ctx.font = '7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('FINALIST', fLeft, fT - 6);

      // Finalist rows
      for (let i = 0; i < finalists.length; i++) {
        const f = finalists[i];
        const ry = fT + i * fRowH;
        ctx.fillStyle = 'rgba(30,77,62,' + (0.06 * phase3Dim).toFixed(3) + ')';
        ctx.fillRect(fLeft, ry, fRight - fLeft, fRowH);

        ctx.fillStyle = 'rgba(26,22,18,' + (0.90 * phase3Dim).toFixed(3) + ')';
        ctx.font = 'italic 10.5px "Crimson Pro", serif';
        ctx.textAlign = 'left';
        ctx.fillText(f.name, fLeft, ry + fRowH * 0.45);
        ctx.fillStyle = 'rgba(26,22,18,' + (0.55 * phase3Dim).toFixed(3) + ')';
        ctx.font = '7.5px "JetBrains Mono", monospace';
        ctx.fillText('p2 conf ' + (f.confidence * 100).toFixed(0) + '%', fLeft, ry + fRowH * 0.45 + 11);

        for (let j = 0; j < N_MECH; j++) {
          const cx = mCellStart + j * mCellW;
          const cy = ry + fRowH * 0.40 - 5;
          const cellInnerW = mCellW - 2;
          const cellInnerH = 11;
          ctx.strokeStyle = 'rgba(26,22,18,' + (0.18 * phase3Dim).toFixed(3) + ')';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(cx + 0.5, cy, cellInnerW, cellInnerH);
          if (f.mechCells[j].filled) {
            const sc = f.mechCells[j].score;
            let cellColor;
            if (sc > 0.80) cellColor = 'rgba(190,151,72,' + (0.92 * phase3Dim).toFixed(3) + ')';
            else if (sc > 0.55) cellColor = 'rgba(30,77,62,' + (0.75 * phase3Dim).toFixed(3) + ')';
            else if (sc > 0.30) cellColor = 'rgba(26,22,18,' + (0.55 * phase3Dim).toFixed(3) + ')';
            else cellColor = 'rgba(110,31,34,' + (0.50 * phase3Dim).toFixed(3) + ')';
            ctx.fillStyle = cellColor;
            ctx.fillRect(cx + 0.5, cy, cellInnerW * sc, cellInnerH);
            // tiny score label for hits
            if (sc > 0.80) {
              ctx.fillStyle = 'rgba(26,22,18,0.95)';
              ctx.font = 'bold 7px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText((sc * 100).toFixed(0), cx + cellInnerW / 2, cy + cellInnerH * 0.78);
            }
          }
        }
      }

      // Phase III agent cursor
      if (phase === 'phase3' && mechRow < finalists.length) {
        const cx = mCellStart + (mechCol + 0.5) * mCellW;
        const cy = fT + (mechRow + 0.5) * fRowH - fRowH * 0.05;
        ctx.strokeStyle = 'rgba(190,151,72,0.95)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(190,151,72,0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // "in silico testing…" label
        ctx.fillStyle = 'rgba(110,31,34,0.85)';
        ctx.font = 'italic 8px "Crimson Pro", serif';
        ctx.textAlign = 'right';
        ctx.fillText('simulating…', p3R, fB + 11);
      }

      // Reveal — final answer
      if (phase === 'reveal' && bestFinalIdx >= 0) {
        const f = finalists[bestFinalIdx];
        const ry = fT + bestFinalIdx * fRowH;
        const cx = mCellStart + bestMechIdx * mCellW;
        const cy = ry + fRowH * 0.40 - 5;
        const cellInnerW = mCellW - 2;
        const cellInnerH = 11;
        // Gold ring around winning cell
        ctx.strokeStyle = 'rgba(190,151,72,0.95)';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(cx - 1, cy - 2, cellInnerW + 4, cellInnerH + 4);
        // Gold ring around full row
        ctx.strokeStyle = 'rgba(190,151,72,0.65)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(fLeft - 2, ry - 1, fRight - fLeft + 4, fRowH);
        // Crown / final answer banner at bottom of phase III column
        const bannerY = innerB - 38;
        ctx.fillStyle = 'rgba(190,151,72,0.18)';
        ctx.fillRect(p3L - 2, bannerY, p3R - p3L + 4, 32);
        ctx.strokeStyle = 'rgba(190,151,72,0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(p3L - 2, bannerY, p3R - p3L + 4, 32);
        ctx.fillStyle = 'rgba(110,31,34,0.95)';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('★ FINAL ANSWER', p3L + 4, bannerY + 11);
        ctx.fillStyle = 'rgba(26,22,18,0.95)';
        ctx.font = 'italic 11px "Crimson Pro", serif';
        ctx.fillText(f.name + ' · ' + MECH_FULL[MECH_NAMES[bestMechIdx]],
                     p3L + 4, bannerY + 26);
      }

      if (readout) {
        const phaseStr = phase === 'phase1' ? 'I · scoring'
                      : phase === 'phase2' ? 'II · investigation'
                      : phase === 'phase3' ? 'III · mechanism'
                      : 'CONVERGED';
        if (phase === 'phase1') {
          readout.textContent = 'cycle ' + (cycleN + 1) + ' · ' + currentDisease.id + ' · phase ' + phaseStr + ' · ' + particles.length + ' active flows · ' + seedNodeIndices.length + ' HPO seeds';
        } else if (phase === 'phase2') {
          const fillN = candidates.reduce((s, c) => s + c.cells.filter(cl => cl.filled).length, 0);
          const totalCells = candidates.length * N_DBS;
          const rejN = candidates.filter(c => c.rejected).length;
          readout.textContent = 'cycle ' + (cycleN + 1) + ' · ' + currentDisease.id + ' · phase ' + phaseStr + ' · ' + fillN + '/' + totalCells + ' cells · ' + rejN + ' rejected';
        } else if (phase === 'phase3') {
          const fillM = finalists.reduce((s, f) => s + f.mechCells.filter(cl => cl.filled).length, 0);
          const totalM = finalists.length * N_MECH;
          readout.textContent = 'cycle ' + (cycleN + 1) + ' · ' + currentDisease.id + ' · phase ' + phaseStr + ' · ' + finalists.length + ' finalists · ' + fillM + '/' + totalM + ' mechanism tests';
        } else {
          const winnerName = bestFinalIdx >= 0 ? finalists[bestFinalIdx].name : '—';
          const winnerMech = bestMechIdx >= 0 ? MECH_FULL[MECH_NAMES[bestMechIdx]] : '—';
          readout.textContent = 'cycle ' + (cycleN + 1) + ' · ' + currentDisease.id + ' · ' + phaseStr + ' · ' + winnerName + ' · ' + winnerMech;
        }
      }

      requestAnimationFrame(frame);
    }
    gate.frameFn = frame;
    gate.running = true;
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => { ({ ctx, w, h } = setupCanvas(canvas)); });

    /* ===== DEAD CODE BELOW — old IIFE body, replaced by new frame above =====
    // ---- Hierarchical graph ----
    // 4 tiers: disease (1) → genes (4) → proteins (5) → mechanisms (4)
    const TIERS = [
      { name: 'disease',   count: 1 },
      { name: 'gene',      count: 4 },
      { name: 'protein',   count: 5 },
      { name: 'mechanism', count: 4 }
    ];
    const nodes = [];
    for (let t = 0; t < TIERS.length; t++) {
      for (let k = 0; k < TIERS[t].count; k++) {
        nodes.push({
          tier: t, idxInTier: k, type: TIERS[t].name,
          x: 0, y: 0, attention: 0
        });
      }
    }
    const tierStart = [0];
    for (let t = 1; t <= TIERS.length; t++) {
      tierStart.push(tierStart[t - 1] + TIERS[t - 1].count);
    }
    const N_NODES = nodes.length;
    // edges: each node connects to 2-3 nodes in the next tier
    const edges = [];
    for (let t = 0; t < TIERS.length - 1; t++) {
      const fromIdx = nodes
        .map((n, i) => ({ n, i }))
        .filter(x => x.n.tier === t)
        .map(x => x.i);
      const toIdx = nodes
        .map((n, i) => ({ n, i }))
        .filter(x => x.n.tier === t + 1)
        .map(x => x.i);
      for (const f of fromIdx) {
        const k = Math.min(toIdx.length, 2 + Math.floor(Math.random() * 2));
        const shuffled = toIdx.slice().sort(() => Math.random() - 0.5);
        for (let j = 0; j < k; j++) {
          edges.push({ a: f, b: shuffled[j], attention: 0 });
        }
      }
    }

    // ---- Hypothesis state (one per visible row) ----
    const N_HYP = 6;
    const hypotheses = [];
    function setupHypotheses() {
      hypotheses.length = 0;
      const shuffled = HYP_POOL.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < N_HYP; i++) {
        // Map each hypothesis to one of the 4 mechanism nodes (last tier)
        const mechIdx = i % TIERS[3].count;
        hypotheses.push({
          label: shuffled[i],
          confidence: rand(0.02, 0.10),
          mechIdx,
          isTrue: false,
          eliminated: false
        });
      }
      const trueIdx = Math.floor(Math.random() * N_HYP);
      hypotheses[trueIdx].isTrue = true;
    }
    setupHypotheses();

    // ---- Glyphs in flight (paper-evidence travelling lit → graph → hyp) ----
    const glyphs = [];

    // ---- Agents (only active in Phase II) ----
    const N_AGENTS = 4;
    const agents = [];
    for (let i = 0; i < N_AGENTS; i++) {
      agents.push({
        x: 0, y: 0, tx: 0, ty: 0,
        mode: 'idle', currentPaper: -1, cooldown: rand(0, 0.6)
      });
    }

    // ---- Phase state ----
    const PHASES = ['gnn', 'agents', 'reveal'];
    const PHASE_DUR = { gnn: 5.5, agents: 9.5, reveal: 4.0 };
    let phase = 'gnn';
    let phaseTimer = 0;
    let cycleN = 0;
    let currentDisease = DISEASE_POOL[0];
    let winnerIdx = -1;
    let mechLit = 0; // gold path intensity 0..1

    function resetCycle() {
      cycleN++;
      currentDisease = DISEASE_POOL[Math.floor(Math.random() * DISEASE_POOL.length)];
      setupHypotheses();
      for (const p of papers) p.read = false;
      glyphs.length = 0;
      for (const e of edges) e.attention = 0;
      for (const n of nodes) n.attention = 0;
      winnerIdx = -1;
      mechLit = 0;
    }

    // ---- Layout (bands) ----
    function computeLayout() {
      const padT = 28, padB = 14;
      const litLeft   = 14;
      const litRight  = 14 + (w - 28) * 0.245;
      const graphLeft  = 14 + (w - 28) * 0.275;
      const graphRight = 14 + (w - 28) * 0.660;
      const hypLeft    = 14 + (w - 28) * 0.690;
      const hypRight   = w - 14;
      const top = padT;
      const bot = h - padB;

      // Position graph nodes hierarchically inside the graph band
      const graphTop = top + 4;
      const graphBot = bot - 4;
      const graphTierH = (graphBot - graphTop) / TIERS.length;
      for (const n of nodes) {
        const ty = graphTop + (n.tier + 0.5) * graphTierH;
        const cnt = TIERS[n.tier].count;
        const tx = graphLeft + ((n.idxInTier + 0.5) / cnt) * (graphRight - graphLeft);
        n.x = tx;
        n.y = ty;
      }

      return { litLeft, litRight, graphLeft, graphRight, hypLeft, hypRight, top, bot };
    }

    // ---- Helpers ----
    function pickRandomMechanismNodeIdx() {
      const start = tierStart[3];
      return start + Math.floor(Math.random() * TIERS[3].count);
    }

    let lastT = performance.now();
    let hoveredHypIdx = -1;

    const gate = makeVisibilityGate(canvas);
    function frame() {
      if (!gate.visible) { gate.running = false; return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // ---- Phase transitions ----
      phaseTimer += dt;
      if (phaseTimer > PHASE_DUR[phase]) {
        phaseTimer = 0;
        if (phase === 'gnn') phase = 'agents';
        else if (phase === 'agents') {
          // pick winner
          let bestC = 0; winnerIdx = -1;
          for (let i = 0; i < hypotheses.length; i++) {
            if (!hypotheses[i].eliminated && hypotheses[i].confidence > bestC) {
              bestC = hypotheses[i].confidence;
              winnerIdx = i;
            }
          }
          phase = 'reveal';
        } else { phase = 'gnn'; resetCycle(); }
      }

      const L = computeLayout();

      // ---- PHASE I: GNN attention waves down through tiers ----
      if (phase === 'gnn') {
        const wave = phaseTimer / PHASE_DUR.gnn; // 0 → 1
        const targetTier = wave * TIERS.length;  // 0 → 4
        for (const n of nodes) {
          const dist = Math.abs(n.tier - targetTier);
          const target = Math.exp(-dist * dist * 1.4);
          n.attention = n.attention * 0.90 + target * 0.30;
        }
        for (const e of edges) {
          const tA = nodes[e.a].tier, tB = nodes[e.b].tier;
          const dA = Math.abs(tA - targetTier), dB = Math.abs(tB - targetTier);
          const minD = Math.min(dA, dB);
          const target = Math.exp(-(minD * minD) * 1.2);
          e.attention = e.attention * 0.90 + target * 0.30;
        }
      } else {
        for (const n of nodes) n.attention *= 0.96;
        for (const e of edges) e.attention *= 0.96;
      }

      // ---- PHASE II: agents scrape papers, eject glyphs ----
      if (phase === 'agents') {
        for (const ag of agents) {
          if (ag.mode === 'idle') {
            ag.cooldown -= dt;
            if (ag.cooldown <= 0) {
              // pick an unread paper
              const unread = [];
              for (let i = 0; i < papers.length; i++) {
                if (!papers[i].read) unread.push(i);
              }
              if (unread.length > 0) {
                ag.currentPaper = unread[Math.floor(Math.random() * unread.length)];
                const col = ag.currentPaper % LIT_COLS;
                const row = Math.floor(ag.currentPaper / LIT_COLS);
                const cellW = (L.litRight - L.litLeft) / LIT_COLS;
                const cellH = ((L.bot - L.top) - 24) / LIT_ROWS;
                ag.tx = L.litLeft + (col + 0.5) * cellW;
                ag.ty = L.top + 24 + (row + 0.5) * cellH;
                if (ag.x === 0 && ag.y === 0) { ag.x = ag.tx; ag.y = ag.ty - 30; }
                ag.mode = 'fetching';
              }
            }
          } else if (ag.mode === 'fetching') {
            const dx = ag.tx - ag.x, dy = ag.ty - ag.y;
            const d = Math.hypot(dx, dy);
            const speed = 220; // px/s
            if (d < 4) {
              // arrive — read paper, emit glyph
              papers[ag.currentPaper].read = true;
              const col = ag.currentPaper % LIT_COLS;
              const row = Math.floor(ag.currentPaper / LIT_COLS);
              const cellW = (L.litRight - L.litLeft) / LIT_COLS;
              const cellH = ((L.bot - L.top) - 24) / LIT_ROWS;
              const startX = L.litLeft + (col + 0.5) * cellW;
              const startY = L.top + 24 + (row + 0.5) * cellH;
              // Pick target hypothesis (biased toward true one)
              let targetHyp = Math.floor(Math.random() * N_HYP);
              const trueOne = hypotheses.findIndex(h => h.isTrue && !h.eliminated);
              if (Math.random() < 0.40 && trueOne >= 0) targetHyp = trueOne;
              // Skip eliminated hypotheses
              let safety = 0;
              while (hypotheses[targetHyp].eliminated && safety++ < 20) {
                targetHyp = Math.floor(Math.random() * N_HYP);
              }
              if (hypotheses[targetHyp].eliminated) targetHyp = trueOne >= 0 ? trueOne : 0;
              // Mid-point: pass through a random graph node
              const midNodeIdx = Math.floor(Math.random() * N_NODES);
              const hypBarH = ((L.bot - L.top) - 30) / N_HYP;
              const endY = L.top + 30 + (targetHyp + 0.5) * hypBarH + 4;
              const endX = L.hypLeft + 8;
              // Most evidence is supportive; some is contradictory
              const supportive = Math.random() < 0.72;
              const evidence = supportive ? rand(0.06, 0.13) : rand(-0.07, -0.025);
              glyphs.push({
                startX, startY,
                midX: nodes[midNodeIdx].x, midY: nodes[midNodeIdx].y,
                endX, endY,
                t: 0,
                speed: rand(0.55, 0.85),
                targetHyp,
                evidence
              });
              ag.mode = 'idle';
              ag.cooldown = rand(0.15, 0.5);
              ag.currentPaper = -1;
            } else {
              ag.x += dx / d * speed * dt;
              ag.y += dy / d * speed * dt;
            }
          }
        }
      }

      // ---- Glyphs in flight ----
      for (let i = glyphs.length - 1; i >= 0; i--) {
        const g = glyphs[i];
        g.t += dt * g.speed;
        if (g.t >= 1) {
          // arrived — apply evidence to target hypothesis
          const h = hypotheses[g.targetHyp];
          if (h && !h.eliminated) {
            let bump = g.evidence;
            // True hypothesis gets a slight extra boost on positive evidence
            if (h.isTrue && bump > 0) bump *= 1.3;
            h.confidence = Math.max(0, Math.min(1, h.confidence + bump));
            // Eliminate hypotheses that drop very low (only after some agent activity)
            if (h.confidence < 0.02 && cycleN > 0 && phaseTimer > 4) {
              h.eliminated = true;
            }
          }
          glyphs.splice(i, 1);
        }
      }

      // Slow decay of confidence over time so weak hypotheses fade
      for (const h of hypotheses) {
        if (!h.eliminated && phase === 'agents') h.confidence *= 0.998;
      }

      // ---- Reveal phase: lock winner, light gold path ----
      if (phase === 'reveal') {
        mechLit = Math.min(1, mechLit + dt * 0.6);
      } else {
        mechLit *= 0.94;
      }

      // ---- Hover detection over hypotheses ----
      hoveredHypIdx = -1;
      if (mouse.inside) {
        const mx = mouse.x * w, my = mouse.y * h;
        const hypBarH = ((L.bot - L.top) - 30) / N_HYP;
        for (let i = 0; i < N_HYP; i++) {
          const hy = L.top + 30 + i * hypBarH;
          if (mx > L.hypLeft && mx < L.hypRight && my > hy && my < hy + hypBarH) {
            hoveredHypIdx = i;
            break;
          }
        }
      }

      // ============ DRAW ============
      ctx.clearRect(0, 0, w, h);

      // Band header labels (top)
      ctx.font = '8.5px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(26,22,18,0.55)';
      ctx.textAlign = 'left';
      ctx.fillText('I · LITERATURE',  L.litLeft,   16);
      ctx.fillText('II · GNN GRAPH',  L.graphLeft, 16);
      ctx.fillText('III · HYPOTHESES', L.hypLeft,   16);

      // Phase pill (right side, above bands)
      {
        const phaseLbl = phase === 'gnn' ? 'PHASE I · GNN ATTENTION'
                       : phase === 'agents' ? 'PHASE II · AGENTS SCRAPING'
                       : 'CONVERGED · MECHANISM FOUND';
        ctx.font = '9px "JetBrains Mono", monospace';
        const tw = ctx.measureText(phaseLbl).width;
        const px = w - tw - 18, py = 16;
        ctx.fillStyle = 'rgba(245,241,232,0.92)';
        ctx.fillRect(px - 4, py - 9, tw + 8, 14);
        ctx.strokeStyle = phase === 'reveal' ? 'rgba(190,151,72,0.95)' : 'rgba(190,151,72,0.55)';
        ctx.lineWidth = phase === 'reveal' ? 1.2 : 0.7;
        ctx.strokeRect(px - 4, py - 9, tw + 8, 14);
        ctx.fillStyle = 'rgba(110,82,38,0.95)';
        ctx.textAlign = 'left';
        ctx.fillText(phaseLbl, px, py);
      }

      // ===== BAND I — LITERATURE =====
      {
        const cellW = (L.litRight - L.litLeft) / LIT_COLS;
        const cellH = ((L.bot - L.top) - 24) / LIT_ROWS;
        for (let i = 0; i < papers.length; i++) {
          const col = i % LIT_COLS;
          const row = Math.floor(i / LIT_COLS);
          const px = L.litLeft + col * cellW + 2;
          const py = L.top + 24 + row * cellH + 2;
          const pw = cellW - 4;
          const ph = cellH - 4;
          if (papers[i].read) {
            ctx.fillStyle = 'rgba(26,22,18,0.75)';
            ctx.fillRect(px, py, pw, ph);
          } else {
            ctx.strokeStyle = 'rgba(26,22,18,0.30)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
            // tiny inner "text lines" to suggest a paper
            ctx.strokeStyle = 'rgba(26,22,18,0.18)';
            ctx.lineWidth = 0.4;
            ctx.beginPath();
            ctx.moveTo(px + 1.5, py + ph * 0.35);
            ctx.lineTo(px + pw - 1.5, py + ph * 0.35);
            ctx.moveTo(px + 1.5, py + ph * 0.55);
            ctx.lineTo(px + pw - 1.5, py + ph * 0.55);
            ctx.moveTo(px + 1.5, py + ph * 0.75);
            ctx.lineTo(px + pw - 2.5, py + ph * 0.75);
            ctx.stroke();
          }
        }
        ctx.strokeStyle = 'rgba(26,22,18,0.20)';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(L.litLeft, L.top + 22, L.litRight - L.litLeft, L.bot - L.top - 22);
        // Read counter
        const readN = papers.filter(p => p.read).length;
        ctx.fillStyle = 'rgba(26,22,18,0.45)';
        ctx.font = 'italic 8.5px "Crimson Pro", serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${readN}/${N_PAPERS} read`, L.litRight - 4, L.bot + 11);
      }

      // ===== BAND II — GNN GRAPH =====
      {
        const dim = phase === 'gnn' ? 1.0 : phase === 'agents' ? 0.55 : 0.85;

        // Tier labels (left side of graph band)
        ctx.fillStyle = 'rgba(26,22,18,0.40)';
        ctx.font = 'italic 8px "Crimson Pro", serif';
        ctx.textAlign = 'right';
        const graphTop = L.top + 4, graphBot = L.bot - 4;
        const graphTierH = (graphBot - graphTop) / TIERS.length;
        for (let t = 0; t < TIERS.length; t++) {
          const ty = graphTop + (t + 0.5) * graphTierH;
          ctx.fillText(TIERS[t].name, L.graphLeft - 4, ty + 3);
        }

        // edges
        for (const e of edges) {
          const a = nodes[e.a], b = nodes[e.b];
          const att = Math.min(1, e.attention);
          ctx.strokeStyle = `rgba(26,22,18,${((0.10 + att * 0.55) * dim).toFixed(3)})`;
          ctx.lineWidth = 0.5 + att * 1.4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        // nodes
        for (let i = 0; i < N_NODES; i++) {
          const n = nodes[i];
          const att = Math.min(1, n.attention);
          let r = n.type === 'disease' ? 5.5 : n.type === 'mechanism' ? 4.5 : 3.5;
          // halo on attended nodes
          if (att > 0.05) {
            ctx.fillStyle = `rgba(190,151,72,${(att * 0.30 * dim).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
            ctx.fill();
          }
          const baseAlpha = (0.55 + att * 0.40) * dim;
          let color;
          if (n.type === 'disease')         color = `rgba(110,31,34,${baseAlpha.toFixed(3)})`;
          else if (n.type === 'gene')       color = `rgba(26,22,18,${baseAlpha.toFixed(3)})`;
          else if (n.type === 'protein')    color = `rgba(30,77,62,${baseAlpha.toFixed(3)})`;
          else                              color = `rgba(190,151,72,${baseAlpha.toFixed(3)})`; // mechanism
          ctx.fillStyle = color;
          ctx.beginPath();
          if (n.type === 'disease') {
            ctx.rect(n.x - r, n.y - r, r * 2, r * 2);
          } else if (n.type === 'protein') {
            ctx.moveTo(n.x, n.y - r);
            ctx.lineTo(n.x + r, n.y + r * 0.85);
            ctx.lineTo(n.x - r, n.y + r * 0.85);
            ctx.closePath();
          } else {
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          }
          ctx.fill();
        }

        // OMIM label above the disease node
        const dis = nodes[0];
        ctx.fillStyle = 'rgba(110,31,34,0.85)';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(currentDisease, dis.x, dis.y - 9);
      }

      // ===== BAND III — HYPOTHESES =====
      {
        const hypBarH = ((L.bot - L.top) - 30) / N_HYP;
        for (let i = 0; i < N_HYP; i++) {
          const hyp = hypotheses[i];
          const hy = L.top + 30 + i * hypBarH;
          if (hyp.eliminated) {
            // strikethrough faint label
            ctx.fillStyle = 'rgba(26,22,18,0.25)';
            ctx.font = 'italic 9px "Crimson Pro", serif';
            ctx.textAlign = 'left';
            ctx.fillText(hyp.label, L.hypLeft + 2, hy + 6);
            ctx.strokeStyle = 'rgba(26,22,18,0.30)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            const tw = ctx.measureText(hyp.label).width;
            ctx.moveTo(L.hypLeft + 2, hy + 4);
            ctx.lineTo(L.hypLeft + 2 + tw, hy + 4);
            ctx.stroke();
            continue;
          }
          // Hover highlight
          if (hoveredHypIdx === i) {
            ctx.fillStyle = 'rgba(190,151,72,0.10)';
            ctx.fillRect(L.hypLeft - 4, hy - 2, L.hypRight - L.hypLeft + 4, hypBarH);
          }
          // Label
          const isWinner = (phase === 'reveal' && winnerIdx === i);
          ctx.fillStyle = isWinner ? 'rgba(190,151,72,1)' : 'rgba(26,22,18,0.78)';
          ctx.font = isWinner
            ? 'italic 11px "Crimson Pro", serif'
            : 'italic 9.5px "Crimson Pro", serif';
          ctx.textAlign = 'left';
          ctx.fillText(hyp.label, L.hypLeft + 2, hy + 6);
          // Confidence bar
          const barY = hy + 11;
          const barW = (L.hypRight - L.hypLeft) - 4;
          const barH = 4;
          ctx.fillStyle = 'rgba(245,241,232,0.95)';
          ctx.fillRect(L.hypLeft + 2, barY, barW, barH);
          ctx.strokeStyle = 'rgba(26,22,18,0.30)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(L.hypLeft + 2 + 0.25, barY + 0.25, barW - 0.5, barH - 0.5);
          // Bar fill
          const fillC = isWinner
            ? `rgba(190,151,72,${(0.85 + 0.15 * mechLit).toFixed(3)})`
            : (hyp.isTrue && phase === 'agents'
                ? 'rgba(190,151,72,0.65)'
                : 'rgba(110,31,34,0.55)');
          ctx.fillStyle = fillC;
          ctx.fillRect(L.hypLeft + 2, barY, barW * hyp.confidence, barH);
          // Confidence percentage
          ctx.fillStyle = 'rgba(26,22,18,0.55)';
          ctx.font = '7.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText((hyp.confidence * 100).toFixed(0) + '%', L.hypRight - 2, hy + 6);
        }
      }

      // ===== Glyphs in flight =====
      for (const g of glyphs) {
        const t = g.t;
        const u = 1 - t;
        const px = u * u * g.startX + 2 * u * t * g.midX + t * t * g.endX;
        const py = u * u * g.startY + 2 * u * t * g.midY + t * t * g.endY;
        ctx.fillStyle = g.evidence > 0
          ? 'rgba(190,151,72,0.85)'
          : 'rgba(110,31,34,0.65)';
        ctx.beginPath();
        ctx.arc(px, py, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== Agents (only visible in Phase II) =====
      if (phase === 'agents') {
        for (const ag of agents) {
          if (ag.mode === 'fetching') {
            ctx.fillStyle = 'rgba(190,151,72,0.95)';
            ctx.strokeStyle = 'rgba(26,22,18,0.6)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(ag.x, ag.y, 2.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      }

      // ===== Reveal phase: gold trace =====
      if (phase === 'reveal' && winnerIdx >= 0 && mechLit > 0.05) {
        const hyp = hypotheses[winnerIdx];
        const hypBarH = ((L.bot - L.top) - 30) / N_HYP;
        const hypX = L.hypLeft + 6;
        const hypY = L.top + 30 + (winnerIdx + 0.5) * hypBarH + 4;
        const mechNodeIdx = tierStart[3] + (hyp.mechIdx % TIERS[3].count);
        const mechNode = nodes[mechNodeIdx];
        const diseaseNode = nodes[0];
        // Draw with two intermediate nodes for visual chain (random gene + protein)
        const geneIdx = tierStart[1] + Math.floor(Math.random() * TIERS[1].count);
        const protIdx = tierStart[2] + Math.floor(Math.random() * TIERS[2].count);
        // glow underlay
        ctx.strokeStyle = `rgba(190,151,72,${(0.18 * mechLit).toFixed(3)})`;
        ctx.lineWidth = 5 + mechLit * 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hypX, hypY);
        ctx.lineTo(mechNode.x, mechNode.y);
        ctx.lineTo(nodes[protIdx].x, nodes[protIdx].y);
        ctx.lineTo(nodes[geneIdx].x, nodes[geneIdx].y);
        ctx.lineTo(diseaseNode.x, diseaseNode.y);
        ctx.stroke();
        // bright core
        ctx.strokeStyle = `rgba(190,151,72,${(0.55 + mechLit * 0.40).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(hypX, hypY);
        ctx.lineTo(mechNode.x, mechNode.y);
        ctx.lineTo(nodes[protIdx].x, nodes[protIdx].y);
        ctx.lineTo(nodes[geneIdx].x, nodes[geneIdx].y);
        ctx.lineTo(diseaseNode.x, diseaseNode.y);
        ctx.stroke();
      }

      // ===== Readout =====
      if (readout) {
        const readN = papers.filter(p => p.read).length;
        const phaseStr = phase === 'gnn' ? 'I · GNN'
                      : phase === 'agents' ? 'II · agents'
                      : 'CONVERGED';
        const winnerStr = (phase === 'reveal' && winnerIdx >= 0)
          ? hypotheses[winnerIdx].label
          : '—';
        const aliveN = hypotheses.filter(h => !h.eliminated).length;
        readout.textContent =
          `cycle ${cycleN + 1} · ${currentDisease} · phase ${phaseStr} · ${readN}/${N_PAPERS} papers · ${aliveN}/${N_HYP} hypotheses · top: ${winnerStr}`;
      }

      requestAnimationFrame(frame);
    }
    gate.frameFn = frame;
    gate.running = true;
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => { ({ ctx, w, h } = setupCanvas(canvas)); });
    ===== DEAD CODE ABOVE ===== */
  })();