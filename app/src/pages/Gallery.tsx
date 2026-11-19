import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { CONTRACT, DEMO_NOTICE, MASKS, type Lang, type MaskView } from '../content/mask';
import type { Strings } from '../content/i18n';
import type { Copy } from '../content/copy';
import { useWallet } from '../wallet/useWallet';
import { wallet, RECEIVE } from '../wallet/wizard';
import { useMaskLive } from '../chain/live';
import { fmtUsd } from '../price';
import { useUsdOf } from '../components/Price';
import { PixelDigits, Ticker } from '../components/art';
import { SandstormPanel } from '../components/Sandstorm';
import { WHAT_IF } from '../content/whatif';

const TOTAL = String(MASKS.length).padStart(3, '0');
const fmtNum = (n: bigint | number) => Number(n).toLocaleString('en-US');

// Shares from the contract parameters (90 / 10 first sale, 10 % royalty on resale)
const PLATFORM_PCT = CONTRACT.platformBps / 100;
const KEEPER_FIRST_PCT = 100 - PLATFORM_PCT;
const ROYALTY_PCT = CONTRACT.royaltyBps / 100;
const SHARES = [KEEPER_FIRST_PCT, PLATFORM_PCT, ROYALTY_PCT, 100 - ROYALTY_PCT];

// The right half of the collection viewer. Keyed by mask so its live state never shows the previous mask.
function ViewerInfo({ mask, t, c, myPkh, controls }: { mask: MaskView; t: Strings; c: Copy; myPkh?: Uint8Array; controls: ReactNode }) {
  const live = useMaskLive(mask, myPkh);
  const { usdOf } = useUsdOf();
  const st = live.state;
  const sats = st ? (st.price > 0n ? st.price : st.lastSalePrice || BigInt(mask.priceSats)) : BigInt(mask.priceSats);
  const usd = usdOf(sats);
  const v = c.collection;
  return (
    <div className="viewer-info" id="viewer-panel" role="tabpanel" aria-label={mask.name}>
      <p className="label label-muted">[ {mask.ref} / {v.region} ]</p>
      <h3 className="headline h-s">{mask.name}</h3>
      <p className="ink-2" style={{ margin: 0 }}>{v.facts}</p>
      <div className="viewer-tags">
        <span className="tag">{t.status[live.status].toUpperCase()}</span>
        <span className="tag">{v.token}</span>
        <span className="tag">{v.keeper(mask.country)}</span>
      </div>
      <div><span className="price-big">{fmtNum(sats)}</span><span className="price-sub"> sats{usd !== null ? ` ≈ ${fmtUsd(usd)}` : ''}</span></div>
      <div className="viewer-actions">
        <a className="btn btn-primary" href={`#/mask/${mask.catalogueId}`}>{v.enter}</a>
        {mask.mint && <a className="link" href={`#/mask/${mask.catalogueId}/certificate`}>{v.verify}</a>}
        {controls}
      </div>
    </div>
  );
}

