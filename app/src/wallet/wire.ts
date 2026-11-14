// CashScript WC transaction object → what goes over the WizardConnect relay.
// WALLET.md items 2 and 3: the tx must be a hex string, and nothing may contain a BigInt
// or Uint8Array (the relay does a plain JSON.stringify). libauth's `stringify` turns them into
// "<bigint: Xn>" / "<Uint8Array: 0x…>" strings, which Selene parses.
import { binToHex, encodeTransaction, stringify } from '@bitauth/libauth';
import type { WcTransactionObject } from 'cashscript';

export type WireTransaction = {
  transaction: string;
  sourceOutputs: Record<string, unknown>[];
  broadcast?: boolean;
  userPrompt?: string;
};

export function toWire(wc: WcTransactionObject): WireTransaction {
  const { transaction, sourceOutputs, ...rest } = wc;
  // Selene only reads artifact.contractName (+ redeemScript): drop source/debug to keep messages small
  const slim = sourceOutputs.map((o) =>
    o.contract
      ? { ...o, contract: { ...o.contract, artifact: { ...o.contract.artifact, source: undefined, debug: undefined } } }
      : o,
  );
  const wire: WireTransaction = {
    ...rest,
    transaction: binToHex(encodeTransaction(transaction)),
    sourceOutputs: JSON.parse(stringify(slim)),
  };
  JSON.stringify(wire); // prove it serializes before it goes anywhere
  return wire;
}
