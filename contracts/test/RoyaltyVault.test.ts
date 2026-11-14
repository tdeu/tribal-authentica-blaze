import { describe, it, expect } from 'vitest';
import { TransactionBuilder, type Output, type SpendableUtxo as Utxo, type Unlocker } from 'cashscript';
import { binToHex } from '@bitauth/libauth';
import {
  Contract, loadArtifact, party, commitment, vmOrder, fakeTxid, bchUtxo, newProvider, type Party,
} from './helpers.js';

// Parameters used throughout: 10 % royalty, 10 % platform cut on first sale, 1 000-sat royalty floor.
const ROYALTY_BPS = 1000n;
const PLATFORM_BPS = 1000n;
const MIN_ROYALTY = 1000n;
const VAULT_SATS = 1000n;
const FEE = 2000n;

const artisan = party('artisan');
const platform = party('platform (Emtee)');
const buyer1 = party('buyer1');
const buyer2 = party('buyer2');
const attacker = party('attacker');

const CATEGORY = fakeTxid();       // the platform's mask category (txid order)
const FORGED_CATEGORY = fakeTxid(); // anyone else's category

const provider = newProvider();
const vault = new Contract(
  loadArtifact('RoyaltyVault'),
  [vmOrder(CATEGORY), artisan.lock, platform.lock, ROYALTY_BPS, PLATFORM_BPS, MIN_ROYALTY],
  { provider },
);

// ---------------------------------------------------------------- fixtures

const vaultUtxo = (owner: Party, price: bigint, last: bigint, category = CATEGORY, capability: 'mutable' | 'minting' | 'none' = 'mutable'): Utxo => ({
  txid: fakeTxid(), vout: 0, satoshis: VAULT_SATS, lockingBytecode: vault.lockingBytecode,
  token: { category, amount: 0n, nft: { capability, commitment: commitment(owner.pkh, price, last) } },
});

const nftOut = (owner: Party, price: bigint, last: bigint, over: Partial<Output> = {}, category = CATEGORY): Output => ({
  to: vault.tokenAddress, amount: VAULT_SATS,
  token: { category, amount: 0n, nft: { capability: 'mutable', commitment: commitment(owner.pkh, price, last) } },
  ...over,
});

const pay = (p: Party, amount: bigint): Output => ({ to: p.address, amount });

// A buyer funds the purchase from one big P2PKH UTXO; change goes back to them.
function buyTx(vaultIn: Utxo, buyer: Party, outputs: Output[], buyerPkh = buyer.pkh) {
  const funding = bchUtxo(10_000_000n, buyer);
  const spent = outputs.reduce((s, o) => s + o.amount, 0n);
  return new TransactionBuilder({ provider })
    .addInput(vaultIn, vault.unlock.buy(buyerPkh))
    .addInput(funding, buyer.signer.unlockP2PKH())
    .addOutputs(outputs)
    .addOutput({ to: buyer.address, amount: funding.satoshis + vaultIn.satoshis - spent - FEE });
}

// The owner (or whoever signs) pays the fee from one P2PKH UTXO.
function listTx(vaultIn: Utxo, signer: Party, newPrice: bigint, out: Output, pk = signer.pk) {
  const funding = bchUtxo(100_000n, signer);
  return new TransactionBuilder({ provider })
    .addInput(vaultIn, vault.unlock.list(pk, signer.signer, newPrice))
    .addInput(funding, signer.signer.unlockP2PKH())
    .addOutput(out)
    .addOutput({ to: signer.address, amount: funding.satoshis + vaultIn.satoshis - out.amount - FEE });
}

// Royalty as the contract computes it (integer division)
const royaltyOf = (price: bigint, last: bigint) => {
  const r = [price * ROYALTY_BPS / 10000n, last * ROYALTY_BPS / 10000n, MIN_ROYALTY];
  return r.reduce((a, b) => (a > b ? a : b));
};

// ---------------------------------------------------------------- first sale (90 / 10)

