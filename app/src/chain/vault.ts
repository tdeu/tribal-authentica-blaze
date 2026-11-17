// A mask's RoyaltyVault: read its on-chain state and build buy() transactions.
// Node-safe on purpose (no import.meta.env, no DOM): scripts/buy-chipnet.ts uses this same code
// with the reference signer, so the chipnet end-to-end test exercises exactly what the page sends.
import {
  Contract, TransactionBuilder, placeholderP2PKHUnlocker, placeholderPublicKey, placeholderSignature,
  type Artifact, type NetworkProvider, type SpendableUtxo, type WcTransactionObject,
} from 'cashscript';
import { binToHex, decodeCashAddress, decodeTransaction, encodeCashAddress, hexToBin } from '@bitauth/libauth';
import artifact from '../data/RoyaltyVault.artifact.json';
import { decodeCommitment, encodeCommitment } from '../data/fingerprint';

export type ContractParams = { royaltyBps: number; platformBps: number; minRoyaltySats: number };

// What scripts/mint.ts writes to masks.json for each network
export type MintRecord = {
  categoryId: string; vaultTokenAddress: string; prepTxid: string; genesisTxid: string;
  commitment: string; priceSats: number; custodianAddress: string; platformAddress: string; mintedAt: string;
};

export const DUST = 546n;
export const FEE_RATE = 1.0;   // sat/byte
const FEE_MARGIN = 3_000n;     // the buyer must hold price + this; the real fee is ~1 sat/byte (~1 kB)

const pkhOf = (address: string) => {
  const d = decodeCashAddress(address);
  if (typeof d === 'string') throw new Error(`bad address ${address}: ${d}`);
  return { prefix: d.prefix, pkh: d.payload };
};
const lockOf = (pkh: Uint8Array) => hexToBin('76a914' + binToHex(pkh) + '88ac');
const vmOrder = (categoryHex: string) => hexToBin(categoryHex).reverse();

/** The mask's vault contract. Refuses if the parameters don't reproduce the minted vault address. */
export function vaultOf(mint: MintRecord, params: ContractParams, provider: NetworkProvider) {
  const custodian = pkhOf(mint.custodianAddress);
  const platform = pkhOf(mint.platformAddress);
  const contract = new Contract(
    artifact as unknown as Artifact,
    [vmOrder(mint.categoryId), lockOf(custodian.pkh), lockOf(platform.pkh),
      BigInt(params.royaltyBps), BigInt(params.platformBps), BigInt(params.minRoyaltySats)],
    { provider },
  );
  if (contract.tokenAddress !== mint.vaultTokenAddress) {
    throw new Error(`vault address mismatch: rebuilt ${contract.tokenAddress}, minted ${mint.vaultTokenAddress}`);
  }
  return { contract, custodianPkh: custodian.pkh, platformPkh: platform.pkh, prefix: custodian.prefix };
}
export type Vault = ReturnType<typeof vaultOf>;

export type MaskState = {
  utxo: SpendableUtxo;
  catalogueId: number;
  fingerprint: string;
  ownerPkh: Uint8Array;
  ownerIsCustodian: boolean;  // true = not yet sold (or bought back by the custodian)
  price: bigint;              // 0 = not for sale
  lastSalePrice: bigint;
  unconfirmed: boolean;       // the vault UTXO is still in the mempool (e.g. "Just sold")
};

/** Current state of the mask, read from the vault UTXO (mempool included). */
export async function readState(provider: NetworkProvider, vault: Vault, mint: MintRecord): Promise<MaskState> {
  const utxos = (await provider.getUtxos(vault.contract.tokenAddress))
    .filter((u) => u.token?.category === mint.categoryId && u.token.nft);
  if (utxos.length !== 1) throw new Error(`expected 1 certificate in the vault, found ${utxos.length}`);
  const utxo = utxos[0];
  const c = decodeCommitment(hexToBin(utxo.token!.nft!.commitment));
  let unconfirmed = false;
  const electrum = provider as NetworkProvider & { performRequest?: (m: string, ...p: string[]) => Promise<unknown> };
  if (electrum.performRequest) {
    try {
      const list = await electrum.performRequest('blockchain.address.listunspent', vault.contract.tokenAddress, 'include_tokens') as { tx_hash: string; height: number }[];
      unconfirmed = (list.find((x) => x.tx_hash === utxo.txid)?.height ?? 1) <= 0;
    } catch { /* display only */ }
  }
  return {
    utxo, catalogueId: c.catalogueId, fingerprint: c.fingerprint, ownerPkh: c.ownerPkh,
    ownerIsCustodian: binToHex(c.ownerPkh) === binToHex(vault.custodianPkh),
    price: c.price, lastSalePrice: c.lastSalePrice, unconfirmed,
  };
}

