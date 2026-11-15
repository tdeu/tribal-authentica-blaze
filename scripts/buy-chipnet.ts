// CHIPNET ONLY. End-to-end buy of a minted mask, with the SAME builder the page uses
// (app/src/chain/vault.ts) and the spike's reference signer (spikes/wizardconnect/scripts/refwallet.ts)
// standing in for Selene, which has no chipnet.
//   npm run buy:chipnet -- --mask 1
// The buyer key (CHIPNET_BUYER_WIF) is created in scripts/.env if missing and topped up from the chipnet funder.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SignatureTemplate, TransactionBuilder } from 'cashscript';
import { generatePrivateKey, encodePrivateKeyWif, encodeCashAddress, hash160, binToHex } from '@bitauth/libauth';
import { loadMasks, loadFunder, makeProvider, waitForUtxo, arg, NET, FEE_RATE } from './lib.ts';
import { vaultOf, readState, buildBuy, type MintRecord } from '../app/src/chain/vault.ts';
import { toWire } from '../app/src/wallet/wire.ts';
import { refSign } from '../spikes/wizardconnect/scripts/refwallet.ts';

const network = 'chipnet' as const;
const id = Number(arg('--mask'));
const data = loadMasks();
const mask = data.masks.find((m) => m.catalogueId === id);
if (!mask) throw new Error('usage: npm run buy:chipnet -- --mask <catalogueId>');
const mint = mask.mint[network] as MintRecord | null;
if (!mint) throw new Error(`mask ${id} is not minted on chipnet`);

const ENV = fileURLToPath(new URL('.env', import.meta.url));
if (!process.env.CHIPNET_BUYER_WIF) {
  const wif = encodePrivateKeyWif(generatePrivateKey(), 'testnet');
  fs.appendFileSync(ENV, `CHIPNET_BUYER_WIF=${wif}\n`);
  process.env.CHIPNET_BUYER_WIF = wif;
}
const buyerKey = new SignatureTemplate(process.env.CHIPNET_BUYER_WIF);
const buyerPkh = hash160(buyerKey.publicKey) as Uint8Array;
const buyerAddress = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: buyerPkh }).address;

const provider = makeProvider(network);
const vault = vaultOf(mint, data.contract, provider);
const before = await readState(provider, vault, mint);
console.log(`mask ${id}: owner ${before.ownerIsCustodian ? 'custodian (not yet sold)' : binToHex(before.ownerPkh)}, price ${before.price}, last sale ${before.lastSalePrice}`);
console.log(`buyer ${buyerAddress}`);

// Top up the buyer from the funder if needed
const need = before.price + 5_000n;
const bal = async () => (await provider.getUtxos(buyerAddress)).filter((u) => !u.token).reduce((s, u) => s + u.satoshis, 0n);
if (await bal() < need) {
  const funder = loadFunder(network);
  const fu = (await provider.getUtxos(funder.address)).filter((u) => !u.token);
  const { txid } = await new TransactionBuilder({ provider })
    .addInputs(fu, funder.key.unlockP2PKH())
    .addOutput({ to: buyerAddress, amount: need })
    .addBchChangeOutputIfNeeded({ to: funder.address, feeRate: FEE_RATE })
    .send();
  console.log(`top-up  ${NET.chipnet.explorer}${txid}`);
  await waitForUtxo(provider, buyerAddress, txid);
}

const utxos = (await provider.getUtxos(buyerAddress)).filter((u) => !u.token)
  .map((u) => ({ ...u, pathName: 'receive', index: 0, address: buyerAddress }));
const built = buildBuy(provider, vault, before, data.contract, { pkh: buyerPkh, changeAddress: buyerAddress, utxos }, `Buy mask ${id}`);
console.log(`${built.kind} sale: ${built.payouts.map((p) => `${p.sats} → ${p.role}`).join(', ')}, fee ${built.fee}`);

toWire(built.wc); // the page sends this exact object over WizardConnect; prove it serializes
const signed = refSign(built.wc, built.inputPaths, buyerKey as never);
const txid = await provider.sendRawTransaction(signed);
console.log(`buy     ${NET.chipnet.explorer}${txid}`);

await waitForUtxo(provider, vault.contract.tokenAddress, txid);
const after = await readState(provider, vault, mint);
const ok = binToHex(after.ownerPkh) === binToHex(buyerPkh) && after.price === 0n && after.lastSalePrice === before.price
  && after.fingerprint === before.fingerprint;
console.log(`after: owner ${ok ? 'buyer ✓' : binToHex(after.ownerPkh)}, last sale ${after.lastSalePrice}, fingerprint unchanged ${after.fingerprint === before.fingerprint}, unconfirmed ${after.unconfirmed}`);
process.exit(ok ? 0 : 1);
