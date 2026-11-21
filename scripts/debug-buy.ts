// READ-ONLY. Rebuilds the exact bch_signTransaction payload the page sends for a mainnet (or chipnet) buy,
// saves it, then checks it the way Selene does before signing: decode, structure checks, sign the wallet
// inputs with a throwaway key, and run libauth's VM on the result. Nothing is ever broadcast.
//   npx tsx debug-buy.ts --network mainnet --mask 2
//   npx tsx debug-buy.ts --network mainnet --mask 2 --buyer bitcoincash:q…    real buyer UTXOs (input 0 only)
//   npx tsx debug-buy.ts --payload saved.json                                  re-check a saved payload
import fs from 'node:fs';
import {
  binToHex, hexToBin, decodeTransaction, encodeCashAddress, hash160, secp256k1, generatePrivateKey,
  createVirtualMachineBCH2023, createVirtualMachineBCHCHIPs, stringify, type Output, type Transaction,
} from '@bitauth/libauth';
import { SignatureTemplate, type SpendableUtxo } from 'cashscript';
import { loadMasks, makeProvider, arg, type Network } from './lib.ts';
import { vaultOf, readState, buildBuy, payoutsOf, type MintRecord, type BuyerUtxo } from '../app/src/chain/vault.ts';
import { decodeCommitment } from '../app/src/data/fingerprint.ts';
import { toWire, type WireTransaction } from '../app/src/wallet/wire.ts';
import { refSign } from '../spikes/wizardconnect/scripts/refwallet.ts';
import { seleneAccepts } from '../spikes/wizardconnect/scripts/selene-compat.ts';

type Payload = { network: Network; mask: number; wire: WireTransaction; inputPaths: [number, string, number][]; signerKeyHex?: string };

// ---------------------------------------------------------------- build (or load) the payload

let payload: Payload;
const saved = arg('--payload');
if (saved) {
  payload = JSON.parse(fs.readFileSync(saved, 'utf8'));
} else {
  const network = (arg('--network') ?? 'mainnet') as Network;
  const id = Number(arg('--mask') ?? 2);
  const data = loadMasks();
  const m = data.masks.find((x) => x.catalogueId === id);
  const mint = m?.mint[network] as MintRecord | null;
  if (!mint) throw new Error(`mask ${id} is not minted on ${network}`);
  const provider = makeProvider(network);
  const vault = vaultOf(mint, data.contract, provider);
  const state = await readState(provider, vault, mint); // fresh vault UTXO, as BuySheet does right before building
  console.log(`mask ${id} vault UTXO ${state.utxo.txid}:${state.utxo.vout}  ${state.utxo.satoshis} sats  price ${state.price}  unconfirmed ${state.unconfirmed}`);

  const prefix = network === 'mainnet' ? 'bitcoincash' : 'bchtest';
  let buyerAddr = arg('--buyer');
  let signerKeyHex: string | undefined;
  let utxos: BuyerUtxo[];
  let pkh: Uint8Array;
  if (buyerAddr) {
    // Real buyer address: real UTXOs, read only. Its inputs can't be signed here; input 0 is still checked.
    utxos = (await provider.getUtxos(buyerAddr)).filter((u) => !u.token).map((u) => ({ ...u, pathName: 'receive', index: 0, address: buyerAddr! }));
    const d = (await import('@bitauth/libauth')).decodeCashAddress(buyerAddr);
    if (typeof d === 'string') throw new Error(d);
    pkh = d.payload;
  } else {
    // Throwaway buyer with one synthetic UTXO: fine for verification, the outpoint is never looked up.
    const sk = generatePrivateKey();
    signerKeyHex = binToHex(sk);
    pkh = hash160(secp256k1.derivePublicKeyCompressed(sk) as Uint8Array) as Uint8Array;
    buyerAddr = encodeCashAddress({ prefix, type: 'p2pkh', payload: pkh }).address;
    const fake: SpendableUtxo = {
      txid: 'ab'.repeat(32), vout: 1, satoshis: state.price + 20_000n,
      lockingBytecode: '76a914' + binToHex(pkh) + '88ac',
    } as SpendableUtxo;
    utxos = [{ ...fake, pathName: 'receive', index: 0, address: buyerAddr }];
  }
  console.log(`buyer ${buyerAddr}${signerKeyHex ? ' (throwaway, synthetic UTXO)' : ''}`);
  const built = buildBuy(provider, vault, state, data.contract, { pkh, changeAddress: buyerAddr, utxos }, `Sankofa — buy mask ${String(id).padStart(3, '0')}`);
  payload = { network, mask: id, wire: toWire(built.wc), inputPaths: built.inputPaths, signerKeyHex };
  // Expected payouts for the output check below
  const { payouts } = payoutsOf(state, vault, data.contract);
  (payload as Payload & { expect: unknown }).expect = {
    vaultLock: binToHex(hexToBin(state.utxo.lockingBytecode ?? '')), payouts: payouts.map((p) => ({ ...p, sats: String(p.sats) })),
  };
  const out = arg('--out') ?? `buy-payload-${network}-${String(id).padStart(3, '0')}.json`;
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`payload saved → ${out}`);
}

