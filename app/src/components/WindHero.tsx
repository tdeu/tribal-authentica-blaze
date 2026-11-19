// Hero title + wind. Laterite sand blows left → right across the hero (~2.5 s):
//  - line 1 ("IT STAYS HOME.") never moves; grains that hit it settle into a pile at its base.
//  - line 2 ("ITS STORY TRAVELS.") dissolves letter by letter into sand carried right and DOWN towards
//    the collection, then reforms (each letter fades back in) so both lines end fully readable.
//  - afterwards a thin trail of grains keeps drifting down (scroll invitation) while the hero is visible.
// Performance: one canvas, one requestAnimationFrame loop, fillRect per grain. Layout and glyph shapes
// are read ONCE at start (and on resize), never per frame. The pile is painted once into an offscreen
// layer. Per-frame DOM writes are limited to a letter's opacity when it dissolves / reforms.
// Reduced motion: static title, no canvas.
import { useEffect, useRef, type ReactNode } from 'react';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
let playedThisLoad = false;

type Grain = { x: number; y: number; vx: number; vy: number; s: number; a: number; born: number; life: number; kind: 'wind' | 'letter' | 'trail' };

export function WindHero({ line1, line2, label, children }: { line1: string; line2: string; label: string; children?: ReactNode }) {
  const reduced = reducedMotion();
  const hero = useRef<HTMLElement>(null);
  const l1 = useRef<HTMLSpanElement>(null);
  const l2 = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduced) return;
    const h = hero.current, c = canvas.current, line1El = l1.current, line2El = l2.current;
    if (!h || !c || !line1El || !line2El) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    let raf = 0, visible = true, alive = true;
    let W = 0, H = 0, dpr = 1;
    let box1 = { l: 0, t: 0, r: 0, b: 0 };
    let letters: { el: HTMLElement; i: number; pts: [number, number][] }[] = [];
    let trailSrc: { x: number; y: number }[] = [];
    let pile: HTMLCanvasElement | null = null, pctx: CanvasRenderingContext2D | null = null;
    let heights: number[] = [];
    let color = '#E0582A';
    let grainSize = 2;
    let base1 = 0; // line 1 baseline (pile floor)
    const grains: Grain[] = [];
    const playFull = !playedThisLoad;
    let t0 = 0;
    const DISSOLVE_AT = 0.35, DISSOLVE_STEP = 0.06, REFORM_AT = 1.55, REFORM_STEP = 0.04, WIND_END = 2.2;
    const letterState: ('idle' | 'gone' | 'back')[] = [];

    // ---- one layout pass: sizes, line 1 box, line 2 letter glyph points
    const measure = () => {
      const hr = h.getBoundingClientRect();
      W = Math.round(hr.width); H = Math.round(hr.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = `${W}px`; c.style.height = `${H}px`;
      color = getComputedStyle(h).getPropertyValue('--accent').trim() || color;
      const r1 = line1El.getBoundingClientRect();
      box1 = { l: r1.left - hr.left, t: r1.top - hr.top, r: r1.right - hr.left, b: r1.bottom - hr.top };
      const cs = getComputedStyle(line2El);
      const fontSize = parseFloat(cs.fontSize) || 64;
      grainSize = Math.max(1.5, Math.min(3, fontSize / 40));
      base1 = box1.b - fontSize * 0.08;   // caps sit ~0.08em above the line box bottom at line-height .92
      const step = Math.max(2, Math.round(fontSize / 30));
      // glyph raster: draw each letter centred in its own box on an offscreen canvas, sample its pixels
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const o = off.getContext('2d', { willReadFrequently: true })!;
      o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
      const spans = Array.from(line2El.querySelectorAll<HTMLElement>('.wl'));
      const rects = spans.map((el) => el.getBoundingClientRect());
      rects.forEach((r, i) => { const ch = spans[i].textContent ?? ''; if (ch.trim()) o.fillText(ch, r.left - hr.left + r.width / 2, r.top - hr.top + r.height / 2 + fontSize * 0.04); });
      const img = o.getImageData(0, 0, W, H).data;
      let lettersTmp = spans.map((el, i) => {
        const r = rects[i]; const pts: [number, number][] = [];
        const x0 = Math.max(0, Math.floor(r.left - hr.left)), x1 = Math.min(W - 1, Math.ceil(r.right - hr.left));
        const y0 = Math.max(0, Math.floor(r.top - hr.top)), y1 = Math.min(H - 1, Math.ceil(r.bottom - hr.top));
        for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) if (img[(y * W + x) * 4 + 3] > 140) pts.push([x, y]);
        return { el, i, pts };
      });
      letters = lettersTmp;
      // cap the letter grains (~700) so a phone draws ~1,300 grains at the peak, whatever the font size
      const total = letters.reduce((n, L) => n + L.pts.length, 0);
      const keep = Math.max(1, Math.ceil(total / 700));
      if (keep > 1) letters.forEach((L) => { L.pts = L.pts.filter((_, k) => k % keep === 0); });
      trailSrc = letters.flatMap((L) => L.pts.filter((_, k) => k % 6 === 0).map(([x, y]) => ({ x, y })));
      // pile layer under line 1
      pile = document.createElement('canvas'); pile.width = c.width; pile.height = c.height;
      pctx = pile.getContext('2d')!; pctx.setTransform(dpr, 0, 0, dpr, 0, 0); pctx.fillStyle = color;
      heights = new Array(Math.ceil((box1.r - box1.l) / grainSize) + 1).fill(0);
    };

    const settle = () => {
      if (!pctx) return;
      // sand spreads along the base, heavier on the windward (left) side
      const x = box1.l + (box1.r - box1.l) * Math.pow(Math.random(), 1.8);
      let col = Math.max(0, Math.min(heights.length - 1, Math.floor((x - box1.l) / grainSize)));
      // angle of repose: a grain rolls down to a lower neighbour before it stacks (smooth mounds, not towers)
      for (let guard = 0; guard < 8; guard++) {
        if (col > 0 && heights[col - 1] < heights[col] - 1) col--;
        else if (col < heights.length - 1 && heights[col + 1] < heights[col] - 1) col++;
        else break;
      }
      if (heights[col] >= 5) return;                         // pile has a natural max height
      const y = base1 - (heights[col] + 1) * grainSize * 0.9 + grainSize;
      heights[col]++;
      pctx.globalAlpha = rand(0.55, 0.95);
      pctx.fillRect(box1.l + col * grainSize, y, grainSize, grainSize);
    };

    const spawnWind = (n: number, now: number) => {
      for (let k = 0; k < n; k++) {
        // biased to the title band so grains actually meet the letters
        const y = Math.random() < 0.75 ? rand(box1.t - 20, box1.b + (box1.b - box1.t) * 1.6) : rand(0, H);
        grains.push({ x: rand(-40, -4), y, vx: rand(420, 820), vy: rand(-20, 20), s: grainSize * rand(0.7, 1.2), a: rand(0.35, 0.9), born: now, life: 4, kind: 'wind' });
      }
    };
    const releaseLetter = (L: typeof letters[number], now: number) => {
      for (const [x, y] of L.pts) {
        grains.push({ x, y, vx: rand(160, 520), vy: rand(30, 170), s: grainSize * rand(0.8, 1.3), a: rand(0.6, 1), born: now + rand(0, 0.12), life: rand(1.1, 1.8), kind: 'letter' });
      }
    };
    const spawnTrail = (now: number) => {
      if (!trailSrc.length) return;
      const p = trailSrc[Math.floor(Math.random() * trailSrc.length)];
      grains.push({ x: p.x, y: p.y, vx: rand(8, 40), vy: rand(30, 75), s: grainSize * rand(0.6, 1), a: rand(0.25, 0.55), born: now, life: rand(4, 7), kind: 'trail' });
    };

    let last = 0, windAcc = 0, trailAcc = 0;
    const tick = (ms: number) => {
      if (!alive) return;
      const now = ms / 1000;
      const dt = last ? Math.min(0.05, now - last) : 0;
      last = now;
      const t = now - t0;

      if (playFull) {
        if (t < WIND_END) { windAcc += dt * (t < 0.3 ? 700 : 300); const n = Math.floor(windAcc); windAcc -= n; spawnWind(n, now); }
        letters.forEach((L, i) => {
          if (!L.pts.length) return;
          if (letterState[i] === 'idle' && t >= DISSOLVE_AT + i * DISSOLVE_STEP) { letterState[i] = 'gone'; L.el.style.opacity = '0'; releaseLetter(L, now); }
          if (letterState[i] === 'gone' && t >= REFORM_AT + i * REFORM_STEP) { letterState[i] = 'back'; L.el.style.opacity = '1'; }
        });
      }
      if (!playFull || t > WIND_END) { trailAcc += dt * 9; while (trailAcc >= 1) { trailAcc--; spawnTrail(now); } }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (pile) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(pile, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
      ctx.fillStyle = color;
      for (let k = grains.length - 1; k >= 0; k--) {
        const g = grains[k];
        const age = now - g.born;
        if (age < 0) continue;
        if (age > g.life || g.x > W + 10 || g.y > H + 10) { grains[k] = grains[grains.length - 1]; grains.pop(); continue; }
        if (g.kind === 'wind') {
          g.vy += Math.sin((g.x + g.y) * 0.02) * 40 * dt;
          // hits line 1: settles into the pile at its base (line 1 holds)
          if (g.x >= box1.l && g.x <= box1.r && g.y >= box1.t && g.y <= box1.b) { settle(); grains[k] = grains[grains.length - 1]; grains.pop(); continue; }
        } else if (g.kind === 'letter') {
          g.vx += 120 * dt; g.vy += 160 * dt;                   // wind pushes right, sand falls
        }
        g.x += g.vx * dt; g.y += g.vy * dt;
        const fade = g.kind === 'wind' ? 1 : Math.min(1, (g.life - age) / (g.life * 0.45));
        ctx.globalAlpha = g.a * Math.max(0, fade);
        ctx.fillRect(g.x, g.y, g.s, g.s);
      }
      if (t > REFORM_AT + letters.length * REFORM_STEP + 0.5) playedThisLoad = true;
      raf = visible ? requestAnimationFrame(tick) : 0;
    };

    const start = () => {
      measure();
      letters.forEach((_, i) => { letterState[i] = 'idle'; });
      t0 = performance.now() / 1000;
      last = 0;
      raf = requestAnimationFrame(tick);
    };

    // pause off-screen (the trail runs forever otherwise)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf && alive && t0) { last = 0; raf = requestAnimationFrame(tick); }
    });
    io.observe(h);
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = window.setTimeout(() => { measure(); grains.length = 0; }, 150); };
    window.addEventListener('resize', onResize);
    // the glyph raster needs the real font
    (document.fonts?.ready ?? Promise.resolve()).then(() => { if (alive) start(); });

    return () => {
      alive = false; cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', onResize); clearTimeout(rt);
      letters.forEach((L) => { L.el.style.opacity = ''; });
    };
  }, [reduced, line1, line2]);

  return (
    <section className="hero" ref={hero}>
      <h1 className="headline h-xl wind-title" aria-label={label}>
        <span ref={l1} aria-hidden>{line1}</span><br />
        <span ref={l2} className="accent" aria-hidden>
          {[...line2].map((ch, i) => <span key={i} className="wl">{ch}</span>)}
        </span>
      </h1>
      {children}
      {!reduced && <canvas ref={canvas} className="wind-canvas" aria-hidden />}
    </section>
  );
}
