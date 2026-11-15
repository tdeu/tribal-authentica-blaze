// Live on-chain state of a mask for the page: polls the vault (mempool included) and derives the
// status shown to people. Before the first sale the on-chain owner is the custodian's key: that is
// "Not yet sold", never "owned by the custodian".
import { useCallback, useEffect, useState } from 'react';
import { binToHex } from '@bitauth/libauth';
import { provider } from '../wallet/chain';
import { CONTRACT, type MaskView } from '../content/mask';
import { readState, vaultOf, type MaskState, type Vault } from './vault';

export type MaskStatus = 'coming-soon' | 'loading' | 'error' | 'not-sold' | 'just-sold' | 'resale' | 'sold' | 'yours';

export type Live = {
  status: MaskStatus;
  state?: MaskState;
  vault?: Vault;
  error?: string;
  refresh: () => Promise<void>;
};

const POLL_MS = 20_000;
const vaults = new Map<number, Vault>();
const vaultFor = (m: MaskView) => {
  let v = vaults.get(m.catalogueId);
  if (!v) { v = vaultOf(m.mint!, CONTRACT, provider); vaults.set(m.catalogueId, v); }
  return v;
};

export function statusOf(s: MaskState | undefined, myPkh?: Uint8Array): MaskStatus {
  if (!s) return 'loading';
  if (myPkh && binToHex(myPkh) === binToHex(s.ownerPkh) && !s.ownerIsCustodian) return 'yours';
  if (s.ownerIsCustodian) return s.price > 0n ? 'not-sold' : 'sold'; // custodian delisted: not buyable
  if (s.unconfirmed && s.price === 0n) return 'just-sold';
  return s.price > 0n ? 'resale' : 'sold';
}

export function useMaskLive(m: MaskView, myPkh?: Uint8Array): Live {
  const [state, setState] = useState<MaskState>();
  const [vault, setVault] = useState<Vault>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!m.mint) return;
    try {
      const v = vaultFor(m);
      setVault(v);
      setState(await readState(provider, v, m.mint));
      setError(undefined);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }, [m]);

  useEffect(() => {
    if (!m.mint) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [m, refresh]);

  if (!m.mint) return { status: 'coming-soon', refresh };
  if (error && !state) return { status: 'error', error, refresh };
  return { status: statusOf(state, myPkh), state, vault, error, refresh };
}
