import { useEffect, useState } from 'react';
import { binToHex, encodeCashAddress, sha256 } from '@bitauth/libauth';
import { COLLECTION, CONTRACT, type Lang, type MaskView } from '../content/mask';
import type { Strings } from '../content/i18n';
import { useWallet } from '../wallet/useWallet';
import { wallet, RECEIVE } from '../wallet/wizard';
import { provider } from '../wallet/chain';
import { useMaskLive } from '../chain/live';
import { readHistory, readState, vaultOf, type HistoryEvent } from '../chain/vault';
import { fingerprintHex, type MaskContent } from '../data/fingerprint';
import { ADDRESS_PREFIX, explorerTx } from '../config';
import { fmtSats } from '../components/Price';
import { ResellSheet } from '../components/ResellSheet';

const addrOf = (pkh: Uint8Array) => encodeCashAddress({ prefix: ADDRESS_PREFIX, type: 'p2pkh', payload: pkh }).address;
const short = (s: string) => (s.length > 24 ? `${s.slice(0, 16)}…${s.slice(-6)}` : s);

// ---------------------------------------------------------------- Verify (all in the browser)

type Check = { label: string; ok: boolean; detail?: string };
type VerifyResult = { checks: Check[]; ok: boolean; computed: string; onchain: string } | { error: string };

async function verify(mask: MaskView, t: Strings): Promise<VerifyResult> {
  const v = t.cert.verify;
  try {
    const raw = COLLECTION.masks.find((m) => m.catalogueId === mask.catalogueId) as unknown as MaskContent;
    const checks: Check[] = [];
    // 1. Every photo's bytes, as served, hash to what the fingerprint lists
    if (raw.photos.length) {
      const bad: string[] = [];
      for (const p of raw.photos) {
        const bytes = new Uint8Array(await (await fetch(`/${p.file}`, { cache: 'no-store' })).arrayBuffer());
        if (binToHex(sha256.hash(bytes)) !== p.sha256) bad.push(p.file);
      }
      checks.push({ label: v.photos, ok: bad.length === 0, detail: bad.length ? bad.join(', ') : `${raw.photos.length}` });
    } else {
      checks.push({ label: v.noPhotos, ok: true });
    }
    // 2. Fingerprint recomputed from the content (not the stored value)
    const computed = fingerprintHex(raw);
    // 3. Fresh read of the commitment locked in the vault; vaultOf already refused a vault that
    //    does not rebuild from the contract terms + mint record
    const vault = vaultOf(mask.mint!, CONTRACT, provider);
    checks.push({ label: v.vault, ok: true, detail: short(vault.contract.tokenAddress) });
    const st = await readState(provider, vault, mask.mint!);
    const ok = st.fingerprint === computed && st.catalogueId === raw.catalogueId;
    checks.push({ label: v.content, ok, detail: computed });
    checks.push({ label: v.onchain, ok, detail: st.fingerprint });
    return { checks, ok: ok && checks.every((c) => c.ok), computed, onchain: st.fingerprint };
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) };
  }
}

// ---------------------------------------------------------------- History

function useHistory(mask: MaskView, key: string | undefined) {
  const [events, setEvents] = useState<HistoryEvent[] | 'loading' | 'error'>('loading');
  useEffect(() => {
    if (!mask.mint || !key) return;
    let on = true;
    (async () => {
      try {
        const ev = await readHistory(provider, vaultOf(mask.mint!, CONTRACT, provider), mask.mint!, CONTRACT);
        if (on) setEvents(ev);
      } catch { if (on) setEvents('error'); }
    })();
    return () => { on = false; };
  }, [mask, key]);
  return events;
}

