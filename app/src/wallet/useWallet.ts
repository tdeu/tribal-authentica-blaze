import { useSyncExternalStore } from 'react';
import { wallet, type WalletState } from './wizard';

// React view of the single WizardConnect session.
export function useWallet(): WalletState {
  return useSyncExternalStore(
    (cb) => wallet.subscribe(() => cb()),
    () => wallet.state,
  );
}
