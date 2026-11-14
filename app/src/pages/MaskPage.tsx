import { useState } from 'react';
import { MASK, type Lang } from '../content/mask';
import { T } from '../content/i18n';
import { useWallet } from '../wallet/useWallet';

const fmtSats = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');

export function MaskPage({ onConnect }: { onConnect: () => void }) {
  const [lang, setLang] = useState<Lang>('fr');
  const s = useWallet();
  const t = T[lang];
  const [note, setNote] = useState<string | null>(null);

  const onBuy = () => {
    if (!s.approved) { setNote(t.connectFirst); onConnect(); return; }
    setNote(t.checkoutSoon); // Screen 2 (buy flow) replaces this
  };

  return (
    <article className="mask">
      <figure className="mask-photo">
        {MASK.photo
          ? <img src={MASK.photo} alt={MASK.name} />
          : <div className="photo-placeholder" role="img" aria-label="Mask photo placeholder">[MASK_PHOTO]</div>}
      </figure>

      <div className="mask-body">
        <div className="lang-toggle" role="group" aria-label="Language">
          {(['fr', 'en'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <h1 className="mask-name">{MASK.name}</h1>
        <p className="mask-artisan">{t.by} <span>{MASK.artisan}</span> · {MASK.origin}</p>

        <p className="mask-price">
          {MASK.priceSats === null ? '[PRICE]' : <>{fmtSats(MASK.priceSats)} <small>sats</small></>}
        </p>
        <p className="royalty">{t.royaltyLine}</p>

        <button type="button" className="btn btn-primary btn-buy" onClick={onBuy}>{t.buy}</button>
        {note && <p className="hint" role="status">{note}</p>}

        <section className="story">
          <h2>{t.story}</h2>
          <p lang={lang}>{MASK.story[lang]}</p>
        </section>

        <p className="fine">{t.certificateNote}</p>
      </div>
    </article>
  );
}
