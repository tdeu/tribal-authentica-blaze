import { useState } from 'react';
import { LINKS, isPlaceholder } from '../config';

// Required on every demo page (BCH BLAZE 2026): repo, pre-existing code, frozen "before" demo,
// deck, CashTokens donation address. Kept to one thin line so it never pushes the mask below
// the fold; on narrow screens the line scrolls sideways inside the banner (not the page).
function Item({ label, href }: { label: string; href: string }) {
  return isPlaceholder(href)
    ? <span className="blaze-item blaze-todo" title={`${label}: coming soon`}>{label}</span>
    : <a className="blaze-item" href={href} target="_blank" rel="noreferrer">{label}</a>;
}

const shortAddr = (a: string) => {
  const body = a.split(':')[1] ?? a;
  return `${body.slice(0, 6)}…${body.slice(-5)}`;
};

export function BlazeBanner() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(LINKS.donation); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <header className="blaze">
      <div className="blaze-line">
        <strong className="blaze-title">BCH BLAZE 2026</strong>
        <Item label="Repo" href={LINKS.repo} />
        <Item label="Pre-hackathon code" href={LINKS.prepTag} />
        <Item label="Before demo" href={LINKS.beforeDemo} />
        <Item label="Deck" href={LINKS.deck} />
        <button type="button" className="blaze-donate" onClick={copy} title={LINKS.donation}
          aria-label={`Copy donation address ${LINKS.donation}`}>
          Donate <code>{copied ? 'copied ✓' : shortAddr(LINKS.donation)}</code>
        </button>
      </div>
    </header>
  );
}