function HistoryList({ events, t, myPkh }: { events: HistoryEvent[]; t: Strings; myPkh?: Uint8Array }) {
  const h = t.cert.history;
  const who = (pkh: Uint8Array) => (myPkh && binToHex(myPkh) === binToHex(pkh) ? t.cert.you : short(addrOf(pkh)));
  const role = (r: string) => (r === 'seller' ? h.seller : r === 'custodian' ? h.custodian : h.platform);
  return (
    <ol className="history">
      {[...events].reverse().map((e) => (
        <li key={e.txid}>
          <div className="history-what">
            {e.kind === 'minted' && <>{h.minted} <b>{fmtSats(e.price)}</b></>}
            {e.kind === 'sold' && <>{e.saleKind === 'first' ? h.firstSale : h.resale} <b>{fmtSats(e.price)}</b> → {who(e.ownerPkh)}</>}
            {e.kind === 'listed' && <>{h.listed} <b>{fmtSats(e.price)}</b></>}
            {e.kind === 'delisted' && <>{h.delisted}</>}
          </div>
          {e.payouts && <div className="fine">{e.payouts.map((p) => `${fmtSats(p.sats)} → ${role(p.role)}`).join(' · ')}</div>}
          <a className="fine link" href={explorerTx(e.txid)} target="_blank" rel="noreferrer">
            {short(e.txid)}{e.height <= 0 ? ` · ${h.pending}` : ''}
          </a>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- Page

export function CertificatePage({ mask, lang, t }: { mask: MaskView; lang: Lang; t: Strings }) {
  const c = t.cert;
  const s = useWallet();
  const myPkh = s.approved ? wallet.addressAt(RECEIVE, 0)?.pkh : undefined;
  const live = useMaskLive(mask, myPkh);
  const st = live.state;
  const history = useHistory(mask, st?.utxo.txid);
  const [result, setResult] = useState<VerifyResult | 'running'>();
  const [reselling, setReselling] = useState(false);

  if (!mask.mint) {
    return (<section className="certificate"><h1 className="mask-name">{c.title} · {mask.ref}</h1><p className="fine">{t.comingSoon}</p></section>);
  }

  return (
    <section className="certificate" lang={lang}>
      <p className="fine">{c.title} · {mask.ref}</p>
      <h1 className="mask-name">{mask.name}</h1>
      <p className="mask-artisan">{t.custodian} {mask.custodian} · <span className={`status status-${live.status}`}>{t.status[live.status]}</span></p>

      <div className="cert-card">
        <h2>{c.owner}</h2>
        {!st ? <p className="fine">{live.error ?? t.status.loading}</p> : (
          <>
            <p className="cert-owner">
              {st.ownerIsCustodian ? c.notSoldOwner : live.status === 'yours' ? <b>{c.you} ✓</b> : <code>{short(addrOf(st.ownerPkh))}</code>}
            </p>
            <p className="fine">
              {st.price > 0n ? `${c.forSale} ${fmtSats(st.price)}` : c.notForSale}
              {st.lastSalePrice > 0n && ` · ${c.lastSale} ${fmtSats(st.lastSalePrice)}`}
            </p>
            {live.status === 'yours' && (
              <button type="button" className="btn btn-primary" onClick={() => setReselling(true)}>
                {st.price > 0n ? c.resell.change : c.resell.open}
              </button>
            )}
          </>
        )}
      </div>

      <div className="cert-card">
        <h2>{c.verify.title}</h2>
        <p className="fine">{c.verify.lead}</p>
        <button type="button" className="btn btn-ghost" disabled={result === 'running'}
          onClick={async () => { setResult('running'); setResult(await verify(mask, t)); }}>
          {result === 'running' ? c.verify.running : c.verify.run}
        </button>
        {result && result !== 'running' && ('error' in result
          ? <p className="warn" role="alert">{c.verify.failed} {result.error}</p>
          : (
            <div role="status">
              <ul className="checks">
                {result.checks.map((k) => (
                  <li key={k.label} className={k.ok ? 'ok' : 'bad'}>
                    <span aria-hidden>{k.ok ? '✓' : '✗'}</span> {k.label}
                    {k.detail && <code className="hash">{k.detail}</code>}
                  </li>
                ))}
              </ul>
              <p className={result.ok ? 'wstatus wstatus-ok' : 'warn'}>{result.ok ? c.verify.ok : c.verify.bad}</p>
            </div>
          ))}
      </div>

      <div className="cert-card">
        <h2>{c.history.title}</h2>
        {history === 'loading' ? <p className="fine">{c.history.loading}</p>
          : history === 'error' ? <p className="fine">{c.history.error}</p>
          : <HistoryList events={history} t={t} myPkh={myPkh} />}
      </div>

      {reselling && st && live.vault && (
        <ResellSheet mask={mask} live={live} t={t} onClose={() => setReselling(false)} />
      )}
    </section>
  );
}
