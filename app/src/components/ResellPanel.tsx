import { useEffect, useRef, useState } from 'react';
import { wallet, RECEIVE, PATH_NAME } from '../wallet/wizard';
import { walletUtxos, checkSigned, broadcast, provider } from '../wallet/chain';
import { toWire } from '../wallet/wire';
import { buildList, listProblem, minResalePrice, payoutsOf, readState, type BuiltList } from '../chain/vault';
import type { Live } from '../chain/live';
import { CONTRACT, type MaskView } from '../content/mask';
import type { Strings } from '../content/i18n';
import type { Copy } from '../content/copy';
import { explorerTx } from '../config';

// Resell, inline on the certificate (holder only): price → split shown live (the keeper's royalty
// BEFORE signing) → the wallet signs list() (owner signature on the vault input + fee inputs) →
// broadcast. A signed tx is kept: "Try again" after a broadcast error re-sends the same tx.
type Phase =
  | { k: 'review' } | { k: 'building' } | { k: 'signing' } | { k: 'broadcasting' }
  | { k: 'done'; txid: string; price: bigint }
  | { k: 'error'; message: string; signedHex?: string };

const fmtNum = (n: bigint | number) => Number(n).toLocaleString('en-US');

export function ResellPanel({ mask, live, t, c }: { mask: MaskView; live: Live; t: Strings; c: Copy }) {
  const r = t.cert.resell;
  const b = t.buySheet;
  const k = c.cert;
  const state = live.state!;
  const vault = live.vault!;
  const min = minResalePrice(state.lastSalePrice, CONTRACT);
  const [input, setInput] = useState(String(state.price > 0n ? state.price : state.lastSalePrice > min ? state.lastSalePrice : min));
  const [phase, setPhase] = useState<Phase>({ k: 'review' });
  const [fee, setFee] = useState<bigint>();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const set = (p: Phase) => { if (alive.current) setPhase(p); };

  const price = /^\d{1,15}$/.test(input.trim()) ? BigInt(input.trim()) : null;
  const problem = price === null ? `${r.min} ${fmtNum(min)} sats` : price === 0n ? null : listProblem(state, CONTRACT, price);
  const preview = price !== null && price > 0n && !problem ? payoutsOf({ ...state, price }, vault, CONTRACT) : null;
  const seller = preview?.payouts.find((p) => p.role === 'seller');
  const royalty = preview?.payouts.find((p) => p.role === 'custodian');

  const send = async (signedHex: string, p: bigint) => {
    set({ k: 'broadcasting' });
    try {
      const txid = await broadcast(signedHex);
      set({ k: 'done', txid, price: p });
      live.refresh();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/missing|spent|conflict|bad-txns-inputs/i.test(msg)) { set({ k: 'error', message: r.changed }); live.refresh(); return; }
      set({ k: 'error', message: `${b.errorNetwork} ${msg}`, signedHex });
    }
  };

  const start = async (newPrice: bigint) => {
    set({ k: 'building' });
    let built: BuiltList;
    try {
      const me = wallet.addressAt(RECEIVE, 0);
      if (!me) throw new Error(b.connectFirst);
      const fresh = await readState(provider, vault, mask.mint!);
      if (fresh.utxo.txid !== state.utxo.txid) { set({ k: 'error', message: r.changed }); live.refresh(); return; }
      const utxos = (await walletUtxos()).map((u) => ({ ...u, pathName: PATH_NAME[u.path] }));
      built = buildList(provider, vault, fresh, CONTRACT,
        { pkh: me.pkh, changeAddress: me.address, utxos, path: [PATH_NAME[RECEIVE], 0] }, newPrice,
        newPrice === 0n ? `Sankofa — take mask ${mask.ref} off sale` : `Sankofa — resell mask ${mask.ref}`);
      setFee(built.fee);
    } catch (e) {
      set({ k: 'error', message: `${r.errorOurs} ${String((e as Error)?.message ?? e)}` });
      return;
    }
    const wire = toWire(built.wc);
    set({ k: 'signing' });
    const out = await wallet.sign(wire, built.inputPaths);
    if (!out.ok) {
      set({ k: 'error', message: out.side === 'timeout' ? b.errorTimeout : out.side === 'wallet' ? `${b.errorWallet} ${out.message}` : out.message });
      return;
    }
    const bad = checkSigned(wire.transaction, out.signedHex);
    if (bad) { set({ k: 'error', message: `${b.errorWallet} ${bad}` }); return; }
    await send(out.signedHex, newPrice);
  };

  const busy = phase.k === 'building' || phase.k === 'signing' || phase.k === 'broadcasting';
  const retry = () => (phase.k === 'error' && phase.signedHex ? send(phase.signedHex, price ?? 0n) : price !== null && start(price));

  return (
    <div className="side-box" aria-live="polite">
      <p className="label">{k.resell}</p>
      <label className="field">
        <span>{k.price}</span>
        <input inputMode="numeric" autoComplete="off" value={input} disabled={busy}
          onChange={(e) => { setInput(e.target.value.replace(/[^\d]/g, '')); if (phase.k !== 'review') setPhase({ k: 'review' }); setFee(undefined); }}
          aria-invalid={!!problem} aria-describedby="resell-hint" />
      </label>
      <p id="resell-hint" className="fine">{problem ?? `${r.min} ${fmtNum(min)} sats · ${r.royaltyRule}`}</p>
      {preview && seller && royalty && (
        <dl className="rows">
          <div><dt>{k.youGet}</dt><dd>{fmtNum(seller.sats)}</dd></div>
          <div className="accent"><dt>{k.royalty}</dt><dd>{fmtNum(royalty.sats)}</dd></div>
          <div><dt>{k.fee}</dt><dd>{fee !== undefined ? fmtNum(fee) : '≈ 1,000'}</dd></div>
        </dl>
      )}

      {phase.k === 'review' && (
        <>
          <button type="button" className="btn btn-outline btn-block" disabled={!preview || price === state.price} onClick={() => price !== null && start(price)}>
            {state.price > 0n ? k.change : k.list}
          </button>
          {state.price > 0n && <button type="button" className="btn btn-text btn-block" onClick={() => start(0n)}>{k.delist}</button>}
        </>
      )}
      {busy && <p className="wstatus">{b[phase.k as 'building' | 'signing' | 'broadcasting']}</p>}
      {phase.k === 'signing' && <button type="button" className="btn btn-text btn-block" onClick={() => wallet.cancelPending()}>{b.cancel}</button>}
      {phase.k === 'done' && (
        <>
          <p className="wstatus wstatus-ok">{phase.price === 0n ? r.delisted : r.listed}</p>
          <a className="btn btn-ghost btn-block" href={explorerTx(phase.txid)} target="_blank" rel="noreferrer">{b.viewTx} ↗</a>
        </>
      )}
      {phase.k === 'error' && (
        <div className="wproblem" role="alert">
          <p className="warn">{phase.message}</p>
          {phase.message !== r.changed && <button type="button" className="btn btn-primary btn-block" onClick={retry}>{b.retry}</button>}
        </div>
      )}
    </div>
  );
}