export type Payout = { role: 'custodian' | 'platform' | 'seller'; address: string; sats: bigint };

const maxOf = (...xs: bigint[]) => xs.reduce((a, b) => (a > b ? a : b));

/** Resale royalty to the custodian, exactly as the contract computes it. */
export const royaltyOf = (price: bigint, lastSalePrice: bigint, params: ContractParams) => {
  const bps = BigInt(params.royaltyBps);
  return maxOf(price * bps / 10000n, lastSalePrice * bps / 10000n, BigInt(params.minRoyaltySats));
};

/** Lowest resale price list() accepts: the seller's share after the royalty must not be dust. */
export const minResalePrice = (lastSalePrice: bigint, params: ContractParams) => {
  // royalty grows with the price, so search upward from the floor (a few steps at most)
  let p = royaltyOf(0n, lastSalePrice, params) + DUST;
  while (p < royaltyOf(p, lastSalePrice, params) + DUST) p = royaltyOf(p, lastSalePrice, params) + DUST;
  return p;
};

/** Where the money goes if the mask is bought now, exactly as the contract requires (outputs 1 and 2). */
export type SaleTerms = Pick<MaskState, 'ownerPkh' | 'ownerIsCustodian' | 'price' | 'lastSalePrice'>;
export function payoutsOf(state: SaleTerms, vault: Vault, params: ContractParams): { kind: 'first' | 'resale'; payouts: Payout[] } {
  const addr = (pkh: Uint8Array) => encodeCashAddress({ prefix: vault.prefix as 'bitcoincash', type: 'p2pkh', payload: pkh }).address;
  const p = state.price;
  if (state.ownerIsCustodian) {
    const cut = p * BigInt(params.platformBps) / 10000n;
    return { kind: 'first', payouts: [
      { role: 'custodian', address: addr(vault.custodianPkh), sats: p - cut },
      { role: 'platform', address: addr(vault.platformPkh), sats: cut },
    ] };
  }
  const royalty = royaltyOf(p, state.lastSalePrice, params);
  return { kind: 'resale', payouts: [
    { role: 'seller', address: addr(state.ownerPkh), sats: p - royalty },
    { role: 'custodian', address: addr(vault.custodianPkh), sats: royalty },
  ] };
}

export type BuyerUtxo = SpendableUtxo & { pathName: string; index: number; address: string };
export type Buyer = { pkh: Uint8Array; changeAddress: string; utxos: BuyerUtxo[] };

export type BuiltBuy = {
  wc: WcTransactionObject;
  inputPaths: [number, string, number][];   // buyer inputs only; the vault input needs no signature
  payouts: Payout[];
  kind: 'first' | 'resale';
  price: bigint;
  fee: bigint;
  newCommitment: string;
};

/**
 * buy(): [0] vault (NFT) + buyer P2PKH inputs → [0] NFT back to the vault with the buyer as owner,
 * [1] and [2] the payouts, [3] change to the buyer.
 */
export function buildBuy(
  provider: NetworkProvider, vault: Vault, state: MaskState, params: ContractParams, buyer: Buyer, prompt: string,
): BuiltBuy {
  if (binToHex(buyer.pkh) === binToHex(state.ownerPkh)) throw new Error('You already own this mask.');
  if (state.price <= 0n) throw new Error('This mask is not for sale.');
  const { kind, payouts } = payoutsOf(state, vault, params);

  const utxos = [...buyer.utxos].filter((u) => !u.token).sort((a, b) => (b.satoshis > a.satoshis ? 1 : -1));
  const need = state.price + FEE_MARGIN;
  const chosen: BuyerUtxo[] = [];
  let total = 0n;
  for (const u of utxos) { if (total >= need) break; chosen.push(u); total += u.satoshis; }
  if (total < need) throw new Error(`Not enough BCH: need about ${need} sats, the wallet has ${total} sats available.`);

  const c = decodeCommitment(hexToBin(state.utxo.token!.nft!.commitment));
  const newCommitment = binToHex(encodeCommitment({
    catalogueId: c.catalogueId, fingerprint: c.fingerprint, ownerPkh: buyer.pkh, price: 0n, lastSalePrice: state.price,
  }));

  // One placeholder unlocker per input, each for its own address (the wallet fills in the signatures)
  const tb = new TransactionBuilder({ provider }).addInput(state.utxo, vault.contract.unlock.buy(buyer.pkh));
  for (const u of chosen) tb.addInput(u, placeholderP2PKHUnlocker(u.address));
  tb.addOutput({
    to: vault.contract.tokenAddress, amount: state.utxo.satoshis,
    token: { category: state.utxo.token!.category, amount: 0n, nft: { capability: 'mutable', commitment: newCommitment } },
  });
  for (const p of payouts) tb.addOutput({ to: p.address, amount: p.sats });
  tb.addBchChangeOutputIfNeeded({ to: buyer.changeAddress, feeRate: FEE_RATE });

  const wc = tb.generateWcTransactionObject({ broadcast: false, userPrompt: prompt });
  const inputPaths = chosen.map((u, i) => [i + 1, u.pathName, u.index] as [number, string, number]);
  const inSum = state.utxo.satoshis + total;
  const outSum = wc.transaction.outputs.reduce((s, o) => s + o.valueSatoshis, 0n);
  return { wc, inputPaths, payouts, kind, price: state.price, fee: inSum - outSum, newCommitment };
}

