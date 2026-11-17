import { useEffect, useRef, useState } from 'react';
import { wallet, RECEIVE, PATH_NAME } from '../wallet/wizard';
import { walletUtxos, checkSigned, broadcast, provider } from '../wallet/chain';
import { toWire } from '../wallet/wire';
import { buildList, listProblem, minResalePrice, payoutsOf, readState } from '../chain/vault';
import type { Live } from '../chain/live';
import { CONTRACT, type MaskView } from '../content/mask';
import type { Strings } from '../content/i18n';
import { explorerTx } from '../config';
import { fmtUsd } from '../price';
import { fmtSats, useUsdOf } from './Price';

// Resell flow for the holder: price → split shown live (royalty BEFORE signing) → Selene signs list()
// (owner signature on the vault input + fee inputs) → broadcast. Same phases and retry rules as BuySheet.
type Phase =
  | { k: 'review' } | { k: 'building' } | { k: 'signing' } | { k: 'broadcasting' }
  | { k: 'done'; txid: string; price: bigint }
  | { k: 'error'; message: string; signedHex?: string };

export function ResellSheet({ mask, live, t, onClose }: { mask: MaskView; live: Live; t: Strings; onClose: () => void }) {
  const r = t.cert.resell;
  const b = t.buySheet;
  const state = live.state!;
  const vault = live.vault!;
  const min = minResalePrice(state.lastSalePrice, CONTRACT);
  const [input, setInput] = useState(String(state.price > 0n ? state.price : state.lastSalePrice > min ? state.lastSalePrice : min));
  const [phase, setPhase] = useState<Phase>({ k: 'review' });
  const [fee, setFee] = useState<bigint>();
  const { usdOf } = useUsdOf();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const set = (p: Phase) => { if (alive.current) setPhase(p); };

  const price = /^\d{1,15}$/.test(input.trim()) ? BigInt(input.trim()) : null;
  const problem = price === null ? `${r.min} ${fmtSats(min)}` : price === 0n ? null : listProblem(state, CONTRACT, price);
  const preview = price !== null && price > 0n && !problem ? payoutsOf({ ...state, price }, vault, CONTRACT) : null;
  const seller = preview?.payouts.find((p) => p.role === 'seller');
  const royalty = preview?.payouts.find((p) => p.role === 'custodian');
  const usd = (sats: bigint) => { const u = usdOf(sats); return u === null ? '' : `≈ ${fmtUsd(u)} `; };

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
    let built;
    try {
      const me = wallet.addressAt(RECEIVE, 0);
      if (!me) throw new Error(b.connectFirst);
      const fresh = await readState(provider, vault, mask.mint!);
      if (fresh.utxo.txid !== state.utxo.txid) { set({ k: 'error', message: r.changed }); live.refresh(); return; }
      const utxos = (await walletUtxos()).map((u) => ({ ...u, pathName: PATH_NAME[u.path] }));
      built = buildList(provider, vault, fresh, CONTRACT,
        { pkh: me.pkh, changeAddress: me.address, utxos, path: [PATH_NAME[RECEIVE], 0] }, newPrice,
        newPrice === 0n ? `Tribal Authentica — take mask ${mask.ref} off sale` : `Tribal Authentica — resell mask ${mask.ref}`);
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
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={r.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{r.title}</h2>
          {!busy && <button type="button" className="icon-btn" onClick={onClose} aria-label={b.close}>×</button>}
        </div>
        <p className="fine">{mask.name} · {mask.ref}</p>

        {phase.k === 'review' && (
          <>
            <p className="fine">{r.lead}</p>
            <label className="field">
              <span>{r.price}</span>
              <input inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value.replace(/[^\d]/g, ''))} aria-invalid={!!problem} />
            </label>
            <p className={problem ? 'fine warn' : 'fine'}>{problem ?? `${r.min} ${fmtSats(min)}`}</p>
          </>
        )}

        {preview && seller && royalty && phase.k !== 'done' && (
          <dl className="bill">
            <div className="bill-total"><dt>{r.buyerPays}</dt><dd>{usd(price!)}<small>{fmtSats(price!)}</small></dd></div>
            <div><dt>{r.youGet}</dt><dd>{usd(seller.sats)}<small>{fmtSats(seller.sats)}</small></dd></div>
            <div><dt>{r.royalty}<br /><small className="fine">{r.royaltyRule}</small></dt><dd>{usd(royalty.sats)}<small>{fmtSats(royalty.sats)}</small></dd></div>
            <div className="bill-fee"><dt>{r.fee}</dt><dd><small>{fee !== undefined ? fmtSats(fee) : '≈ 1,000 sats'}</small></dd></div>
          </dl>
        )}

        <div className="wbody" aria-live="polite">
          {phase.k === 'review' && (
            <>
              <button type="button" className="btn btn-primary btn-buy" disabled={!preview || price === state.price} onClick={() => price !== null && start(price)}>{r.confirm}</button>
              {state.price > 0n && <button type="button" className="btn btn-ghost" onClick={() => start(0n)}>{r.delist}</button>}
            </>
          )}
          {busy && <p className="wstatus"><span className="spinner" aria-hidden />{b[phase.k as 'building' | 'signing' | 'broadcasting']}</p>}
          {phase.k === 'signing' && <button type="button" className="btn btn-text" onClick={() => wallet.cancelPending()}>{b.cancel}</button>}
          {phase.k === 'done' && (
            <>
              <p className="wstatus wstatus-ok">{phase.price === 0n ? r.delisted : r.listed}</p>
              <a className="btn btn-ghost" href={explorerTx(phase.txid)} target="_blank" rel="noreferrer">{b.viewTx}</a>
              <button type="button" className="btn btn-primary" onClick={onClose}>{b.close}</button>
            </>
          )}
          {phase.k === 'error' && (
            <div className="wproblem" role="alert">
              <p className="warn">{phase.message}</p>
              {phase.message !== r.changed && <button type="button" className="btn btn-primary" onClick={retry}>{b.retry}</button>}
              <button type="button" className="btn btn-text" onClick={onClose}>{b.close}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
