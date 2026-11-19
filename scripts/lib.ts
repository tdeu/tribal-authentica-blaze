// Shared mint/fingerprint helpers. Keys are read from scripts/.env (gitignored) and never printed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  Contract, ElectrumNetworkProvider, SignatureTemplate, TransactionBuilder,
  type Artifact, type NetworkProvider, type SpendableUtxo,
} from 'cashscript';
import {
  decodeCashAddress, encodeCashAddress, hash160, sha256, hexToBin, binToHex, decodeTransaction, getDustThreshold,
  type Output,
} from '@bitauth/libauth';
import { encodeCommitment, fingerprintHex, type MaskContent } from '../app/src/data/fingerprint.ts';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MASKS_JSON = fileURLToPath(new URL('../app/src/data/masks.json', import.meta.url));
export const PUBLIC_DIR = fileURLToPath(new URL('../app/public/', import.meta.url));
const ARTIFACT = fileURLToPath(new URL('../contracts/artifacts/RoyaltyVault.json', import.meta.url));

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

// ---------------------------------------------------------------- data

export type Network = 'chipnet' | 'mainnet';
export type PerNetwork<T> = Record<Network, T>;

export type MintRecord = {
  categoryId: string; vaultTokenAddress: string; prepTxid: string; genesisTxid: string;
  commitment: string; priceSats: number; custodianAddress: string; platformAddress: string; mintedAt: string;
};

export type Mask = MaskContent & {
  payoutAddress: PerNetwork<string>;
  priceSats: PerNetwork<number>; // chipnet = test price
  fingerprint: string | null;
  categoryId: PerNetwork<string | null>;
  mint: PerNetwork<MintRecord | null>;
};

export type MasksFile = {
  _comment: string;
  demoNotice: { en: string; fr: string };
  contract: { royaltyBps: number; platformBps: number; minRoyaltySats: number; vaultSats: number };
  platformPayoutAddress: PerNetwork<string>;
  masks: Mask[];
};

export const loadMasks = (): MasksFile => JSON.parse(fs.readFileSync(MASKS_JSON, 'utf8'));
export const saveMasks = (d: MasksFile) => fs.writeFileSync(MASKS_JSON, JSON.stringify(d, null, 2) + '\n');

export const isPlaceholder = (s: string) => /\[[A-Z0-9_ ]+.*\]/.test(s);
export const placeholdersIn = (m: MaskContent) =>
  [m.title.fr, m.title.en, m.story.fr, m.story.en, m.custodianLabel, m.country].filter(isPlaceholder);

export { fingerprintHex, encodeCommitment };

// ---------------------------------------------------------------- network

export const NET = {
  chipnet: { prefix: 'bchtest', explorer: 'https://chipnet.bch.ninja/tx/', wifEnv: 'CHIPNET_FUNDER_WIF', wifType: 'testnet' },
  mainnet: { prefix: 'bitcoincash', explorer: 'https://blockchair.com/bitcoin-cash/transaction/', wifEnv: 'MAINNET_FUNDER_WIF', wifType: 'mainnet' },
} as const;

export const FEE_RATE = 1.1; // sat/byte, a little above the 1 sat/byte relay minimum
export const DUST = 546n;

export const makeProvider = (network: Network): NetworkProvider => new ElectrumNetworkProvider(network);

export function loadFunder(network: Network) {
  const wif = process.env[NET[network].wifEnv];
  if (!wif) throw new Error(`${NET[network].wifEnv} missing in scripts/.env`);
  const key = new SignatureTemplate(wif);
  const isTestnetWif = wif.startsWith('c'); // compressed WIF: K/L = mainnet, c = testnet
  if ((network === 'chipnet') !== isTestnetWif) throw new Error(`${NET[network].wifEnv} is not a ${network} key`);
  const pkh = hash160(key.publicKey) as Uint8Array;
  const address = encodeCashAddress({ prefix: NET[network].prefix, type: 'p2pkh', payload: pkh }).address;
  return { key, pkh, address };
}

// A payout address must be a P2PKH cashaddr (q… or token-aware z…) on the right network.
export function parsePayout(address: string, network: Network, what: string) {
  if (isPlaceholder(address)) throw new Error(`${what}: still a placeholder (${address})`);
  const d = decodeCashAddress(address);
  if (typeof d === 'string') throw new Error(`${what}: invalid address ${address}: ${d}`);
  if (d.prefix !== NET[network].prefix) throw new Error(`${what}: ${address} is not a ${network} address`);
  if (d.type !== 'p2pkh' && d.type !== 'p2pkhWithTokens') throw new Error(`${what}: ${address} must be P2PKH (q… or z…), got ${d.type}`);
  const pkh = d.payload;
  return { address, pkh, lock: hexToBin('76a914' + binToHex(pkh) + '88ac') };
}

// ---------------------------------------------------------------- vault

export const loadArtifact = (): Artifact => JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));

// Category as explorers show it (txid order) → VM byte order for the contract parameter
export const vmOrder = (categoryHex: string) => hexToBin(categoryHex).reverse();

