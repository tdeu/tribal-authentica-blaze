// Demo mask content. Everything in [BRACKETS] is a placeholder to be replaced with real,
// artisan-approved content. Do not invent names, places or stories here.

export type Lang = 'fr' | 'en';

export const MASK = {
  name: '[MASK_NAME]',
  artisan: '[ARTISAN_NAME]',
  origin: '[ORIGIN — town, Côte d’Ivoire]',
  // Set once the demo price (~$1 in BCH) is fixed at mint time. null = shows [PRICE].
  priceSats: null as number | null,
  photo: null as string | null, // URL of the mask photo; null = placeholder
  story: {
    fr: '[HISTOIRE DU MASQUE — texte validé par l’artisan, en français]',
    en: '[MASK STORY — artisan-approved text, in English]',
  } satisfies Record<Lang, string>,
};
