// Demo mask content. Everything in [BRACKETS] is a placeholder to be replaced with real,
// artisan-approved content. Do not invent names, places or stories here.

export type Lang = 'fr' | 'en';

export const MASK = {
  name: '[MASK_NAME]',
  artisan: '[ARTISAN_NAME]',
  origin: '[ORIGIN]',
  // Demo price in USD. Once the mask is minted, priceSats (fixed on-chain) takes over and
  // the USD figure is derived from it at the live rate.
  priceUsd: 1,
  priceSats: null as number | null,
  photo: null as string | null, // URL of the mask photo; null = placeholder
  story: {
    fr: '[HISTOIRE DU MASQUE — texte validé par l’artisan, en français]',
    en: '[MASK STORY — artisan-approved text, in English]',
  } satisfies Record<Lang, string>,
};

// Split rules, mirrored from the contract parameters (contracts/SPEC.md)
export const ARTISAN_SHARE_FIRST_SALE = 0.9;
export const PLATFORM_SHARE_FIRST_SALE = 0.1;
export const RESALE_ROYALTY = 0.1;
export const PLATFORM_NAME = 'Emtée';
