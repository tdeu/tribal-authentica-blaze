// Hero panel with the dot-matrix mask that assembles from a laterite sandstorm.
// Shape: mask 001, sampled from its photo to the 24×34 grid. The mask itself is DOM: every dot absolutely
// positioned in a fixed-size box (final state, reduced motion, no layout shift). The storm is painted
// on one canvas overlay pinned over the panel: one requestAnimationFrame loop drawing each dot with
// translate + rotate + alpha. Layout is read once at the start, never per frame. On the last landing
// the DOM dots appear and the canvas is removed in the same frame (same colour, same opacity).
// Measured on a software renderer: canvas ~60 fps median vs ~9–30 fps for ~450 DOM-animated dots.
// Plays once per page load when the panel is 35 % visible; reduced motion shows the finished mask.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Corners } from './art';
import hero from '../data/hero-mask-001.json';

// The grid is mask 001 itself, sampled from its photo (see the _comment in the data file).
const W = hero.width;
type Dot = { x: number; y: number; a: number | null }; // a = final opacity, null = background dot
const DOTS: Dot[] = (hero.alpha as (number | null)[]).map((a, i) => ({ x: i % W, y: Math.floor(i / W), a }));


const rand = (a: number, b: number) => a + Math.random() * (b - a);

// One dot: from (sx, sy) to (fx, fy) in panel px, ease-out-cubic, a sideways sine wobble that dies out
// as it lands, 90° → 0°, opacity 0 → its final shade.
type Flight = { sx: number; sy: number; fx: number; fy: number; a: number; wob: number; turns: number; delay: number; dur: number };

let playedThisLoad = false;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SandstormPanel({ label, bar, caption, replay, replayLabel }: {
  label: string; bar: ReactNode; caption: string; replay: string; replayLabel: string;
}) {
  const reduced = reducedMotion();
  const [startPending] = useState(() => !(reduced || playedThisLoad)); // fixed for this mount
  const [done, setDone] = useState(!startPending);
  const panel = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const started = useRef(!startPending);

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    canvas.current?.remove();
    canvas.current = null;
  };

  const play = useCallback(() => {
    const p = panel.current, b = box.current;
    if (!p || !b) return;
    stop();
    started.current = true;
    // Reads: once, before any write
    const pr = p.getBoundingClientRect(), br = b.getBoundingClientRect();
    const ox = br.left - pr.left, oy = br.top - pr.top;
    const els = Array.from(b.querySelectorAll<HTMLSpanElement>('span.on'));
    const size = els[0]?.offsetWidth ?? 8;
    const color = getComputedStyle(b).getPropertyValue('--accent').trim() || 'currentColor';
    const flights: Flight[] = els.map((el) => {
      const col = Number(el.dataset.x);
      return {
        fx: ox + el.offsetLeft, fy: oy + el.offsetTop, a: Number(el.dataset.a),
        sx: rand(-340, -80), sy: rand(0, pr.height),                   // off-panel, left
        wob: rand(8, 22), turns: rand(2, 4),
        delay: (rand(0, 1.3) + 0.5 * (col / W)) * 1000,                 // storm sweeps left → right
        dur: rand(0.9, 1.4) * 1000,
      };
    });
    // Writes: the overlay canvas, then hide the DOM dots
    const cv = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(pr.width * dpr); cv.height = Math.round(pr.height * dpr);
    cv.className = 'storm-canvas';
    cv.setAttribute('aria-hidden', 'true');
    p.appendChild(cv);
    canvas.current = cv;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = color;
    b.classList.add('pending');
    setDone(false);
    const t0 = performance.now();
    const half = size / 2;
    const tick = (now: number) => {
      ctx.clearRect(0, 0, pr.width, pr.height);
      let flying = 0;
      for (const f of flights) {
        let t = (now - t0 - f.delay) / f.dur;
        if (t <= 0) { flying++; continue; }
        if (t < 1) flying++; else t = 1;
        const p = 1 - (1 - t) ** 3;                                       // ease-out-cubic
        const x = f.sx + (f.fx - f.sx) * p;
        const y = f.sy + (f.fy - f.sy) * p + Math.sin(t * Math.PI * f.turns) * f.wob * (1 - p);
        const r = (Math.PI / 2) * (1 - p);
        ctx.globalAlpha = f.a * Math.min(1, t / 0.3);
        ctx.setTransform(dpr * Math.cos(r), dpr * Math.sin(r), -dpr * Math.sin(r), dpr * Math.cos(r), dpr * (x + half), dpr * (y + half));
        ctx.fillRect(-half, -half, size, size);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (flying > 0) { raf.current = requestAnimationFrame(tick); return; }
      // Hand over to the DOM dots in the same frame
      b.classList.remove('pending');
      stop();
      playedThisLoad = true;
      setDone(true);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  // Start when 35 % of the panel is visible, once per page load
  useEffect(() => {
    if (started.current || !panel.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); play(); }
    }, { threshold: 0.35 });
    io.observe(panel.current);
    return () => io.disconnect();
  }, [play]);

  useEffect(() => stop, []);

  // The 816 dots never re-render: starting, landing and the caption don't touch them
  const dots = useMemo(() => DOTS.map((d, i) => (
    <span key={i} aria-hidden className={d.a === null ? 'off' : 'on'} data-x={d.x} data-a={d.a ?? undefined}
      style={{ '--x': d.x, '--y': d.y, ...(d.a === null ? {} : { opacity: d.a }) } as CSSProperties} />
  )), []);

  return (
    <>
      <div className="hero-panel" ref={panel}>
        <div className="hero-panel-bar">{bar}</div>
        <div className="hero-panel-art">
          <Corners />
          <div className={`dotmask${startPending ? ' pending' : ''}`} ref={box} role="img" aria-label={label}>{dots}</div>
        </div>
        {!reduced && (
          <button type="button" className="replay" onClick={play} aria-label={replayLabel}>{replay} ↺</button>
        )}
      </div>
      <p className={`storm-caption${done ? ' shown' : ''}`} aria-hidden={!done}>{caption}</p>
    </>
  );
}
