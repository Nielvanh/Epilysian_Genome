// Shared canvas helpers for project pages.
// Mirrors the helpers used on the main landing page.

function setupCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w: rect.width, h: rect.height };
}

function makeVisibilityGate(canvas) {
  const gate = { visible: true, running: false, frameFn: null };
  if (typeof IntersectionObserver === 'undefined') return gate;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      gate.visible = e.isIntersecting;
      if (gate.visible && !gate.running && gate.frameFn) {
        gate.running = true;
        requestAnimationFrame(gate.frameFn);
      }
    }
  }, { rootMargin: '160px 0px' });
  io.observe(canvas);
  return gate;
}

const INK = '#1A1612';
const GOLD = '#BE9748';
const EMERALD = '#1E4D3E';
const BURGUNDY = '#6E1F22';
