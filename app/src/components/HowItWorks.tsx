import type { Lang } from '../content/mask';
import { LINKS } from '../config';

// The technical detail lives here, off the main path.
const COPY = {
  en: {
    title: 'How it works',
    items: [
      ['The certificate', 'Each mask has one certificate: a CashTokens NFT on Bitcoin Cash. It stays locked in a smart contract (a CashScript covenant) and records who owns the mask, its price and its last sale price.'],
      ['When you buy', 'Your wallet pays in one transaction: 90% goes straight to the artisan, 10% to Emtée, and the certificate is updated with your name as owner. No middleman holds the money.'],
      ['Every resale', 'The certificate can only change owner through the contract, and the contract always sends the artisan a royalty: 10% of the price, never less than 10% of the last sale, with a small minimum. Selling “cheap” to a friend doesn’t dodge it.'],
      ['Your wallet', 'You connect Selene with WizardConnect. The app builds the transaction, Selene shows it and signs it, and nothing moves without your approval. The certificate isn’t shown in your wallet: this site reads ownership from the contract.'],
    ],
    code: 'Open-source code and contract tests',
    close: 'Close',
  },
  fr: {
    title: 'Comment ça marche',
    items: [
      ['Le certificat', 'Chaque masque a un certificat : un NFT CashTokens sur Bitcoin Cash. Il reste verrouillé dans un contrat (un covenant CashScript) qui enregistre le propriétaire, le prix et le prix de la dernière vente.'],
      ['À l’achat', 'Votre portefeuille paie en une seule transaction : 90 % directement à l’artisan, 10 % à Emtée, et le certificat passe à votre nom. Aucun intermédiaire ne garde l’argent.'],
      ['À chaque revente', 'Le certificat ne change de propriétaire que via le contrat, qui verse toujours une redevance à l’artisan : 10 % du prix, jamais moins de 10 % de la dernière vente, avec un petit minimum. Revendre « pas cher » à un ami ne la contourne pas.'],
      ['Votre portefeuille', 'Vous connectez Selene avec WizardConnect. Le site prépare la transaction, Selene l’affiche et la signe : rien ne bouge sans votre accord. Le certificat n’apparaît pas dans le portefeuille : ce site lit le propriétaire dans le contrat.'],
    ],
    code: 'Code source et tests du contrat',
    close: 'Fermer',
  },
} as const;

export function HowItWorks({ open, onClose, lang }: { open: boolean; onClose: () => void; lang: Lang }) {
  if (!open) return null;
  const c = COPY[lang];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={c.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{c.title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={c.close}>×</button>
        </div>
        <dl className="how">
          {c.items.map(([dt, dd]) => (<div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>))}
        </dl>
        <a className="btn btn-ghost" href={LINKS.repo} target="_blank" rel="noreferrer">{c.code}</a>
      </div>
    </div>
  );
}
