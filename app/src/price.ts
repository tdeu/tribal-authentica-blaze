import { useEffect, useState } from 'react';

// Live BCH/USD rate for display only (prices are fixed on-chain in BCH at mint time).
// Public endpoints, no user data sent, tried in order (CoinGecko's free API rate-limits and its 429s
// carry no CORS header, so it is the last resort). Refreshed every 5 minutes.
const SOURCES: [string, (j: any) => unknown][] = [
  ['https://api.coinbase.com/v2/prices/BCH-USD/spot', (j) => j?.data?.amount],
  ['https://api.kraken.com/0/public/Ticker?pair=BCHUSD', (j) => j?.result?.BCHUSD?.c?.[0]],
  ['https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd', (j) => j?.['bitcoin-cash']?.usd],
];

async function fetchRate(): Promise<number> {
  for (const [url, pick] of SOURCES) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const v = Number(pick(await r.json()));
      if (v > 0) return v;
    } catch { /* next source */ }
  }
  throw new Error('no BCH/USD source reachable');
}

export type Rate = { usdPerBch: number } | 'loading' | 'unavailable';

let cache: { usdPerBch: number; at: number } | undefined;

export function useBchUsd(): Rate {
  const [rate, setRate] = useState<Rate>(cache ? { usdPerBch: cache.usdPerBch } : 'loading');
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (cache && Date.now() - cache.at < 5 * 60_000) { setRate({ usdPerBch: cache.usdPerBch }); return; }
      try {
        const v = await fetchRate();
        cache = { usdPerBch: v, at: Date.now() };
        if (alive) setRate({ usdPerBch: v });
      } catch {
        if (alive) setRate((prev) => (typeof prev === 'object' ? prev : 'unavailable'));
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return rate;
}

export const fmtUsd = (usd: number) =>
  usd.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtBch = (bch: number) => {
  // Enough digits that a ~$1 price shows meaningfully (e.g. 0.00213)
  const digits = bch >= 1 ? 4 : bch >= 0.01 ? 5 : 6;
  return `${bch.toFixed(digits)} BCH`;
};
