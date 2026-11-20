// In-browser Verify: photos hashed as served, fingerprint recomputed from the content, compared with
// the commitment read fresh from the vault. Shared by the certificate page and the collection cards.
import { binToHex, hexToBin, sha256 } from '@bitauth/libauth';
import { COLLECTION, CONTRACT, type MaskView } from '../content/mask';
import { provider } from '../wallet/chain';
import { readState, vaultOf } from './vault';
import { fingerprintHex, type MaskContent } from '../data/fingerprint';

export type Verdict =
  | { error: string }
  | { photos: { n: number; bad: string[] }; computed: Uint8Array; onchain: Uint8Array; firstDiff: number; ok: boolean };

// DEV ONLY: ?tamper=1 flips one byte of the story (and of the first photo, if any) before hashing, to show
// the NO MATCH state. import.meta.env.DEV is false in production builds, so this code is removed there.
export const TAMPER = import.meta.env.DEV && new URLSearchParams(window.location.search).get('tamper') === '1';

export async function verify(mask: MaskView): Promise<Verdict> {
  try {
    let raw = COLLECTION.masks.find((m) => m.catalogueId === mask.catalogueId) as unknown as MaskContent;
    if (TAMPER) {
      const en = raw.story.en;
      raw = { ...raw, story: { ...raw.story, en: String.fromCharCode(en.charCodeAt(0) ^ 1) + en.slice(1) } };
    }
    // 1. Every published photo, as served, hashes to what the fingerprint lists
    const bad: string[] = [];
    for (const p of raw.photos) {
      const bytes = new Uint8Array(await (await fetch(`/${p.file}`, { cache: 'no-store' })).arrayBuffer());
      if (TAMPER && p === raw.photos[0] && bytes.length) bytes[0] ^= 1;
      if (binToHex(sha256.hash(bytes)) !== p.sha256) bad.push(p.file);
    }
    // 2. Fingerprint recomputed here from the content (never the stored value)
    const computed = hexToBin(fingerprintHex(raw));
    // 3. Fresh read of the commitment in the vault (vaultOf refuses a vault that doesn't rebuild from its terms)
    const vault = vaultOf(mask.mint!, CONTRACT, provider);
    const st = await readState(provider, vault, mask.mint!);
    const commitment = hexToBin(st.utxo.token!.nft!.commitment);
    const onchain = commitment.slice(2, 34);
    let firstDiff = -1;
    for (let i = 0; i < 32; i++) if (computed[i] !== onchain[i]) { firstDiff = i; break; }
    const idOk = st.catalogueId === raw.catalogueId;
    return { photos: { n: raw.photos.length, bad }, computed, onchain, firstDiff: idOk ? firstDiff : Math.max(firstDiff, 0), ok: idOk && firstDiff === -1 && bad.length === 0 };
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) };
  }
}

const cache = new Map<number, Promise<Verdict>>();
/** Same as verify(), run once per mask per page load (the collection cards). */
export const verifyOnce = (mask: MaskView) => {
  let p = cache.get(mask.catalogueId);
  if (!p) { p = verify(mask); cache.set(mask.catalogueId, p); }
  return p;
};
