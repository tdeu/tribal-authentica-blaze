import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { wallet } from '../wallet/wizard';
import { useWallet } from '../wallet/useWallet';
import { NETWORK } from '../config';

const short = (a: string) => {
  const [prefix, body] = a.split(':');
  return `${prefix}:${body.slice(0, 8)}…${body.slice(-6)}`;
};

// Connect sheet: QR + "Copy connection link" fallback, approval hint, connected z… address.
export function WalletConnect({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useWallet();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && s.relay === 'idle') wallet.connect();
  }, [open, s.relay]);

  useEffect(() => {
    if (canvas.current && s.qrUri && !s.approved) {
      QRCode.toCanvas(canvas.current, s.qrUri, { width: 232, margin: 1, color: { dark: '#1b1b1f', light: '#ffffff' } });
    }
  }, [s.qrUri, s.approved, open]);

  if (!open) return null;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(s.pairingUri ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Connect wallet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{s.approved ? 'Wallet connected' : 'Connect with Selene'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!s.approved && (
          <>
            <ol className="steps">
              <li>Open <b>Selene</b> on your phone ({NETWORK}).</li>
              <li>Scan this code with Selene's WizardConnect scanner.</li>
              <li>Tap <b>Connect</b> in Selene's dialog. Nothing works until you approve.</li>
            </ol>
            <canvas ref={canvas} className="qr" aria-label="WizardConnect QR code" />
            <button type="button" className="btn btn-ghost" onClick={copyLink} disabled={!s.pairingUri}>
              {copied ? 'Link copied' : 'Copy connection link'}
            </button>
            {s.walletName && <p className="hint">{s.walletName} found. Waiting for you to approve in the app…</p>}
            {s.dappKey && <p className="fine">Connection key (compare in Selene): <code>{s.dappKey.slice(0, 16)}…</code></p>}
          </>
        )}

        {s.approved && s.tokenAddress && (
          <>
            {s.networkMismatch && (
              <p className="warn">Your wallet is on {s.walletNetwork}, this app is on {NETWORK}. Switch Selene's network.</p>
            )}
            <p className="fine">Your token address</p>
            <code className="addr" title={s.tokenAddress}>{short(s.tokenAddress)}</code>
            <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(s.tokenAddress!)}>Copy address</button>
            <button type="button" className="btn btn-text" onClick={() => wallet.disconnect()}>Disconnect</button>
          </>
        )}

        <p className={`status status-${s.relay}`}>
          Relay: {s.relay}{s.relay === 'reconnecting' ? ' (normal, it reconnects by itself)' : ''}
        </p>
        {s.pending && <p className="hint">Approve the request in Selene. Keep this tab open in front.</p>}
      </div>
    </div>
  );
}

export function WalletChip({ onOpen }: { onOpen: () => void }) {
  const s = useWallet();
  return (
    <button type="button" className={`chip ${s.approved ? 'chip-on' : ''}`} onClick={onOpen}>
      <span className={`dot dot-${s.approved ? s.relay : 'idle'}`} aria-hidden />
      {s.approved && s.tokenAddress ? short(s.tokenAddress) : 'Connect wallet'}
    </button>
  );
}
