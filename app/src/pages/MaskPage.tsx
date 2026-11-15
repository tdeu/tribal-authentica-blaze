import { useState } from 'react';
import { MASK, DEMO_NOTICE, type Lang } from '../content/mask';
import type { Strings } from '../content/i18n';
import { useWallet } from '../wallet/useWallet';
import { useBchUsd, fmtUsd, fmtBch } from '../price';
import { SplitBar } from '../components/SplitBar';

// Screen 1. Above the fold on a phone: photo, one headline, price, money split, one button.
export function MaskPage({ lang, t, onConnect, onHow }: { lang: Lang; t: Strings; onConnect: () => void; onHow: () => void }) {
  const s = useWallet();
  const rate = useBchUsd();
  const [note, setNote] = useState<string | null>(null);

  // USD first, BCH second. Before mint the USD price is the reference; after mint, sats are.
  const usdPerBch = typeof rate === 'object' ? rate.usdPerBch : null;
  const usd = MASK.priceSats !== null ? (usdPerBch ? (MASK.priceSats / 1e8) * usdPerBch : null) : MASK.priceUsd;
  const bch = MASK.priceSats !== null ? MASK.priceSats / 1e8 : usdPerBch ? MASK.priceUsd / usdPerBch : null;

  const minted = MASK.categoryId !== null;
  const onBuy = () => {
    if (!minted) return;
    if (!s.approved) { onConnect(); return; }
    setNote(t.checkoutSoon); // replaced by the buy flow (screen 2)
  };

  return (
    <article className="mask">
      <figure className="mask-photo">
        {MASK.photo
          ? <img src={MASK.photo} alt={MASK.name} />
          : <div className="photo-placeholder" role="img" aria-label="[MASK_PHOTO]">[MASK_PHOTO]</div>}
      </figure>

      <div className="mask-body">
        <p className="demo-notice" role="note" lang={lang}>{DEMO_NOTICE[lang]}</p>
        <h1 className="mask-name">{MASK.name}</h1>
        <p className="mask-artisan">{t.custodian} {MASK.custodian} · <span className="status">{t.notSold}</span></p>
        <p className="tagline">{t.tagline}</p>

        <div className="price">
          <span className="price-usd">{usd === null ? '—' : fmtUsd(usd)}</span>
          <span className="price-bch">
            {bch !== null ? `≈ ${fmtBch(bch)}` : rate === 'loading' ? t.rateLoading : t.rateMissing}
          </span>
        </div>

        <SplitBar usd={usd} t={t} />

        <div className="buy-dock">
          <button type="button" className="btn btn-primary btn-buy" onClick={onBuy} disabled={!minted} aria-disabled={!minted}>
            {minted ? t.buy : t.comingSoon}
          </button>
          {note && <p className="hint" role="status">{note}</p>}
        </div>

        <p className="cert">{t.stays}</p>
        <p className="cert">{t.certificate} <button type="button" className="link" onClick={onHow}>{t.howItWorks}</button></p>

        <section className="story">
          <h2>{t.story}</h2>
          <p lang={lang}>{MASK.story[lang]}</p>
        </section>
      </div>
    </article>
  );
}
