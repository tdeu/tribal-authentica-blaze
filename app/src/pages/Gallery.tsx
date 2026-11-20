import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { encodeCashAddress } from '@bitauth/libauth';
import { CONTRACT, MINTED, MINTED_TOTAL, verifyHref, type Lang, type MaskView } from '../content/mask';
import { DemoTag } from '../components/DemoTag';
import type { Strings } from '../content/i18n';
import type { Copy } from '../content/copy';
import { useWallet } from '../wallet/useWallet';
import { wallet, RECEIVE } from '../wallet/wizard';
import { provider } from '../wallet/chain';
import { useMaskLive, type Live } from '../chain/live';
import { readHistory, vaultOf } from '../chain/vault';
import { verifyOnce } from '../chain/verify';
import { ADDRESS_PREFIX } from '../config';
import { fmtUsd } from '../price';
import { useUsdOf } from '../components/Price';
import { Hero } from '../components/Hero';
import { BuySheet } from '../components/BuySheet';
import { ActivityFeed } from '../components/ActivityFeed';

const fmtNum = (n: bigint | number) => Number(n).toLocaleString('en-US');
const shortAddr = (pkh: Uint8Array) => {
  const a = encodeCashAddress({ prefix: ADDRESS_PREFIX, type: 'p2pkhWithTokens', payload: pkh }).address.split(':')[1];
  return `${a.slice(0, 1)}…${a.slice(-4)}`;
};
const shortHash = (h: string | null) => (h ? `${h.slice(0, 4)}…${h.slice(-4)}` : '—');

const isBuyable = (l: Live) => l.status === 'not-sold' || l.status === 'resale';

// Owners = completed sales in the vault history (re-read when the vault moves)
function useOwners(mask: MaskView, key: string | undefined) {
  const [n, setN] = useState<number>();
  useEffect(() => {
    if (!mask.mint || !key) return;
    let live = true;
    readHistory(provider, vaultOf(mask.mint, CONTRACT, provider), mask.mint, CONTRACT)
      .then((ev) => live && setN(ev.filter((e) => e.kind === 'sold').length))
      .catch(() => live && setN(undefined));
    return () => { live = false; };
  }, [mask, key]);
  return n;
}

function useMatch(mask: MaskView) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    if (mask.mint) verifyOnce(mask).then((v) => live && setOk(!('error' in v) && v.ok));
    return () => { live = false; };
  }, [mask]);
  return ok;
}

// The right half of the collection viewer: the custody record. Keyed by mask so its live state never shows the previous mask.
function CustodyRecord({ mask, lang, t, c, myPkh, onConnect, controls }: {
  mask: MaskView; lang: Lang; t: Strings; c: Copy; myPkh?: Uint8Array; onConnect: () => void; controls: ReactNode;
}) {
  const live = useMaskLive(mask, myPkh);
  const { usdOf } = useUsdOf();
  const [buying, setBuying] = useState(false);
  const st = live.state;
  const owners = useOwners(mask, st?.utxo.txid);
  const match = useMatch(mask);
  const sats = st ? (st.price > 0n ? st.price : st.lastSalePrice || BigInt(mask.priceSats)) : BigInt(mask.priceSats);
  const usd = usdOf(sats);
  const v = c.collection;
  const buyable = isBuyable(live);
  const buyLabel = buyable ? c.mask.buy : t.status[live.status];
  const certHref = `#/mask/${mask.catalogueId}/certificate`;
  const ownerText = !st ? '…'
    : live.status === 'yours' ? v.yours
    : st.ownerIsCustodian ? v.notSold
    : st.price > 0n ? v.forResale
    : v.ownedBy(shortAddr(st.ownerPkh));
  return (
    <div className="viewer-info" id="viewer-panel" role="tabpanel" aria-label={mask.names[lang]}>
      <p className="label">{mask.ref} · {v.record}</p>
      <h3 className="headline h-s">{mask.names[lang]}</h3>
      <dl className="record">
        {mask.source && <div><dt>{v.fSource}</dt><dd>{mask.source}</dd></div>}
        {mask.styleOrigin && <div><dt>{v.fStyle}</dt><dd>{mask.styleOrigin}</dd></div>}
        <div>
          <dt>{v.fFingerprint}</dt>
          <dd>{shortHash(mask.fingerprint)}{' '}
            {match ? <span className="ok">{v.fpMatch} ✓</span> : <a href={certHref}>{v.fpVerify}</a>}
          </dd>
        </div>
        <div><dt>{v.fOwners}</dt><dd>{owners ?? (st?.ownerIsCustodian ? 0 : '…')} · {ownerText}</dd></div>
      </dl>
      {mask.style && (
        <details className="style-card" lang={lang}>
          <summary>{c.mask.about}</summary>
          <p className="fine">{c.mask.styleLabel}</p>
          {mask.style[lang].split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p, i) => <p key={i} className="about-body">{p}</p>)}
        </details>
      )}
      <div className="price-row"><div><span className="price-big">{fmtNum(sats)}</span><span className="price-sub"> sats{usd !== null ? ` ≈ ${fmtUsd(usd)}` : ''}</span></div><DemoTag lang={lang} /></div>
      <div className="viewer-actions">
        <div className="viewer-buy">
          <button type="button" className="btn btn-primary" disabled={!buyable} onClick={() => buyable && setBuying(true)}>{buyLabel}</button>
          <a className="whatif-link" href="#/what-if">{c.whatIfLink}</a>
        </div>
        <a className="link" href={`#/mask/${mask.catalogueId}`}>{v.enter}</a>
        <a className="link" href={certHref}>{v.verify}</a>
        {controls}
      </div>
      {live.status === 'error' && <p className="fine">{live.error}</p>}
      {buying && live.state && live.vault && (
        <BuySheet mask={mask} lang={lang} live={live} t={t} c={c} refLabel={`[ ${mask.ref} / ${MINTED_TOTAL} ]`} onClose={() => setBuying(false)} onConnect={onConnect} />
      )}
    </div>
  );
}

