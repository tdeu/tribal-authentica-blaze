// "On-chain activity": the vault histories of every minted mask (the same reads as the certificate),
// merged newest first. Cached 60 s so the landing page doesn't re-read Electrum on every render.
import { CONTRACT, MINTED, type MaskView } from '../content/mask';
import { provider } from '../wallet/chain';
import { readHistory, vaultOf, type HistoryEvent } from './vault';

export type Activity = HistoryEvent & { mask: MaskView; seq: number };

const TTL_MS = 60_000;
const TIMEOUT_MS = 15_000;
let cache: { at: number; p: Promise<Activity[]> } | undefined;

// DEV ONLY: ?chainfail=1 makes every read fail, to show the Retry state (removed from production builds)
const CHAIN_FAIL = import.meta.env.DEV && new URLSearchParams(window.location.search).get('chainfail') === '1';

async function load(): Promise<Activity[]> {
  if (CHAIN_FAIL) throw new Error('DEV ?chainfail=1');
  const perMask = await Promise.all(MINTED.map(async (mask) => {
    const events = await readHistory(provider, vaultOf(mask.mint!, CONTRACT, provider), mask.mint!, CONTRACT);
    return events.map((e, seq) => ({ ...e, mask, seq }));
  }));
  // Newest first: unconfirmed (height <= 0) on top, then by block height; same block → later in the chain first
  const rank = (a: Activity) => (a.height > 0 ? a.height : Number.MAX_SAFE_INTEGER);
  return perMask.flat().sort((a, b) => rank(b) - rank(a) || (a.mask === b.mask ? b.seq - a.seq : 0));
}

/** Cached for 60 s; a failed read is not cached, so Retry reads again. */
export function loadActivity(force = false): Promise<Activity[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.p;
  // A server that never answers counts as unreachable (the feed shows Retry instead of loading forever)
  const p = Promise.race([load(), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), TIMEOUT_MS))]);
  cache = { at: Date.now(), p };
  p.catch(() => { if (cache?.p === p) cache = undefined; });
  return p;
}
