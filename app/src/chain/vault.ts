// A mask's RoyaltyVault: read its on-chain state and build buy() transactions.
// Node-safe on purpose (no import.meta.env, no DOM): scripts/buy-chipnet.ts uses this same code
// with the reference signer, so the chipnet end-to-end test exercises exactly what the page sends.
import {
  Contract, TransactionBuilder, placeholderP2PKHUnlocker,
  type Artifact, type NetworkProvider, type SpendableUtxo, type WcTransactionObject,
} from 'cashscript';
import { binToHex, decodeCashAddress, encodeCashAddress, hexToBin } from '@bitauth/libauth';
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

/** Where the money goes if the mask is bought now, exactly as the contract requires (outputs 1 and 2). */
export function payoutsOf(state: MaskState, vault: Vault, params: ContractParams): { kind: 'first' | 'resale'; payouts: Payout[] } {
  const addr = (pkh: Uint8Array) => encodeCashAddress({ prefix: vault.prefix as 'bitcoincash', type: 'p2pkh', payload: pkh }).address;
  const p = state.price;
  if (state.ownerIsCustodian) {
    const cut = p * BigInt(params.platformBps) / 10000n;
    return { kind: 'first', payouts: [
      { role: 'custodian', address: addr(vault.custodianPkh), sats: p - cut },
      { role: 'platform', address: addr(vault.platformPkh), sats: cut },
    ] };
  }
  const bps = BigInt(params.royaltyBps);
  const royalty = [p * bps / 10000n, state.lastSalePrice * bps / 10000n, BigInt(params.minRoyaltySats)].reduce((a, b) => (a > b ? a : b));
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
