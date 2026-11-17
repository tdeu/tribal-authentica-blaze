// Step 3 on a mock chain: the holder resells (list(), owner signature filled by the reference wallet
// the way Selene fills contract placeholders), a second buyer buys, the custodian gets the royalty,
// and the history reader reconstructs every step from the raw txs.
import { describe, it, expect } from 'vitest';
import { MockNetworkProvider, SignatureTemplate, randomUtxo } from 'cashscript';
import { binToHex, encodeCashAddress, hash160, hexToBin, sha256, utf8ToBin, decodeTransaction, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import { buildPrep, buildGenesis, vaultContract, loadMasks, GENESIS_FEE } from '../lib.ts';
import { encodeCommitment, fingerprintHex } from '../../app/src/data/fingerprint.ts';
import {
  vaultOf, readState, buildBuy, buildList, listProblem, minResalePrice, royaltyOf, historyFromTxs,
  type MintRecord, type RawTx,
} from '../../app/src/chain/vault.ts';
import { toWire } from '../../app/src/wallet/wire.ts';
import { refSign } from '../../spikes/wizardconnect/scripts/refwallet.ts';

const key = (label: string) => {
  const k = new SignatureTemplate(sha256.hash(utf8ToBin(`resale test key: ${label}`)));
  const pkh = hash160(k.publicKey) as Uint8Array;
  return { key: k, pkh, address: encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address, lock: hexToBin('76a914' + binToHex(pkh) + '88ac') };
};
type Key = ReturnType<typeof key>;
const funder = key('funder'), custodian = key('custodian'), platform = key('platform'), buyer = key('buyer'), buyer2 = key('buyer2');
const data = loadMasks();
const params = data.contract;
const mask = data.masks[0];
const PRICE = 6_000n;

async function setup() {
  const provider = new MockNetworkProvider({ updateUtxoSet: true, validateTransactions: true });
  const txs: RawTx[] = [];
  const keep = (r: { txid: string; hex: string }) => { txs.push({ txid: r.txid, hex: r.hex, height: txs.length + 1 }); return r; };
  provider.addUtxo(funder.address, randomUtxo({ satoshis: 100_000n }));
  const prep = await buildPrep(provider, funder, await provider.getUtxos(funder.address), BigInt(params.vaultSats) + GENESIS_FEE).send();
  const categoryId = prep.txid;
  const prep0 = (await provider.getUtxos(funder.address)).find((u) => u.txid === categoryId && u.vout === 0)!;
  const v = vaultContract(data, custodian.lock, platform.lock, categoryId, provider);
  const commitment = encodeCommitment({ catalogueId: mask.catalogueId, fingerprint: fingerprintHex(mask), ownerPkh: custodian.pkh, price: PRICE, lastSalePrice: 0n });
  const genesis = keep(await buildGenesis(provider, funder, prep0, v.tokenAddress, BigInt(params.vaultSats), commitment).send());
  const mint: MintRecord = {
    categoryId, vaultTokenAddress: v.tokenAddress, prepTxid: categoryId, genesisTxid: genesis.txid, commitment: binToHex(commitment),
    priceSats: Number(PRICE), custodianAddress: custodian.address, platformAddress: platform.address, mintedAt: '',
  };
  const vault = vaultOf(mint, params, provider);
  const fund = (who: Key, sats: bigint) => provider.addUtxo(who.address, { ...randomUtxo({ satoshis: sats }), lockingBytecode: binToHex(who.lock) });
  const walletOf = async (who: Key) => ({
    pkh: who.pkh, changeAddress: who.address, path: ['receive', 0] as [string, number],
    utxos: (await provider.getUtxos(who.address)).filter((u) => !u.token)
      .map((u) => ({ ...u, lockingBytecode: binToHex(who.lock), pathName: 'receive', index: 0, address: who.address })),
  });
  const state = () => readState(provider, vault, mint);
  const send = async (hex: string) => {
    const txid = await provider.sendRawTransaction(hex);
    keep({ txid, hex });
    return { txid, hex };
  };
  const buy = async (who: Key) => {
    const b = buildBuy(provider, vault, await state(), params, await walletOf(who), 'buy');
    return send(refSign(b.wc, b.inputPaths, who.key as never));
  };
  const list = async (who: Key, price: bigint, signer: Key = who) => {
    const l = buildList(provider, vault, await state(), params, await walletOf(who), price, 'resell');
    toWire(l.wc); // what the page sends to Selene must serialize
    return { built: l, ...(await send(refSign(l.wc, l.inputPaths, signer.key as never))) };
  };
  return { provider, mint, vault, txs, fund, state, buy, list, walletOf };
}

const paidTo = (hex: string, address: string) => {
  const tx = decodeTransaction(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(tx);
  return tx.outputs.filter((o) => {
    const a = lockingBytecodeToCashAddress({ bytecode: o.lockingBytecode, prefix: 'bchtest' });
    return typeof a !== 'string' && a.address === address;
  }).reduce((s, o) => s + o.valueSatoshis, 0n);
};

describe('resale rules', () => {
  it('royalty = max(10 % of price, 10 % of last sale, floor)', () => {
    expect(royaltyOf(8_000n, 6_000n, params)).toBe(1_000n);       // floor
    expect(royaltyOf(50_000n, 6_000n, params)).toBe(5_000n);      // 10 % of price
    expect(royaltyOf(20_000n, 470_000n, params)).toBe(47_000n);   // 10 % of last sale (anti-wash)
  });
  it('lowest resale price leaves the seller a non-dust share', () => {
    for (const last of [0n, 6_000n, 470_000n]) {
      const min = minResalePrice(last, params);
      expect(min - royaltyOf(min, last, params)).toBeGreaterThanOrEqual(546n);
      expect(min - 1n - royaltyOf(min - 1n, last, params)).toBeLessThan(546n);
    }
    const holder = { ownerPkh: buyer.pkh, ownerIsCustodian: false, price: 0n, lastSalePrice: 6_000n };
    expect(listProblem(holder, params, 1_000n)).toMatch(/lowest resale price is 1546/);
    expect(listProblem(holder, params, 8_000n)).toBeNull();
    expect(listProblem(holder, params, 0n)).toBeNull();
  });
});

describe('resell path (vault.ts list) signed by the reference wallet', () => {
  it('buy → resell → second buyer: seller and custodian paid as shown, history reconstructed', async () => {
    const s = await setup();
    s.fund(buyer, 20_000n);
    await s.buy(buyer);
    expect(binToHex((await s.state()).ownerPkh)).toBe(binToHex(buyer.pkh));

    // The holder lists at 8 000 sats. The preview shown before signing is the contract's split.
    const { built } = await s.list(buyer, 8_000n);
    expect(built.inputPaths[0]).toEqual([0, 'receive', 0]);   // the vault input carries the owner's signature
    expect(built.preview.kind).toBe('resale');
    expect(built.preview.payouts.map((p) => [p.role, p.sats])).toEqual([['seller', 7_000n], ['custodian', 1_000n]]);
    expect(built.fee).toBeGreaterThan(0n);
    expect(built.fee).toBeLessThan(2_000n);
    const listed = await s.state();
    expect(listed.price).toBe(8_000n);
    expect(binToHex(listed.ownerPkh)).toBe(binToHex(buyer.pkh));
    expect(listed.lastSalePrice).toBe(PRICE);

    // Second buyer: seller gets price - royalty, custodian gets the royalty
    s.fund(buyer2, 20_000n);
    const resale = await s.buy(buyer2);
    expect(paidTo(resale.hex, buyer.address)).toBe(7_000n);
    expect(paidTo(resale.hex, custodian.address)).toBe(1_000n);
    const after = await s.state();
    expect(binToHex(after.ownerPkh)).toBe(binToHex(buyer2.pkh));
    expect(after.price).toBe(0n);
    expect(after.lastSalePrice).toBe(8_000n);
    expect(after.fingerprint).toBe(fingerprintHex(mask));

    // History, from the raw txs in any order
    const h = historyFromTxs(s.vault, s.mint, params, [...s.txs].reverse());
    expect(h.map((e) => [e.kind, e.price])).toEqual([['minted', 6_000n], ['sold', 6_000n], ['listed', 8_000n], ['sold', 8_000n]]);
    expect(h[1].saleKind).toBe('first');
    expect(h[1].payouts!.map((p) => [p.role, p.sats])).toEqual([['custodian', 5_400n], ['platform', 600n]]);
    expect(h[3].saleKind).toBe('resale');
    expect(binToHex(h[3].sellerPkh!)).toBe(binToHex(buyer.pkh));
    expect(binToHex(h[3].ownerPkh)).toBe(binToHex(buyer2.pkh));
    expect(h[3].payouts!.map((p) => [p.role, p.sats])).toEqual([['seller', 7_000n], ['custodian', 1_000n]]);
  });

  it('delist (price 0) keeps the owner; history says delisted', async () => {
    const s = await setup();
    s.fund(buyer, 30_000n);
    await s.buy(buyer);
    await s.list(buyer, 9_000n);
    await s.list(buyer, 0n);
    const st = await s.state();
    expect(st.price).toBe(0n);
    expect(binToHex(st.ownerPkh)).toBe(binToHex(buyer.pkh));
    expect(historyFromTxs(s.vault, s.mint, params, s.txs).map((e) => e.kind)).toEqual(['minted', 'sold', 'listed', 'delisted']);
  });

  it('refuses: not the owner, price below the minimum, no fee money; the contract rejects a wrong signer', async () => {
    const s = await setup();
    s.fund(buyer, 20_000n);
    await s.buy(buyer);
    const st = await s.state();
    s.fund(buyer2, 20_000n);
    const other = await s.walletOf(buyer2), owner = await s.walletOf(buyer);
    expect(() => buildList(s.provider, s.vault, st, params, other, 8_000n, '')).toThrow(/Only the owner/);
    expect(() => buildList(s.provider, s.vault, st, params, owner, 1_000n, '')).toThrow(/lowest resale price/);
    const broke = { ...owner, utxos: [] };
    expect(() => buildList(s.provider, s.vault, st, params, broke, 8_000n, '')).toThrow(/network fee/);
    // Built for the owner but signed with another key: the VM refuses it
    await expect(s.list(buyer, 8_000n, buyer2)).rejects.toThrow();
    expect((await s.state()).price).toBe(0n);
  });
});