// ---------------------------------------------------------------- resell: list()

const LIST_FEE_MARGIN = 2_000n; // the owner pays the network fee of list() (~0.9 kB at 1 sat/byte)

export type Owner = Buyer & { path: [string, number] }; // path of the key that owns the certificate (receive/0)

export type BuiltList = {
  wc: WcTransactionObject;
  inputPaths: [number, string, number][];   // input 0 (vault, owner's signature) + fee inputs
  newPrice: bigint;
  fee: bigint;
  newCommitment: string;
  preview: { kind: 'first' | 'resale'; payouts: Payout[] }; // what a buyer at newPrice would pay out
};

/** Why list() would refuse `newPrice` for this owner (null = fine). 0 = take off sale. */
export function listProblem(state: SaleTerms, params: ContractParams, newPrice: bigint): string | null {
  if (newPrice < 0n) return 'The price cannot be negative.';
  if (newPrice === 0n) return null;
  if (state.ownerIsCustodian) {
    const cut = newPrice * BigInt(params.platformBps) / 10000n;
    return cut < DUST || newPrice - cut < DUST ? `The price is too low (each share must be at least ${DUST} sats).` : null;
  }
  const min = minResalePrice(state.lastSalePrice, params);
  return newPrice < min ? `The lowest resale price is ${min} sats.` : null;
}

/**
 * list(): [0] vault (NFT, owner signs) + owner P2PKH inputs → [0] NFT back to the vault with the new price,
 * [1] change to the owner. Owner, fingerprint and last sale price stay as they are (the contract checks it).
 */
export function buildList(
  provider: NetworkProvider, vault: Vault, state: MaskState, params: ContractParams, owner: Owner, newPrice: bigint, prompt: string,
): BuiltList {
  if (binToHex(owner.pkh) !== binToHex(state.ownerPkh)) throw new Error('Only the owner can resell this mask.');
  const problem = listProblem(state, params, newPrice);
  if (problem) throw new Error(problem);
  if (newPrice === state.price) throw new Error('That is already the current price.');

  const utxos = [...owner.utxos].filter((u) => !u.token).sort((a, b) => (b.satoshis > a.satoshis ? 1 : -1));
  const chosen: BuyerUtxo[] = [];
  let total = 0n;
  for (const u of utxos) { if (total >= LIST_FEE_MARGIN) break; chosen.push(u); total += u.satoshis; }
  if (total < LIST_FEE_MARGIN) throw new Error(`Not enough BCH for the network fee: need about ${LIST_FEE_MARGIN} sats, the wallet has ${total} sats available.`);

  const c = decodeCommitment(hexToBin(state.utxo.token!.nft!.commitment));
  const newCommitment = binToHex(encodeCommitment({ ...c, price: newPrice }));

  const tb = new TransactionBuilder({ provider })
    .addInput(state.utxo, vault.contract.unlock.list(placeholderPublicKey(), placeholderSignature(), newPrice));
  for (const u of chosen) tb.addInput(u, placeholderP2PKHUnlocker(u.address));
  tb.addOutput({
    to: vault.contract.tokenAddress, amount: state.utxo.satoshis,
    token: { category: state.utxo.token!.category, amount: 0n, nft: { capability: 'mutable', commitment: newCommitment } },
  });
  tb.addBchChangeOutputIfNeeded({ to: owner.changeAddress, feeRate: FEE_RATE });

  const wc = tb.generateWcTransactionObject({ broadcast: false, userPrompt: prompt });
  const inputPaths: [number, string, number][] = [
    [0, owner.path[0], owner.path[1]],
    ...chosen.map((u, i) => [i + 1, u.pathName, u.index] as [number, string, number]),
  ];
  const inSum = state.utxo.satoshis + total;
  const outSum = wc.transaction.outputs.reduce((s, o) => s + o.valueSatoshis, 0n);
  return {
    wc, inputPaths, newPrice, fee: inSum - outSum, newCommitment,
    preview: payoutsOf({ ...state, price: newPrice }, vault, params),
  };
}

