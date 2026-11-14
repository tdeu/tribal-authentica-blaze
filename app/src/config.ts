// App configuration from Vite env vars (see .env.example). Mainnet is the default:
// Selene, our WizardConnect wallet, has no chipnet.

export type Network = 'mainnet' | 'chipnet';

const rawNetwork = (import.meta.env.VITE_NETWORK ?? 'mainnet').trim();
if (rawNetwork !== 'mainnet' && rawNetwork !== 'chipnet') {
  throw new Error(`VITE_NETWORK must be "mainnet" or "chipnet", got "${rawNetwork}"`);
}
export const NETWORK: Network = rawNetwork;

export const ADDRESS_PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';

export const explorerTx = (txid: string) =>
  NETWORK === 'mainnet'
    ? `https://blockchair.com/bitcoin-cash/transaction/${txid}`
    : `https://chipnet.bch.ninja/tx/${txid}`;

const env = (key: string, placeholder: string) => {
  const v = (import.meta.env[key] as string | undefined)?.trim();
  return v ? v : placeholder;
};

// Links shown in the BLAZE banner on every page
export const LINKS = {
  repo: 'https://github.com/tdeu/tribal-authentica-blaze',
  prepTag: 'https://github.com/tdeu/tribal-authentica-preparation/tree/before-blaze-14nov',
  beforeDemo: env('VITE_BEFORE_DEMO_URL', '[BEFORE_DEMO_URL]'),
  deck: env('VITE_DECK_URL', '[DECK_URL]'),
  donation: env('VITE_DONATION_ADDRESS', '[DONATION_Z_ADDRESS]'),
};

export const isPlaceholder = (v: string) => v.startsWith('[') && v.endsWith(']');

export const DAPP_NAME = 'Tribal Authentica';
