// Hero title + a continuous laterite wind (seamless, never stops while visible).
//  - "IT STAYS HOME." never moves. Dune ripples rest on its baseline and slowly migrate; grains hop
//    along them (saltation) and flow on past it.
//  - "ITS STORY TRAVELS." is a migrating dune: every letter keeps shedding sand from its trailing
//    (right) edge, which streams right and down towards the collection, and keeps absorbing grains
//    that arrive at its leading (left) edge. The line sways a few pixels. Erosion is capped at ~12 %
//    of each letter's area, so it is always legible.
//  - A low wind band carries grains left → right with near/far parallax and short motion streaks.
// Performance: one canvas, one requestAnimationFrame loop, fixed pools (no allocation per frame),
// fillRect only. Layout and glyph shapes are read once (start, resize), never per frame. The only
// per-frame DOM write is line 2's transform (no layout). Paused off-screen. Reduced motion: static.
import { useEffect, useRef, type ReactNode } from 'react';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

type Grain = { x: number; y: number; vx: number; vy: number; s: number; a: number; c: number; age: number; life: number; on: boolean };
type Letter = { el: HTMLElement; lead: number; top: number; bot: number; trail: [number, number][]; holes: Grain[] };

export function WindHero({ line1, line2, label, children }: { line1: string; line2: string; label: string; children?: ReactNode }) {
  const reduced = reducedMotion();
  const hero = useRef<HTMLElement>(null);
  const l1 = useRef<HTMLSpanElement>(null);
  const l2 = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);     // behind the title: all moving sand
  const front = useRef<HTMLCanvasElement>(null);      // above the title: only the edge nibbles on line 2

  useEffect(() => {
    if (reduced) return;
    const h = hero.current, cv = canvas.current, fv = front.current, e1 = l1.current, e2 = l2.current;
    if (!h || !cv || !fv || !e1 || !e2) return;
    const ctx = cv.getContext('2d'), fx = fv.getContext('2d');
    if (!ctx || !fx) return;

    let W = 0, H = 0, dpr = 1, unit = 2, fs2 = 64;
    let x1l = 0, x1r = 0, base1 = 0;          // line 1 extent and baseline
    let band0 = 0;                             // top of the low wind band (line 2 top)
    let letters: Letter[] = [];
    let palette: string[] = [];
    let bg = '#12100E';
    const far: Grain[] = [], near: Grain[] = [], hop: Grain[] = [], shed: Grain[] = [];
    let shedNext = 0;
    let raf = 0, visible = true, alive = true, last = 0, ready = false;
    const T0 = performance.now() / 1000;

    const css = (name: string, fb: string) => getComputedStyle(h).getPropertyValue(name).trim() || fb;
    const mk = (): Grain => ({ x: 0, y: 0, vx: 0, vy: 0, s: 1, a: 1, c: 0, age: 0, life: 1, on: false });

    const spawnBand = (g: Grain, isFar: boolean, anywhere = false) => {
      g.on = true;
      g.x = anywhere ? rand(-20, W) : rand(-60, -4);
      g.y = rand(band0 + (isFar ? 0 : (H - band0) * 0.15), H - 4);
      g.vx = isFar ? rand(70, 140) : rand(170, 300);
      g.vy = rand(-6, 10);
      g.s = isFar ? unit * rand(0.45, 0.8) : unit * rand(0.8, 1.35);
      g.a = isFar ? rand(0.18, 0.38) : rand(0.45, 0.85);
      g.c = Math.floor(Math.random() * 5); g.age = rand(0, 10);
    };
    const ripple = (x: number, t: number) =>   // dune surface height above line 1's baseline (px)
      unit * (1.6 + 1.1 * Math.sin(x * 0.045 - t * 0.35) + 0.6 * Math.sin(x * 0.11 + t * 0.6) + 0.35 * Math.sin(x * 0.27 - t * 0.9));
    const spawnHop = (g: Grain, anywhere = false) => {
      g.on = true;
      g.x = anywhere ? rand(x1l - 40, x1r) : x1l - rand(10, 60);
      g.vx = rand(28, 70); g.vy = rand(2.2, 4.2);       // vy reused as hop frequency
      g.s = unit * rand(0.55, 0.95); g.a = rand(0.5, 0.9); g.c = Math.floor(Math.random() * 5); g.age = rand(0, 6);
    };
    const emitShed = (x: number, y: number) => {
      const g = shed[shedNext]; shedNext = (shedNext + 1) % shed.length;
      g.on = true; g.x = x; g.y = y; g.vx = rand(60, 170); g.vy = rand(10, 60);
      g.s = unit * rand(0.55, 1.1); g.a = rand(0.55, 0.95); g.c = Math.floor(Math.random() * 5); g.age = 0; g.life = rand(1.4, 2.6);
    };

    // ---- one layout pass (start + resize)
    const measure = () => {
      const hr = h.getBoundingClientRect();
      W = Math.round(hr.width); H = Math.round(hr.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [cv, fv]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = `${W}px`; c.style.height = `${H}px`; }
      palette = ['--sand-1', '--sand-2', '--sand-3', '--sand-4', '--sand-5'].map((n, i) => css(n, ['#E0582A', '#C2401A', '#D98A3D', '#B5652B', '#E9A25C'][i]));
      bg = css('--bg', bg);
      const r1 = e1.getBoundingClientRect();
      const fs1 = parseFloat(getComputedStyle(e1).fontSize) || 64;
      x1l = r1.left - hr.left; x1r = r1.right - hr.left;
      base1 = r1.bottom - hr.top - fs1 * 0.08;           // caps sit ~0.08em above the box bottom
      unit = Math.max(1.2, Math.min(2.6, fs1 / 45));
      const cs2 = getComputedStyle(e2);
      fs2 = parseFloat(cs2.fontSize) || 64;
      // line 2 glyphs: draw each letter centred in its box, then read the pixels once
      e2.style.transform = '';
      const spans = Array.from(e2.querySelectorAll<HTMLElement>('.wl'));
      const rects = spans.map((el) => el.getBoundingClientRect());
      band0 = Math.min(...rects.map((r) => r.top - hr.top));
      const off = document.createElement('canvas'); off.width = Math.max(1, W); off.height = Math.max(1, H);
      const o = off.getContext('2d', { willReadFrequently: true })!;
      o.font = `${cs2.fontWeight} ${cs2.fontSize} ${cs2.fontFamily}`;
      o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
      rects.forEach((r, i) => { const ch = spans[i].textContent ?? ''; if (ch.trim()) o.fillText(ch, r.left - hr.left + r.width / 2, r.top - hr.top + r.height / 2 + fs2 * 0.04); });
      const img = o.getImageData(0, 0, off.width, off.height).data;
      const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && img[(y * W + x) * 4 + 3] > 140;
      const step = Math.max(1, Math.round(fs2 / 40));
      letters = [];
      spans.forEach((el, i) => {
        const r = rects[i]; if (!(el.textContent ?? '').trim()) return;
        const x0 = Math.floor(r.left - hr.left), x1 = Math.ceil(r.right - hr.left), y0 = Math.floor(r.top - hr.top), y1 = Math.ceil(r.bottom - hr.top);
        let lead = x1, top = y1, bot = y0, area = 0; const trail: [number, number][] = [];
        for (let y = y0; y <= y1; y += step) {
          let right = -1;
          for (let x = x0; x <= x1; x += step) {
            if (!on(x, y)) continue;
            area += step * step; lead = Math.min(lead, x); top = Math.min(top, y); bot = Math.max(bot, y);
            right = x;
          }
          // trailing edge = the letter's outer right silhouette only (never counters inside O, R…)
          if (right >= 0) trail.push([right, y]);
        }
        if (!trail.length) return;
        const holeR = unit * 1.1;
        const nHoles = Math.max(4, Math.min(16, Math.round((area * 0.1) / (Math.PI * holeR * holeR) / 2)));
        letters.push({ el, lead, top, bot, trail, holes: Array.from({ length: nHoles }, mk) });
      });
      // pools sized for the screen
      const small = W < 700;
      const fill = (pool: Grain[], n: number) => { pool.length = 0; for (let k = 0; k < n; k++) pool.push(mk()); };
      fill(far, small ? 70 : 140); fill(near, small ? 40 : 80); fill(hop, small ? 24 : 46); fill(shed, small ? 220 : 380);
      shedNext = 0;
      far.forEach((g) => spawnBand(g, true, true)); near.forEach((g) => spawnBand(g, false, true)); hop.forEach((g) => spawnHop(g, true));
      ready = true;
    };

    const tick = (ms: number) => {
      if (!alive) return;
      raf = visible ? requestAnimationFrame(tick) : 0;
      if (!ready) return;
      const now = ms / 1000, t = now - T0;
      const dt = last ? Math.min(0.05, now - last) : 0;
      last = now;
      // line 2 drifts like a dune (the same offset is applied to everything drawn on its letters)
      const sway = Math.sin(t * 0.55) * unit * 1.8;
      e2.style.transform = `translateX(${sway.toFixed(2)}px)`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      fx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fx.clearRect(0, 0, W, H);

      // far layer
      for (const g of far) {
        g.x += g.vx * dt; g.y += (g.vy + Math.sin(g.age * 1.3 + g.x * 0.01) * 6) * dt; g.age += dt;
        if (g.x > W + 10 || g.y > H) spawnBand(g, true);
        ctx.globalAlpha = g.a; ctx.fillStyle = palette[g.c];
        ctx.fillRect(g.x - g.vx * 0.008, g.y, g.vx * 0.008 + g.s, g.s);
      }

      // dune ripples on line 1's baseline (from just before to just after line 1)
      const rx0 = Math.max(0, x1l - 30), rx1 = Math.min(W, x1r + 30);
      ctx.globalAlpha = 0.85; ctx.fillStyle = palette[3];
      ctx.beginPath(); ctx.moveTo(rx0, base1);
      for (let x = rx0; x <= rx1; x += 4) {
        const fade = Math.max(0, Math.min(1, (x - rx0) / 40, (rx1 - x) / 40));
        ctx.lineTo(x, base1 - ripple(x, t) * fade);
      }
      ctx.lineTo(rx1, base1); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.fillStyle = palette[4];   // lit crests
      for (let x = rx0; x <= rx1; x += 3) {
        const fade = Math.max(0, Math.min(1, (x - rx0) / 40, (rx1 - x) / 40));
        if (Math.sin(x * 0.045 - t * 0.35) > 0.35) ctx.fillRect(x, base1 - ripple(x, t) * fade - unit * 0.5, 3, unit * 0.6);
      }
      // grains hopping along the ripples, flowing past line 1
      for (const g of hop) {
        g.x += g.vx * dt; g.age += dt;
        if (g.x > x1r + 30) spawnHop(g);
        const lift = Math.abs(Math.sin(g.age * g.vy)) * unit * 1.2;   // short hops: grains stay on the dune surface
        ctx.globalAlpha = g.a; ctx.fillStyle = palette[g.c];
        ctx.fillRect(g.x, base1 - ripple(g.x, t) - lift - g.s, g.s, g.s);
      }

      // line 2: erosion nibbles on each letter's trailing edge (front canvas), each one shedding sand (back)
      fx.fillStyle = bg;
      for (const L of letters) {
        for (const hole of L.holes) {
          if (!hole.on || hole.age >= hole.life) {
            const [px, py] = pick(L.trail);
            hole.on = true; hole.x = px; hole.y = py; hole.age = 0; hole.life = rand(0.5, 1.1); hole.s = unit * rand(1.4, 2.6);
            emitShed(px + sway, py); if (Math.random() < 0.6) emitShed(px + sway + 1, py + 1);
          }
          hole.age += dt;
          const k = Math.min(1, hole.age / hole.life);               // opens, then refills
          fx.globalAlpha = Math.sin(Math.PI * k) * 0.95;
          const r = hole.s * (0.5 + 0.5 * Math.sin(Math.PI * k));
          fx.fillRect(hole.x + sway - r * 0.35, hole.y - r / 2, r, r);
        }
      }
      // grains streaming off line 2, right and down towards the collection
      for (const g of shed) {
        if (!g.on) continue;
        g.age += dt;
        if (g.age > g.life || g.y > H + 4 || g.x > W + 4) { g.on = false; continue; }
        g.vx += 40 * dt; g.vy += 70 * dt;
        g.x += g.vx * dt; g.y += g.vy * dt;
        ctx.globalAlpha = g.a * Math.min(1, (g.life - g.age) / (g.life * 0.5)); ctx.fillStyle = palette[g.c];
        ctx.fillRect(g.x - g.vx * 0.01, g.y, g.vx * 0.01 + g.s, g.s);
      }
      // near layer: grains reaching a letter's leading edge are absorbed (the dune rebuilds from the front)
      for (const g of near) {
        const px = g.x;
        g.x += g.vx * dt; g.y += (g.vy + Math.sin(g.age * 1.7 + g.x * 0.013) * 10) * dt; g.age += dt;
        if (g.x > W + 10 || g.y > H) { spawnBand(g, false); continue; }
        let absorbed = false;
        for (const L of letters) {
          const lx = L.lead + sway;
          if (px < lx && g.x >= lx && g.y >= L.top && g.y <= L.bot) { absorbed = true; break; }
        }
        if (absorbed) { spawnBand(g, false); continue; }
        ctx.globalAlpha = g.a; ctx.fillStyle = palette[g.c];
        ctx.fillRect(g.x - g.vx * 0.014, g.y, g.vx * 0.014 + g.s, g.s);
      }
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf && alive) { last = 0; raf = requestAnimationFrame(tick); }
    });
    io.observe(h);
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = window.setTimeout(measure, 150); };
    window.addEventListener('resize', onResize);
    (document.fonts?.ready ?? Promise.resolve()).then(() => { if (!alive) return; measure(); if (!raf) raf = requestAnimationFrame(tick); });

    return () => {
      alive = false; cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', onResize); clearTimeout(rt);
      e2.style.transform = '';
    };
  }, [reduced, line1, line2]);

  return (
    <section className="hero" ref={hero}>
      <h1 className="headline h-xl wind-title" aria-label={label}>
        <span ref={l1} className="w1" aria-hidden>{line1}</span><br />
        <span ref={l2} className="accent w2" aria-hidden>
          {[...line2].map((ch, i) => <span key={i} className="wl">{ch}</span>)}
        </span>
      </h1>
      {children}
      {!reduced && <canvas ref={canvas} className="wind-canvas wind-back" aria-hidden />}
      {!reduced && <canvas ref={front} className="wind-canvas wind-front" aria-hidden />}
    </section>
  );
}
