// The mint path on a local mock chain (nothing broadcast): prep → genesis → first sale → resale.
// Checks that no minting-capable output ever exists in a mask's category and that the 70-byte
// commitment (with its frozen fingerprint) works with the real compiled RoyaltyVault.
import { describe, it, expect } from 'vitest';
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo, type SpendableUtxo } from 'cashscript';
import { binToHex, hexToBin, decodeTransaction, encodeCashAddress, hash160, sha256, utf8ToBin } from '@bitauth/libauth';
import {
  buildPrep, buildGenesis, checkGenesis, vaultContract, loadMasks, GENESIS_FEE, type MasksFile,
} from '../lib.ts';
import { encodeCommitment, decodeCommitment, fingerprintHex, canonicalJson } from '../../app/src/data/fingerprint.ts';

const key = (label: string) => {
  const k = new SignatureTemplate(sha256.hash(utf8ToBin(`mint test key: ${label}`)));
  const pkh = hash160(k.publicKey) as Uint8Array;
  return {
    key: k, pkh,
    address: encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address,
    lock: hexToBin('76a914' + binToHex(pkh) + '88ac'),
  };
};
const funder = key('funder');
const custodian = key('custodian');
const platform = key('platform');
const buyer1 = key('buyer1');
const buyer2 = key('buyer2');

const data: MasksFile = loadMasks();
const mask = data.masks[0];
const VAULT_SATS = BigInt(data.contract.vaultSats);
const PRICE = 470_000n;

function setup() {
  const provider = new MockNetworkProvider({ updateUtxoSet: true, validateTransactions: true });
  provider.addUtxo(funder.address, randomUtxo({ satoshis: 100_000n }));
  return provider;
}

async function mint(provider: MockNetworkProvider) {
  const prep = buildPrep(provider, funder, await provider.getUtxos(funder.address), VAULT_SATS + GENESIS_FEE);
  const prepHex = prep.build();
  const { txid: category } = await prep.send();
  const prep0 = (await provider.getUtxos(funder.address)).find((u) => u.txid === category && u.vout === 0)!;
  const vault = vaultContract(data, custodian.lock, platform.lock, category, provider);
  const commitment = encodeCommitment({ catalogueId: mask.catalogueId, fingerprint: fingerprintHex(mask), ownerPkh: custodian.pkh, price: PRICE, lastSalePrice: 0n });
  const genesis = buildGenesis(provider, funder, prep0, vault.tokenAddress, VAULT_SATS, commitment);
  const genesisHex = genesis.build();
  checkGenesis(genesisHex, category, vault.lockingBytecode, commitment);
  await genesis.send();
  const [nft] = (await provider.getUtxos(vault.tokenAddress)).filter((u) => u.token?.category === category);
  return { category, vault, commitment, nft, prepHex, genesisHex };
}

