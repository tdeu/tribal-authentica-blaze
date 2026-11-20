import { useEffect, useState } from 'react';
import type { Copy } from '../content/copy';

// Eyebrow, played once on load (~1.5 s): "PROVENANCE: UNKNOWN" → UNKNOWN is struck through →
// "SEALED ON BITCOIN CASH" types in. Reduced motion: the final state, static.
const STRIKE_AT = 450;   // ms
const TYPE_AT = 750;
const TYPE_MS = 750;     // whole phrase

const reduced = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

function Eyebrow({ parts }: { parts: readonly [string, string, string] }) {
  const [lead, unknown, sealed] = parts;
  const [still] = useState(reduced);
  const [struck, setStruck] = useState(still);
  const [k, setK] = useState(still ? 1 : 0); // typing progress, 0..1

  useEffect(() => {
    if (still) return;
    const ids: number[] = [window.setTimeout(() => setStruck(true), STRIKE_AT)];
    let raf = 0;
    ids.push(window.setTimeout(() => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / TYPE_MS);
        setK(p);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, TYPE_AT));
    return () => { ids.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [still]);

  const n = Math.round(k * sealed.length);
  const typing = n > 0 && n < sealed.length;
  return (
    <p className="label hero-eyebrow">
      <span className="sr-only">{lead}{sealed}</span>
      <span aria-hidden="true">
        <span className="muted">{lead}</span>
        <span className={`strike${struck ? ' on' : ''}`}>{unknown}</span>{' '}
        <span className="sealed">
          <span>{sealed.slice(0, n)}</span>
          {typing && <span className="caret" />}
          <span className="ghost">{sealed.slice(n)}</span>
        </span>
      </span>
    </p>
  );
}

export function Hero({ c, onBuy, verifyHref }: { c: Copy; onBuy: () => void; verifyHref: string }) {
  const h = c.hero;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <Eyebrow parts={h.eyebrow as unknown as [string, string, string]} />
      <h1 className="headline hero-h1" id="hero-title">{h.h1[0]}<br /><span className="accent">{h.h1[1]}</span></h1>
      <p className="lead hero-sub">{h.sub}</p>
      <div className="hero-ctas">
        <button type="button" className="btn btn-primary" onClick={onBuy}>{h.buy}</button>
        <a className="btn btn-ghost" href={verifyHref}>{h.verify}</a>
      </div>
    </section>
  );
}
