import { useState } from 'react';
import { CONTRACT, DEMO_NOTICE, MASKS, type Lang, type MaskView } from '../content/mask';
import type { Strings } from '../content/i18n';
import type { Copy } from '../content/copy';
import { useWallet } from '../wallet/useWallet';
import { wallet, RECEIVE } from '../wallet/wizard';
import { useMaskLive } from '../chain/live';
import { fmtUsd } from '../price';
import { useUsdOf } from '../components/Price';
import { BuySheet } from '../components/BuySheet';
import { Corners, SplitBar, Ticker } from '../components/art';

const TOTAL = String(MASKS.length).padStart(3, '0');
const fmtNum = (n: bigint | number) => Number(n).toLocaleString('en-US');
const KEEPER_FIRST = 100 - CONTRACT.platformBps / 100;
const ROYALTY = CONTRACT.royaltyBps / 100;

// Story: blank-line separated paragraphs. With more than one, the first is the large opening line.
const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export function MaskPage({ mask, lang, setLang, t, c, onConnect, onHow }: {
  mask: MaskView; lang: Lang; setLang: (l: Lang) => void; t: Strings; c: Copy; onConnect: () => void; onHow: () => void;
}) {
  const s = useWallet();
  const myPkh = s.approved ? wallet.addressAt(RECEIVE, 0)?.pkh : undefined;
  const live = useMaskLive(mask, myPkh);
  const { usdOf } = useUsdOf();
  const [buying, setBuying] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const m = c.mask;

  const st = live.state;
  const sats = st ? (st.price > 0n ? st.price : st.lastSalePrice || BigInt(mask.priceSats)) : BigInt(mask.priceSats);
  const usd = usdOf(sats);
  const buyable = live.status === 'not-sold' || live.status === 'resale';
  const resale = live.status === 'resale' || (st && !st.ownerIsCustodian);
  const buyLabel = !mask.mint ? t.comingSoon : buyable ? m.buy : t.status[live.status];
  const onBuy = () => { if (buyable) setBuying(true); };
  const status = t.status[live.status].toUpperCase();

  const story = paragraphs(mask.story[lang]);
  const [opening, ...body] = story.length > 1 ? story : [null, ...story];
  const photo = mask.photos[photoIdx] ?? null;
  const fingerprint = st?.fingerprint ?? mask.fingerprint;

  const keeperSquares = resale ? 2 : 18;
  const legend = resale ? m.resaleSplit : m.firstSplit;
  const keeperPct = resale ? ROYALTY : KEEPER_FIRST;

  return (
    <article className="mask-page">
      <section className="mask-hero vignette">
        {photo ? <img src={photo} alt={mask.name} /> : (
          <div className="photo-ph" role="img" aria-label={c.collection.photo(mask.ref)}>{c.collection.photo(mask.ref)}<br />{m.photoHint}</div>
        )}
        <Corners bottom={false} />
        <div className="mask-hero-foot">
          <div>
            <p className="label">[ {mask.ref} / {c.collection.region} ]</p>
            <h1 className="headline h-l">{mask.name}</h1>
          </div>
          {mask.photos.length > 0 && (
            <div className="tools">
              <a className="icon-btn" href={photo!} target="_blank" rel="noreferrer" aria-label={m.zoom}>+</a>
              {mask.photos.length > 1 && (
                <button type="button" className="icon-btn" aria-label={m.nextPhoto} onClick={() => setPhotoIdx((photoIdx + 1) % mask.photos.length)}>→</button>
              )}
            </div>
          )}
        </div>
      </section>
      <Ticker quiet items={[...m.details.slice(0, 3), mask.country, ...m.details.slice(3), status]} />

      <div className="mask-cols">
        <section className="story-col" aria-labelledby="story-label">
          <div className="story-head">
            <p className="label" id="story-label">{m.story}</p>
            <div className="seg" role="group" aria-label="Language">
              {(['fr', 'en'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div lang={lang} style={{ display: 'contents' }}>
            {opening && <p className="story-open">{opening}</p>}
            {body.map((p, i) => <p key={i} className="story-body">{p}</p>)}
          </div>
          <p className="demo-notice" role="note" lang={lang}>{DEMO_NOTICE[lang]}</p>
        </section>

        <aside className="buy-col">
          <div className="buy-panel">
            <p className="label">{m.own}</p>
            <div><span className="price-huge">{fmtNum(sats)}</span><span className="price-sub"> {m.sats}{usd !== null ? ` ≈ ${fmtUsd(usd)}` : ''}</span></div>
            <SplitBar accent={keeperSquares} label={m.splitLabel(keeperPct, 100 - keeperPct, resale ? 'the seller' : 'Emtée')} />
            <div className="split-legend"><span>{keeperPct}% {legend[0]}</span><span>{100 - keeperPct}% {legend[1]}</span></div>
            <button type="button" className="btn btn-primary btn-block btn-big" onClick={onBuy} disabled={!buyable}>{buyLabel}</button>
            {live.status === 'error' && <p className="fine">{live.error}</p>}
            <ul className="perks">{m.perks.map((p) => <li key={p}>{p}</li>)}</ul>
            <button type="button" className="link" style={{ alignSelf: 'flex-start', fontSize: 13 }} onClick={onHow}>{m.how}</button>
          </div>
          <div className="chain-panel">
            <p className="label">{m.onchain}</p>
            {mask.mint ? (
              <dl className="kv">
                <dt>{m.category}</dt><dd>{mask.mint.categoryId}</dd>
                <dt>{m.vault}</dt><dd>{mask.mint.vaultTokenAddress}</dd>
                <dt>{m.fingerprint}</dt><dd>{fingerprint} · {m.locked}</dd>
              </dl>
            ) : <p className="fine">{m.notMinted}</p>}
            {mask.mint && <a href={`#/mask/${mask.catalogueId}/certificate`} style={{ marginTop: 8, fontSize: 13 }}>{m.cert}</a>}
          </div>
        </aside>
      </div>

      <div className="buy-dock">
        <div className="dock-price"><b>{fmtNum(sats)}</b>{m.sats}{usd !== null ? ` ≈ ${fmtUsd(usd)}` : ''}</div>
        <button type="button" className="btn btn-primary" onClick={onBuy} disabled={!buyable}>{buyLabel}</button>
      </div>

      {buying && live.state && live.vault && (
        <BuySheet mask={mask} live={live} t={t} c={c} refLabel={`[ ${mask.ref} / ${TOTAL} ]`} onClose={() => setBuying(false)} onConnect={onConnect} />
      )}
    </article>
  );
}
