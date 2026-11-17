import { useEffect, useRef, useState } from 'react';
import { binToHex, encodeCashAddress, hexToBin, sha256 } from '@bitauth/libauth';
import { COLLECTION, CONTRACT, type Lang, type MaskView } from '../content/mask';
import type { Strings } from '../content/i18n';
import type { Copy } from '../content/copy';
import { useWallet } from '../wallet/useWallet';
import { wallet, RECEIVE } from '../wallet/wizard';
import { provider } from '../wallet/chain';
import { useMaskLive } from '../chain/live';
import { readHistory, readState, vaultOf, type HistoryEvent } from '../chain/vault';
import { fingerprintHex, type MaskContent } from '../data/fingerprint';
import { ADDRESS_PREFIX, explorerTx } from '../config';
import { HashGrid } from '../components/art';
import { ResellPanel } from '../components/ResellPanel';

const fmtNum = (n: bigint | number) => Number(n).toLocaleString('en-US');
const sats = (n: bigint | number) => `${fmtNum(n)} sats`;
const addrOf = (pkh: Uint8Array) => encodeCashAddress({ prefix: ADDRESS_PREFIX, type: 'p2pkhWithTokens', payload: pkh }).address;
const shortAddr = (a: string) => { const b = a.split(':')[1] ?? a; return `${b.slice(0, 3)}…${b.slice(-4)}`; };

// ---------------------------------------------------------------- Verify (all in the browser)

type Verdict =
  | { error: string }
  | { photos: { n: number; bad: string[] }; computed: Uint8Array; onchain: Uint8Array; firstDiff: number; ok: boolean };

// DEV ONLY: ?tamper=1 flips one byte of the story (and of the first photo, if any) before hashing, to show
// the NO MATCH state. import.meta.env.DEV is false in production builds, so this code is removed there.
const TAMPER = import.meta.env.DEV && new URLSearchParams(window.location.search).get('tamper') === '1';

async function verify(mask: MaskView): Promise<Verdict> {
  try {
    let raw = COLLECTION.masks.find((m) => m.catalogueId === mask.catalogueId) as unknown as MaskContent;
    if (TAMPER) {
      const en = raw.story.en;
      raw = { ...raw, story: { ...raw.story, en: String.fromCharCode(en.charCodeAt(0) ^ 1) + en.slice(1) } };
    }
    // 1. Every published photo, as served, hashes to what the fingerprint lists
    const bad: string[] = [];
    for (const p of raw.photos) {
      const bytes = new Uint8Array(await (await fetch(`/${p.file}`, { cache: 'no-store' })).arrayBuffer());
      if (TAMPER && p === raw.photos[0] && bytes.length) bytes[0] ^= 1;
      if (binToHex(sha256.hash(bytes)) !== p.sha256) bad.push(p.file);
    }
    // 2. Fingerprint recomputed here from the content (never the stored value)
    const computed = hexToBin(fingerprintHex(raw));
    // 3. Fresh read of the commitment in the vault (vaultOf refuses a vault that doesn't rebuild from its terms)
    const vault = vaultOf(mask.mint!, CONTRACT, provider);
    const st = await readState(provider, vault, mask.mint!);
    const commitment = hexToBin(st.utxo.token!.nft!.commitment);
    const onchain = commitment.slice(2, 34);
    let firstDiff = -1;
    for (let i = 0; i < 32; i++) if (computed[i] !== onchain[i]) { firstDiff = i; break; }
    const idOk = st.catalogueId === raw.catalogueId;
    return { photos: { n: raw.photos.length, bad }, computed, onchain, firstDiff: idOk ? firstDiff : Math.max(firstDiff, 0), ok: idOk && firstDiff === -1 && bad.length === 0 };
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) };
  }
}

