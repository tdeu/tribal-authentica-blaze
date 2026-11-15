import { DEMO_NOTICE, MASKS, type Lang, type MaskView } from '../content/mask';
import type { Strings } from '../content/i18n';
import { useWallet } from '../wallet/useWallet';
import { wallet, RECEIVE } from '../wallet/wizard';
import { useMaskLive } from '../chain/live';
import { fmtUsd } from '../price';
import { fmtSats, useUsdOf } from '../components/Price';

function Card({ mask, t, myPkh }: { mask: MaskView; t: Strings; myPkh?: Uint8Array }) {
  const live = useMaskLive(mask, myPkh);
  const { usdOf } = useUsdOf();
  const st = live.state;
  const sats = st ? (st.price > 0n ? st.price : st.lastSalePrice) : mask.mint ? BigInt(mask.mint.priceSats) : null;
  const usd = sats !== null ? usdOf(sats) : mask.priceUsd;
  return (
    <li>
      <a className="card" href={`#/mask/${mask.catalogueId}`} aria-label={`${mask.name} — ${t.status[live.status]}`}>
        <div className="card-photo">
          {mask.photo ? <img src={mask.photo} alt="" loading="lazy" /> : <span>[MASK_PHOTO]</span>}
        </div>
        <div className="card-body">
          <span className="card-ref">{mask.ref}</span>
          <span className="card-name">{mask.name}</span>
          <span className={`status status-${live.status}`}>{t.status[live.status]}</span>
          <span className="card-price">
            {usd !== null ? `${sats !== null ? '≈ ' : ''}${fmtUsd(usd)}` : '—'}
            {sats !== null && <small> · {fmtSats(sats)}</small>}
          </span>
        </div>
      </a>
    </li>
  );
}

export function Gallery({ lang, t }: { lang: Lang; t: Strings }) {
  const s = useWallet();
  const myPkh = s.approved ? wallet.addressAt(RECEIVE, 0)?.pkh : undefined;
  return (
    <section className="gallery">
      <h1 className="mask-name">{t.gallery.title}</h1>
      <p className="tagline">{t.gallery.lead}</p>
      <p className="demo-notice" role="note" lang={lang}>{DEMO_NOTICE[lang]}</p>
      <ul className="cards">
        {MASKS.map((m) => <Card key={m.catalogueId} mask={m} t={t} myPkh={myPkh} />)}
      </ul>
    </section>
  );
}
