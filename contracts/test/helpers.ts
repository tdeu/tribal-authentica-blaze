// Shared test fixtures: deterministic keys, mock chain, commitment encoding.
import { Contract, MockNetworkProvider, SignatureTemplate, type Artifact, type SpendableUtxo as Utxo } from 'cashscript';
import {
  sha256, secp256k1, hash160, encodeCashAddress, binToHex, hexToBin, bigIntToBinUint64LE,
} from '@bitauth/libauth';
import { readFileSync } from 'node:fs';

export const loadArtifact = (name: string): Artifact =>
  JSON.parse(readFileSync(new URL(`../artifacts/${name}.json`, import.meta.url), 'utf8'));

export type Party = {
  name: string; sk: Uint8Array; pk: Uint8Array; pkh: Uint8Array; lock: Uint8Array;
  address: string; tokenAddress: string; signer: SignatureTemplate;
};

// Deterministic key per label (test-only, never funded anywhere)
export function party(name: string): Party {
  const sk = sha256.hash(new TextEncoder().encode(`tribal-authentica test key: ${name}`));
  const pk = secp256k1.derivePublicKeyCompressed(sk) as Uint8Array;
  const pkh = hash160(pk) as Uint8Array;
  return {
    name, sk, pk, pkh,
    lock: p2pkh(pkh),
    address: encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address,
    tokenAddress: encodeCashAddress({ prefix: 'bchtest', type: 'p2pkhWithTokens', payload: pkh }).address,
    signer: new SignatureTemplate(sk),
  };
}

export const p2pkh = (pkh: Uint8Array) => hexToBin('76a914' + binToHex(pkh) + '88ac');

let counter = 0;
// Unique fake txid per call
export const fakeTxid = () => binToHex(sha256.hash(new TextEncoder().encode(`txid ${++counter}`)));

// Category as explorers show it (txid order) → VM byte order for contract parameters
export const vmOrder = (categoryHex: string) => hexToBin(categoryHex).reverse();

// Frozen head of every test certificate: catalogueId (2, LE) || fingerprint (32)
export const HEAD = new Uint8Array([7, 0, ...sha256.hash(new TextEncoder().encode('test mask fingerprint'))]);

// 70-byte commitment: head (34) || ownerPkh (20) || price (8 LE) || lastSalePrice (8 LE)
export const commitment = (ownerPkh: Uint8Array, price: bigint, lastSalePrice: bigint, head: Uint8Array = HEAD) =>
  binToHex(new Uint8Array([...head, ...ownerPkh, ...bigIntToBinUint64LE(price), ...bigIntToBinUint64LE(lastSalePrice)]));

export const bchUtxo = (satoshis: bigint, owner: Party): Utxo =>
  ({ txid: fakeTxid(), vout: 0, satoshis, lockingBytecode: binToHex(owner.lock) });

export const newProvider = () => new MockNetworkProvider();
export { Contract };