function VerifySection({ mask, c }: { mask: MaskView; c: Copy }) {
  const k = c.cert;
  const [verdict, setVerdict] = useState<Verdict>();
  const [phase, setPhase] = useState(0); // 0 idle, 1 source, 2 fingerprint, 3 on-chain, 4 verdict
  const [running, setRunning] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = async () => {
    timers.current.forEach(clearTimeout);
    setRunning(true); setPhase(0); setVerdict(undefined);
    const v = await verify(mask);
    setVerdict(v);
    setRunning(false);
    if ('error' in v) { setPhase(4); return; }
    // Reveal step by step (opacity only)
    setPhase(1);
    timers.current = [450, 1000, 1600].map((ms, i) => window.setTimeout(() => setPhase(i + 2), ms));
  };

  const ok = verdict && !('error' in verdict) ? verdict : undefined;
  const mark = ok && ok.firstDiff >= 0 ? ok.firstDiff : undefined;
  return (
    <section className="verify" aria-labelledby="verify-label">
      <div className="verify-head">
        <div>
          <p className="label" id="verify-label">{k.verifyLabel}</p>
          <h2 className="headline h-m" style={{ marginTop: 12 }}>{k.verifyTitle[0]}<br /><span className="accent">{k.verifyTitle[1]}</span></h2>
        </div>
        <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
          {running ? k.running : phase >= 4 ? k.again : k.run}
        </button>
      </div>
      {TAMPER && <p className="warn">DEV · ?tamper=1: one byte of the story is flipped before hashing.</p>}
      <div className="steps3">
        <div className={`step${phase >= 1 ? ' on' : ''}`}>
          <p className="fine">{k.s1[0]}</p>
          <div className="step-art">
            {mask.photos.length
              ? mask.photos.slice(0, 3).map((p) => <img key={p} src={p} alt="" />)
              : [0, 1, 2].map((i) => <div key={i} className="photo-ph" aria-hidden />)}
          </div>
          <div className="step-title">{k.s1[1]}</div>
          <p className="step-text">{k.s1[2]}</p>
          {ok && phase >= 1 && <p className="step-text">{ok.photos.bad.length ? k.photosBad(ok.photos.bad.join(', ')) : `✓ ${k.photosOk(ok.photos.n)}`}</p>}
        </div>
        <div className={`step${phase >= 2 ? ' on' : ''}`}>
          <p className="fine">{k.s2[0]}</p>
          <div className="step-art"><HashGrid bytes={ok?.computed} revealed={phase >= 2} mark={mark} label={k.gridA} /></div>
          <div className="step-title">{k.s2[1]}</div>
          <p className="step-text">{ok && phase >= 2 ? binToHex(ok.computed) : '[SHA256 · 32 BYTES]'}</p>
        </div>
        <div className={`step${phase >= 3 ? ' on' : ''}`}>
          <p className="fine">{k.s3[0]}</p>
          <div className="step-art"><HashGrid bytes={ok?.onchain} revealed={phase >= 3} mark={mark} label={k.gridB} /></div>
          <div className="step-title">{k.s3[1]}</div>
          <p className="step-text">{ok && phase >= 3 ? binToHex(ok.onchain) : k.s3[2]}</p>
        </div>
      </div>
      <div aria-live="polite">
        {verdict && 'error' in verdict && <p className="warn">{k.failed} {verdict.error}</p>}
        {ok && phase >= 4 && (ok.ok
          ? <div className="verdict verdict-ok"><strong>{k.match}</strong><p>{k.matchText(mask.ref)}</p></div>
          : <div className="verdict verdict-bad"><strong>{k.noMatch}</strong><p>{ok.firstDiff >= 0 ? k.noMatchText(ok.firstDiff + 2) : k.photoMismatch}</p></div>)}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- History

function useHistory(mask: MaskView, key: string | undefined) {
  const [events, setEvents] = useState<HistoryEvent[] | 'loading' | 'error'>('loading');
  useEffect(() => {
    if (!mask.mint || !key) return;
    let on = true;
    readHistory(provider, vaultOf(mask.mint, CONTRACT, provider), mask.mint, CONTRACT)
      .then((ev) => { if (on) setEvents(ev); })
      .catch(() => { if (on) setEvents('error'); });
    return () => { on = false; };
  }, [mask, key]);
  return events;
}

const dateOf = (e: HistoryEvent, lang: Lang, pending: string) =>
  e.height <= 0 ? pending : e.time ? new Date(e.time * 1000).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : `#${e.height}`;

function HistoryTable({ events, c, lang }: { events: HistoryEvent[]; c: Copy; lang: Lang }) {
  const k = c.cert;
  const text = (e: HistoryEvent) => {
    if (e.kind === 'minted') return k.minted;
    if (e.kind === 'listed') return k.listed(sats(e.price));
    if (e.kind === 'delisted') return k.delisted;
    const keeper = e.payouts?.find((p) => p.role === 'custodian')?.sats ?? 0n;
    if (e.saleKind === 'first') {
      const emtee = e.payouts?.find((p) => p.role === 'platform')?.sats ?? 0n;
      const [a, b, d] = k.firstSale(sats(e.price), fmtNum(keeper), fmtNum(emtee));
      return <>{a}<span className="accent">{b}</span>{d}</>;
    }
    const [a, b] = k.resold(sats(e.price), sats(keeper));
    return <>{a}<span className="accent">{b}</span></>;
  };
  return (
    <div className="htable" role="table">
      <div className="hrow hhead" role="row">{k.cols.map((h, i) => <span key={h} role="columnheader" style={i === 2 ? { textAlign: 'right' } : undefined}>{h}</span>)}</div>
      {events.map((e) => (
        <div className="hrow" role="row" key={e.txid}>
          <span role="cell">{dateOf(e, lang, k.pending)}</span>
          <span role="cell">{text(e)}</span>
          <span role="cell"><a href={explorerTx(e.txid)} target="_blank" rel="noreferrer" aria-label={`${k.txLabel} ${e.txid}`}>↗</a></span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Page

export function CertificatePage({ mask, lang, t, c }: { mask: MaskView; lang: Lang; t: Strings; c: Copy }) {
  const k = c.cert;
  const s = useWallet();
  const myPkh = s.approved ? wallet.addressAt(RECEIVE, 0)?.pkh : undefined;
  const live = useMaskLive(mask, myPkh);
  const st = live.state;
  const history = useHistory(mask, st?.utxo.txid);

  if (!mask.mint) {
    return (
      <section className="cert-hero">
        <div>
          <p className="label">{k.tag(mask.ref)}</p>
          <h1 className="headline h-l">{mask.name}</h1>
          <p className="lead">{t.comingSoon}</p>
        </div>
      </section>
    );
  }

  const yours = live.status === 'yours';
  const holder = !st ? '…' : st.ownerIsCustodian ? k.notSold
    : yours ? `${k.you} · ${shortAddr(s.tokenAddress ?? addrOf(st.ownerPkh))}` : shortAddr(addrOf(st.ownerPkh));
  const paid = Array.isArray(history)
    ? history.flatMap((e) => e.payouts ?? []).filter((p) => p.role === 'custodian').reduce((a, p) => a + p.sats, 0n)
    : undefined;

  return (
    <>
      <section className="cert-hero">
        <div>
          <p className="label">{k.tag(mask.ref)}</p>
          <h1 className="headline h-l">{mask.name}</h1>
          <p className="lead">{!st ? '' : yours ? k.leadYours : st.ownerIsCustodian ? k.leadUnsold : k.leadOther}</p>
          {live.status === 'error' && <p className="fine">{live.error}</p>}
        </div>
        <div className="cert-photo vignette">
          {mask.photo ? <img src={mask.photo} alt={mask.name} /> : <div className="photo-ph" role="img" aria-label={c.collection.photo(mask.ref)}>{c.collection.photo(mask.ref)}</div>}
        </div>
      </section>

      <dl className="facts">
        <div><dt>{k.holder}</dt><dd style={{ fontWeight: 700 }}>{holder}</dd></div>
        <div><dt>{k.keeper}</dt><dd>{k.keeperValue(mask.custodian)}</dd></div>
        <div><dt>{k.paid}</dt><dd>{paid === undefined ? '…' : `${fmtNum(paid)} ${k.sats}`}</dd></div>
        <div><dt>{k.everyResale}</dt><dd className="accent" style={{ fontWeight: 700 }}>{k.tenPct}</dd></div>
      </dl>

      <VerifySection mask={mask} c={c} />

      <section className="cert-lower">
        <div className="history">
          <p className="label">{k.historyLabel}</p>
          {history === 'loading' ? <p className="fine" style={{ marginTop: 16 }}>{k.loading}</p>
            : history === 'error' ? <p className="fine" style={{ marginTop: 16 }}>{k.error}</p>
            : <HistoryTable events={history} c={c} lang={lang} />}
        </div>
        {st && live.vault && yours && <ResellPanel mask={mask} live={live} t={t} c={c} />}
        {st && !yours && st.price > 0n && (
          <div className="side-box">
            <p className="label">{k.forSale}</p>
            <div><span className="price-big">{fmtNum(st.price)}</span><span className="price-sub"> sats</span></div>
            <a className="btn btn-primary btn-block" href={`#/mask/${mask.catalogueId}`}>{k.buyIt}</a>
          </div>
        )}
      </section>
    </>
  );
}
