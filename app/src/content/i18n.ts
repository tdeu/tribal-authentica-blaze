import type { Lang } from './mask';

// UI strings. The mask's own story lives in mask.ts.
export const T = {
  fr: {
    by: 'par',
    royaltyLine: '90 % pour l’artisan, 10 % de chaque revente, pour toujours',
    story: 'L’histoire',
    buy: 'Acheter en Bitcoin Cash',
    connectFirst: 'Connectez votre portefeuille pour acheter',
    checkoutSoon: 'Portefeuille connecté. Le paiement arrive à l’étape suivante.',
    certificateNote: 'Le certificat NFT reste dans le contrat : il ne peut changer de propriétaire qu’en payant l’artisan.',
  },
  en: {
    by: 'by',
    royaltyLine: '90% to the artisan, 10% of every resale, forever',
    story: 'The story',
    buy: 'Buy with Bitcoin Cash',
    connectFirst: 'Connect your wallet to buy',
    checkoutSoon: 'Wallet connected. Checkout comes in the next step.',
    certificateNote: 'The NFT certificate stays in the contract: it can only change owner by paying the artisan.',
  },
} satisfies Record<Lang, Record<string, string>>;
