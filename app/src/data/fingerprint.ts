// Mask fingerprint: sha256 of the canonical JSON of a mask's content.
// Shared by scripts/fingerprint.ts (Node) and the certificate page's in-browser "Verify" (step 3),
// so both compute exactly the same bytes. Keep this file free of Node- or DOM-only APIs.
//
// Canonical JSON: object keys sorted (recursively), UTF-8, no whitespace, arrays kept in order.
// Photo hashes are listed in the fixed order of `photos[]` in masks.json.
//
// What is fingerprinted: catalogueId, title {fr, en}, story {fr, en}, custodianLabel, country, photo sha256s.
// What is NOT: payout addresses, price, category IDs (network-specific, and the price is in the commitment),
// and the display-only editorial fields region, details, subtitle and style (About this style).
import { sha256, binToHex, hexToBin, bigIntToBinUint64LE, utf8ToBin } from '@bitauth/libauth';

export type Photo = { file: string; sha256: string | null };

export type MaskContent = {
  catalogueId: number;
  title: { fr: string; en: string };
  story: { fr: string; en: string };
  custodianLabel: string;
  country: string;
  photos: Photo[];
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`canonical JSON: only safe integers allowed, got ${value}`);
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  throw new Error(`canonical JSON: unsupported type ${typeof value}`);
}

export function fingerprintPayload(m: MaskContent) {
  const photoHashes = m.photos.map((p, i) => {
    if (!p.sha256 || !/^[0-9a-f]{64}$/.test(p.sha256)) throw new Error(`mask ${m.catalogueId}: photo ${i} (${p.file}) has no sha256, run the fingerprint script`);
    return p.sha256;
  });
  return {
    catalogueId: m.catalogueId,
    title: { fr: m.title.fr, en: m.title.en },
    story: { fr: m.story.fr, en: m.story.en },
    custodianLabel: m.custodianLabel,
    country: m.country,
    photos: photoHashes,
  };
}

export const fingerprintHex = (m: MaskContent): string =>
  binToHex(sha256.hash(utf8ToBin(canonicalJson(fingerprintPayload(m)))));

// ---------------------------------------------------------------- 70-byte NFT commitment
//   catalogueId (2, LE) || fingerprint (32) || ownerPkh (20) || price (8, LE) || lastSalePrice (8, LE)
// The first 34 bytes are frozen by the RoyaltyVault on every list() and buy().

export const COMMITMENT_LENGTH = 70;

export function encodeCommitment(c: { catalogueId: number; fingerprint: string; ownerPkh: Uint8Array; price: bigint; lastSalePrice: bigint }): Uint8Array {
  if (!Number.isInteger(c.catalogueId) || c.catalogueId < 0 || c.catalogueId > 0xffff) throw new Error(`catalogueId out of range: ${c.catalogueId}`);
  const fp = hexToBin(c.fingerprint);
  if (fp.length !== 32) throw new Error('fingerprint must be 32 bytes');
  if (c.ownerPkh.length !== 20) throw new Error('ownerPkh must be 20 bytes');
  const out = new Uint8Array([
    c.catalogueId & 0xff, c.catalogueId >> 8, ...fp, ...c.ownerPkh,
    ...bigIntToBinUint64LE(c.price), ...bigIntToBinUint64LE(c.lastSalePrice),
  ]);
  if (out.length !== COMMITMENT_LENGTH) throw new Error('commitment length');
  return out;
}

export function decodeCommitment(bytes: Uint8Array) {
  if (bytes.length !== COMMITMENT_LENGTH) throw new Error(`expected a ${COMMITMENT_LENGTH}-byte commitment, got ${bytes.length}`);
  const u64 = (b: Uint8Array) => b.reduceRight((acc, x) => (acc << 8n) | BigInt(x), 0n);
  return {
    catalogueId: bytes[0] | (bytes[1] << 8),
    fingerprint: binToHex(bytes.slice(2, 34)),
    ownerPkh: bytes.slice(34, 54),
    price: u64(bytes.slice(54, 62)),
    lastSalePrice: u64(bytes.slice(62, 70)),
  };
}
