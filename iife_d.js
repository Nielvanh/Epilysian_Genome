(function draftD() {
    const canvas = document.getElementById('draft-d');
    if (!canvas) return;
    let { ctx, w, h } = setupCanvas(canvas);
    const wrap = canvas.parentElement;
    const readout = document.getElementById('readout-d');
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

    // ----------------------------------------------------------------
    // CLOCKS — color templates use 'X' as alpha placeholder; we
    // substitute with .replace('X', alphaStr) at draw-time.
    // ringR is the fraction of baseR for that clock's track
    // ----------------------------------------------------------------
    const CLOCKS = [
      {
        key: 'chrono', name: 'CHRONO', label: 'chronological',
        color: 'rgba(190,151,72,X)', // gold
        ringR: 1.00, type: 'truth',
        bias: () => 0, noiseAmp: 0
      },
      {
        key: 'horvath', name: 'HORVATH', label: 'Horvath multi-tissue',
        color: 'rgba(110,31,34,X)', // burgundy
        ringR: 0.84,
        bias: (a) => 0.6 * Math.sin(a * 0.07) - 0.5,
        noiseAmp: 1.4
      },
      {
        key: 'hannum', name: 'HANNUM', label: 'Hannum blood',
        color: 'rgba(30,77,62,X)', // emerald
        ringR: 0.70,
        bias: (a) => 0.9 * Math.sin(a * 0.05 + 1.2) + 0.4,
        noiseAmp: 1.6
      },
      {
        key: 'grimage', name: 'GRIMAGE', label: 'GrimAge mortality',
        color: 'rgba(64,28,18,X)', // dark walnut
        ringR: 0.56,
        // GrimAge accelerates with age, especially mid-late life
        bias: (a) => a > 40 ? Math.pow(a - 40, 1.55) * 0.020 : -0.3,
        noiseAmp: 1.9
      },
      {
        key: 'pheno', name: 'PHENOAGE', label: 'PhenoAge',
        color: 'rgba(80,52,28,X)', // sepia
        ringR: 0.42,
        bias: (a) => a > 35 ? (a - 35) * 0.07 : -0.4,
        noiseAmp: 1.5
      }
    ];

    // Pre-generate smoothed noise trajectories at integer ages 0..100
    // (1D OU-ish process — a smoothed random walk)
    for (const c of CLOCKS) {
      if (c.type === 'truth') { c.noise = new Float32Array(101); continue; }
      const noise = new Float32Array(101);
      let v = 0;
      for (let a = 0; a <= 100; a++) {
        v = v * 0.86 + gauss() * c.noiseAmp * 0.40;
        noise[a] = v;
      }
      c.noise = noise;
    }

    function clockAge(c, age) {
      if (c.type === 'truth') return age;
      const ageC = Math.max(0, Math.min(100, age));
      const intA = Math.floor(ageC);
      const frac = ageC - intA;
      const n = c.noise;
      const noise = (intA < 100) ? (n[intA] * (1 - frac) + n[intA + 1] * frac) : n[100];
      return age + c.bias(age) + noise;
    }

    // animation — clock sweeps continuously clockwise; on reaching
    // 100 it wraps to 0 (no reverse). Mouse-scrubs and wraps both
    // count as "discontinuities" → their trail samples are flagged
    // broken so we don't draw a chord across the dial.
    let age = 18;
    const SWEEP_RATE = 5; // yrs/sec
    let lastT = performance.now();

    // trails per clock — entries: { a: epiAge, broken: bool }
    const TRAIL_LEN = 45;
    const trails = {};
    for (const c of CLOCKS) trails[c.key] = [];
    let trailTimer = 0;
    let pendingJump = false; // accumulates between trail samples

    // decade pulse rings — emit from each hand tip when chrono crosses
    // an integer decade (continuously, not on jumps)
    const pulses = [];
    let lastDecade = -1;

    const gate = makeVisibilityGate(canvas);
    function frame() {
      if (!gate.visible) { gate.running = false; return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const prevAge = age;

      // -------- LAYOUT --------
      const padT = 34, padB = 26, padL = 18, padR = 18;
      const innerW = w - padL - padR;
      const innerH = h - padT - padB;
      const clockAreaW = innerW * 0.60;
      const cx = padL + clockAreaW / 2;
      const cy = padT + innerH / 2;
      const baseR = Math.min(clockAreaW * 0.5, innerH * 0.5) - 14;
      const legX = padL + clockAreaW + 10;
      const legY = padT + 10;
      const legW = innerW - clockAreaW - 14;

      const mx = mouse.x * w, my = mouse.y * h;

      // -------- AGE DRIVER --------
      // Hover over the clock face = scrub by angle.
      // Otherwise sweep clockwise; wrap 100 → 0 (continuous direction).
      const dx = mx - cx, dy = my - cy;
      const distC = Math.sqrt(dx * dx + dy * dy);
      const overFace = mouse.inside && distC < baseR + 14;
      if (overFace) {
        let ang = Math.atan2(dy, dx) + Math.PI / 2;
        if (ang < 0) ang += Math.PI * 2;
        age = (ang / (Math.PI * 2)) * 100;
      } else {
        age += SWEEP_RATE * dt;
        if (age >= 100) age -= 100; // wrap, stays clockwise
      }

      // -------- DISCONTINUITY DETECTION --------
      // > 3 yrs of change in a single frame = scrub jump or wrap;
      // mark the next trail sample as broken and skip pulse emission
      const isJump = Math.abs(age - prevAge) > 3;
      if (isJump) pendingJump = true;

      // -------- CURRENT AGES PER CLOCK --------
      const ages = {};
      for (const c of CLOCKS) ages[c.key] = clockAge(c, age);

      // -------- TRAIL SAMPLING --------
      trailTimer += dt;
      if (trailTimer > 0.06) {
        trailTimer = 0;
        for (const c of CLOCKS) {
          trails[c.key].push({ a: ages[c.key], broken: pendingJump });
          if (trails[c.key].length > TRAIL_LEN) trails[c.key].shift();
        }
        pendingJump = false;
      }

      // -------- DECADE PULSES --------
      const curDecade = Math.floor(age / 10);
      if (curDecade !== lastDecade && lastDecade !== -1 && !isJump) {
        for (const c of CLOCKS) {
          const a = Math.max(0, Math.min(100, ages[c.key]));
          const angP = (a / 100) * Math.PI * 2 - Math.PI / 2;
          const r = baseR * c.ringR;
          pulses.push({
            x: cx + Math.cos(angP) * r,
            y: cy + Math.sin(angP) * r,
            r: 2, life: 1, color: c.color
          });
        }
      }
      lastDecade = curDecade;

      // ============ DRAW ============
      ctx.clearRect(0, 0, w, h);

      // Subtle radial vignette behind clock
      {
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR + 24);
        grd.addColorStop(0, 'rgba(190,151,72,0.05)');
        grd.addColorStop(0.7, 'rgba(190,151,72,0.02)');
        grd.addColorStop(1, 'rgba(190,151,72,0.00)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR + 24, 0, Math.PI * 2);
        ctx.fill();
      }

      // Outer rims (double ring, ink + gold)
      ctx.strokeStyle = 'rgba(26,22,18,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(190,151,72,0.45)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 9, 0, Math.PI * 2);
      ctx.stroke();

      // Tick marks + decade labels on outer ring
      ctx.font = 'italic 11px "Crimson Pro", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let yr = 0; yr <= 100; yr++) {
        const ang = (yr / 100) * Math.PI * 2 - Math.PI / 2;
        const isDecade = (yr % 10 === 0);
        const isFive = (yr % 5 === 0);
        const tickLen = isDecade ? 9 : (isFive ? 5 : 2);
        const r1 = baseR;
        const r2 = baseR - tickLen;
        ctx.strokeStyle = `rgba(26,22,18,${isDecade ? 0.7 : (isFive ? 0.45 : 0.22)})`;
        ctx.lineWidth = isDecade ? 1.2 : 0.7;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
        ctx.stroke();
        if (isDecade) {
          const lr = baseR - 21;
          ctx.fillStyle = 'rgba(26,22,18,0.78)';
          const txt = (yr === 0) ? '·' : yr.toString();
          ctx.fillText(txt, cx + Math.cos(ang) * lr, cy + Math.sin(ang) * lr);
        }
      }

      // Concentric DNAm clock rings + clock name on the ring
      for (const c of CLOCKS) {
        if (c.type === 'truth') continue;
        const r = baseR * c.ringR;
        ctx.strokeStyle = c.color.replace('X', '0.20');
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Trails — skip segments whose endpoint is flagged broken
      // (those mark a scrub-jump or 100→0 wrap, where a chord across
      // the dial would be visually misleading)
      for (const c of CLOCKS) {
        const tr = trails[c.key];
        if (tr.length < 2) continue;
        const r = baseR * c.ringR;
        ctx.lineCap = 'round';
        for (let i = 1; i < tr.length; i++) {
          if (tr[i].broken) continue;
          const a = (tr.length - i) / tr.length;
          const a0 = Math.max(0, Math.min(100, tr[i - 1].a));
          const a1 = Math.max(0, Math.min(100, tr[i].a));
          const ang0 = (a0 / 100) * Math.PI * 2 - Math.PI / 2;
          const ang1 = (a1 / 100) * Math.PI * 2 - Math.PI / 2;
          // steeper fade: old end drops to ~0 quickly
          const alpha = 0.34 * Math.pow(1 - a, 1.7);
          ctx.strokeStyle = c.color.replace('X', alpha.toFixed(3));
          ctx.lineWidth = c.type === 'truth' ? 1.6 : 1.0;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang0) * r, cy + Math.sin(ang0) * r);
          ctx.lineTo(cx + Math.cos(ang1) * r, cy + Math.sin(ang1) * r);
          ctx.stroke();
        }
      }

      // Pulses (decade chime rings around hand tips)
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.r += 28 * dt;
        p.life -= 1.5 * dt;
        if (p.life <= 0) { pulses.splice(i, 1); continue; }
        ctx.strokeStyle = p.color.replace('X', (p.life * 0.55).toFixed(3));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Divergence arc (between chrono hand and most-divergent DNAm hand)
      let mostDiv = null, maxAbsDelta = 0;
      for (const c of CLOCKS) {
        if (c.type === 'truth') continue;
        const d = Math.abs(ages[c.key] - age);
        if (d > maxAbsDelta) { maxAbsDelta = d; mostDiv = c; }
      }
      if (mostDiv && maxAbsDelta > 0.4) {
        const a1 = (Math.max(0, Math.min(100, age)) / 100) * Math.PI * 2 - Math.PI / 2;
        const a2 = (Math.max(0, Math.min(100, ages[mostDiv.key])) / 100) * Math.PI * 2 - Math.PI / 2;
        const arcR = baseR + 14;
        ctx.strokeStyle = mostDiv.color.replace('X', '0.55');
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const start = Math.min(a1, a2);
        const end = Math.max(a1, a2);
        ctx.arc(cx, cy, arcR, start, end);
        ctx.stroke();
        // small arrow caps
        ctx.fillStyle = mostDiv.color.replace('X', '0.55');
        for (const aa of [start, end]) {
          ctx.beginPath();
          ctx.arc(cx + Math.cos(aa) * arcR, cy + Math.sin(aa) * arcR, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // -------- LEGEND HOVER --------
      const lineH = Math.min(34, (innerH - 14) / CLOCKS.length);
      let hovered = null;
      for (let i = 0; i < CLOCKS.length; i++) {
        const c = CLOCKS[i];
        const ly = legY + i * lineH;
        const isHover = mouse.inside && mx > legX - 6 && mx < legX + legW + 4
                        && my > ly && my < ly + lineH;
        if (isHover) hovered = c.key;
      }

      // Hands — draw DNAm first (under), chrono last (on top)
      const drawOrder = [...CLOCKS].sort((a, b) =>
        (a.type === 'truth' ? 1 : 0) - (b.type === 'truth' ? 1 : 0)
      );
      for (const c of drawOrder) {
        const a = Math.max(0, Math.min(100, ages[c.key]));
        const r = baseR * c.ringR;
        const ang = (a / 100) * Math.PI * 2 - Math.PI / 2;
        const tx = cx + Math.cos(ang) * r;
        const ty = cy + Math.sin(ang) * r;

        const isTruth = c.type === 'truth';
        const dim = (hovered && hovered !== c.key) ? 0.40 : 1.0;
        // hand shaft
        ctx.strokeStyle = c.color.replace('X', (isTruth ? 0.95 : 0.78) * dim);
        ctx.lineWidth = isTruth ? 2.2 : 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // tip dot
        ctx.fillStyle = c.color.replace('X', (isTruth ? 0.95 : 0.88) * dim);
        ctx.beginPath();
        ctx.arc(tx, ty, isTruth ? 4.2 : 3.0, 0, Math.PI * 2);
        ctx.fill();
        // hovered hand: gold ring around tip
        if (hovered === c.key) {
          ctx.strokeStyle = 'rgba(190,151,72,0.95)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(tx, ty, 7.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Center cap: ink core + gold pip
      ctx.fillStyle = 'rgba(26,22,18,0.88)';
      ctx.beginPath();
      ctx.arc(cx, cy, 5.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(190,151,72,0.95)';
      ctx.beginPath();
      ctx.arc(cx, cy, 2.8, 0, Math.PI * 2);
      ctx.fill();

      // -------- LEGEND DRAW --------
      for (let i = 0; i < CLOCKS.length; i++) {
        const c = CLOCKS[i];
        const ly = legY + i * lineH;
        const isHover = (hovered === c.key);
        if (isHover) {
          ctx.fillStyle = 'rgba(190,151,72,0.10)';
          ctx.fillRect(legX - 6, ly, legW + 6, lineH);
        }
        // colored swatch
        ctx.fillStyle = c.color.replace('X', '0.95');
        ctx.beginPath();
        ctx.arc(legX + 4, ly + 9, 3.6, 0, Math.PI * 2);
        ctx.fill();
        // name
        ctx.fillStyle = 'rgba(26,22,18,0.88)';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(c.name, legX + 14, ly + 4);
        // value
        ctx.fillStyle = 'rgba(26,22,18,0.62)';
        ctx.font = '9px "JetBrains Mono", monospace';
        const av = ages[c.key];
        ctx.fillText(`${av.toFixed(1)}y`, legX + 14, ly + 17);
        // delta
        if (c.type !== 'truth') {
          const d = ages[c.key] - age;
          const sgn = d >= 0 ? '+' : '−';
          const dCol = Math.abs(d) < 1
            ? 'rgba(26,22,18,0.50)'
            : (d > 0 ? 'rgba(110,31,34,0.90)' : 'rgba(30,77,62,0.90)');
          ctx.fillStyle = dCol;
          ctx.textAlign = 'right';
          ctx.fillText(`${sgn}${Math.abs(d).toFixed(1)}y`, legX + legW - 4, ly + 17);
          ctx.textAlign = 'left';
        }
      }

      // -------- READOUT --------
      if (readout) {
        const a = Math.round(age);
        const parts = [`t:${a}y`];
        for (const c of CLOCKS) {
          if (c.type === 'truth') continue;
          const d = ages[c.key] - age;
          const sgn = d >= 0 ? '+' : '−';
          parts.push(`${c.name.toLowerCase()}:${sgn}${Math.abs(d).toFixed(1)}y`);
        }
        readout.textContent = parts.join(' · ');
      }

      requestAnimationFrame(frame);
    }
    gate.frameFn = frame;
    gate.running = true;
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => { ({ ctx, w, h } = setupCanvas(canvas)); });
  })();