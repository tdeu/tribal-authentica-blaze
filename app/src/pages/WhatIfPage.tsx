import type { Lang } from '../content/mask';
import { WHAT_IF } from '../content/whatif';

// #/what-if — the 7 cases, each with its proof (moved off the landing page; README keeps its own copy).
export function WhatIfPage({ lang }: { lang: Lang }) {
  const w = WHAT_IF[lang];
  return (
    <section className="whatif" id="what-if-something-goes-wrong" aria-labelledby="whatif-title">
      <p className="label">{w.label}</p>
      <h1 className="headline h-m" id="whatif-title" style={{ marginTop: 12 }}>{w.title[0]}<br /><span className="accent">{w.title[1]}</span></h1>
      <ol className="whatif-list">
        {w.items.map((it, i) => (
          <li key={i}>
            <span className="whatif-n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h2>{it.q}</h2>
              <p>{it.a}</p>
              <p className="whatif-proof">
                <span>{w.proof}:</span>{' '}
                {it.proofs.map((p, j) => (
                  <span key={p.href + j}>{j > 0 && ' · '}<a href={p.href} target="_blank" rel="noreferrer">{p.label} ↗</a></span>
                ))}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