export function Gallery({ lang, t, c }: { lang: Lang; t: Strings; c: Copy }) {
  const s = useWallet();
  const myPkh = s.approved ? wallet.addressAt(RECEIVE, 0)?.pkh : undefined;
  const [idx, setIdx] = useState(0);
  const n = MASKS.length;
  const mask = MASKS[idx];
  const go = (i: number) => setIdx((i + n) % n);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
  };
  const v = c.collection;

  return (
    <>
      <section className="hero">
        <h1 className="headline h-xl">{c.hero.line1}<br /><span className="accent">{c.hero.line2}</span></h1>
        <p className="lead hero-lead">{c.hero.lead[0]}<b>{c.hero.lead[1]}</b>{c.hero.lead[2]}</p>
        <SandstormPanel label={c.hero.maskLabel} caption={c.hero.caption} replay={c.hero.replay} replayLabel={c.hero.replayLabel}
          bar={<><span>{c.hero.panel}</span><span>[ {mask.ref} / {TOTAL} ]</span></>} />
        <p className="demo-notice" role="note" lang={lang}>{DEMO_NOTICE[lang]}</p>
      </section>

      <section className="cta-row">
        <div className="tag-line">{c.cta.a}<br /><b>{c.cta.b}</b></div>
        <button type="button" className="link explore" onClick={() => document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })}>{c.cta.explore}</button>
        <a className="btn btn-primary" style={{ padding: '18px 26px' }} href={`#/mask/${MASKS[0].catalogueId}`}>{c.cta.enter}</a>
      </section>
      <Ticker items={c.ticker} />

      <section className="how-block">
        <div>
          <p className="label">{c.how.label}</p>
          <h2 className="headline h-m">{c.how.title.map((l, i) => <span key={i}>{l}<br /></span>)}</h2>
          <p>{c.how.body}</p>
        </div>
        <div>
          <p className="label">{c.how.digitsCap}</p>
          <PixelDigits value={`${KEEPER_FIRST_PCT}%`} label={c.how.digitsLabel(KEEPER_FIRST_PCT)} />
          <div className="payout" role="table">
            <div className="head" role="row">{c.how.cols.map((h) => <span key={h} role="columnheader">{h}</span>)}</div>
            {c.how.rows.map(([ev, to, strong], i) => (
              <div key={i} role="row" className={strong ? 'strong' : undefined}>
                <span role="cell">{ev}</span><span role="cell">{to}</span><span role="cell">{SHARES[i]}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="whatif" id="what-if-something-goes-wrong" aria-labelledby="whatif-title">
        <p className="label">{WHAT_IF[lang].label}</p>
        <h2 className="headline h-m" id="whatif-title" style={{ marginTop: 12 }}>{WHAT_IF[lang].title[0]}<br /><span className="accent">{WHAT_IF[lang].title[1]}</span></h2>
        <ol className="whatif-list">
          {WHAT_IF[lang].items.map((it, i) => (
            <li key={i}>
              <span className="whatif-n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{it.q}</h3>
                <p>{it.a}</p>
                <p className="whatif-proof">
                  <span>{WHAT_IF[lang].proof}:</span>{' '}
                  {it.proofs.map((p, j) => (
                    <span key={p.href + j}>{j > 0 && ' · '}<a href={p.href} target="_blank" rel="noreferrer">{p.label} ↗</a></span>
                  ))}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="collection" id="collection" onKeyDown={onKey}>
        <div className="collection-head">
          <div>
            <p className="label">{v.label}</p>
            <h2 className="headline h-m" style={{ marginTop: 12 }}>{v.title[0]}<br /><span className="accent">{v.title[1]}</span></h2>
          </div>
          <p className="lead">{v.lead[0]}<br />{v.lead[1]}</p>
        </div>
        <div className="viewer">
          <div className="viewer-photo vignette">
            {mask.photo
              ? <img src={mask.photo} alt={mask.name} />
              : <div className="photo-ph" role="img" aria-label={v.photo(mask.ref)}>{v.photo(mask.ref)}<br />{v.photoHint}</div>}
          </div>
          <ViewerInfo key={mask.catalogueId} mask={mask} t={t} c={c} myPkh={myPkh} controls={
            <div className="arrows">
              <button type="button" className="icon-btn" aria-label={v.prev} onClick={() => go(idx - 1)}>←</button>
              <button type="button" className="icon-btn" aria-label={v.next} onClick={() => go(idx + 1)}>→</button>
            </div>
          } />
        </div>
        <div className="viewer-tabs" role="tablist" aria-label={v.tabs}>
          {MASKS.map((m, i) => (
            <button key={m.catalogueId} type="button" role="tab" aria-selected={i === idx} aria-controls="viewer-panel"
              tabIndex={i === idx ? 0 : -1} onClick={() => go(i)}>[ {m.ref} ]</button>
          ))}
        </div>
      </section>
    </>
  );
}
