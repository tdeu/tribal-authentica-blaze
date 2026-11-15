import { useBchUsd, fmtUsd, fmtBch } from '../price';
import type { Strings } from '../content/i18n';

export const fmtSats = (sats: bigint | number) => `${Number(sats).toLocaleString('en-US')} sats`;

/** ≈ USD at the live rate, or null while the rate is unknown. */
export function useUsdOf() {
  const rate = useBchUsd();
  const usdPerBch = typeof rate === 'object' ? rate.usdPerBch : null;
  return { rate, usdOf: (sats: bigint | number) => (usdPerBch ? (Number(sats) / 1e8) * usdPerBch : null) };
}

/**
 * Price line: USD first (live rate), then sats and BCH. Before mint there are no sats yet:
 * the demo price is $1 and BCH is derived from the live rate.
 */
export function PriceLine({ sats, usdFallback, t }: { sats: bigint | null; usdFallback: number; t: Strings }) {
  const { rate, usdOf } = useUsdOf();
  const usdPerBch = typeof rate === 'object' ? rate.usdPerBch : null;
  const usd = sats !== null ? usdOf(sats) : usdFallback;
  const sub = sats !== null
    ? `${fmtSats(sats)} · ${fmtBch(Number(sats) / 1e8)}`
    : usdPerBch ? `≈ ${fmtBch(usdFallback / usdPerBch)}` : rate === 'loading' ? t.rateLoading : t.rateMissing;
  return (
    <div className="price">
      <span className="price-usd">{usd === null ? '—' : `${sats !== null ? '≈ ' : ''}${fmtUsd(usd)}`}</span>
      <span className="price-bch">{sub}</span>
    </div>
  );
}