// ---------------------------------------------------------------- decode like the wallet does

const fromWire = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const b = /^<Uint8Array: 0x([0-9a-f]*)>$/.exec(v); if (b) return hexToBin(b[1]);
    const n = /^<bigint: (-?\d+)n>$/.exec(v); if (n) return BigInt(n[1]);
    return v;
  }
  if (Array.isArray(v)) return v.map(fromWire);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromWire(x)]));
  return v;
};
const { wire, inputPaths } = payload;
const tx = decodeTransaction(hexToBin(wire.transaction));
if (typeof tx === 'string') throw new Error(`cannot decode tx: ${tx}`);
type Src = Output & { outpointTransactionHash: Uint8Array; outpointIndex: number; unlockingBytecode: Uint8Array; sequenceNumber: number; contract?: { abiFunction?: { name: string }; redeemScript?: Uint8Array; artifact?: { contractName?: string } } };
const src = fromWire(wire.sourceOutputs) as Src[];

let problems = 0;
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) problems++; };

console.log(`\n1. payload  broadcast=${wire.broadcast}  userPrompt=${JSON.stringify(wire.userPrompt)}  tx ${wire.transaction.length / 2} bytes, ${tx.inputs.length} in / ${tx.outputs.length} out`);
console.log(`   inputPaths ${JSON.stringify(inputPaths)}`);

console.log('\n2. inputs ↔ sourceOutputs');
ok(tx.inputs.length === src.length, `${tx.inputs.length} inputs, ${src.length} sourceOutputs`);
tx.inputs.forEach((inp, i) => {
  const s = src[i];
  const same = binToHex(inp.outpointTransactionHash) === binToHex(s.outpointTransactionHash) && inp.outpointIndex === s.outpointIndex
    && inp.sequenceNumber === s.sequenceNumber && binToHex(inp.unlockingBytecode) === binToHex(s.unlockingBytecode);
  const signedByWallet = inputPaths.some(([j]) => j === i);
  ok(same, `input ${i}: outpoint/sequence/unlockingBytecode match its sourceOutput`);
  if (signedByWallet) ok(inp.unlockingBytecode.length === 0 || /^41(00){65}21(00){33}$/.test(binToHex(inp.unlockingBytecode)),
    `input ${i} (wallet, ${inputPaths.find(([j]) => j === i)!.slice(1).join('/')}): unlocking = ${inp.unlockingBytecode.length ? 'placeholder sig+pubkey' : 'empty'}`);
});

// Port of Selene's prepareTransaction + validateSigningRequest (spikes/wizardconnect/scripts/selene-compat.ts),
// which runs BEFORE the confirm dialog; any throw there = "Wallet could not verify transaction".
try { seleneAccepts(wire, inputPaths); ok(true, "Selene's validateSigningRequest accepts the request"); }
catch (e) { ok(false, `Selene's validateSigningRequest rejects it: ${(e as Error).message} (its limit: NFT commitment ≤ 40 bytes)`); }

console.log('\n3. contract input (0)');
const v = src[0];
ok(!inputPaths.some(([j]) => j === 0), 'input 0 is not in inputPaths (buy() needs no signature)');
ok(!!v.token?.nft, `token present: category ${v.token ? binToHex(v.token.category) : '-'}, capability ${v.token?.nft?.capability}`);
ok(v.token?.nft?.capability === 'mutable', 'capability mutable');
const commitLen = v.token?.nft?.commitment.length ?? 0;
console.log(`       commitment ${commitLen} bytes ${v.token?.nft ? binToHex(v.token.nft.commitment) : ''}`);
ok(!!v.contract?.redeemScript && !!v.contract.artifact?.contractName, `contract fields: contractName=${v.contract?.artifact?.contractName}, abiFunction=${v.contract?.abiFunction?.name}, redeemScript ${v.contract?.redeemScript?.length} bytes`);
ok(v.unlockingBytecode.length > 0, `unlockingBytecode filled (${v.unlockingBytecode.length} bytes): buyerPkh + selector + redeem script`);

