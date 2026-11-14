import { useState } from 'react';
import { LINKS, NETWORK, isPlaceholder } from '../config';

// Required on every demo page (BCH BLAZE 2026): repo, pre-existing code, frozen "before" demo,
// deck, and a CashTokens donation address. Placeholders render as plain text, not links.
function Item({ label, href }: { label: string; href: string }) {
  return isPlaceholder(href)
    ? <span className="blaze-item blaze-todo" title="placeholder">{label} {href}</span>
    : <a className="blaze-item" href={href} target="_blank" rel="noreferrer">{label}</a>;
}

export function BlazeBanner() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(LINKS.donation); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <header className="blaze" role="banner">
      <div className="blaze-row">
        <strong className="blaze-title">Built for BCH BLAZE 2026</strong>
        {NETWORK !== 'mainnet' && <span className="blaze-net">{NETWORK}</span>}
      </div>
      <nav className="blaze-row blaze-links" aria-label="Hackathon links">
        <Item label="Repo" href={LINKS.repo} />
        <Item label="Pre-hackathon code" href={LINKS.prepTag} />
        <Item label="Before demo" href={LINKS.beforeDemo} />
        <Item label="Deck" href={LINKS.deck} />
      </nav>
      <div className="blaze-row blaze-donate">
        <span>Donate (CashTokens):</span>
        <code className="blaze-addr">{LINKS.donation}</code>
        {!isPlaceholder(LINKS.donation) && (
          <button type="button" className="blaze-copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        )}
      </div>
    </header>
  );
}
