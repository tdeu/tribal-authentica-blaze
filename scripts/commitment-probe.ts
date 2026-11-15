// CHIPNET ONLY. Proves the network accepts a 70-byte NFT commitment (BCH 2026 upgrade: limit 40 → 128 bytes)
// before we rely on it. Mints one mutable NFT with a 70-byte commitment to the funder's own token address,
// then reads it back from the Electrum server and compares the bytes.
//   npm run probe
import { TransactionBuilder } from 'cashscript';
import { binToHex, encodeCashAddress, sha256, utf8ToBin } from '@bitauth/libauth';
import { makeProvider, loadFunder, buildPrep, waitForUtxo, NET, FEE_RATE } from './lib.ts';
import { encodeCommitment } from '../app/src/data/fingerprint.ts';

const network = 'chipnet' as const;
const provider = makeProvider(network);
const funder = loadFunder(network);
const tokenAddress = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkhWithTokens', payload: funder.pkh }).address;

const commitment = encodeCommitment({
  catalogueId: 0xffff, fingerprint: binToHex(sha256.hash(utf8ToBin('commitment probe'))),
  ownerPkh: funder.pkh, price: 470_000n, lastSalePrice: 0n,
});
console.log(`probe: ${commitment.length}-byte commitment, funder ${funder.address}`);

const utxos = await provider.getUtxos(funder.address);
const bal = utxos.filter((u) => !u.token).reduce((s, u) => s + u.satoshis, 0n);
console.log(`funder balance ${bal} sats`);
if (bal < 5_000n) { console.error(`fund ${funder.address} from a chipnet faucet first (5 000+ sats)`); process.exit(1); }

const prep = buildPrep(provider, funder, utxos, 2_000n);
const { txid: prepTxid } = await prep.send();
console.log(`prep    ${NET.chipnet.explorer}${prepTxid}`);
const [prep0] = (await waitForUtxo(provider, funder.address, prepTxid)).filter((u) => u.vout === 0);

const genesis = new TransactionBuilder({ provider })
  .addInput(prep0, funder.key.unlockP2PKH())
  .addOutput({ to: tokenAddress, amount: 1_000n, token: { category: prepTxid, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(commitment) } } });
const size = genesis.build().length / 2;
if (BigInt(Math.ceil(size * FEE_RATE)) > prep0.satoshis - 1_000n) throw new Error(`fee too low for ${size} bytes`);
try {
  const { txid } = await genesis.send();
  console.log(`genesis ${NET.chipnet.explorer}${txid}`);
  const back = (await waitForUtxo(provider, tokenAddress, txid))[0];
  const ok = back.token?.nft?.commitment === binToHex(commitment);
  console.log(ok ? `OK: chipnet accepted and returned the ${commitment.length}-byte commitment` : `MISMATCH: got ${back.token?.nft?.commitment}`);
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(`REJECTED: ${(e as Error).message}`);
  console.error('Fallback: keep the 36-byte commitment and put the 34-byte fingerprint in an OP_RETURN of the prep tx.');
  process.exit(1);
}
