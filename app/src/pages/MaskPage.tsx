import { useState } from 'react';
import { DEMO_NOTICE, type Lang, type MaskView } from '../content/mask';
import type { Strings } from '../content/i18n';
import { useWallet } from '../wallet/useWallet';
import { wallet, RECEIVE } from '../wallet/wizard';
import { useMaskLive } from '../chain/live';
import { SplitBar } from '../components/SplitBar';
import { PriceLine, useUsdOf } from '../components/Price';
import { BuySheet } from '../components/BuySheet';

// One mask. Above the fold on a phone: photo, name, status, price, money split, one button.
export function MaskPage({ mask, lang, t, onConnect, onHow }: {
  mask: MaskView; lang: Lang; t: Strings; onConnect: () => void; onHow: () => void;
}) {
  const s = useWallet();
  const myPkh = s.approved ? wallet.addressAt(RECEIVE, 0)?.pkh : undefined;
  const live = useMaskLive(mask, myPkh);
  const { usdOf } = useUsdOf();
  const [buying, setBuying] = useState(false);

  // On-chain price once minted (0 = not for sale: show the last sale instead)
  const st = live.state;
  const sats = st ? (st.price > 0n ? st.price : st.lastSalePrice || null) : mask.mint ? BigInt(mask.mint.priceSats) : null;
  const buyable = live.status === 'not-sold' || live.status === 'resale';

  const onBuy = () => {
    if (!buyable) return;
    setBuying(true);
  };

  const buyLabel = !mask.mint ? t.comingSoon : buyable ? t.buy : t.status[live.status];

  return (
    <article className="mask">
      <figure className="mask-photo">
        {mask.photo
          ? <img src={mask.photo} alt={mask.name} />
          : <div className="photo-placeholder" role="img" aria-label="[MASK_PHOTO]">[MASK_PHOTO]</div>}
      </figure>

      <div className="mask-body">
        <p className="demo-notice" role="note" lang={lang}>{DEMO_NOTICE[lang]}</p>
        <h1 className="mask-name">{mask.name}</h1>
        <p className="mask-artisan">
          {t.custodian} {mask.custodian} · <span className={`status status-${live.status}`}>{t.status[live.status]}</span>
        </p>
        <p className="tagline">{t.tagline}</p>

        <PriceLine sats={sats} usdFallback={mask.priceUsd} t={t} />

        <SplitBar usd={sats !== null ? usdOf(sats) : mask.priceUsd} t={t} />

        <div className="buy-dock">
          <button type="button" className="btn btn-primary btn-buy" onClick={onBuy} disabled={!buyable} aria-disabled={!buyable}>
            {buyLabel}
          </button>
          {live.status === 'error' && <p className="fine center">{live.error}</p>}
        </div>

        <p className="cert">{t.stays}</p>
        <p className="cert">{t.certificate} <button type="button" className="link" onClick={onHow}>{t.howItWorks}</button></p>
        {mask.mint && <p className="cert"><a className="link" href={`#/mask/${mask.catalogueId}/certificate`}>{t.cert.open} →</a></p>}

        <section className="story">
          <h2>{t.story}</h2>
          <p lang={lang}>{mask.story[lang]}</p>
        </section>
      </div>

      {buying && live.state && live.vault && (
        <BuySheet mask={mask} live={live} t={t} onClose={() => setBuying(false)} onConnect={onConnect} />
      )}
    </article>
  );
}