describe('first sale: 90 % artisan, 10 % platform', () => {
  const price = 50_000n; // platform cut 5 000, artisan 45 000
  const minted = () => vaultUtxo(artisan, price, 0n);

  it('accepts the exact 90/10 split and records buyer + lastSalePrice', () => {
    const tx = buyTx(minted(), buyer1, [nftOut(buyer1, 0n, price), pay(artisan, 45_000n), pay(platform, 5_000n)]);
    expect(tx).not.toFailRequire();
  });

  it('rejects the artisan underpaid by 1 sat', () => {
    const tx = buyTx(minted(), buyer1, [nftOut(buyer1, 0n, price), pay(artisan, 44_999n), pay(platform, 5_000n)]);
    expect(tx).toFailRequireWith('artisan underpaid');
  });

  it('rejects the platform underpaid by 1 sat', () => {
    const tx = buyTx(minted(), buyer1, [nftOut(buyer1, 0n, price), pay(artisan, 45_000n), pay(platform, 4_999n)]);
    expect(tx).toFailRequireWith('platform underpaid');
  });

  it('rejects the platform share sent to the buyer', () => {
    const tx = buyTx(minted(), buyer1, [nftOut(buyer1, 0n, price), pay(artisan, 45_000n), pay(buyer1, 5_000n)]);
    expect(tx).toFailRequireWith('output 2 must pay the platform');
  });

  it('rejects the artisan share sent to the platform', () => {
    const tx = buyTx(minted(), buyer1, [nftOut(buyer1, 0n, price), pay(platform, 45_000n), pay(platform, 5_000n)]);
    expect(tx).toFailRequireWith('output 1 must pay the artisan');
  });

  it('takes no platform cut on a resale', () => {
    // buyer1 owns it after the first sale and resells at 60 000: royalty 6 000, seller 54 000, platform nothing
    const tx = buyTx(vaultUtxo(buyer1, 60_000n, price), buyer2, [nftOut(buyer2, 0n, 60_000n), pay(buyer1, 54_000n), pay(artisan, 6_000n)]);
    expect(tx).not.toFailRequire();
  });

  it('rounds the platform cut down (integer division)', () => {
    // 12 345 * 10 % = 1 234.5 → 1 234
    const tx = buyTx(vaultUtxo(artisan, 12_345n, 0n), buyer1, [nftOut(buyer1, 0n, 12_345n), pay(artisan, 11_111n), pay(platform, 1_234n)]);
    expect(tx).not.toFailRequire();
  });
});

// ---------------------------------------------------------------- royalty = max(10 % price, 10 % last, floor)

describe('resale royalty = max(10 % price, 10 % lastSalePrice, floor)', () => {
  const cases = [
    { name: 'price term wins', price: 80_000n, last: 50_000n, royalty: 8_000n },
    { name: 'last-sale term wins', price: 6_000n, last: 50_000n, royalty: 5_000n },
    { name: 'floor wins', price: 6_000n, last: 5_000n, royalty: 1_000n },
  ];
  for (const c of cases) {
    it(`${c.name}: royalty ${c.royalty} accepted`, () => {
      expect(royaltyOf(c.price, c.last)).toBe(c.royalty);
      const tx = buyTx(vaultUtxo(buyer1, c.price, c.last), buyer2,
        [nftOut(buyer2, 0n, c.price), pay(buyer1, c.price - c.royalty), pay(artisan, c.royalty)]);
      expect(tx).not.toFailRequire();
    });
    it(`${c.name}: royalty ${c.royalty - 1n} rejected`, () => {
      const tx = buyTx(vaultUtxo(buyer1, c.price, c.last), buyer2,
        [nftOut(buyer2, 0n, c.price), pay(buyer1, c.price - c.royalty), pay(artisan, c.royalty - 1n)]);
      expect(tx).toFailRequireWith('royalty underpaid');
    });
  }
});

// ---------------------------------------------------------------- list()

describe('list()', () => {
  it('owner can list at a valid price', () => {
    const tx = listTx(vaultUtxo(buyer1, 0n, 50_000n), buyer1, 60_000n, nftOut(buyer1, 60_000n, 50_000n));
    expect(tx).not.toFailRequire();
  });

  it('owner can delist (price 0)', () => {
    const tx = listTx(vaultUtxo(buyer1, 60_000n, 50_000n), buyer1, 0n, nftOut(buyer1, 0n, 50_000n));
    expect(tx).not.toFailRequire();
  });

  it('accepts the exact minimum listing price (royalty + 546)', () => {
    // last 50 000 → royalty floor from last sale = 5 000 → min price 5 546
    const tx = listTx(vaultUtxo(buyer1, 0n, 50_000n), buyer1, 5_546n, nftOut(buyer1, 5_546n, 50_000n));
    expect(tx).not.toFailRequire();
  });

  it('rejects a negative price', () => {
    const tx = listTx(vaultUtxo(buyer1, 0n, 50_000n), buyer1, -1n, nftOut(buyer1, 0n, 50_000n));
    expect(tx).toFailRequireWith('negative price');
  });

  it('artisan relisting: rejects a price whose platform share is dust', () => {
    // 5 000 * 10 % = 500 < 546
    const tx = listTx(vaultUtxo(artisan, 0n, 0n), artisan, 5_000n, nftOut(artisan, 5_000n, 0n));
    expect(tx).toFailRequireWith('platform share below dust');
  });

  it('artisan relisting: accepts a price whose platform share is >= 546', () => {
    const tx = listTx(vaultUtxo(artisan, 0n, 0n), artisan, 5_460n, nftOut(artisan, 5_460n, 0n));
    expect(tx).not.toFailRequire();
  });
});

