import { describe, it, expect } from 'vitest';
import { TransactionBuilder, type Output, type SpendableUtxo as Utxo } from 'cashscript';
import { Contract, loadArtifact, party, vmOrder, fakeTxid, bchUtxo, newProvider, type Party } from './helpers.js';

const PRICE = 1000n;
const STOCK_SATS = 1000n;
const FEE = 2000n;

const artisan = party('artisan');
const claimer = party('claimer');
const attacker = party('attacker');

const PATRON = fakeTxid();
const FAKE = fakeTxid();

const provider = newProvider();
const dispenser = new Contract(loadArtifact('PatronDispenser'), [artisan.lock, PRICE, vmOrder(PATRON)], { provider });

const stockUtxo = (amount: bigint, category = PATRON): Utxo => ({
  txid: fakeTxid(), vout: 0, satoshis: STOCK_SATS, lockingBytecode: dispenser.lockingBytecode,
  token: { category, amount },
});
const stockBack = (amount: bigint, category = PATRON, to = dispenser.tokenAddress): Output =>
  ({ to, amount: STOCK_SATS, token: { category, amount } });
const tokenTo = (p: Party, amount = 1n, category = PATRON): Output =>
  ({ to: p.tokenAddress, amount: 1000n, token: { category, amount } });
const pay = (p: Party, amount: bigint): Output => ({ to: p.address, amount });

function claimTx(stock: Utxo, outputs: Output[], who = claimer) {
  const funding = bchUtxo(1_000_000n, who);
  const spent = outputs.reduce((s, o) => s + o.amount, 0n);
  return new TransactionBuilder({ provider })
    .addInput(stock, dispenser.unlock.claim())
    .addInput(funding, who.signer.unlockP2PKH())
    .addOutputs(outputs)
    .addOutput({ to: who.address, amount: funding.satoshis + stock.satoshis - spent - FEE });
}

describe('claim()', () => {
  it('stock > 1: 1 token out, stock - 1 back, artisan paid', () => {
    expect(claimTx(stockUtxo(10n), [stockBack(9n), pay(artisan, PRICE), tokenTo(claimer)])).not.toFailRequire();
  });

  it('stock = 1: last token leaves, artisan gets price + the UTXO BCH, nothing left at the contract', () => {
    expect(claimTx(stockUtxo(1n), [pay(artisan, PRICE + STOCK_SATS), tokenTo(claimer)])).not.toFailRequire();
  });

  it('stock = 1: artisan not given the UTXO BCH is rejected', () => {
    expect(claimTx(stockUtxo(1n), [pay(artisan, PRICE), tokenTo(claimer)])).toFailRequireWith('artisan underpaid');
  });
});

// The 6 bypass attempts from the spike, rewritten
describe('bypass attempts', () => {
  it('1. take 2 tokens', () => {
    expect(claimTx(stockUtxo(10n), [stockBack(8n), pay(artisan, PRICE), tokenTo(claimer, 2n)]))
      .toFailRequireWith('stock must shrink by exactly 1');
  });

  it('1b. take 2 tokens while returning stock - 1 (token amounts would not balance)', () => {
    // The extra token is minted from nothing; the contract stops it first (claim output must be exactly 1).
    expect(claimTx(stockUtxo(10n), [stockBack(9n), pay(artisan, PRICE), tokenTo(claimer, 2n)])).toFailRequireWith('claim must be exactly 1 token');
  });

  it('2. no artisan payment', () => {
    expect(claimTx(stockUtxo(10n), [stockBack(9n), pay(claimer, PRICE), tokenTo(claimer)]))
      .toFailRequireWith('must pay the artisan');
  });

  it('3. pay 999 instead of 1 000', () => {
    expect(claimTx(stockUtxo(10n), [stockBack(9n), pay(artisan, PRICE - 1n), tokenTo(claimer)]))
      .toFailRequireWith('artisan underpaid');
  });

  it('4. stock sent to the claimer', () => {
    expect(claimTx(stockUtxo(10n), [stockBack(9n, PATRON, claimer.tokenAddress), pay(artisan, PRICE), tokenTo(claimer)]))
      .toFailRequireWith('stock must return to the dispenser');
  });

  it('5. category swap: fake tokens returned, real stock kept', () => {
    // Attacker brings 9 fake tokens and returns them as "stock"; keeps all 10 real ones.
    const fakeIn: Utxo = { txid: fakeTxid(), vout: 0, satoshis: 1000n, lockingBytecode: bchUtxo(0n, attacker).lockingBytecode, token: { category: FAKE, amount: 9n } };
    const tx = new TransactionBuilder({ provider })
      .addInput(stockUtxo(10n), dispenser.unlock.claim())
      .addInput(fakeIn, attacker.signer.unlockP2PKH())
      .addInput(bchUtxo(1_000_000n, attacker), attacker.signer.unlockP2PKH())
      .addOutputs([stockBack(9n, FAKE), pay(artisan, PRICE), tokenTo(attacker, 10n)]);
    expect(tx).toFailRequireWith('stock category changed');
  });

  it('6. claim on a non-Patron UTXO at the dispenser address', () => {
    expect(claimTx(stockUtxo(10n, FAKE), [stockBack(9n, FAKE), pay(artisan, PRICE), tokenTo(claimer, 1n, FAKE)]))
      .toFailRequireWith('not a Patron stock UTXO');
  });

  it('dispenser not at input 0', () => {
    const tx = new TransactionBuilder({ provider })
      .addInput(bchUtxo(1_000_000n, claimer), claimer.signer.unlockP2PKH())
      .addInput(stockUtxo(10n), dispenser.unlock.claim())
      .addOutputs([stockBack(9n), pay(artisan, PRICE), tokenTo(claimer)]);
    expect(tx).toFailRequireWith('dispenser must be input 0');
  });
});
