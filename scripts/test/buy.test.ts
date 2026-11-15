// The page's buy path (app/src/chain/vault.ts) on a mock chain, signed by the spike's reference wallet
// the way Selene would sign it: mint → readState → buildBuy → wire → refSign → VM-validated broadcast.
import { describe, it, expect } from 'vitest';
import { MockNetworkProvider, SignatureTemplate, randomUtxo } from 'cashscript';
import { binToHex, encodeCashAddress, hash160, hexToBin, sha256, utf8ToBin } from '@bitauth/libauth';
import { buildPrep, buildGenesis, vaultContract, loadMasks, GENESIS_FEE } from '../lib.ts';
import { encodeCommitment, fingerprintHex } from '../../app/src/data/fingerprint.ts';
import { vaultOf, readState, buildBuy, payoutsOf, type MintRecord } from '../../app/src/chain/vault.ts';
import { toWire } from '../../app/src/wallet/wire.ts';
import { refSign } from '../../spikes/wizardconnect/scripts/refwallet.ts';

const key = (label: string) => {
  const k = new SignatureTemplate(sha256.hash(utf8ToBin(`buy test key: ${label}`)));
  const pkh = hash160(k.publicKey) as Uint8Array;
  return { key: k, pkh, address: encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address, lock: hexToBin('76a914' + binToHex(pkh) + '88ac') };
};
const funder = key('funder'), custodian = key('custodian'), platform = key('platform'), buyer = key('buyer'), buyer2 = key('buyer2');
const data = loadMasks();
const mask = data.masks[0];
const PRICE = 470_000n;

async function mintOnMock() {
  const provider = new MockNetworkProvider({ updateUtxoSet: true, validateTransactions: true });
  provider.addUtxo(funder.address, randomUtxo({ satoshis: 100_000n }));
  const prep = buildPrep(provider, funder, await provider.getUtxos(funder.address), BigInt(data.contract.vaultSats) + GENESIS_FEE);
  const { txid: categoryId } = await prep.send();
  const prep0 = (await provider.getUtxos(funder.address)).find((u) => u.txid === categoryId && u.vout === 0)!;
  const v = vaultContract(data, custodian.lock, platform.lock, categoryId, provider);
  const commitment = encodeCommitment({ catalogueId: mask.catalogueId, fingerprint: fingerprintHex(mask), ownerPkh: custodian.pkh, price: PRICE, lastSalePrice: 0n });
  const { txid: genesisTxid } = await buildGenesis(provider, funder, prep0, v.tokenAddress, BigInt(data.contract.vaultSats), commitment).send();
  const mint: MintRecord = {
    categoryId, vaultTokenAddress: v.tokenAddress, prepTxid: categoryId, genesisTxid, commitment: binToHex(commitment),
    priceSats: Number(PRICE), custodianAddress: custodian.address, platformAddress: platform.address, mintedAt: '',
  };
  return { provider, mint };
}

const fund = (provider: MockNetworkProvider, who: ReturnType<typeof key>, sats: bigint) => {
  provider.addUtxo(who.address, { ...randomUtxo({ satoshis: sats }), lockingBytecode: binToHex(who.lock) });
};
const buyerOf = async (provider: MockNetworkProvider, who: ReturnType<typeof key>) => ({
  pkh: who.pkh, changeAddress: who.address,
  utxos: (await provider.getUtxos(who.address)).map((u) => ({ ...u, lockingBytecode: binToHex(who.lock), pathName: 'receive', index: 0, address: who.address })),
});

describe('page buy path (vault.ts) signed by the reference wallet', () => {
  it('reads the minted state: not yet sold, listed at the mint price', async () => {
    const { provider, mint } = await mintOnMock();
    const vault = vaultOf(mint, data.contract, provider);
    const s = await readState(provider, vault, mint);
    expect(s.ownerIsCustodian).toBe(true);
    expect(s.price).toBe(PRICE);
    expect(s.fingerprint).toBe(fingerprintHex(mask));
    const { kind, payouts } = payoutsOf(s, vault, data.contract);
    expect(kind).toBe('first');
    expect(payouts.map((p) => [p.role, p.sats])).toEqual([['custodian', 423_000n], ['platform', 47_000n]]);
  });

  it('first sale: builds, serializes for WizardConnect, signs, passes the VM; buyer becomes owner', async () => {
    const { provider, mint } = await mintOnMock();
    const vault = vaultOf(mint, data.contract, provider);
    fund(provider, buyer, 300_000n); fund(provider, buyer, 300_000n); // two inputs, so input paths are exercised
    const built = buildBuy(provider, vault, await readState(provider, vault, mint), data.contract, await buyerOf(provider, buyer), 'Buy mask 1');
    expect(built.inputPaths).toEqual([[1, 'receive', 0], [2, 'receive', 0]]);
    expect(built.fee).toBeGreaterThan(0n);
    expect(built.fee).toBeLessThan(3_000n);
    expect(() => JSON.stringify(toWire(built.wc))).not.toThrow();
    await provider.sendRawTransaction(refSign(built.wc, built.inputPaths, buyer.key as never));
    const after = await readState(provider, vault, mint);
    expect(binToHex(after.ownerPkh)).toBe(binToHex(buyer.pkh));
    expect(after.ownerIsCustodian).toBe(false);
    expect(after.price).toBe(0n);
    expect(after.lastSalePrice).toBe(PRICE);
    expect(after.fingerprint).toBe(fingerprintHex(mask));
  });

  it('refuses: not enough BCH, already the owner, not for sale', async () => {
    const { provider, mint } = await mintOnMock();
    const vault = vaultOf(mint, data.contract, provider);
    fund(provider, buyer, 100_000n);
    const s = await readState(provider, vault, mint);
    const poor = await buyerOf(provider, buyer);
    expect(() => buildBuy(provider, vault, s, data.contract, poor, '')).toThrow(/Not enough BCH/);
    fund(provider, buyer, 900_000n);
    const built = buildBuy(provider, vault, s, data.contract, await buyerOf(provider, buyer), '');
    await provider.sendRawTransaction(refSign(built.wc, built.inputPaths, buyer.key as never));
    const sold = await readState(provider, vault, mint);
    const owner = await buyerOf(provider, buyer);
    expect(() => buildBuy(provider, vault, sold, data.contract, owner, '')).toThrow(/already own/);
    fund(provider, buyer2, 900_000n);
    const other = await buyerOf(provider, buyer2);
    expect(() => buildBuy(provider, vault, sold, data.contract, other, '')).toThrow(/not for sale/);
  });

  it('refuses a vault whose parameters do not reproduce the minted address', async () => {
    const { provider, mint } = await mintOnMock();
    expect(() => vaultOf(mint, { ...data.contract, royaltyBps: 500 }, provider)).toThrow(/mismatch/);
  });
});