const tokenOutputs = (hex: string) => {
  const tx = decodeTransaction(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(tx);
  return tx.outputs.filter((o) => o.token);
};

const buyerFunds = (provider: MockNetworkProvider, who: ReturnType<typeof key>) => {
  const u = { ...randomUtxo({ satoshis: 2_000_000n }), lockingBytecode: binToHex(who.lock) };
  provider.addUtxo(who.address, u);
  return u as SpendableUtxo;
};

describe('mint: prep + genesis', () => {
  it('the category has no minting-capable output, ever', async () => {
    const { prepHex, genesisHex, category } = await mint(setup());
    expect(tokenOutputs(prepHex)).toHaveLength(0);
    const outs = tokenOutputs(genesisHex);
    expect(outs).toHaveLength(1);
    expect(binToHex(outs[0].token!.category)).toBe(category);
    expect(outs[0].token!.nft?.capability).toBe('mutable');
  });

  it('puts exactly one mutable NFT with the 70-byte commitment in the vault', async () => {
    const { nft, commitment, vault } = await mint(setup());
    expect(nft.token?.nft?.capability).toBe('mutable');
    expect(nft.token?.nft?.commitment).toBe(binToHex(commitment));
    expect(commitment.length).toBe(70);
    expect(nft.satoshis).toBe(VAULT_SATS);
    const d = decodeCommitment(commitment);
    expect(d).toMatchObject({ catalogueId: mask.catalogueId, fingerprint: fingerprintHex(mask), price: PRICE, lastSalePrice: 0n });
    expect(binToHex(d.ownerPkh)).toBe(binToHex(custodian.pkh));
    expect((await vault.getUtxos()).length).toBe(1);
  });

  it('checkGenesis rejects a genesis that also creates a minting baton', async () => {
    const provider = setup();
    const prep = buildPrep(provider, funder, await provider.getUtxos(funder.address), VAULT_SATS + GENESIS_FEE + 2_000n);
    const { txid: category } = await prep.send();
    const prep0 = (await provider.getUtxos(funder.address)).find((u) => u.txid === category && u.vout === 0)!;
    const vault = vaultContract(data, custodian.lock, platform.lock, category, provider);
    const commitment = encodeCommitment({ catalogueId: 1, fingerprint: fingerprintHex(mask), ownerPkh: custodian.pkh, price: PRICE, lastSalePrice: 0n });
    const bad = buildGenesis(provider, funder, prep0, vault.tokenAddress, VAULT_SATS, commitment)
      .addOutput({ to: encodeCashAddress({ prefix: 'bchtest', type: 'p2pkhWithTokens', payload: funder.pkh }).address, amount: 1_000n, token: { category, amount: 0n, nft: { capability: 'minting', commitment: '' } } });
    expect(() => checkGenesis(bad.build(), category, vault.lockingBytecode, commitment)).toThrow(/output|minting/);
  });
});

describe('the minted NFT works with the real vault', () => {
  it('first sale 90/10, then a resale with the 10 % royalty to the custodian', async () => {
    const provider = setup();
    const { vault, nft, commitment } = await mint(provider);
    const head = commitment.slice(0, 34);
    const out = (owner: Uint8Array, price: bigint, last: bigint) => ({
      to: vault.tokenAddress, amount: VAULT_SATS,
      token: { category: nft.token!.category, amount: 0n, nft: { capability: 'mutable' as const, commitment: binToHex(new Uint8Array([...head, ...owner, ...encodeCommitment({ catalogueId: 0, fingerprint: '00'.repeat(32), ownerPkh: owner, price, lastSalePrice: last }).slice(54)])) } },
    });

    // First sale: 423 000 custodian / 47 000 platform
    const f1 = buyerFunds(provider, buyer1);
    await new TransactionBuilder({ provider })
      .addInput(nft, vault.unlock.buy(buyer1.pkh))
      .addInput(f1, buyer1.key.unlockP2PKH())
      .addOutput(out(buyer1.pkh, 0n, PRICE))
      .addOutput({ to: custodian.address, amount: 423_000n })
      .addOutput({ to: platform.address, amount: 47_000n })
      .addOutput({ to: buyer1.address, amount: f1.satoshis - PRICE - 3_000n })
      .send();

    // buyer1 lists at 600 000, then buyer2 buys: royalty 60 000 to the custodian, 540 000 to buyer1
    let [v] = await vault.getUtxos();
    const fl = buyerFunds(provider, buyer1);
    await new TransactionBuilder({ provider })
      .addInput(v, vault.unlock.list(buyer1.key.publicKey, buyer1.key, 600_000n))
      .addInput(fl, buyer1.key.unlockP2PKH())
      .addOutput(out(buyer1.pkh, 600_000n, PRICE))
      .addOutput({ to: buyer1.address, amount: fl.satoshis - 3_000n })
      .send();

    [v] = await vault.getUtxos();
    const f2 = buyerFunds(provider, buyer2);
    await new TransactionBuilder({ provider })
      .addInput(v, vault.unlock.buy(buyer2.pkh))
      .addInput(f2, buyer2.key.unlockP2PKH())
      .addOutput(out(buyer2.pkh, 0n, 600_000n))
      .addOutput({ to: buyer1.address, amount: 540_000n })
      .addOutput({ to: custodian.address, amount: 60_000n })
      .addOutput({ to: buyer2.address, amount: f2.satoshis - 600_000n - 3_000n })
      .send();

    [v] = await vault.getUtxos();
    const d = decodeCommitment(hexToBin(v.token!.nft!.commitment));
    expect(binToHex(d.ownerPkh)).toBe(binToHex(buyer2.pkh));
    expect(d.fingerprint).toBe(fingerprintHex(mask));
    expect(d.lastSalePrice).toBe(600_000n);
  });
});

describe('fingerprint', () => {
  it('canonical JSON sorts keys and has no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: 'x', c: [2, 1] } })).toBe('{"a":{"c":[2,1],"d":"x"},"b":1}');
  });
  it('masks.json fingerprints are up to date', () => {
    for (const m of data.masks) expect(m.fingerprint).toBe(fingerprintHex(m));
  });
});
