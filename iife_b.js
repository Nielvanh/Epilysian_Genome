(function draftB() {
    const canvas = document.getElementById('draft-b');
    if (!canvas) return;
    let { ctx, w, h } = setupCanvas(canvas);
    const wrap = canvas.parentElement;
    const readout = document.getElementById('readout-b');
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

    // hg38 chromosome sizes (Mb), 1..22, X
    const CHROMS = [
      { n:'1',  size:248.96 }, { n:'2',  size:242.19 }, { n:'3',  size:198.30 },
      { n:'4',  size:190.21 }, { n:'5',  size:181.54 }, { n:'6',  size:170.81 },
      { n:'7',  size:159.35 }, { n:'8',  size:145.14 }, { n:'9',  size:138.39 },
      { n:'10', size:133.80 }, { n:'11', size:135.09 }, { n:'12', size:133.28 },
      { n:'13', size:114.36 }, { n:'14', size:107.04 }, { n:'15', size:101.99 },
      { n:'16', size:90.34  }, { n:'17', size:83.26  }, { n:'18', size:80.37  },
      { n:'19', size:58.62  }, { n:'20', size:64.44  }, { n:'21', size:46.71  },
      { n:'22', size:50.82  }, { n:'X',  size:156.04 }
    ];

    // approximate centromere positions (Mb)
    const CENT = {
      '1':123,'2':93,'3':91,'4':50,'5':48,'6':59,'7':59,'8':45,'9':50,
      '10':40,'11':53,'12':35,'13':17,'14':17,'15':19,'16':36,'17':25,
      '18':17,'19':26,'20':28,'21':12,'22':15,'X':61
    };

    // real epigenetic-clock hotspots — broad FWHMs because these
    // canonical clock CpGs change quasi-linearly across most of life
    const HOTSPOTS = [
      { gene:'ELOVL2',  chr:'6',  pos:11.0,  peakAge:55, fwhm:60, dir:+1, mag:0.038 },
      { gene:'FHL2',    chr:'2',  pos:105.6, peakAge:58, fwhm:62, dir:+1, mag:0.034 },
      { gene:'KLF14',   chr:'7',  pos:130.4, peakAge:62, fwhm:55, dir:+1, mag:0.030 },
      { gene:'TRIM59',  chr:'3',  pos:160.1, peakAge:50, fwhm:55, dir:+1, mag:0.028 },
      { gene:'ASPA',    chr:'17', pos:3.4,   peakAge:48, fwhm:58, dir:-1, mag:0.026 },
      { gene:'EDARADD', chr:'1',  pos:236.4, peakAge:52, fwhm:55, dir:+1, mag:0.024 }
    ];

    // ----------------------------------------------------------------
    // CpG population — four life-stage cohorts so the aggregate field
    // visibly changes character as you scrub the age slider:
    //
    //   * developmental  ~22%  peakAge 0..15   sharp, intense (ECC remodeling)
    //   * young-adult     ~8%  peakAge 17..32  moderate, narrow
    //   * canonical aging ~55% peakAge 38..78  broad — active across midlife
    //   * late-life       ~15% peakAge 72..95  noisier, senescence-style
    // ----------------------------------------------------------------
    const N_SITES = 1200;
    const totalSize = CHROMS.reduce((a, c) => a + c.size, 0);
    const sites = [];
    for (const ch of CHROMS) {
      const n = Math.max(8, Math.round(N_SITES * ch.size / totalSize));
      for (let i = 0; i < n; i++) {
        const pos = Math.random() * ch.size;
        const r = Math.random();
        let peakAge, fwhm, mag, dir;
        if (r < 0.22) {
          // developmental — rapid remodelling, sharp narrow peaks
          peakAge = Math.random() * 14 + gauss() * 2;
          if (peakAge < 0) peakAge = 0;
          if (peakAge > 18) peakAge = 18;
          fwhm = 5 + Math.random() * 9;
          mag = 0.010 + Math.pow(Math.random(), 1.7) * 0.028;
          dir = Math.random() < 0.50 ? +1 : -1; // mixed in development
        } else if (r < 0.30) {
          // young-adult settling
          peakAge = 17 + Math.random() * 15;
          fwhm = 12 + Math.random() * 12;
          mag = 0.004 + Math.pow(Math.random(), 2.6) * 0.012;
          dir = Math.random() < 0.55 ? +1 : -1;
        } else if (r < 0.85) {
          // canonical aging — broad Gaussians, active across most of adult life
          peakAge = 38 + Math.random() * 40 + gauss() * 5;
          if (peakAge < 30) peakAge = 30 + Math.random() * 6;
          if (peakAge > 90) peakAge = 90;
          fwhm = 30 + Math.random() * 48; // wide — quasi-continuous activity
          mag = 0.0035 + Math.pow(Math.random(), 2.6) * 0.018;
          // hyper-methylation enriched in this regime (CpG-island bias)
          dir = Math.random() < 0.65 ? +1 : -1;
        } else {
          // late-life / senescence-driven drift — narrower, noisier
          peakAge = 72 + Math.random() * 23;
          fwhm = 10 + Math.random() * 22;
          mag = 0.006 + Math.pow(Math.random(), 2.0) * 0.022;
          dir = Math.random() < 0.55 ? +1 : -1;
        }
        sites.push({ chr: ch.n, pos, peakAge, fwhm, dir, mag, hot: null });
      }
    }
    for (const hs of HOTSPOTS) {
      sites.push({
        chr: hs.chr, pos: hs.pos, peakAge: hs.peakAge,
        fwhm: hs.fwhm, dir: hs.dir, mag: hs.mag, hot: hs
      });
    }

    function velAt(s, age) {
      const sigma = s.fwhm / 2.355;
      const z = (age - s.peakAge) / sigma;
      return s.dir * s.mag * Math.exp(-0.5 * z * z);
    }

    function phaseFor(age) {
      if (age < 16)  return 'developmental remodelling';
      if (age < 32)  return 'young-adult equilibrium';
      if (age < 65)  return 'canonical aging drift';
      if (age < 82)  return 'late-life acceleration';
      return 'senescent stochastic drift';
    }
    function phaseShort(age) {
      if (age < 16)  return 'develop.';
      if (age < 32)  return 'equilibr.';
      if (age < 65)  return 'aging';
      if (age < 82)  return 'late-life';
      return 'senesc.';
    }

    // particle system (drifting methylation events)
    const particles = [];
    function emitParticle(x, y, dir, mag) {
      particles.push({
        x, y,
        vx: gauss() * 0.18,
        vy: -0.45 - Math.random() * 0.55,
        life: 1.0,
        decay: 0.013 + Math.random() * 0.012,
        size: 1.0 + mag * 70,
        dir
      });
    }

    // age driver
    let age = 18;
    let sweepDir = +1;
    const SWEEP_RATE = 4.3; // yrs/sec — calmer (this panel is the busiest)
    let lastT = performance.now();

    function chrSeed(name) {
      let s = 7;
      for (let i = 0; i < name.length; i++) s = (s * 31 + name.charCodeAt(i)) | 0;
      return Math.abs(s);
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

    const gate = makeVisibilityGate(canvas);
    function frame() {
      if (!gate.visible) { gate.running = false; return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      const padT = 34, padB = 26, padL = 18, padR = 18;
      const innerW = w - padL - padR;
      const innerH = h - padT - padB;
      const ideoH   = 30;
      const sliderH = 22;
      const gapA    = 10; // velocity → ideogram
      const gapB    = 10; // ideogram → slider
      const velH = innerH - ideoH - sliderH - gapA - gapB;
      const baselineY = padT + velH;
      const ideoTop = baselineY + gapA;
      const sliderTop = ideoTop + ideoH + gapB;
      const sliderY = sliderTop + sliderH / 2;

      const mx = mouse.x * w;
      const my = mouse.y * h;
      const overSlider = mouse.inside && my > sliderTop - 6 && my < sliderTop + sliderH + 6;
      const overVel = mouse.inside && my < baselineY + 4 && my > padT - 4;

      if (overSlider) {
        const t = Math.max(0, Math.min(1, (mx - padL) / innerW));
        age = t * 100;
      } else {
        age += sweepDir * SWEEP_RATE * dt;
        if (age >= 100) { age = 100; sweepDir = -1; }
        if (age <= 0)   { age = 0;   sweepDir = +1; }
      }

      ctx.clearRect(0, 0, w, h);

      // -------- chromosome layout --------
      const cgap = 4;
      const totalCgap = cgap * (CHROMS.length - 1);
      const usable = innerW - totalCgap;
      const layout = [];
      let cx0 = 0;
      for (const ch of CHROMS) {
        const wpx = (ch.size / totalSize) * usable;
        layout.push({ ch, x: cx0, w: wpx });
        cx0 += wpx + cgap;
      }
      const chrXMap = {};
      for (const L of layout) chrXMap[L.ch.n] = L;

      // baseline rule
      ctx.strokeStyle = 'rgba(26,22,18,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, baselineY);
      ctx.lineTo(padL + innerW, baselineY);
      ctx.stroke();

      // y-axis hint
      ctx.fillStyle = 'rgba(26,22,18,0.45)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('|Δβ/yr|', padL + 2, padT + 10);

      // -------- VELOCITY TICKS --------
      const velMax = 0.045;
      let muV = 0, nGain = 0, nLoss = 0;
      for (const s of sites) {
        const L = chrXMap[s.chr];
        if (!L) continue;
        const cx = padL + L.x + (s.pos / L.ch.size) * L.w;
        const v = velAt(s, age);
        const av = Math.abs(v);
        muV += av;
        if (av > 0.002) { if (s.dir > 0) nGain++; else nLoss++; }
        const tickH = Math.min(1, av / velMax) * velH;
        if (tickH < 0.6) continue;
        const a = 0.16 + 0.70 * (av / velMax);
        ctx.strokeStyle = s.dir > 0
          ? `rgba(110,31,34,${a.toFixed(3)})`
          : `rgba(30,77,62,${a.toFixed(3)})`;
        ctx.lineWidth = s.hot ? 1.5 : 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, baselineY);
        ctx.lineTo(cx, baselineY - tickH);
        ctx.stroke();

        // calmer emit — higher threshold + lower probability so the
        // panel reads as "ambient" rather than fizzing
        if (av > 0.020 && Math.random() < 0.012) {
          emitParticle(cx, baselineY - tickH, s.dir, av);
        }
      }
      muV = sites.length ? muV / sites.length : 0;

      // -------- PARTICLES --------
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0 || p.y < padT + 6) { particles.splice(i, 1); continue; }
        ctx.fillStyle = p.dir > 0
          ? `rgba(110,31,34,${(p.life * 0.42).toFixed(3)})`
          : `rgba(30,77,62,${(p.life * 0.42).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // -------- HOTSPOT CALLOUTS --------
      for (const s of sites) {
        if (!s.hot) continue;
        const L = chrXMap[s.chr];
        if (!L) continue;
        const cx = padL + L.x + (s.pos / L.ch.size) * L.w;
        const v = velAt(s, age);
        const av = Math.abs(v);
        const tickH = Math.min(1, av / velMax) * velH;
        const tipY = baselineY - tickH;
        const activity = Math.min(1, av / 0.020);
        if (activity > 0.05) {
          ctx.strokeStyle = `rgba(190,151,72,${(0.45 + activity * 0.45).toFixed(3)})`;
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.arc(cx, tipY, 3 + activity * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        const labelY = padT + 22 + (s.hot.gene.length % 3) * 11;
        ctx.fillStyle = `rgba(26,22,18,${(0.55 + activity * 0.40).toFixed(3)})`;
        ctx.font = 'italic 10.5px "Crimson Pro", serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.hot.gene, cx, labelY);
        ctx.strokeStyle = `rgba(190,151,72,${(0.18 + activity * 0.32).toFixed(3)})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(cx, labelY + 3);
        ctx.lineTo(cx, tipY - 5);
        ctx.stroke();
      }

      // -------- IDEOGRAM --------
      for (const L of layout) {
        const x0 = padL + L.x;
        const wpx = L.w;
        ctx.fillStyle = 'rgba(26,22,18,0.05)';
        roundRect(ctx, x0, ideoTop, wpx, ideoH, 5);
        ctx.fill();
        const seed = chrSeed(L.ch.n);
        const nBands = 5 + (seed % 4);
        for (let b = 0; b < nBands; b++) {
          const r = ((seed * 9301 + b * 4951) % 1000) / 1000;
          const bx = x0 + r * wpx;
          const bw = wpx * (0.05 + ((seed + b * 7) % 7) / 50);
          const ba = 0.10 + ((seed + b * 13) % 5) / 28;
          ctx.fillStyle = `rgba(26,22,18,${ba.toFixed(3)})`;
          const drawW = Math.max(0, Math.min(bw, x0 + wpx - bx - 2));
          ctx.fillRect(bx, ideoTop + 2, drawW, ideoH - 4);
        }
        const cmb = CENT[L.ch.n];
        if (cmb) {
          const cxc = x0 + (cmb / L.ch.size) * wpx;
          ctx.fillStyle = 'rgba(190,151,72,0.55)';
          ctx.beginPath();
          ctx.moveTo(cxc - 2.5, ideoTop + 1);
          ctx.lineTo(cxc + 2.5, ideoTop + 1);
          ctx.lineTo(cxc, ideoTop + ideoH / 2);
          ctx.lineTo(cxc + 2.5, ideoTop + ideoH - 1);
          ctx.lineTo(cxc - 2.5, ideoTop + ideoH - 1);
          ctx.lineTo(cxc, ideoTop + ideoH / 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(26,22,18,0.35)';
        ctx.lineWidth = 0.6;
        roundRect(ctx, x0, ideoTop, wpx, ideoH, 5);
        ctx.stroke();
        ctx.fillStyle = 'rgba(26,22,18,0.55)';
        ctx.font = '8.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(L.ch.n, x0 + wpx / 2, ideoTop + ideoH + 9);
      }

      // -------- SLIDER --------
      const sx0 = padL;
      const sxW = innerW;
      ctx.strokeStyle = 'rgba(26,22,18,0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx0, sliderY);
      ctx.lineTo(sx0 + sxW, sliderY);
      ctx.stroke();
      for (let yr = 0; yr <= 100; yr += 10) {
        const tx = sx0 + (yr / 100) * sxW;
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
      const knobX = sx0 + (age / 100) * sxW;
      // gold guide line into velocity zone
      ctx.strokeStyle = 'rgba(190,151,72,0.22)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(knobX, padT + 4);
      ctx.lineTo(knobX, sliderY - 6);
      ctx.stroke();

      // phase pill — sits at the top of the gold guide, says what
      // epigenetic regime we're currently scrubbing through
      {
        const pLabel = phaseShort(age).toUpperCase();
        ctx.font = '9px "JetBrains Mono", monospace';
        const tw = ctx.measureText(pLabel).width;
        const pillW = tw + 12;
        const pillH = 14;
        let pillX = knobX - pillW / 2;
        if (pillX < padL + 2) pillX = padL + 2;
        if (pillX + pillW > padL + innerW - 2) pillX = padL + innerW - 2 - pillW;
        const pillY = padT + 2;
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

      // knob
      ctx.fillStyle = 'rgba(190,151,72,0.95)';
      ctx.strokeStyle = 'rgba(26,22,18,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(knobX, sliderY, 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // -------- HOTSPOT HOVER --------
      let activeHot = null;
      if (mouse.inside && overVel) {
        let bestD = 1e9;
        for (const s of sites) {
          if (!s.hot) continue;
          const L = chrXMap[s.chr];
          if (!L) continue;
          const cx = padL + L.x + (s.pos / L.ch.size) * L.w;
          const d = Math.abs(cx - mx);
          if (d < bestD) { bestD = d; activeHot = s; }
        }
        if (bestD > 36) activeHot = null;
      }
      if (activeHot) {
        const L = chrXMap[activeHot.chr];
        const cx = padL + L.x + (activeHot.pos / L.ch.size) * L.w;
        const v = velAt(activeHot, age);
        const av = Math.abs(v);
        const tickH = Math.min(1, av / velMax) * velH;
        const tipY = baselineY - tickH;
        ctx.strokeStyle = 'rgba(190,151,72,0.95)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, tipY, 6.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // -------- READOUT --------
      if (readout) {
        const a = Math.round(age);
        const ph = phaseFor(age);
        let extra = '';
        if (activeHot) {
          const v = velAt(activeHot, age);
          const sgn = v >= 0 ? '+' : '−';
          extra = ` · ${activeHot.hot.gene} chr${activeHot.chr}:${activeHot.pos.toFixed(1)}M v:${sgn}${(Math.abs(v) * 1000).toFixed(2)}·10⁻³/yr`;
        }
        readout.textContent =
          `t:${a}y · ${ph} · μ̄|v|:${(muV * 1000).toFixed(2)}·10⁻³/yr · ↑${nGain} ↓${nLoss}${extra}`;
      }

      requestAnimationFrame(frame);
    }
    gate.frameFn = frame;
    gate.running = true;
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => { ({ ctx, w, h } = setupCanvas(canvas)); });
  })();