// ---------------------------------------------------------------- the 14 bypass attempts from the spike

describe('bypass attempts (spike suite, rewritten)', () => {
  it('1. non-owner list() with their own key', () => {
    const tx = listTx(vaultUtxo(buyer1, 0n, 50_000n), attacker, 1_000_000n, nftOut(buyer1, 1_000_000n, 50_000n));
    expect(tx).toFailRequireWith('not the owner');
  });

  it('2. non-owner list() presenting the owner pubkey with their own signature', () => {
    const tx = listTx(vaultUtxo(buyer1, 0n, 50_000n), attacker, 1_000_000n, nftOut(buyer1, 1_000_000n, 50_000n), buyer1.pk);
    // NULLFAIL: a failing non-empty signature aborts the script at the checkSig line
    expect(tx).toFailRequireWith(/bad owner signature|NULLFAIL|signature/i);
  });

  it('3. transfer to buyer2 via list() (owner rewrites the commitment)', () => {
    const tx = listTx(vaultUtxo(buyer1, 0n, 50_000n), buyer1, 0n, nftOut(buyer2, 0n, 50_000n));
    expect(tx).toFailRequireWith('wrong new commitment');
  });

  it('4. transfer via buy() to someone other than the declared buyer', () => {
    const tx = buyTx(vaultUtxo(buyer1, 60_000n, 50_000n), buyer2,
      [nftOut(attacker, 0n, 60_000n), pay(buyer1, 54_000n), pay(artisan, 6_000n)]);
    expect(tx).toFailRequireWith('wrong new commitment');
  });

  it('5. lastSalePrice reset by list()', () => {
    const tx = listTx(vaultUtxo(buyer1, 0n, 50_000n), buyer1, 6_000n, nftOut(buyer1, 6_000n, 0n));
    expect(tx).toFailRequireWith('wrong new commitment');
  });

  it('6. wash relist at 2 000 after a 50 000 sale', () => {
    const tx = listTx(vaultUtxo(buyer1, 0n, 50_000n), buyer1, 2_000n, nftOut(buyer1, 2_000n, 50_000n));
    expect(tx).toFailRequireWith('price below minimum listing price');
  });

  it('7. buy() while not listed', () => {
    const tx = buyTx(vaultUtxo(buyer1, 0n, 50_000n), buyer2,
      [nftOut(buyer2, 0n, 0n), pay(buyer1, 1_000n), pay(artisan, 1_000n)]);
    expect(tx).toFailRequireWith('not for sale');
  });

  it('8. resale with no artisan payment', () => {
    const tx = buyTx(vaultUtxo(buyer1, 60_000n, 50_000n), buyer2, [nftOut(buyer2, 0n, 60_000n), pay(buyer1, 60_000n)]);
    // output 2 is the buyer's change, not the artisan
    expect(tx).toFailRequireWith('output 2 must pay the artisan');
  });

  it('9. royalty sent to the buyer instead of the artisan', () => {
    const tx = buyTx(vaultUtxo(buyer1, 60_000n, 50_000n), buyer2,
      [nftOut(buyer2, 0n, 60_000n), pay(buyer1, 54_000n), pay(buyer2, 6_000n)]);
    expect(tx).toFailRequireWith('output 2 must pay the artisan');
  });

  it('10. NFT taken out of the vault', () => {
    const tx = buyTx(vaultUtxo(buyer1, 60_000n, 50_000n), buyer2,
      [nftOut(buyer2, 0n, 60_000n, { to: buyer2.tokenAddress }), pay(buyer1, 54_000n), pay(artisan, 6_000n)]);
    expect(tx).toFailRequireWith('NFT must stay in the vault');
  });

  it('11. royalty not indexed on the last sale (10 % of price only)', () => {
    // last 50 000, price 6 000: royalty must be 5 000, attacker pays 600
    const tx = buyTx(vaultUtxo(buyer1, 6_000n, 50_000n), buyer2,
      [nftOut(buyer2, 0n, 6_000n), pay(buyer1, 5_400n), pay(artisan, 600n)]);
    expect(tx).toFailRequireWith('royalty underpaid');
  });

  it('12. royalty 1 sat short', () => {
    const tx = buyTx(vaultUtxo(buyer1, 60_000n, 50_000n), buyer2,
      [nftOut(buyer2, 0n, 60_000n), pay(buyer1, 54_000n), pay(artisan, 5_999n)]);
    expect(tx).toFailRequireWith('royalty underpaid');
  });

  it('13. seller underpaid by 1 sat', () => {
    const tx = buyTx(vaultUtxo(buyer1, 60_000n, 50_000n), buyer2,
      [nftOut(buyer2, 0n, 60_000n), pay(buyer1, 53_999n), pay(artisan, 6_000n)]);
    expect(tx).toFailRequireWith('seller underpaid');
  });

  it('14. floor-only case: paying 10 % (600) when the floor is 1 000', () => {
    const tx = buyTx(vaultUtxo(buyer1, 6_000n, 0n), buyer2,
      [nftOut(buyer2, 0n, 6_000n), pay(buyer1, 5_400n), pay(artisan, 600n)]);
    expect(tx).toFailRequireWith('royalty underpaid');
  });
});

