import { useBchUsd } from '../price';

export const fmtSats = (sats: bigint | number) => `${Number(sats).toLocaleString('en-US')} sats`;

/** ≈ USD at the live rate, or null while the rate is unknown. */
export function useUsdOf() {
  const rate = useBchUsd();
  const usdPerBch = typeof rate === 'object' ? rate.usdPerBch : null;
  return { rate, usdOf: (sats: bigint | number) => (usdPerBch ? (Number(sats) / 1e8) * usdPerBch : null) };
}
