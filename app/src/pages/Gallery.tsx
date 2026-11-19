import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { CONTRACT, MASKS, type Lang, type MaskView } from '../content/mask';
import { DemoNotice } from '../components/DemoNotice';
import type { Strings } from '../content/i18n';
import type { Copy } from '../content/copy';
import { useWallet } from '../wallet/useWallet';
import { wallet, RECEIVE } from '../wallet/wizard';
import { useMaskLive } from '../chain/live';
import { fmtUsd } from '../price';
import { useUsdOf } from '../components/Price';
import { WindHero } from '../components/WindHero';
import { BuySheet } from '../components/BuySheet';

const TOTAL = String(MASKS.length).padStart(3, '0');
const fmtNum = (n: bigint | number) => Number(n).toLocaleString('en-US');

// Shares from the contract parameters (90 / 10 first sale, 10 % royalty on resale)
const PLATFORM_PCT = CONTRACT.platformBps / 100;
const KEEPER_FIRST_PCT = 100 - PLATFORM_PCT;
const ROYALTY_PCT = CONTRACT.royaltyBps / 100;
const SHARES = [KEEPER_FIRST_PCT, PLATFORM_PCT, ROYALTY_PCT, 100 - ROYALTY_PCT];

// The right half of the collection viewer. Keyed by mask so its live state never shows the previous mask.
function ViewerInfo({ mask, lang, t, c, myPkh, onConnect, controls }: {
  mask: MaskView; lang: Lang; t: Strings; c: Copy; myPkh?: Uint8Array; onConnect: () => void; controls: ReactNode;
}) {
  const live = useMaskLive(mask, myPkh);
  const { usdOf } = useUsdOf();
  const [buying, setBuying] = useState(false);
  const st = live.state;
  const sats = st ? (st.price > 0n ? st.price : st.lastSalePrice || BigInt(mask.priceSats)) : BigInt(mask.priceSats);
  const usd = usdOf(sats);
  const v = c.collection;
  const buyable = live.status === 'not-sold' || live.status === 'resale';
  const buyLabel = !mask.mint ? t.comingSoon : buyable ? c.mask.buy : t.status[live.status];
  return (
    <div className="viewer-info" id="viewer-panel" role="tabpanel" aria-label={mask.names[lang]}>
      <p className="label label-muted">[ {mask.ref}{mask.region ? ` / ${mask.region}` : ''} ]</p>
      <h3 className="headline h-s">{mask.names[lang]}</h3>
      {mask.details && <p className="ink-2" style={{ margin: 0 }}>{mask.details[lang]}</p>}
      <div className="viewer-tags">
        <span className="tag">{t.status[live.status].toUpperCase()}</span>
        <span className="tag">{v.token}</span>
        {mask.country && <span className="tag">{v.origin(mask.country)}</span>}
      </div>
      <div><span className="price-big">{fmtNum(sats)}</span><span className="price-sub"> sats{usd !== null ? ` ≈ ${fmtUsd(usd)}` : ''}</span></div>
      <div className="viewer-actions">
        <div className="viewer-buy">
          <button type="button" className="btn btn-primary" disabled={!buyable} onClick={() => buyable && setBuying(true)}>{buyLabel}</button>
          <a className="whatif-link" href="#/what-if">{c.whatIfLink}</a>
        </div>
        <a className="link" href={`#/mask/${mask.catalogueId}`}>{v.enter}</a>
        {mask.mint && <a className="link" href={`#/mask/${mask.catalogueId}/certificate`}>{v.verify}</a>}
        {controls}
      </div>
      {live.status === 'error' && <p className="fine">{live.error}</p>}
      {buying && live.state && live.vault && (
        <BuySheet mask={mask} lang={lang} live={live} t={t} c={c} refLabel={`[ ${mask.ref} / ${TOTAL} ]`} onClose={() => setBuying(false)} onConnect={onConnect} />
      )}
    </div>
  );
}

export function Gallery({ lang, t, c, onConnect }: { lang: Lang; t: Strings; c: Copy; onConnect: () => void }) {
  const s = useWallet();
  const myPkh = s.approved ? wallet.addressAt(RECEIVE, 0)?.pkh : undefined;
  const [idx, setIdx] = useState(0);
  const n = MASKS.length;
  const mask = MASKS[idx];
  const go = (i: number) => setIdx((i + n) % n);
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('.sheet')) return; // typing in the buy sheet
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
  };
  const v = c.collection;

  return (
    <>
      <WindHero line1={c.hero.line1} line2={c.hero.line2} label={`${c.hero.line1} ${c.hero.line2}`}>
        <p className="lead hero-lead">{c.hero.lead[0]}<b>{c.hero.lead[1]}</b>{c.hero.lead[2]}</p>
        <DemoNotice lang={lang} className="hero-notice" />
      </WindHero>

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
              ? <img src={mask.photo} alt={mask.names[lang]} />
              : <div className="photo-ph" role="img" aria-label={v.photoSoon} />}
          </div>
          <ViewerInfo key={mask.catalogueId} mask={mask} lang={lang} t={t} c={c} myPkh={myPkh} onConnect={onConnect} controls={
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

      <section className="how-block" id="how">
        <div>
          <p className="label">{c.how.label}</p>
          <h2 className="headline h-m">{c.how.title.map((l, i) => <span key={i}>{l}<br /></span>)}</h2>
          <ol className="how-steps">{c.how.steps.map((st, i) => <li key={i}><span aria-hidden>{String(i + 1).padStart(2, '0')}</span>{st}</li>)}</ol>
        </div>
        <div>
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
    </>
  );
}