console.log('\n4. outputs vs covenant');
const expect = (payload as Payload & { expect?: { vaultLock: string; payouts: { role: string; address: string; sats: string }[] } }).expect;
tx.outputs.forEach((o, i) => console.log(`       [${i}] ${o.valueSatoshis} sats  lock ${binToHex(o.lockingBytecode)}${o.token ? `  NFT ${o.token.nft?.capability} ${o.token.nft?.commitment.length} B` : ''}`));
ok(binToHex(tx.outputs[0].lockingBytecode) === binToHex(v.lockingBytecode), 'output 0 = vault (same locking bytecode as input 0)');
ok(!!tx.outputs[0].token && binToHex(tx.outputs[0].token.category) === binToHex(v.token!.category) && tx.outputs[0].token.nft?.capability === 'mutable', 'output 0 keeps category + mutable');
ok(tx.outputs[0].valueSatoshis >= v.valueSatoshis, 'output 0 value >= vault input value');
if (v.token?.nft) {
  const before = decodeCommitment(v.token.nft.commitment), after = decodeCommitment(tx.outputs[0].token!.nft!.commitment);
  ok(after.fingerprint === before.fingerprint && after.price === 0n && after.lastSalePrice === before.price, `new commitment: same fingerprint, price 0, lastSalePrice ${after.lastSalePrice}`);
  if (expect) expect.payouts.forEach((p, k) => {
    const o = tx.outputs[1 + k];
    ok(!!o && o.valueSatoshis >= BigInt(p.sats), `output ${1 + k} pays ${p.role} ≥ ${p.sats} (${o?.valueSatoshis}) — ${Number(BigInt(p.sats) * 10000n / before.price) / 100} %`);
  });
}
const inSum = src.reduce((a, s) => a + s.valueSatoshis, 0n), outSum = tx.outputs.reduce((a, o) => a + o.valueSatoshis, 0n);
console.log(`       change ${tx.outputs.length > 3 ? `at output 3: ${tx.outputs[3].valueSatoshis}` : 'none'}   fee ${inSum - outSum} sats (${Number(inSum - outSum) / (wire.transaction.length / 2)} sat/B before signatures)`);

// ---------------------------------------------------------------- VM

console.log('\n5. VM');
const asOutputs = src as unknown as Output[];
const vms = { 'BCH 2023 (libauth 3.0.0 default)': createVirtualMachineBCH2023(true), 'BCH CHIPs (libauth 3.0.0)': createVirtualMachineBCHCHIPs(true) };

const evalInput0 = (name: string, vm: ReturnType<typeof createVirtualMachineBCH2023>, t: Transaction) => {
  const trace = vm.debug({ inputIndex: 0, sourceOutputs: asOutputs, transaction: t });
  const fail = trace.findIndex((s) => s.error !== undefined);
  const last = trace[trace.length - 1];
  if (fail === -1 && vm.stateSuccess(last) === true) { console.log(`  ok   ${name}: input 0 script evaluates to true (${trace.length} steps)`); return; }
  const s = trace[fail === -1 ? trace.length - 1 : fail];
  console.log(`  FAIL ${name}: input 0 — ${s.error ?? vm.stateSuccess(last)} at ip ${s.ip}`);
  console.log(`       stack ${JSON.stringify(s.stack.map(binToHex))}`);
  problems++;
};

let signed: Transaction = tx;
if (payload.signerKeyHex) {
  const key = new SignatureTemplate(hexToBin(payload.signerKeyHex));
  const wc = { transaction: tx, sourceOutputs: src } as never;
  const hex = refSign(wc, inputPaths, key);
  signed = decodeTransaction(hexToBin(hex)) as Transaction;
  const signedOut = arg('--signed-out');
  if (signedOut) fs.writeFileSync(signedOut, JSON.stringify({ signedHex: hex, sourceOutputs: wire.sourceOutputs }, null, 2));
}
for (const [name, vm] of Object.entries(vms)) {
  evalInput0(name, vm, signed);
  if (payload.signerKeyHex) {
    const r = vm.verify({ sourceOutputs: asOutputs, transaction: signed });
    console.log(`  ${r === true ? 'ok  ' : 'FAIL'} ${name}: full vm.verify (what the wallet runs after signing)${r === true ? '' : `\n       ${r}`}`);
    if (r !== true) problems++;
  }
}

console.log(`\n${problems ? `${problems} problem(s)` : 'all checks pass'}. Nothing was broadcast.`);
void stringify;
