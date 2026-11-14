// Chain access + building/checking/broadcasting the wallet's own transactions.
import {
  ElectrumNetworkProvider, TransactionBuilder, placeholderP2PKHUnlocker, type SpendableUtxo,
} from 'cashscript';
import { binToHex, cashAddressToLockingBytecode, decodeTransaction, hexToBin, sha256 } from '@bitauth/libauth';
import { NETWORK } from '../config';
import { wallet, RECEIVE, CHANGE, PATH_NAME, type InputPath } from './wizard';
import { toWire, type WireTransaction } from './wire';

export const provider = new ElectrumNetworkProvider(NETWORK);

export const DUST = 546n;
export const FEE_RATE = 1; // sat/byte

// How many addresses per path to scan for funds. Selene's funds can sit on any receive/change index.
const SCAN_PER_PATH = 10;

const lockOf = (address: string) => {
  const r = cashAddressToLockingBytecode(address);
  if (typeof r === 'string') throw new Error(r);
  return binToHex(r.bytecode);
};

export type WalletUtxo = SpendableUtxo & { path: number; index: number; address: string };

/** BCH-only UTXOs of the connected wallet across receive/change 0..SCAN_PER_PATH-1. */
export async function walletUtxos(): Promise<WalletUtxo[]> {
  const targets: { path: number; index: number; address: string }[] = [];
  for (const path of [RECEIVE, CHANGE]) {
    for (let i = 0; i < SCAN_PER_PATH; i++) {
      const a = wallet.addressAt(path, i);
      if (a) targets.push({ path, index: i, address: a.address });
    }
  }
  const lists = await Promise.all(targets.map(async (t) =>
    (await provider.getUtxos(t.address)).map((u) => ({ ...u, ...t, lockingBytecode: u.lockingBytecode ?? lockOf(t.address) }))));
  return lists.flat().filter((u) => !u.token);
}

export type BuiltTx = {
  wire: WireTransaction;       // exactly what goes to the wallet — never rebuilt (WALLET.md 7)
  inputPaths: InputPath[];
  unsignedHex: string;
  summary: { inputs: bigint; outputs: { address: string; sats: bigint }[]; fee: bigint };
};

/** Plain send from the connected wallet: `amount` sats to `to`, change back to receive/0. */
export async function buildPlainSend(to: string, amount: bigint, prompt: string): Promise<BuiltTx> {
  if (amount < DUST) throw new Error(`amount below dust (${DUST} sats)`);
  const change = wallet.addressAt(RECEIVE, 0);
  if (!change) throw new Error('wallet not approved yet');
  const utxos = (await walletUtxos()).sort((a, b) => (b.satoshis > a.satoshis ? 1 : -1));

  const tb = new TransactionBuilder({ provider });
  const inputPaths: InputPath[] = [];
  const margin = 1_000n; // covers the fee of a small tx at 1 sat/byte
  let total = 0n;
  for (const u of utxos) {
    if (total >= amount + margin + DUST) break;
    tb.addInput(u, placeholderP2PKHUnlocker(u.address));
    inputPaths.push([inputPaths.length, PATH_NAME[u.path], u.index]);
    total += u.satoshis;
  }
  if (total < amount + margin) {
    throw new Error(`Not enough BCH in the wallet: need about ${amount + margin} sats, found ${total} sats on receive/change 0–${SCAN_PER_PATH - 1}.`);
  }
  tb.addOutput({ to, amount });
  tb.addBchChangeOutputIfNeeded({ to: change.address, feeRate: FEE_RATE });

  const wc = tb.generateWcTransactionObject({ broadcast: false, userPrompt: prompt });
  const wire = toWire(wc);
  const outs = wc.transaction.outputs.map((o, i) => ({
    address: i === 0 ? to : change.address, sats: o.valueSatoshis,
  }));
  const outSum = outs.reduce((s, o) => s + o.sats, 0n);
  return { wire, inputPaths, unsignedHex: wire.transaction, summary: { inputs: total, outputs: outs, fee: total - outSum } };
}

/**
 * The wallet must only add signatures. Check that the signed tx spends the same outpoints and
 * creates exactly the same outputs as the one we asked it to sign.
 */
export function checkSigned(unsignedHex: string, signedHex: string): string | null {
  const a = decodeTransaction(hexToBin(unsignedHex));
  const b = decodeTransaction(hexToBin(signedHex));
  if (typeof a === 'string') return `cannot decode our tx: ${a}`;
  if (typeof b === 'string') return `cannot decode the wallet's tx: ${b}`;
  if (a.version !== b.version || a.locktime !== b.locktime) return 'version or locktime changed';
  if (a.inputs.length !== b.inputs.length) return 'input count changed';
  for (let i = 0; i < a.inputs.length; i++) {
    const x = a.inputs[i], y = b.inputs[i];
    if (binToHex(x.outpointTransactionHash) !== binToHex(y.outpointTransactionHash) || x.outpointIndex !== y.outpointIndex) return `input ${i} changed`;
    if (x.sequenceNumber !== y.sequenceNumber) return `input ${i} sequence changed`;
    if (y.unlockingBytecode.length === 0) return `input ${i} left unsigned`;
  }
  if (a.outputs.length !== b.outputs.length) return 'output count changed';
  for (let i = 0; i < a.outputs.length; i++) {
    const x = a.outputs[i], y = b.outputs[i];
    if (x.valueSatoshis !== y.valueSatoshis || binToHex(x.lockingBytecode) !== binToHex(y.lockingBytecode)) return `output ${i} changed`;
    if (JSON.stringify(x.token ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v instanceof Uint8Array ? binToHex(v) : v))
      !== JSON.stringify(y.token ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v instanceof Uint8Array ? binToHex(v) : v))) return `output ${i} token changed`;
  }
  return null;
}

export const txidOf = (hex: string) => binToHex(sha256.hash(sha256.hash(hexToBin(hex))).reverse());

// Idempotent broadcast (WALLET.md 5): the same signed tx is sent once; a node saying it already
// has it counts as success.
const broadcasted = new Map<string, Promise<string>>();
export function broadcast(signedHex: string): Promise<string> {
  const txid = txidOf(signedHex);
  const existing = broadcasted.get(txid);
  if (existing) return existing;
  const p = provider.sendRawTransaction(signedHex).catch((e: Error) => {
    if (/already|txn-already-known|known/i.test(String(e?.message ?? e))) return txid;
    broadcasted.delete(txid);
    throw e;
  });
  broadcasted.set(txid, p);
  return p;
}
