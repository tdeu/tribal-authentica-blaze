// Mask content comes from src/data/masks.json (the same file the fingerprint and mint scripts use).
// Everything in [BRACKETS] there is a placeholder for content the custodian provides and approves.
// Do not invent names, places or stories.
import data from '../data/masks.json';
import { NETWORK } from '../config';
import type { Photo } from '../data/fingerprint';

export type Lang = 'fr' | 'en';

export const COLLECTION = data;
export const DEMO_NOTICE: Record<Lang, string> = data.demoNotice;

// Screen 1 shows the first mask until the gallery lands (step 2).
const m = data.masks[0];
const mint = m.mint[NETWORK] as { priceSats: number } | null;
const photos = m.photos as Photo[];

export const MASK = {
  catalogueId: m.catalogueId,
  name: m.title,
  custodian: m.custodianLabel,
  // Demo price ≈ $1. Once minted, the on-chain price (sats, fixed in the commitment) takes over and
  // the USD figure is derived from it at the live rate.
  priceUsd: 1,
  priceSats: mint ? mint.priceSats : null,
  photo: photos.length ? `/${photos[0].file}` : null,
  story: m.story satisfies Record<Lang, string>,
  // Before the first sale the on-chain owner is the custodian's key: that is "not yet sold".
  sold: false,
};

// Split rules, mirrored from the contract parameters (contracts/SPEC.md)
export const CUSTODIAN_SHARE_FIRST_SALE = 1 - data.contract.platformBps / 10000;
export const PLATFORM_SHARE_FIRST_SALE = data.contract.platformBps / 10000;
export const RESALE_ROYALTY = data.contract.royaltyBps / 10000;
export const PLATFORM_NAME = 'Emtée';
