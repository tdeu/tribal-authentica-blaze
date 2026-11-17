import { useState } from 'react';
import { LINKS, isPlaceholder } from '../config';

// Required on every demo page (BCH BLAZE 2026): repo, pre-existing code, frozen "before" demo,
// deck, CashTokens donation address. One thin line; on narrow screens it scrolls sideways inside itself.
function Item({ label, href }: { label: string; href: string }) {
  return isPlaceholder(href)
    ? <span className="blaze-todo" title={`${label}: coming soon`}>{label}</span>
    : <a href={href} target="_blank" rel="noreferrer">{label} ↗</a>;
}

const shortAddr = (a: string) => {
  const [prefix, body = a] = a.split(':');
  return `${prefix}:${body.slice(0, 6)}…${body.slice(-4)}`;
};

export function BlazeBanner({ donate }: { donate: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(LINKS.donation); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="blaze" role="navigation" aria-label="BCH BLAZE 2026">
      <span className="blaze-title">BCH BLAZE 2026</span>
      <Item label="REPO" href={LINKS.repo} />
      <Item label="PRE-HACKATHON CODE" href={LINKS.prepTag} />
      <Item label="BEFORE DEMO" href={LINKS.beforeDemo} />
      <Item label="DECK" href={LINKS.deck} />
      <button type="button" className="blaze-donate" onClick={copy} title={LINKS.donation} aria-label={`Copy donation address ${LINKS.donation}`}>
        {donate} · {copied ? 'copied ✓' : shortAddr(LINKS.donation)}
      </button>
    </div>
  );
}
