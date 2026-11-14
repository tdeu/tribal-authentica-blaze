import { useEffect, useState } from 'react';

// Live BCH/USD rate for display only (prices are fixed on-chain in BCH at mint time).
// Public endpoint, no user data sent. Refreshed every 5 minutes.
const RATE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd';

export type Rate = { usdPerBch: number } | 'loading' | 'unavailable';

let cache: { usdPerBch: number; at: number } | undefined;

export function useBchUsd(): Rate {
  const [rate, setRate] = useState<Rate>(cache ? { usdPerBch: cache.usdPerBch } : 'loading');
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (cache && Date.now() - cache.at < 5 * 60_000) { setRate({ usdPerBch: cache.usdPerBch }); return; }
      try {
        const r = await fetch(RATE_URL);
        const j = await r.json();
        const v = Number(j?.['bitcoin-cash']?.usd);
        if (!(v > 0)) throw new Error('bad rate');
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
