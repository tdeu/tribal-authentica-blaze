import { useCallback, useEffect, useState } from 'react';
import type { Lang } from '../content/mask';
import type { Copy } from '../content/copy';
import { loadActivity, type Activity } from '../chain/activity';
import { explorerTx } from '../config';
import { fmtUsd } from '../price';
import { useUsdOf } from './Price';

const MAX_ROWS = 10;
const fmtNum = (n: bigint | number) => Number(n).toLocaleString('en-US');
const shortHash = (h: string | null) => (h ? `${h.slice(0, 4)}…${h.slice(-4)}` : '—');
// The fingerprint as sealed on-chain: commitment bytes 2..33 of the genesis (hex chars 4..67)
const sealedFp = (e: Activity) => e.mask.mint?.commitment.slice(4, 68) ?? null;
const paidTo = (e: Activity, role: 'custodian' | 'platform') => e.payouts?.find((p) => p.role === role)?.sats ?? 0n;

function when(e: Activity, lang: Lang, pending: string) {
  if (e.height <= 0) return pending;
  if (!e.time) return `#${fmtNum(e.height)}`;
  return new Date(e.time * 1000).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Line({ e, f }: { e: Activity; f: Copy['feed'] }) {
  const ref = e.mask.ref;
  if (e.kind === 'minted') return <>{f.sealed(ref)} <span className="feed-meta">· <span className="nw">{f.fingerprint} {shortHash(sealedFp(e))}</span></span></>;
  if (e.kind === 'listed') return <>{f.listed(ref, fmtNum(e.price))}</>;
  if (e.kind === 'delisted') return <>{f.delisted(ref)}</>;
  if (e.saleKind === 'first') {
    return <>{f.sold(ref)} <span className="feed-meta">· <span className="nw">{fmtNum(paidTo(e, 'custodian'))} sats {f.toSource}</span> · <span className="nw">{fmtNum(paidTo(e, 'platform'))} sats {f.toSankofa}</span></span></>;
  }
  return <>{f.resold(ref)} <span className="feed-meta">· <span className="nw">{fmtNum(paidTo(e, 'custodian'))} sats {f.royaltyToSource}</span></span></>;
}

export function ActivityFeed({ c, lang }: { c: Copy; lang: Lang }) {
  const f = c.feed;
  const { usdOf } = useUsdOf();
  const [rows, setRows] = useState<Activity[] | 'loading' | 'error'>('loading');
  const [all, setAll] = useState(false);

  const read = useCallback((force = false) => {
    let live = true;
    setRows((r) => (Array.isArray(r) ? r : 'loading'));
    loadActivity(force).then((a) => live && setRows(a)).catch(() => live && setRows('error'));
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const stop = read();
    const id = setInterval(() => read(), 60_000);
    return () => { stop(); clearInterval(id); };
  }, [read]);

  const paid = Array.isArray(rows) ? rows.reduce((s, e) => s + paidTo(e, 'custodian'), 0n) : null;
  const usd = paid !== null ? usdOf(paid) : null;
  const shown = Array.isArray(rows) ? (all ? rows : rows.slice(0, MAX_ROWS)) : [];

  return (
    <div className="feed" aria-labelledby="feed-label" aria-busy={rows === 'loading'}>
      <p className="label" id="feed-label">{f.label}</p>
      {rows === 'error' ? (
        <div className="feed-error" role="alert">
          <span>{f.error}</span>
          <button type="button" className="btn btn-ghost feed-retry" onClick={() => { setRows('loading'); read(true); }}>{f.retry}</button>
        </div>
      ) : (
        <ol className="feed-list">
          {rows === 'loading'
            ? [0, 1, 2].map((i) => <li key={i} className="feed-skel" aria-hidden><span /><span /><span /></li>)
            : shown.map((e) => (
              <li key={`${e.mask.catalogueId}-${e.txid}`}>
                <span className="feed-time">{when(e, lang, f.pending)}</span>
                <span className="feed-text"><Line e={e} f={f} /></span>
                <a className="feed-tx" href={explorerTx(e.txid)} target="_blank" rel="noreferrer" aria-label={f.txLabel}>tx ↗</a>
              </li>
            ))}
        </ol>
      )}
      {Array.isArray(rows) && rows.length > MAX_ROWS && (
        <button type="button" className="link feed-more" onClick={() => setAll(!all)}>{all ? f.seeLess : f.seeAll(rows.length)}</button>
      )}
      {rows !== 'error' && (
        <p className="feed-paid">
          {paid === null
            ? <span className="feed-skel-inline" aria-hidden />
            : f.paid(fmtNum(paid), usd !== null ? fmtUsd(usd) : null)}
        </p>
      )}
    </div>
  );
}
