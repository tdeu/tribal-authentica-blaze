// Mask content comes from src/data/masks.json (the same file the fingerprint and mint scripts use).
// Everything in [BRACKETS] there is a placeholder for content the custodian provides and approves.
// Do not invent names, places or stories.
import data from '../data/masks.json';
import { NETWORK } from '../config';
import type { Photo } from '../data/fingerprint';
import type { MintRecord } from '../chain/vault';

export type Lang = 'fr' | 'en';

export const COLLECTION = data;
export const DEMO_NOTICE: Record<Lang, string> = data.demoNotice;
export const CONTRACT = data.contract;

export type MaskView = {
  catalogueId: number;
  ref: string;                 // "001"
  name: string;                // English title (prompts, logs)
  names: Record<Lang, string>; // title shown to people, per language
  custodian: string;
  country: string;             // origin, as known ([COUNTRY] until provided); fingerprinted
  story: Record<Lang, string>;
  photo: string | null;
  photos: string[];            // every photo, in fingerprint order
  region: string | null;       // display only (not fingerprinted)
  details: Record<Lang, string> | null; // display only, e.g. "Carved wood · brass plates · wool"
  fingerprint: string | null;  // as recorded in masks.json (Verify recomputes it)
  priceSats: number;           // this network's listed price (before mint too)
  // Set on this network once minted. No mint = not for sale yet: Buy says "Coming soon".
  mint: MintRecord | null;
  // Demo price ≈ $1 (USD before mint; after mint the on-chain sats are the reference)
  priceUsd: number;
};

// Placeholders ([LIKE_THIS]) are never shown: a missing value is hidden, a missing title becomes "Mask 00X".
const isPlaceholder = (s: string | undefined | null) => !s || /[[A-Z0-9_ ]+.*]/.test(s);
const real = (s: string | undefined | null) => (isPlaceholder(s) ? null : s!);

export const MASKS: MaskView[] = data.masks.map((m) => {
  const photos = m.photos as Photo[];
  const mint = (m.mint as Record<string, MintRecord | null>)[NETWORK] ?? null;
  const categoryId = (m.categoryId as Record<string, string | null>)[NETWORK] ?? null;
  return {
    catalogueId: m.catalogueId,
    ref: String(m.catalogueId).padStart(3, '0'),
    name: real(m.title.en) ?? `Mask ${String(m.catalogueId).padStart(3, '0')}`,
    names: {
      en: real(m.title.en) ?? `Mask ${String(m.catalogueId).padStart(3, '0')}`,
      fr: real(m.title.fr) ?? `Masque ${String(m.catalogueId).padStart(3, '0')}`,
    },
    custodian: real(m.custodianLabel) ?? '',
    country: real((m as { country?: string }).country) ?? '',
    region: real((m as { region?: string }).region),
    details: (m as { details?: Record<Lang, string> }).details ?? null,
    story: { fr: real(m.story.fr) ?? '', en: real(m.story.en) ?? '' },
    photo: photos.length ? `/${photos[0].file}` : null,
    photos: photos.map((p) => `/${p.file}`),
    fingerprint: m.fingerprint,
    priceSats: (m.priceSats as Record<string, number>)[NETWORK],
    mint: mint && categoryId ? mint : null,
    priceUsd: 1,
  };
});

export const maskById = (id: number) => MASKS.find((m) => m.catalogueId === id);

// Split rules, mirrored from the contract parameters (contracts/SPEC.md)
export const CUSTODIAN_SHARE_FIRST_SALE = 1 - data.contract.platformBps / 10000;
export const PLATFORM_SHARE_FIRST_SALE = data.contract.platformBps / 10000;
export const RESALE_ROYALTY = data.contract.royaltyBps / 10000;
export const PLATFORM_NAME = 'Sankofa';