// ---------------------------------------------------------------- sale history

export type HistoryEvent = {
  kind: 'minted' | 'sold' | 'listed' | 'delisted';
  txid: string;
  height: number;              // <= 0 = not yet in a block
  ownerPkh: Uint8Array;        // owner after this tx
  price: bigint;               // minted/listed: asking price; sold: sale price
  sellerPkh?: Uint8Array;      // sold only
  saleKind?: 'first' | 'resale';
  payouts?: Payout[];          // sold only: who got what, as the contract enforced it
};

export type RawTx = { txid: string; hex: string; height: number };

/**
 * The certificate's life, oldest first: follows the vault UTXO from the genesis output through every
 * tx that spent it. `txs` = every tx touching the vault address (order does not matter).
 */
export function historyFromTxs(vault: Vault, mint: MintRecord, params: ContractParams, txs: RawTx[]): HistoryEvent[] {
  const decoded = txs.map((t) => {
    const tx = decodeTransaction(hexToBin(t.hex));
    if (typeof tx === 'string') throw new Error(`cannot decode ${t.txid}: ${tx}`);
    return { ...t, tx };
  });
  const custodianHex = binToHex(vault.custodianPkh);
  const termsOf = (commitment: Uint8Array): SaleTerms & { fingerprint: string } => {
    const c = decodeCommitment(commitment);
    return { ...c, ownerIsCustodian: binToHex(c.ownerPkh) === custodianHex };
  };

  const genesis = decoded.find((t) => t.txid === mint.genesisTxid);
  let prev = termsOf(hexToBin(mint.commitment));
  const events: HistoryEvent[] = [{
    kind: 'minted', txid: mint.genesisTxid, height: genesis?.height ?? 1, ownerPkh: prev.ownerPkh, price: prev.price,
  }];
  let at = { txid: mint.genesisTxid, vout: 0 };
  for (let guard = 0; guard < 10_000; guard++) {
    const next = decoded.find((t) => t.tx.inputs.some((i) =>
      binToHex(i.outpointTransactionHash) === at.txid && i.outpointIndex === at.vout));
    if (!next) break;
    const out = next.tx.outputs[0];
    if (!out?.token?.nft || binToHex(out.token.category) !== mint.categoryId) throw new Error(`tx ${next.txid} did not return the certificate to the vault`);
    const now = termsOf(out.token.nft.commitment);
    if (now.fingerprint !== prev.fingerprint) throw new Error(`tx ${next.txid} changed the fingerprint`);
    const base = { txid: next.txid, height: next.height, ownerPkh: now.ownerPkh };
    if (binToHex(now.ownerPkh) !== binToHex(prev.ownerPkh)) {
      const { kind, payouts } = payoutsOf(prev, vault, params);
      events.push({ ...base, kind: 'sold', price: prev.price, sellerPkh: prev.ownerPkh, saleKind: kind, payouts });
    } else {
      events.push({ ...base, kind: now.price > 0n ? 'listed' : 'delisted', price: now.price });
    }
    prev = now;
    at = { txid: next.txid, vout: 0 };
  }
  return events;
}

/** Fetches every tx of the vault address (Electrum) and builds the history. */
export async function readHistory(provider: NetworkProvider, vault: Vault, mint: MintRecord, params: ContractParams): Promise<HistoryEvent[]> {
  const electrum = provider as NetworkProvider & { performRequest?: (m: string, ...p: string[]) => Promise<unknown> };
  if (!electrum.performRequest) throw new Error('history needs an Electrum provider');
  const list = await electrum.performRequest('blockchain.address.get_history', vault.contract.address) as { tx_hash: string; height: number }[];
  const txs = await Promise.all(list.map(async (h) => ({ txid: h.tx_hash, height: h.height, hex: await provider.getRawTransaction(h.tx_hash) })));
  return historyFromTxs(vault, mint, params, txs);
}
