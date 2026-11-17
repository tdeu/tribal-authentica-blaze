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
  // EMBER2026 = BCH BLAZE Community Choice voting token, sent to this CashTokens address.
  // Click copies the full address (fallback for non-secure contexts, e.g. phone over LAN http).
  const copy = async () => {
    const a = LINKS.donation;
    let ok = false;
    try { await navigator.clipboard.writeText(a); ok = true; } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = a; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch { /* ignore */ }
    }
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };
  return (
    <div className="blaze" role="navigation" aria-label="BCH BLAZE 2026">
      <span className="blaze-title">BCH BLAZE 2026</span>
      <Item label="REPO" href={LINKS.repo} />
      <Item label="PRE-HACKATHON CODE" href={LINKS.prepTag} />
      <Item label="BEFORE DEMO" href={LINKS.beforeDemo} />
      <Item label="DECK" href={LINKS.deck} />
      <button type="button" className="blaze-donate" onClick={copy} title={LINKS.donation} aria-label={`Copy the CashTokens address for EMBER2026 donations and votes: ${LINKS.donation}`}>
        {donate} · {copied ? 'Copied ✓' : shortAddr(LINKS.donation)}
        <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
      </button>
    </div>
  );
}
