import { useEffect, useRef, useState } from 'react';
import { wallet, RECEIVE, PATH_NAME } from '../wallet/wizard';
import { walletUtxos, checkSigned, broadcast, provider } from '../wallet/chain';
import { toWire } from '../wallet/wire';
import { buildBuy, payoutsOf, readState, type BuiltBuy, type Payout } from '../chain/vault';
import type { Live } from '../chain/live';
import { CONTRACT, type MaskView } from '../content/mask';
import type { Strings } from '../content/i18n';
import { explorerTx } from '../config';
import { fmtUsd } from '../price';
import { fmtSats, useUsdOf } from './Price';

// Buy flow: review (split shown BEFORE signing) → building → signing → broadcasting → confirmed,
// or error + retry. A signed tx is kept: "Try again" after a broadcast error re-sends the SAME tx
// (broadcast is idempotent) instead of asking the wallet to sign again.
type Phase =
  | { k: 'review' } | { k: 'building' } | { k: 'signing' } | { k: 'broadcasting' }
  | { k: 'confirmed'; txid: string }
  | { k: 'error'; message: string; signedHex?: string };

export function BuySheet({ mask, live, t, onClose }: { mask: MaskView; live: Live; t: Strings; onClose: () => void }) {
  const b = t.buySheet;
  const [phase, setPhase] = useState<Phase>({ k: 'review' });
  const [fee, setFee] = useState<bigint>();
  const { usdOf } = useUsdOf();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const set = (p: Phase) => { if (alive.current) setPhase(p); };

  const state = live.state!;
  const vault = live.vault!;
  const { kind, payouts } = payoutsOf(state, vault, CONTRACT);
  const usd = (sats: bigint) => { const u = usdOf(sats); return u === null ? '' : `≈ ${fmtUsd(u)} `; };
  const label = (p: Payout) =>
    p.role === 'custodian' ? (kind === 'first' ? b.toCustodian : b.royalty) : p.role === 'platform' ? b.toPlatform : b.toSeller;

  const send = async (signedHex: string) => {
    set({ k: 'broadcasting' });
    try {
      const txid = await broadcast(signedHex);
      set({ k: 'confirmed', txid });
      live.refresh();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      // The vault UTXO was spent by someone else between our read and the broadcast
      if (/missing|spent|conflict|mempool-conflict|bad-txns-inputs/i.test(msg)) { set({ k: 'error', message: b.soldMeanwhile }); live.refresh(); return; }
      set({ k: 'error', message: `${b.errorNetwork} ${msg}`, signedHex });
    }
  };

  const start = async () => {
    set({ k: 'building' });
    let built: BuiltBuy;
    try {
      const me = wallet.addressAt(RECEIVE, 0);
      if (!me) throw new Error(b.connectFirst);
      const fresh = await readState(provider, vault, mask.mint!); // never build on a stale read
      if (fresh.price <= 0n || fresh.utxo.txid !== state.utxo.txid) { set({ k: 'error', message: b.soldMeanwhile }); live.refresh(); return; }
      const utxos = (await walletUtxos()).map((u) => ({ ...u, pathName: PATH_NAME[u.path] }));
      built = buildBuy(provider, vault, fresh, CONTRACT, { pkh: me.pkh, changeAddress: me.address, utxos }, `Tribal Authentica — buy mask ${mask.ref}`);
      setFee(built.fee);
    } catch (e) {
      set({ k: 'error', message: `${b.errorOurs} ${String((e as Error)?.message ?? e)}` });
      return;
    }
    const wire = toWire(built.wc);
    set({ k: 'signing' });
    const out = await wallet.sign(wire, built.inputPaths);
    if (!out.ok) {
      set({ k: 'error', message: out.side === 'timeout' ? b.errorTimeout : out.side === 'wallet' ? `${b.errorWallet} ${out.message}` : out.message });
      return;
    }
    const problem = checkSigned(wire.transaction, out.signedHex);
    if (problem) { set({ k: 'error', message: `${b.errorWallet} ${problem}` }); return; }
    await send(out.signedHex);
  };

  const retry = () => (phase.k === 'error' && phase.signedHex ? send(phase.signedHex) : start());
  const busy = phase.k === 'building' || phase.k === 'signing' || phase.k === 'broadcasting';

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={b.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{b.title}</h2>
          {!busy && <button type="button" className="icon-btn" onClick={onClose} aria-label={b.close}>×</button>}
        </div>
        <p className="fine">{mask.name} · {mask.ref}</p>

        <dl className="bill">
          <div className="bill-total"><dt>{b.youPay}</dt><dd>{usd(state.price)}<small>{fmtSats(state.price)}</small></dd></div>
          <div className="bill-cap"><dt>{b.where}</dt></div>
          {payouts.map((p) => (
            <div key={p.role}><dt>{label(p)}</dt><dd>{usd(p.sats)}<small>{fmtSats(p.sats)}</small></dd></div>
          ))}
          <div className="bill-fee"><dt>{b.fee}</dt><dd><small>{fee !== undefined ? fmtSats(fee) : '≈ 1,000 sats'}</small></dd></div>
        </dl>
        <p className="split-line">
          {payouts.map((p) => `${usd(p.sats) || fmtSats(p.sats) + ' '}${label(p)}`).join(' · ')}
        </p>

        <div className="wbody" aria-live="polite">
          {phase.k === 'review' && (
            <button type="button" className="btn btn-primary btn-buy" onClick={start} disabled={wallet.state.pending}>{b.confirm}</button>
          )}
          {(phase.k === 'building' || phase.k === 'signing' || phase.k === 'broadcasting') && (
            <p className="wstatus"><span className="spinner" aria-hidden />{b[phase.k]}</p>
          )}
          {phase.k === 'signing' && (
            <button type="button" className="btn btn-text" onClick={() => wallet.cancelPending()}>{b.cancel}</button>
          )}
          {phase.k === 'confirmed' && (
            <>
              <p className="wstatus wstatus-ok">{b.confirmed}</p>
              <p className="fine center">{b.confirmedNote}</p>
              <a className="btn btn-ghost" href={explorerTx(phase.txid)} target="_blank" rel="noreferrer">{b.viewTx}</a>
              <button type="button" className="btn btn-primary" onClick={onClose}>{b.viewCert}</button>
            </>
          )}
          {phase.k === 'error' && (
            <div className="wproblem" role="alert">
              <p className="warn">{phase.message}</p>
              {phase.message !== b.soldMeanwhile && <button type="button" className="btn btn-primary" onClick={retry}>{b.retry}</button>}
              <button type="button" className="btn btn-text" onClick={onClose}>{b.close}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
