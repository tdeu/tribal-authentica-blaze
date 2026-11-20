import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type TouchEvent } from 'react';
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

const ADVANCE_MS = 4000;
const SWIPE_PX = 50;

const fmtNum = (n: bigint | number) => Number(n).toLocaleString('en-US');
const shortAddr = (pkh: Uint8Array) => {
  const a = encodeCashAddress({ prefix: ADDRESS_PREFIX, type: 'p2pkhWithTokens', payload: pkh }).address.split(':')[1];
  return `${a.slice(0, 1)}…${a.slice(-4)}`;
};
const shortHash = (h: string | null) => (h ? `${h.slice(0, 4)}…${h.slice(-4)}` : '—');
const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

const isBuyable = (l: Live) => l.status === 'not-sold' || l.status === 'resale';

function useReducedMotion() {
  const q = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return null; } };
  const [reduced, setReduced] = useState(() => !!q()?.matches);
  useEffect(() => {
    const m = q(); if (!m) return;
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

function usePageHidden() {
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return hidden;
}

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

// The right half of a card: the custody record. Keyed by mask so its live state never shows the previous mask.
function CustodyRecord({ mask, lang, t, c, myPkh, onConnect, open, onToggle, controls }: {
  mask: MaskView; lang: Lang; t: Strings; c: Copy; myPkh?: Uint8Array; onConnect: () => void;
  open: boolean; onToggle: () => void; controls: ReactNode;
}) {
  const live = useMaskLive(mask, myPkh);
  const { usdOf } = useUsdOf();
  const [buying, setBuying] = useState(false);
  const st = live.state;
  const owners = useOwners(mask, st?.utxo.txid);
  const sats = st ? (st.price > 0n ? st.price : st.lastSalePrice || BigInt(mask.priceSats)) : BigInt(mask.priceSats);
  const usd = usdOf(sats);
  const v = c.collection;
  const buyable = isBuyable(live);
  const buyLabel = buyable ? c.mask.buy : t.status[live.status];
  const ownerText = !st ? '…'
    : live.status === 'yours' ? v.yours
    : st.ownerIsCustodian ? v.notSold
    : st.price > 0n ? v.forResale
    : v.ownedBy(shortAddr(st.ownerPkh));
  return (
    <div className="viewer-info">
      <p className="label">{mask.ref} · {v.record}</p>
      <h3 className="headline h-s">{mask.names[lang]}</h3>
      <dl className="record">
        {mask.styleOrigin && <div><dt>{v.fStyle}</dt><dd>{mask.styleOrigin}</dd></div>}
        {mask.source && <div><dt>{v.fSource}</dt><dd>{mask.source}</dd></div>}
        <div><dt>{v.fOwners}</dt><dd>{owners ?? (st?.ownerIsCustodian ? 0 : '…')} · {ownerText}</dd></div>
      </dl>
      <button type="button" className="story-toggle" aria-expanded={open} aria-controls={`story-${mask.catalogueId}`} onClick={onToggle}>
        {open ? v.closeStory : v.readStory}
      </button>
      <div className="price-row"><div><span className="price-big">{fmtNum(sats)}</span><span className="price-sub"> sats{usd !== null ? ` ≈ ${fmtUsd(usd)}` : ''}</span></div><DemoTag lang={lang} /></div>
      <div className="viewer-actions">
        <button type="button" className="btn btn-primary" disabled={!buyable} onClick={() => buyable && setBuying(true)}>{buyLabel}</button>
        <a className="link" href={`#/mask/${mask.catalogueId}/certificate`}>{v.verify}</a>
        {controls}
      </div>
      {live.status === 'error' && <p className="fine">{live.error}</p>}
      {buying && live.state && live.vault && (
        <BuySheet mask={mask} lang={lang} live={live} t={t} c={c} refLabel={`[ ${mask.ref} / ${MINTED_TOTAL} ]`} onClose={() => setBuying(false)} onConnect={onConnect} />
      )}
    </div>
  );
}

// The card's inline story: sealed story + "About this style" + links. Always in the DOM so it can animate;
// inert (and hidden from assistive tech) while closed.
function StoryPanel({ mask, lang, c, open }: { mask: MaskView; lang: Lang; c: Copy; open: boolean }) {
  const match = useMatch(mask);
  const v = c.collection;
  return (
    <div className={`story-wrap${open ? ' open' : ''}`} id={`story-${mask.catalogueId}`} inert={!open} aria-hidden={!open}>
      <div className="story-inner">
        <div className="story-panel" lang={lang}>
          <div className="story-sealed">
            <p className="label">{v.sealedStory}</p>
            {paragraphs(mask.story[lang]).map((p, i) => <p key={i} className="story-body">{p}</p>)}
            <p className="fine sealed-note">{v.sealedOnChain(shortHash(mask.mint?.commitment.slice(4, 68) ?? mask.fingerprint))}{match && <span className="ok"> ✓</span>}</p>
          </div>
          {mask.style && (
            <div className="story-style">
              <p className="label">{c.mask.about}</p>
              <p className="fine">{v.editorial}</p>
              {paragraphs(mask.style[lang]).map((p, i) => <p key={i} className="about-body">{p}</p>)}
            </div>
          )}
          <p className="story-links">
            <a href={`#/mask/${mask.catalogueId}/certificate`}>{v.certLink}</a>
            <a href="#/what-if">{c.whatIfLink}</a>
          </p>
        </div>
      </div>
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
  const n = MINTED.length;
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);      // slide direction of the incoming card
  const [cycle, setCycle] = useState(0);          // bumped by any manual move: restarts the timer
  const [open, setOpen] = useState(false);        // story expanded
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);  // keyboard focus inside the carousel
  const reduced = useReducedMotion();
  const hidden = usePageHidden();
  const paused = reduced || hidden || hovered || focused || open || n < 2;

  const forSale = useRef(new Map<number, boolean>());
  const onStatus = useRef((id: number, b: boolean) => { forSale.current.set(id, b); }).current;
  const mask = MINTED[idx];

  // Manual move: any arrow, tab, swipe or key. Collapses the story and restarts the 4 s timer.
  const go = useCallback((i: number, d: 1 | -1) => {
    setDir(d); setIdx(((i % n) + n) % n); setOpen(false); setCycle((k) => k + 1);
  }, [n]);

  // Auto-advance right to left, 005 → 001 loops
  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(() => { setDir(1); setIdx((i) => (i + 1) % n); }, ADVANCE_MS);
    return () => clearTimeout(id);
  }, [paused, idx, cycle, n]);

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('.sheet')) return; // typing in the buy sheet
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1, 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1, -1); }
  };
  const onFocus = (e: FocusEvent) => {
    let kb = false;
    try { kb = (e.target as HTMLElement).matches(':focus-visible'); } catch { /* old browser */ }
    if (kb) setFocused(true);
  };
  const onBlur = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };
  const hover = (on: boolean) => (e: PointerEvent) => { if (e.pointerType === 'mouse') setHovered(on); };
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => { const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY }; };
  const onTouchEnd = (e: TouchEvent) => {
    const a = touch.current; touch.current = null;
    if (!a || n < 2) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - a.x, dy = p.clientY - a.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(idx + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  };

  const buyFirst = () => {
    const i = MINTED.findIndex((m) => forSale.current.get(m.catalogueId));
    if (i >= 0 && i !== idx) go(i, i > idx ? 1 : -1);
    document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
  };
  const v = c.collection;

  return (
    <>
      {MINTED.map((m) => <SaleProbe key={m.catalogueId} mask={m} onStatus={onStatus} />)}
      <Hero c={c} onBuy={buyFirst} verifyHref={verifyHref()} />

      {mask && (
        <section className="collection" id="collection" aria-labelledby="collection-label">
          <div className="collection-head">
            <p className="label" id="collection-label">{v.label}</p>
            <h2 className="collection-line">{v.line}</h2>
          </div>
          <div className="carousel" role="region" aria-roledescription="carousel" aria-label={v.label}
            onKeyDown={onKey} onFocus={onFocus} onBlur={onBlur} onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
            <div className="viewer" id="viewer-panel" role="tabpanel" aria-label={mask.names[lang]} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <div key={mask.catalogueId} className={`viewer-slide${reduced ? '' : dir === 1 ? ' from-right' : ' from-left'}`}>
                <div className="viewer-photo vignette">
                  {mask.photo
                    ? <img src={mask.photo} alt={mask.names[lang]} draggable={false} />
                    : <div className="photo-ph" role="img" aria-label={v.photoSoon} />}
                </div>
                <CustodyRecord mask={mask} lang={lang} t={t} c={c} myPkh={myPkh} onConnect={onConnect}
                  open={open} onToggle={() => setOpen((o) => !o)} controls={n > 1 && (
                    <div className="arrows">
                      <button type="button" className="icon-btn" aria-label={v.prev} onClick={() => go(idx - 1, -1)}>←</button>
                      <button type="button" className="icon-btn" aria-label={v.next} onClick={() => go(idx + 1, 1)}>→</button>
                    </div>
                  )} />
                <StoryPanel mask={mask} lang={lang} c={c} open={open} />
              </div>
            </div>
            {n > 1 && (
              <div className="viewer-tabs" role="tablist" aria-label={v.tabs} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                {MINTED.map((m, i) => (
                  <button key={m.catalogueId} type="button" role="tab" aria-selected={i === idx} aria-controls="viewer-panel"
                    tabIndex={i === idx ? 0 : -1} onClick={() => go(i, i >= idx ? 1 : -1)}>
                    [ {m.ref} ]
                    {i === idx && !reduced && <span className={`tab-progress${paused ? '' : ' run'}`} key={`${idx}-${cycle}-${paused}`} aria-hidden />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

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

      <p className="vision"><span className="accent">{c.vision[0]}</span>{c.vision[1]}</p>
    </>
  );
}