// ---------------------------------------------------------------- new in BLAZE: category check + structure

describe('category check and structural rules', () => {
  it('rejects buy() on a forged NFT (other category) at the vault address', () => {
    const forged = vaultUtxo(attacker, 1_000n, 0n, FORGED_CATEGORY);
    const tx = buyTx(forged, buyer1,
      [nftOut(buyer1, 0n, 1_000n, {}, FORGED_CATEGORY), pay(attacker, 1_000n), pay(artisan, 1_000n)]);
    expect(tx).toFailRequireWith('not a mask certificate');
  });

  it('rejects list() on a forged NFT', () => {
    const forged = vaultUtxo(attacker, 0n, 0n, FORGED_CATEGORY);
    const tx = listTx(forged, attacker, 10_000n, nftOut(attacker, 10_000n, 0n, {}, FORGED_CATEGORY));
    expect(tx).toFailRequireWith('not a mask certificate');
  });

  it('rejects an NFT of the right category with the wrong capability (immutable)', () => {
    const wrongCap = vaultUtxo(artisan, 50_000n, 0n, CATEGORY, 'none');
    const tx = buyTx(wrongCap, buyer1, [nftOut(buyer1, 0n, 50_000n), pay(artisan, 45_000n), pay(platform, 5_000n)]);
    expect(tx).toFailRequireWith('not a mask certificate');
  });

  it('rejects downgrading the NFT capability on the way out', () => {
    const out = nftOut(buyer1, 0n, 50_000n);
    out.token!.nft!.capability = 'none';
    const tx = buyTx(vaultUtxo(artisan, 50_000n, 0n), buyer1, [out, pay(artisan, 45_000n), pay(platform, 5_000n)]);
    expect(tx).toFailRequireWith('NFT category or capability changed');
  });

  it('rejects draining BCH from the vault output', () => {
    const tx = buyTx(vaultUtxo(artisan, 50_000n, 0n), buyer1,
      [nftOut(buyer1, 0n, 50_000n, { amount: VAULT_SATS - 1n }), pay(artisan, 45_000n), pay(platform, 5_000n)]);
    expect(tx).toFailRequireWith('vault value drained');
  });

  it('rejects the vault spent at input 1', () => {
    const funding = bchUtxo(10_000_000n, buyer1);
    const tx = new TransactionBuilder({ provider })
      .addInput(funding, buyer1.signer.unlockP2PKH())
      .addInput(vaultUtxo(artisan, 50_000n, 0n), vault.unlock.buy(buyer1.pkh) as Unlocker)
      .addOutputs([nftOut(buyer1, 0n, 50_000n), pay(artisan, 45_000n), pay(platform, 5_000n)]);
    expect(tx).toFailRequireWith('vault must be input 0');
  });

  it('rejects two vault NFTs in one tx (the second would escape)', () => {
    const a = vaultUtxo(artisan, 50_000n, 0n);
    const b = vaultUtxo(artisan, 50_000n, 0n);
    const tx = new TransactionBuilder({ provider })
      .addInput(a, vault.unlock.buy(buyer1.pkh))
      .addInput(b, vault.unlock.buy(buyer1.pkh))
      .addInput(bchUtxo(10_000_000n, buyer1), buyer1.signer.unlockP2PKH())
      .addOutputs([nftOut(buyer1, 0n, 50_000n), pay(artisan, 45_000n), pay(platform, 5_000n)])
      .addOutput({ to: buyer1.tokenAddress, amount: VAULT_SATS, token: b.token });
    expect(tx).toFailRequireWith('vault must be input 0');
  });
});

// sanity: the fixtures really are distinct
it('fixtures: categories differ', () => {
  expect(binToHex(vmOrder(CATEGORY))).not.toBe(binToHex(vmOrder(FORGED_CATEGORY)));
});
