import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { wallet, type WalletState } from '../wallet/wizard';
import { useWallet } from '../wallet/useWallet';
import type { Strings } from '../content/i18n';

// How long each waiting phase may last before we show a human message + retry.
const SCAN_TIMEOUT_MS = 120_000;
const APPROVE_TIMEOUT_MS = 90_000;

type Phase = 'preparing' | 'scan' | 'approve' | 'connected' | 'ended';

export function phaseOf(s: WalletState): Phase {
  if (s.approved) return 'connected';
  if (s.relay === 'disconnected') return 'ended';
  if (s.walletName) return 'approve';   // first wallet_ready came in (paths still empty)
  if (s.qrUri) return 'scan';
  return 'preparing';
}

const short = (a: string) => {
  const [prefix, body] = a.split(':');
  return body ? `${prefix}:${body.slice(0, 8)}…${body.slice(-6)}` : a;
};
const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function WalletConnect({ open, onClose, t }: { open: boolean; onClose: () => void; t: Strings }) {
  const w = t.wallet;
  const s = useWallet();
  const phase = phaseOf(s);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Start a pairing when the sheet opens with no session
  useEffect(() => {
    if (open && s.relay === 'idle') wallet.connect();
  }, [open, s.relay]);

  // Phase timers: a waiting phase that lasts too long turns into a message with "Try again"
  useEffect(() => {
    setTimedOut(false);
    if (!open || (phase !== 'scan' && phase !== 'approve')) return;
    const id = setTimeout(() => setTimedOut(true), phase === 'scan' ? SCAN_TIMEOUT_MS : APPROVE_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [open, phase, s.qrUri]);

  useEffect(() => {
    if (canvas.current && s.qrUri && phase === 'scan') {
      QRCode.toCanvas(canvas.current, s.qrUri, { width: 220, margin: 1, color: { dark: '#16161a', light: '#ffffff' } })
        .catch(() => { /* the copy-link fallback stays available */ });
    }
  }, [s.qrUri, phase, open]);

  if (!open) return null;

  const retry = () => { setTimedOut(false); wallet.connect(); };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(s.pairingUri ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  // Which numbered step is active: 1–2 while scanning, 3 while approving, all done when connected
  const active = phase === 'preparing' || phase === 'scan' ? 2 : phase === 'approve' ? 3 : 4;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={w.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{phase === 'connected' ? w.connectedTitle : w.title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label={w.done}>×</button>
        </div>

        {phase !== 'connected' && (
          <ol className="wsteps">
            {w.steps.map((label, i) => {
              const n = i + 1;
              const state = n < active ? 'done' : n === active ? 'now' : 'next';
              return (
                <li key={n} className={`wstep wstep-${state}`}>
                  <span className="wstep-n" aria-hidden>{state === 'done' ? '✓' : n}</span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="wbody" aria-live="polite">
          {phase === 'preparing' && <p className="wstatus"><span className="spinner" aria-hidden /> {w.preparing}</p>}

          {phase === 'scan' && !timedOut && (
            <>
              <canvas ref={canvas} className="qr" aria-label="QR code" />
              {isTouch() && s.pairingUri && (
                <>
                  <p className="fine center">{w.scanHint}</p>
                  <a className="btn btn-primary" href={s.pairingUri}>{w.openInSelene}</a>
                </>
              )}
              <button type="button" className="btn btn-ghost" onClick={copyLink}>{copied ? w.copied : w.copyLink}</button>
            </>
          )}

          {phase === 'approve' && !timedOut && (
            <p className="wstatus"><span className="spinner" aria-hidden /> {w.waitingApproval}</p>
          )}

          {timedOut && (phase === 'scan' || phase === 'approve') && (
            <div className="wproblem">
              <p>{phase === 'scan' ? w.timeoutScan : w.timeoutApprove}</p>
              <button type="button" className="btn btn-primary" onClick={retry}>{w.retry}</button>
            </div>
          )}

          {phase === 'ended' && (
            <div className="wproblem">
              <p>{w.ended}</p>
              <button type="button" className="btn btn-primary" onClick={retry}>{w.retry}</button>
            </div>
          )}

          {phase === 'connected' && (
            <>
              <p className="wstatus wstatus-ok">{w.connected}{s.walletName ? ` · ${s.walletName}` : ''}</p>
              {s.networkMismatch && <p className="warn">{w.wrongNetwork}</p>}
              {s.tokenAddress && (
                <>
                  <p className="fine">{w.yourAddress}</p>
                  <code className="addr" title={s.tokenAddress}>{short(s.tokenAddress)}</code>
                  <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(s.tokenAddress!).catch(() => {})}>{w.copyAddress}</button>
                </>
              )}
              {s.pending && <p className="wstatus"><span className="spinner" aria-hidden /> {w.signing}</p>}
              <button type="button" className="btn btn-primary" onClick={onClose}>{w.done}</button>
              <button type="button" className="btn btn-text" onClick={() => wallet.disconnect()}>{w.disconnect}</button>
            </>
          )}

          {s.relay === 'reconnecting' && phase !== 'ended' && <p className="fine center">{w.reconnecting}</p>}
        </div>
      </div>
    </div>
  );
}

export function WalletChip({ onOpen, label, connectedLabel }: { onOpen: () => void; label: string; connectedLabel: string }) {
  const s = useWallet();
  const on = phaseOf(s) === 'connected';
  const addr = s.tokenAddress?.split(':')[1];
  return (
    <button type="button" className={`btn wallet-chip ${on ? 'on' : 'btn-primary'}`} onClick={onOpen}>
      {on && addr
        ? <><span className="dot" aria-hidden>{s.relay === 'connected' ? '●' : '○'}</span>{connectedLabel} · {addr.slice(0, 3)}…{addr.slice(-4)}</>
        : label}
    </button>
  );
}