// Reports whether each minted mask is for sale, so the hero's Buy goes to the first one that is.
function SaleProbe({ mask, onStatus }: { mask: MaskView; onStatus: (id: number, buyable: boolean) => void }) {
  const live = useMaskLive(mask);
  const b = isBuyable(live);
  useEffect(() => { onStatus(mask.catalogueId, b); }, [mask, b, onStatus]);
  return null;
}

export function Gallery({ lang, t, c, onConnect }: { lang: Lang; t: Strings; c: Copy; onConnect: () => void }) {
  const s = useWallet();
  const myPkh = s.approved ? wallet.addressAt(RECEIVE, 0)?.pkh : undefined;
  const [idx, setIdx] = useState(0);
  const forSale = useRef(new Map<number, boolean>());
  const onStatus = useRef((id: number, b: boolean) => { forSale.current.set(id, b); }).current;
  const n = MINTED.length;
  const mask = MINTED[idx];
  const go = (i: number) => setIdx((i + n) % n);
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('.sheet')) return; // typing in the buy sheet
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
  };
  const buyFirst = () => {
    const i = MINTED.findIndex((m) => forSale.current.get(m.catalogueId));
    if (i >= 0) setIdx(i);
    document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
  };
  const v = c.collection;

  return (
    <>
      {MINTED.map((m) => <SaleProbe key={m.catalogueId} mask={m} onStatus={onStatus} />)}
      <Hero c={c} onBuy={buyFirst} verifyHref={verifyHref()} />

      <section className="problem" aria-label={c.problem[0][0]}>
        {c.problem.map(([label, text]) => (
          <div key={label}><p className="label">{label}</p><p>{text}</p></div>
        ))}
      </section>

      <section className="how-block" id="how" aria-labelledby="how-label">
        <p className="label" id="how-label">{c.how.label}</p>
        <ol className="how-cards">
          {c.how.cards.map(([title, text]) => <li key={title}><h3>{title}</h3><p>{text}</p></li>)}
        </ol>
        <ActivityFeed c={c} lang={lang} />
      </section>

      {mask && (
        <section className="collection" id="collection" onKeyDown={onKey}>
          <div className="collection-head">
            <div>
              <p className="label">{v.label}</p>
              <h2 className="headline h-m" style={{ marginTop: 12 }}>{v.title[0]}<br /><span className="accent">{v.title[1]}</span></h2>
            </div>
            <p className="lead">{v.lead}</p>
          </div>
          <div className="viewer">
            <div className="viewer-photo vignette">
              {mask.photo
                ? <img src={mask.photo} alt={mask.names[lang]} />
                : <div className="photo-ph" role="img" aria-label={v.photoSoon} />}
            </div>
            <CustodyRecord key={mask.catalogueId} mask={mask} lang={lang} t={t} c={c} myPkh={myPkh} onConnect={onConnect} controls={n > 1 && (
              <div className="arrows">
                <button type="button" className="icon-btn" aria-label={v.prev} onClick={() => go(idx - 1)}>←</button>
                <button type="button" className="icon-btn" aria-label={v.next} onClick={() => go(idx + 1)}>→</button>
              </div>
            )} />
          </div>
          {n > 1 && (
            <div className="viewer-tabs" role="tablist" aria-label={v.tabs} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {MINTED.map((m, i) => (
                <button key={m.catalogueId} type="button" role="tab" aria-selected={i === idx} aria-controls="viewer-panel"
                  tabIndex={i === idx ? 0 : -1} onClick={() => go(i)}>[ {m.ref} ]</button>
              ))}
            </div>
          )}
        </section>
      )}

      <p className="vision"><span className="accent">{c.vision[0]}</span>{c.vision[1]}</p>
    </>
  );
}
