(function draftA() {
    const canvas = document.getElementById('draft-a');
    if (!canvas) return;
    let { ctx, w, h } = setupCanvas(canvas);
    const wrap = canvas.parentElement;
    const readout = document.getElementById('readout-a');
    let mouse = { x: 0.5, y: 0.5, inside: false };
    wrap.addEventListener('mousemove', (e) => {
      const r = wrap.getBoundingClientRect();
      mouse.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      mouse.y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      mouse.inside = true;
    });
    wrap.addEventListener('mouseleave', () => { mouse.inside = false; });

    function gauss() {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    function rand(a, b) { return a + Math.random() * (b - a); }

    // ----------------------------------------------------------------
    // Population centroid μ — the cohort's mean position in phase-space
    // at age t. The field pulls cells toward this point.
    // ----------------------------------------------------------------
    function popMean(t) {
      const tn = t / 100;
      return {
        x: 0.18 + tn * 0.62,
        y: 0.18 + Math.pow(tn, 1.45) * 0.65
      };
    }

    // ----------------------------------------------------------------
    // Velocity field v(x, y, t) — composed of:
    //   * pull toward μ(t)
    //   * persistent up-right tilt (canonical aging direction)
    //   * swirl (rising disorder)
    //   * spatial CpG-region heterogeneity
    //
    // Coefficients are continuous functions of age, blended between
    // four stage targets via sigmoids — no hard cutoffs, the field
    // morphs smoothly from developmental → equilibrium → aging →
    // late-life as you scrub. Magnitudes are normalised against
    // GLOBAL_MAX_MAG so quiet phases render with short arrows and
    // stormy phases with long ones.
    // ----------------------------------------------------------------
    const GLOBAL_MAX_MAG = 0.55;
    function sig(t, c, w) { return 1 / (1 + Math.exp(-(t - c) / w)); }

    function velocityAt(x, y, t) {
      const tn = t / 100;
      const m = popMean(t);

      // smooth life-stage weights (sum ≈ 1 for any t)
      const sDev   = 1 - sig(t, 14, 3.5);
      const sEqOn  = sig(t, 14, 3.5);
      const sEqOff = 1 - sig(t, 30, 4);
      const sEq    = sEqOn  * sEqOff;
      const sAgOn  = sig(t, 30, 4);
      const sAgOff = 1 - sig(t, 65, 5);
      const sAge   = sAgOn  * sAgOff;
      const sLate  = sig(t, 65, 5);

      // per-stage targets
      const PULL    = { dev: 1.40, eq: 0.10, age: 0.30, late: 0.40 };
      const TILT    = { dev: 0.12, eq: 0.025, age: 0.18, late: 0.24 };
      const SWIRL   = { dev: 0.04, eq: 0.012, age: 0.09, late: 0.40 };
      const SPATIAL = { dev: 0.045, eq: 0.020, age: 0.030, late: 0.060 };

      const pull    = sDev*PULL.dev    + sEq*PULL.eq    + sAge*PULL.age    + sLate*PULL.late;
      const tilt    = sDev*TILT.dev    + sEq*TILT.eq    + sAge*TILT.age    + sLate*TILT.late;
      const swirl   = sDev*SWIRL.dev   + sEq*SWIRL.eq   + sAge*SWIRL.age   + sLate*SWIRL.late;
      const spatial = sDev*SPATIAL.dev + sEq*SPATIAL.eq + sAge*SPATIAL.age + sLate*SPATIAL.late;

      let vx = (m.x - x) * pull * 0.45;
      let vy = (m.y - y) * pull * 0.45;
      vx += tilt * 0.55;
      vy += tilt * 0.85;
      vx += swirl * (y - 0.5);
      vy -= swirl * (x - 0.5);
      vx += spatial * Math.sin(y * 6 + tn * 5);
      vy += spatial * Math.cos(x * 6 + tn * 5);
      return { vx, vy };
    }

    function phaseFor(age) {
      if (age < 16)  return 'developmental';
      if (age < 32)  return 'equilibrium';
      if (age < 65)  return 'aging drift';
      if (age < 82)  return 'late-life accel';
      return 'senescent drift';
    }
    function phaseShort(age) {
      if (age < 16)  return 'develop.';
      if (age < 32)  return 'equilibr.';
      if (age < 65)  return 'aging';
      if (age < 82)  return 'late-life';
      return 'senesc.';
    }

    function roundRect(ctx, x, y, ww, hh, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, r);
      ctx.arcTo(x + ww, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + ww, y, r);
      ctx.closePath();
    }

    // ----------------------------------------------------------------
    // CpG SITES — ~220 individual loci, each with its own personal
    // aging profile (peak age, FWHM, direction, magnitude). Each has
    // a precomputed trajectory through (PC₁ × entropy) across age 0..100.
    // The right-side strip lets you scrub through them; the selected
    // CpG's full lifespan trajectory is then drawn over the field.
    // Cohorts:
    //   * developmental  20%  peakAge 0..14   sharp upward
    //   * young-adult     8%  peakAge 17..30  modest
    //   * canonical aging 55% peakAge 38..75  broad, up-right
    //   * late-life      17%  peakAge 72..95  varied, noisier
    // ~30% are hypomethylating (direction flipped on x).
    // ----------------------------------------------------------------
    const N_CPG = 220;
    const REAL_LOCI = [
      'ELOVL2', 'FHL2', 'KLF14', 'TRIM59', 'ASPA', 'EDARADD',
      'PDE4C', 'MIR29B2', 'C1orf132', 'CCDC102B', 'NHLRC1',
      'GRIA2', 'OTUD7A', 'CSNK1D', 'ITGA2B', 'SST', 'NPTX2'
    ];
    const CPG_SITES = [];
    for (let i = 0; i < N_CPG; i++) {
      const r = Math.random();
      let peakAge, fwhm, dirAngle, mag, magBeta, cohort;
      if (r < 0.20) {
        cohort  = 'dev';
        peakAge = rand(0, 14);
        fwhm    = rand(6, 14);
        mag     = rand(0.014, 0.030);
        magBeta = rand(0.030, 0.055);
        dirAngle = rand(Math.PI / 3, Math.PI * 0.55);
      } else if (r < 0.30) {
        cohort  = 'eq';
        peakAge = rand(17, 30);
        fwhm    = rand(10, 18);
        mag     = rand(0.005, 0.013);
        magBeta = rand(0.012, 0.022);
        dirAngle = rand(0, Math.PI / 2);
      } else if (r < 0.85) {
        cohort  = 'age';
        peakAge = rand(38, 75);
        fwhm    = rand(25, 50);
        mag     = rand(0.008, 0.020);
        magBeta = rand(0.018, 0.040);
        dirAngle = rand(0.2, Math.PI / 2 - 0.1);
      } else {
        cohort  = 'late';
        peakAge = rand(72, 95);
        fwhm    = rand(10, 22);
        mag     = rand(0.012, 0.026);
        magBeta = rand(0.022, 0.045);
        dirAngle = rand(-0.2, Math.PI * 0.8);
      }
      const isHypo = Math.random() < 0.30;
      if (isHypo) dirAngle = Math.PI - dirAngle; // flip x component
      const xStart = 0.08 + Math.random() * 0.22;
      const yStart = 0.08 + Math.random() * 0.22;
      const betaStart = isHypo ? rand(0.55, 0.85) : rand(0.10, 0.40);

      const traj = new Array(101);
      const betaTraj = new Array(101);
      let xc = xStart, yc = yStart;
      let beta = betaStart;
      for (let t = 0; t <= 100; t++) {
        const sigma = Math.max(1, fwhm / 2.355);
        const g = Math.exp(-Math.pow((t - peakAge) / sigma, 2));
        // 2D phase-space step
        const step = mag * g;
        xc += Math.cos(dirAngle) * step;
        yc += Math.sin(dirAngle) * step;
        xc = Math.max(0.02, Math.min(0.98, xc));
        yc = Math.max(0.02, Math.min(0.98, yc));
        traj[t] = { x: xc, y: yc };
        // 1D β-value step (methylation level)
        beta += (isHypo ? -1 : +1) * magBeta * g;
        beta = Math.max(0, Math.min(1, beta));
        betaTraj[t] = beta;
      }
      const useReal = i < REAL_LOCI.length;
      const name = useReal
        ? REAL_LOCI[i]
        : 'cg' + (10000000 + Math.floor(Math.random() * 89999999)).toString().slice(0, 8);
      CPG_SITES.push({ name, peakAge, fwhm, mag, magBeta, dirAngle, isHypo, cohort, traj, betaTraj });
    }
    CPG_SITES.sort((a, b) => a.peakAge - b.peakAge); // strip → developmental → late

    // count per cohort (strip section sizes)
    const COHORT_KEYS = ['dev', 'eq', 'age', 'late'];
    const COHORT_LABEL = { dev: 'DEVELOPMENTAL', eq: 'EQUILIBRIUM', age: 'AGING DRIFT', late: 'LATE-LIFE' };
    const COHORT_TINT  = {
      dev:  'rgba(30,77,62,0.10)',
      eq:   'rgba(190,151,72,0.10)',
      age:  'rgba(110,31,34,0.08)',
      late: 'rgba(80,18,22,0.14)'
    };
    const COHORT_COUNT = { dev: 0, eq: 0, age: 0, late: 0 };
    for (const c of CPG_SITES) COHORT_COUNT[c.cohort]++;

    let selectedCpG = -1; // index into CPG_SITES; -1 = none selected

    // particles — sample of cohort flowing through the field.
    // The displayed μ is the *empirical* mean of these particles
    // (smoothed) so it actually tracks the cluster you can see, not
    // a hard-coded theoretical curve. The field's underlying pull
    // target is still popMean(t), but the cohort's observed mean
    // can drift / lag slightly — which is biologically honest.
    const N_PART = 60;
    const particles = [];
    for (let i = 0; i < N_PART; i++) {
      particles.push({
        x: 0.10 + Math.random() * 0.30,
        y: 0.10 + Math.random() * 0.30,
        trail: []
      });
    }
    let muEmpX = 0.25, muEmpY = 0.25; // smoothed empirical mean

    // age driver
    let age = 8;
    const SWEEP_RATE = 5.5; // yrs/sec — back in the about-row
    let lastT = performance.now();

    const gate = makeVisibilityGate(canvas);
    function frame() {
      if (!gate.visible) { gate.running = false; return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const prevAge = age;

      // -------- LAYOUT --------
      const padT = 30, padB = 42, padL = 38, padR = 70;
      const innerW = w - padL - padR;
      const innerH = h - padT - padB;
      const sliderH = 18;
      const sliderGap = 8;
      const plotL = padL;
      const plotT = padT;
      const plotW = innerW;
      const plotH = innerH - sliderH - sliderGap - 14; // leave room for axis label
      const sliderTop = plotT + plotH + sliderGap + 14;
      const sliderY = sliderTop + sliderH / 2;

      // CpG strip on right
      const stripGap = 10;
      const stripX = plotL + plotW + stripGap;
      const stripW = padR - stripGap - 12; // leave 12px right margin
      const stripT = plotT;
      const stripH = plotH;

      const mx = mouse.x * w, my = mouse.y * h;
      const overSlider = mouse.inside && my > sliderTop - 4 && my < sliderTop + sliderH + 6
                         && mx >= plotL - 4 && mx <= plotL + plotW + 4;
      const overPlot = mouse.inside && mx > plotL && mx < plotL + plotW
                       && my > plotT && my < plotT + plotH;
      const overStrip = mouse.inside && mx >= stripX - 8 && mx <= stripX + stripW + 8
                        && my >= stripT && my <= stripT + stripH;

      // -------- CpG SELECTION --------
      if (overStrip) {
        const fr = (my - stripT) / stripH;
        selectedCpG = Math.max(0, Math.min(N_CPG - 1, Math.floor(fr * N_CPG)));
      }

      // -------- AGE DRIVER --------
      if (overSlider) {
        const t = Math.max(0, Math.min(1, (mx - plotL) / plotW));
        age = t * 100;
      } else {
        age += SWEEP_RATE * dt;
        if (age >= 100) age -= 100;
      }
      const isJump = Math.abs(age - prevAge) > 3;

      // data ↔ canvas mapping
      const X = (xd) => plotL + xd * plotW;
      const Y = (yd) => plotT + plotH - yd * plotH; // y up = canvas y down
      const Xinv = (cx) => (cx - plotL) / plotW;
      const Yinv = (cy) => 1 - (cy - plotT) / plotH;

      ctx.clearRect(0, 0, w, h);

      // -------- PLOT FRAME + GRID --------
      ctx.strokeStyle = 'rgba(26,22,18,0.06)';
      ctx.lineWidth = 0.6;
      for (let g = 0.2; g < 1; g += 0.2) {
        ctx.beginPath();
        ctx.moveTo(X(g), plotT);
        ctx.lineTo(X(g), plotT + plotH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(plotL, Y(g));
        ctx.lineTo(plotL + plotW, Y(g));
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(26,22,18,0.20)';
      ctx.lineWidth = 1;
      ctx.strokeRect(plotL, plotT, plotW, plotH);

      // -------- VECTOR FIELD --------
      const SP = 36; // grid spacing in px
      const cols = Math.max(6, Math.round(plotW / SP));
      const rows = Math.max(4, Math.round(plotH / SP));
      const grid = [];
      let frameMaxMag = 0;
      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const xData = i / cols;
          const yData = j / rows;
          const v = velocityAt(xData, yData, age);
          const m = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
          if (m > frameMaxMag) frameMaxMag = m;
          grid.push({ i, j, xData, yData, vx: v.vx, vy: v.vy, m });
        }
      }

      // hover: nearest grid cell
      let nearestArrow = null;
      if (overPlot) {
        const xData = Xinv(mx);
        const yData = Yinv(my);
        let bd = 1e9;
        for (const cell of grid) {
          const dx = cell.xData - xData;
          const dy = cell.yData - yData;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; nearestArrow = cell; }
        }
      }

      // Arrows scale to a GLOBAL max so age-stage magnitude is visible
      const ARR_LEN = SP * 1.05;
      for (const cell of grid) {
        if (cell.m < 1e-5) continue;
        const cx = X(cell.xData);
        const cy = Y(cell.yData);
        const norm = Math.min(1, cell.m / GLOBAL_MAX_MAG);
        const len = ARR_LEN * (0.18 + 0.82 * Math.pow(norm, 0.55));
        // canvas direction (flip y because canvas y goes down)
        const dirX = cell.vx / cell.m;
        const dirY = -cell.vy / cell.m;
        const sx = cx - dirX * len * 0.5;
        const sy = cy - dirY * len * 0.5;
        const ex = cx + dirX * len * 0.5;
        const ey = cy + dirY * len * 0.5;
        // colour: emerald (low) → burgundy (high)
        const r = Math.round(30 + (110 - 30) * norm);
        const g = Math.round(77 + (31 - 77) * norm);
        const b = Math.round(62 + (34 - 62) * norm);
        const alpha = 0.25 + norm * 0.55;
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.0 + norm * 1.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // arrowhead
        const headSize = 3.2 + norm * 2.8;
        const ang = Math.atan2(dirY, dirX);
        ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, alpha + 0.15).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headSize * Math.cos(ang - 0.42), ey - headSize * Math.sin(ang - 0.42));
        ctx.lineTo(ex - headSize * Math.cos(ang + 0.42), ey - headSize * Math.sin(ang + 0.42));
        ctx.closePath();
        ctx.fill();
      }

      // -------- PARTICLES (cohort flowing through field) --------
      // Also accumulate the empirical mean so μ can track the cluster.
      let sumX = 0, sumY = 0, nLive = 0;
      for (const p of particles) {
        const v = velocityAt(p.x, p.y, age);
        // step (scale velocity to keep movement visible in 1 frame)
        p.x += v.vx * dt * 0.55 + gauss() * 0.0022;
        p.y += v.vy * dt * 0.55 + gauss() * 0.0022;
        // record trail
        let respawn = false;
        if (p.x < -0.02 || p.x > 1.02 || p.y < -0.02 || p.y > 1.02) respawn = true;
        if (isJump) respawn = true;
        if (respawn) {
          // respawn near the field's current pull target so newcomers
          // don't drag the empirical mean back to the lower-left
          const seed = popMean(age);
          p.x = Math.max(0.04, Math.min(0.96, seed.x + gauss() * 0.10));
          p.y = Math.max(0.04, Math.min(0.96, seed.y + gauss() * 0.10));
          p.trail = [];
        } else {
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 18) p.trail.shift();
        }
        sumX += p.x; sumY += p.y; nLive++;
      }
      // smoothed empirical mean — 1st-order low-pass so μ doesn't jitter
      const meanX = sumX / Math.max(1, nLive);
      const meanY = sumY / Math.max(1, nLive);
      const smoothK = isJump ? 1.0 : 0.12;
      muEmpX += (meanX - muEmpX) * smoothK;
      muEmpY += (meanY - muEmpY) * smoothK;

      // draw particle trails
      for (const p of particles) {
        const tr = p.trail;
        if (tr.length < 2) continue;
        ctx.lineCap = 'round';
        for (let i = 1; i < tr.length; i++) {
          const a = i / tr.length;
          ctx.strokeStyle = `rgba(190,151,72,${(0.55 * Math.pow(a, 1.3)).toFixed(3)})`;
          ctx.lineWidth = 0.7 + a * 1.0;
          ctx.beginPath();
          ctx.moveTo(X(tr[i - 1].x), Y(tr[i - 1].y));
          ctx.lineTo(X(tr[i].x), Y(tr[i].y));
          ctx.stroke();
        }
        // head dot
        ctx.fillStyle = 'rgba(190,151,72,0.85)';
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), 1.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // -------- SELECTED CpG IN PHASE-SPACE --------
      // light trail through (drift, entropy) plane + current-age dot
      if (selectedCpG >= 0) {
        const cpg = CPG_SITES[selectedCpG];
        const tr  = cpg.traj;
        const colMain = cpg.isHypo ? '30,77,62' : '110,31,34';
        ctx.strokeStyle = `rgba(${colMain},0.40)`;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(X(tr[0].x), Y(tr[0].y));
        for (let t = 1; t <= 100; t++) ctx.lineTo(X(tr[t].x), Y(tr[t].y));
        ctx.stroke();
        // current-age dot only
        const ai = Math.max(0, Math.min(100, Math.round(age)));
        const cur = tr[ai];
        ctx.fillStyle = `rgba(${colMain},1)`;
        ctx.beginPath();
        ctx.arc(X(cur.x), Y(cur.y), 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245,241,232,0.95)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // -------- POPULATION CENTROID μ --------
      // μ = empirical mean of the live particle cluster (smoothed),
      // not a hard-coded curve — so the gold ring really does sit
      // in the middle of the dots you can see. A faint × marks the
      // field's underlying pull target (the attractor) for reference.
      const m0 = { x: muEmpX, y: muEmpY };
      const mTarget = popMean(age);
      const cmx = X(m0.x), cmy = Y(m0.y);
      // attractor target (faint × — what the field is "aiming at")
      {
        const tx = X(mTarget.x), ty = Y(mTarget.y);
        ctx.strokeStyle = 'rgba(26,22,18,0.28)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(tx - 4, ty - 4); ctx.lineTo(tx + 4, ty + 4);
        ctx.moveTo(tx - 4, ty + 4); ctx.lineTo(tx + 4, ty - 4);
        ctx.stroke();
      }
      // outer halo
      ctx.strokeStyle = 'rgba(190,151,72,0.40)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cmx, cmy, 9, 0, Math.PI * 2);
      ctx.stroke();
      // inner ring
      ctx.strokeStyle = 'rgba(26,22,18,0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cmx, cmy, 5, 0, Math.PI * 2);
      ctx.stroke();
      // gold pip
      ctx.fillStyle = 'rgba(190,151,72,0.95)';
      ctx.beginPath();
      ctx.arc(cmx, cmy, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // μ label — explicit "population mean" annotation with subtle backdrop
      {
        const labelText = 'μ — population mean';
        ctx.font = 'italic 11px "Crimson Pro", serif';
        const lw = ctx.measureText(labelText).width;
        // place to the right unless that would overflow the plot
        let lx = cmx + 11;
        if (lx + lw + 4 > plotL + plotW - 4) lx = cmx - 11 - lw;
        const ly = cmy - 6;
        ctx.fillStyle = 'rgba(245,241,232,0.78)';
        roundRect(ctx, lx - 3, ly, lw + 6, 14, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(26,22,18,0.85)';
        ctx.textAlign = 'left';
        ctx.fillText(labelText, lx, ly + 10);
      }

      // -------- HOVER ARROW HIGHLIGHT --------
      if (nearestArrow && overPlot) {
        const cell = nearestArrow;
        const cx = X(cell.xData);
        const cy = Y(cell.yData);
        ctx.strokeStyle = 'rgba(190,151,72,0.85)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, ARR_LEN * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }

      // -------- AXIS LABELS --------
      ctx.fillStyle = 'rgba(26,22,18,0.55)';
      ctx.font = 'italic 10.5px "Crimson Pro", serif';
      ctx.textAlign = 'center';
      ctx.fillText('methylation drift  PC₁ →', plotL + plotW / 2, plotT + plotH + 14);
      ctx.save();
      ctx.translate(padL - 24, plotT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('↑ epigenetic entropy', 0, 0);
      ctx.restore();

      // tick numerics on axes (0, 0.5, 1)
      ctx.fillStyle = 'rgba(26,22,18,0.45)';
      ctx.font = '8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (const v of [0, 0.5, 1]) {
        ctx.fillText(v.toFixed(1), X(v), plotT + plotH + 2);
      }
      ctx.textAlign = 'right';
      for (const v of [0, 0.5, 1]) {
        ctx.fillText(v.toFixed(1), plotL - 4, Y(v) + 3);
      }

      // -------- PHASE PILL (top of plot) --------
      {
        const pLabel = phaseShort(age).toUpperCase();
        ctx.font = '9px "JetBrains Mono", monospace';
        const tw = ctx.measureText(pLabel).width;
        const pillW = tw + 14;
        const pillH = 14;
        const pillX = plotL + plotW - pillW - 6;
        const pillY = plotT + 5;
        ctx.fillStyle = 'rgba(245,241,232,0.92)';
        roundRect(ctx, pillX, pillY, pillW, pillH, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(190,151,72,0.65)';
        ctx.lineWidth = 0.8;
        roundRect(ctx, pillX, pillY, pillW, pillH, 7);
        ctx.stroke();
        ctx.fillStyle = 'rgba(110,82,38,0.95)';
        ctx.textAlign = 'center';
        ctx.fillText(pLabel, pillX + pillW / 2, pillY + 10);
      }

      // -------- SLIDER --------
      ctx.strokeStyle = 'rgba(26,22,18,0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotL, sliderY);
      ctx.lineTo(plotL + plotW, sliderY);
      ctx.stroke();
      for (let yr = 0; yr <= 100; yr += 10) {
        const tx = plotL + (yr / 100) * plotW;
        ctx.strokeStyle = 'rgba(26,22,18,0.32)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(tx, sliderY - 3);
        ctx.lineTo(tx, sliderY + 3);
        ctx.stroke();
        if (yr % 20 === 0) {
          ctx.fillStyle = 'rgba(26,22,18,0.55)';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(yr, tx, sliderY + 13);
        }
      }
      const knobX = plotL + (age / 100) * plotW;
      ctx.fillStyle = 'rgba(190,151,72,0.95)';
      ctx.strokeStyle = 'rgba(26,22,18,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(knobX, sliderY, 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // slider label
      ctx.fillStyle = 'rgba(26,22,18,0.50)';
      ctx.font = 'italic 9.5px "Crimson Pro", serif';
      ctx.textAlign = 'left';
      ctx.fillText('age t', plotL, sliderY - 8);

      // -------- CpG STRIP (right side) --------
      // Goal: 4 clearly-labelled cohort bands sized by count,
      // each tinted by life-stage. Individual CpG ticks render
      // inside each band, coloured by hyper (burgundy) / hypo
      // (emerald). Drag selects a CpG → β(age) inset shows its
      // methylation curve.
      ctx.fillStyle = 'rgba(26,22,18,0.65)';
      ctx.font = '8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CpG · n=' + N_CPG, stripX + stripW / 2, stripT - 6);

      // cohort bands — fill backgrounds first, ticks second, labels last
      let yCursor = stripT;
      const bands = [];
      for (const k of COHORT_KEYS) {
        const count = COHORT_COUNT[k];
        if (count === 0) continue;
        const sH = stripH * (count / N_CPG);
        ctx.fillStyle = COHORT_TINT[k];
        ctx.fillRect(stripX, yCursor, stripW, sH);
        bands.push({ key: k, top: yCursor, h: sH, count });
        yCursor += sH;
      }

      // rail outline + dividers
      ctx.strokeStyle = 'rgba(26,22,18,0.30)';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(stripX, stripT, stripW, stripH);
      for (let bi = 1; bi < bands.length; bi++) {
        const yDiv = bands[bi].top;
        ctx.strokeStyle = 'rgba(26,22,18,0.30)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(stripX, yDiv);
        ctx.lineTo(stripX + stripW, yDiv);
        ctx.stroke();
      }

      // individual ticks per band (uniform across whole strip — tickStep = stripH/N_CPG)
      const tickStep = stripH / N_CPG;
      let cohortStart = 0;
      for (const info of bands) {
        for (let i = 0; i < info.count; i++) {
          const cpg = CPG_SITES[cohortStart + i];
          const ty = info.top + (i + 0.5) * (info.h / info.count);
          const colBase = cpg.isHypo ? '30,77,62,' : '110,31,34,';
          const magNorm = Math.max(0, Math.min(1, (cpg.mag - 0.005) / 0.025));
          const tlen = 5 + magNorm * (stripW - 12);
          const alpha = (0.35 + magNorm * 0.45).toFixed(2);
          ctx.strokeStyle = 'rgba(' + colBase + alpha + ')';
          ctx.lineWidth = Math.max(0.8, tickStep * 0.95);
          ctx.beginPath();
          ctx.moveTo(stripX + 3, ty);
          ctx.lineTo(stripX + 3 + tlen, ty);
          ctx.stroke();
        }
        cohortStart += info.count;
      }

      // band labels — vertical text rotated 90°, anchored top-right of band
      for (const info of bands) {
        ctx.save();
        ctx.translate(stripX + stripW - 3, info.top + 4);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = 'rgba(26,22,18,0.65)';
        ctx.font = 'bold 7.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(COHORT_LABEL[info.key] + ' · ' + info.count, 0, 0);
        ctx.restore();
      }

      // selected knob (left-side caret) + selection highlight band
      if (selectedCpG >= 0) {
        const ky = stripT + (selectedCpG + 0.5) * tickStep;
        const cpg = CPG_SITES[selectedCpG];
        // highlight band across the whole strip width
        ctx.fillStyle = 'rgba(190,151,72,0.18)';
        ctx.fillRect(stripX, ky - tickStep / 2 - 0.5, stripW, tickStep + 1);
        // caret on the left
        ctx.fillStyle = cpg.isHypo ? 'rgba(30,77,62,0.95)' : 'rgba(110,31,34,0.95)';
        ctx.strokeStyle = 'rgba(245,241,232,0.95)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(stripX - 7, ky);
        ctx.lineTo(stripX - 1, ky - 4);
        ctx.lineTo(stripX - 1, ky + 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // bottom hint
      ctx.fillStyle = 'rgba(26,22,18,0.45)';
      ctx.font = 'italic 8px "Crimson Pro", serif';
      ctx.textAlign = 'center';
      ctx.fillText('drag to scrub', stripX + stripW / 2, stripT + stripH + 11);

      // -------- β(t) INSET — selected CpG methylation curve --------
      // Canonical 1D epigenetic-clock view: methylation level β over
      // age 0..100. Shows the "gradient and changes" for one CpG at
      // a glance. Sits in the upper-left of the plot only when a CpG
      // is selected.
      if (selectedCpG >= 0) {
        const cpg = CPG_SITES[selectedCpG];
        const insW = Math.min(178, plotW * 0.40);
        const insH = 64;
        const insX = plotL + 6;
        const insY = plotT + 6;
        // panel
        ctx.fillStyle = 'rgba(245,241,232,0.94)';
        ctx.strokeStyle = 'rgba(26,22,18,0.30)';
        ctx.lineWidth = 0.8;
        roundRect(ctx, insX, insY, insW, insH, 4);
        ctx.fill();
        ctx.stroke();
        // header line
        ctx.fillStyle = 'rgba(26,22,18,0.85)';
        ctx.font = 'italic 11px "Crimson Pro", serif';
        ctx.textAlign = 'left';
        ctx.fillText('β(age) · ' + cpg.name, insX + 6, insY + 13);
        ctx.fillStyle = 'rgba(26,22,18,0.55)';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(
          (cpg.isHypo ? 'hypo' : 'hyper') + ' · peak ' + Math.round(cpg.peakAge) + 'y',
          insX + insW - 6, insY + 13
        );
        // chart axes
        const axL = insX + 18, axR = insX + insW - 8;
        const axT = insY + 22, axB = insY + insH - 12;
        // β=0.5 baseline (dashed)
        ctx.strokeStyle = 'rgba(26,22,18,0.18)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 3]);
        const yMid = axT + (axB - axT) * 0.5;
        ctx.beginPath();
        ctx.moveTo(axL, yMid);
        ctx.lineTo(axR, yMid);
        ctx.stroke();
        ctx.setLineDash([]);
        // β(t) curve
        const colMain = cpg.isHypo ? '30,77,62' : '110,31,34';
        ctx.strokeStyle = `rgba(${colMain},0.90)`;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let t = 0; t <= 100; t++) {
          const px = axL + (t / 100) * (axR - axL);
          const py = axT + (1 - cpg.betaTraj[t]) * (axB - axT);
          if (t === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        // current-age marker
        const ai = Math.max(0, Math.min(100, Math.round(age)));
        const cxIns = axL + (ai / 100) * (axR - axL);
        const cyIns = axT + (1 - cpg.betaTraj[ai]) * (axB - axT);
        ctx.fillStyle = `rgba(${colMain},1)`;
        ctx.beginPath();
        ctx.arc(cxIns, cyIns, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245,241,232,0.95)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // axis labels
        ctx.fillStyle = 'rgba(26,22,18,0.55)';
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('1', axL - 2, axT + 4);
        ctx.fillText('0', axL - 2, axB + 2);
        ctx.textAlign = 'center';
        ctx.fillText(ai + 'y', cxIns, axB + 8);
        // β-axis caption
        ctx.save();
        ctx.translate(insX + 9, axT + (axB - axT) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = 'rgba(26,22,18,0.50)';
        ctx.font = 'italic 7.5px "Crimson Pro", serif';
        ctx.textAlign = 'center';
        ctx.fillText('β', 0, 0);
        ctx.restore();
      }

      // -------- READOUT --------
      if (readout) {
        const a = Math.round(age);
        let extra = '';
        if (selectedCpG >= 0) {
          const cpg = CPG_SITES[selectedCpG];
          const tag = cpg.isHypo ? 'hypo' : 'hyper';
          extra = ` · ${cpg.name} · peak:${Math.round(cpg.peakAge)}y · FWHM:${Math.round(cpg.fwhm)}y · ${tag}`;
        } else if (overPlot && nearestArrow) {
          const c = nearestArrow;
          const mag = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
          const ang = Math.atan2(c.vy, c.vx) * 180 / Math.PI;
          const angInt = ((ang % 360) + 360) % 360;
          extra = ` · v(${c.xData.toFixed(2)},${c.yData.toFixed(2)})=|${mag.toFixed(3)}| ∠${angInt.toFixed(0)}°`;
        } else {
          extra = ` · |v|max:${frameMaxMag.toFixed(3)}`;
        }
        readout.textContent =
          `t:${a}y · ${phaseFor(age)} · μ=(${m0.x.toFixed(2)},${m0.y.toFixed(2)})${extra}`;
      }

      requestAnimationFrame(frame);
    }
    gate.frameFn = frame;
    gate.running = true;
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => { ({ ctx, w, h } = setupCanvas(canvas)); });
  })();