export function vaultContract(
  data: MasksFile, custodianLock: Uint8Array, platformLock: Uint8Array, categoryId: string, provider: NetworkProvider,
) {
  const c = data.contract;
  if (!(c.royaltyBps > 0 && c.royaltyBps < 10000)) throw new Error('royaltyBps out of range');
  if (!(c.platformBps > 0 && c.platformBps < 10000)) throw new Error('platformBps out of range');
  if (c.minRoyaltySats < 546) throw new Error('minRoyaltySats below dust');
  return new Contract(
    loadArtifact(),
    [vmOrder(categoryId), custodianLock, platformLock, BigInt(c.royaltyBps), BigInt(c.platformBps), BigInt(c.minRoyaltySats)],
    { provider },
  );
}

// ---------------------------------------------------------------- mint transactions
// Tx 1 (prep): funder → output 0 (to the funder) holding exactly vaultSats + genesisFee. Category ID = prep txid.
// Tx 2 (genesis): spends prep:0 → ONE output: a MUTABLE NFT straight into the vault. No change, no other
//                 token output, so no minting baton for the category ever exists.

export const GENESIS_FEE = 600n; // checked against the real size before anything is sent

export function buildPrep(provider: NetworkProvider, funder: ReturnType<typeof loadFunder>, utxos: SpendableUtxo[], prepSats: bigint) {
  const inputs = utxos.filter((u) => !u.token);
  const total = inputs.reduce((s, u) => s + u.satoshis, 0n);
  const tb = new TransactionBuilder({ provider })
    .addInputs(inputs, funder.key.unlockP2PKH())
    .addOutput({ to: funder.address, amount: prepSats });
  const size = BigInt(Math.ceil((10 + inputs.length * 148 + 2 * 34) * FEE_RATE));
  const change = total - prepSats - size;
  if (change < 0n) throw new Error(`funder has ${total} sats, needs at least ${prepSats + size}`);
  if (change >= DUST) tb.addOutput({ to: funder.address, amount: change });
  return tb;
}

export function buildGenesis(
  provider: NetworkProvider, funder: ReturnType<typeof loadFunder>, prepUtxo: SpendableUtxo,
  vaultTokenAddress: string, vaultSats: bigint, commitment: Uint8Array,
) {
  return new TransactionBuilder({ provider })
    .addInput(prepUtxo, funder.key.unlockP2PKH())
    .addOutput({
      to: vaultTokenAddress, amount: vaultSats,
      token: { category: prepUtxo.txid, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(commitment) } },
    });
}

// Structural checks on a built genesis tx. Throws if anything could mint later or the NFT is misplaced.
export function checkGenesis(hex: string, category: string, vaultLockHex: string, commitment: Uint8Array) {
  const tx = decodeTransaction(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(`genesis decode: ${tx}`);
  if (tx.outputs.length !== 1) throw new Error(`genesis must have exactly 1 output, has ${tx.outputs.length}`);
  const tokenOuts = tx.outputs.filter((o) => o.token);
  for (const o of tokenOuts) if (o.token!.nft?.capability === 'minting') throw new Error('genesis creates a minting baton');
  const nftOuts = tokenOuts.filter((o) => binToHex(o.token!.category) === category);
  if (nftOuts.length !== 1) throw new Error(`expected 1 output of the category, got ${nftOuts.length}`);
  const o = nftOuts[0] as Output;
  if (binToHex(o.lockingBytecode) !== vaultLockHex) throw new Error('NFT is not sent to the vault');
  if (o.token!.nft?.capability !== 'mutable') throw new Error(`NFT capability is ${o.token!.nft?.capability}, expected mutable`);
  if (o.token!.amount !== 0n) throw new Error('fungible amount on the NFT');
  if (binToHex(o.token!.nft!.commitment) !== binToHex(commitment)) throw new Error('commitment mismatch');
  const dust = getDustThreshold(o);
  if (o.valueSatoshis < dust) throw new Error(`vault output ${o.valueSatoshis} sats is below dust ${dust}`);
  return { size: hex.length / 2, dust };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitForUtxo(provider: NetworkProvider, address: string, txid: string, seconds = 60) {
  for (let i = 0; i < seconds; i++) {
    const u = (await provider.getUtxos(address)).filter((x) => x.txid === txid);
    if (u.length) return u;
    await sleep(1000);
  }
  throw new Error(`tx ${txid} not seen at ${address} after ${seconds} s`);
}

export const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
export const flag = (name: string) => process.argv.includes(name);

// ---------------------------------------------------------------- fingerprints
// Recomputes photo sha256s (raw bytes of app/public/<file>) and fingerprints in place.
// Returns what changed, so callers can refuse to mint on stale data.
export function refreshFingerprints(data: MasksFile) {
  const stale: string[] = [];
  for (const m of data.masks) {
    for (const p of m.photos) {
      const file = path.join(PUBLIC_DIR, p.file);
      if (!fs.existsSync(file)) throw new Error(`mask ${m.catalogueId}: photo not found: app/public/${p.file}`);
      const h = binToHex(sha256.hash(fs.readFileSync(file)));
      if (p.sha256 !== h) { stale.push(`mask ${m.catalogueId} photo ${p.file}`); p.sha256 = h; }
    }
    const fp = fingerprintHex(m);
    if (m.fingerprint !== fp) { stale.push(`mask ${m.catalogueId} fingerprint`); m.fingerprint = fp; }
  }
  return stale;
}
