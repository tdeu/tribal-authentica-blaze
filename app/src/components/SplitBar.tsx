import { CUSTODIAN_SHARE_FIRST_SALE, PLATFORM_SHARE_FIRST_SALE } from '../content/mask';
import { fmtUsd } from '../price';
import type { Strings } from '../content/i18n';

// Where the money goes on the first sale, as a bar, with the resale rule under it.
export function SplitBar({ usd, t }: { usd: number | null; t: Strings }) {
  const a = Math.round(CUSTODIAN_SHARE_FIRST_SALE * 100);
  const p = Math.round(PLATFORM_SHARE_FIRST_SALE * 100);
  const amt = (share: number) => (usd === null ? '' : ` · ${fmtUsd(usd * share)}`);
  return (
    <figure className="split" aria-label={`${t.split.firstSale}: ${a}% ${t.split.custodian}, ${p}% ${t.split.platform}`}>
      <figcaption className="split-cap">{t.split.firstSale}</figcaption>
      <div className="split-bar" aria-hidden>
        <span className="split-artisan" style={{ flexBasis: `${a}%` }} />
        <span className="split-platform" style={{ flexBasis: `${p}%` }} />
      </div>
      <div className="split-legend">
        <span><i className="sw sw-artisan" />{t.split.custodian} <b>{a}%</b>{amt(CUSTODIAN_SHARE_FIRST_SALE)}</span>
        <span><i className="sw sw-platform" />{t.split.platform} <b>{p}%</b>{amt(PLATFORM_SHARE_FIRST_SALE)}</span>
      </div>
      <p className="resale"><span aria-hidden>↻</span> {t.resale}</p>
    </figure>
  );
}
