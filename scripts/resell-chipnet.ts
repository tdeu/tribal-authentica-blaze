// CHIPNET ONLY. The holder resells a mask with the SAME list() builder the certificate page uses,
// signed by the reference wallet (owner signature filled into the contract placeholders, as Selene does).
//   npm run resell:chipnet -- --mask 1 --price 8000                 holder = CHIPNET_BUYER_WIF
//   npm run resell:chipnet -- --mask 1 --price 0                    take it off sale
//   npm run resell:chipnet -- --mask 1 --price 8000 --as BUYER2     holder = CHIPNET_BUYER2_WIF
// Then buy it with another key: npm run buy:chipnet -- --mask 1 --as BUYER2
import { binToHex } from '@bitauth/libauth';
import { loadMasks, makeProvider, waitForUtxo, arg, NET } from './lib.ts';
import { vaultOf, readState, buildList, readHistory, type MintRecord } from '../app/src/chain/vault.ts';
import { toWire } from '../app/src/wallet/wire.ts';
import { refSign } from '../spikes/wizardconnect/scripts/refwallet.ts';
import { chipnetKey, topUp, walletOf } from './chipnet-wallets.ts';

const network = 'chipnet' as const;
const id = Number(arg('--mask'));
const priceArg = arg('--price');
const data = loadMasks();
const mask = data.masks.find((m) => m.catalogueId === id);
if (!mask || priceArg === undefined || !/^\d+$/.test(priceArg)) throw new Error('usage: npm run resell:chipnet -- --mask <catalogueId> --price <sats> [--as BUYER2]');
const mint = mask.mint[network] as MintRecord | null;
if (!mint) throw new Error(`mask ${id} is not minted on chipnet`);
const newPrice = BigInt(priceArg);

const holder = chipnetKey(`CHIPNET_${arg('--as') ?? 'BUYER'}_WIF`);
const provider = makeProvider(network);
const vault = vaultOf(mint, data.contract, provider);
const before = await readState(provider, vault, mint);
console.log(`mask ${id}: owner ${binToHex(before.ownerPkh)}, price ${before.price}, last sale ${before.lastSalePrice}`);
console.log(`holder ${holder.address}`);
if (binToHex(before.ownerPkh) !== binToHex(holder.pkh)) throw new Error(`${holder.envName} does not own mask ${id}`);

await topUp(provider, holder, 2_500n); // list() fee margin is 2 000

const built = buildList(provider, vault, before, data.contract, await walletOf(provider, holder), newPrice, `Resell mask ${id}`);
// What the page shows before signing
console.log(newPrice === 0n ? 'take off sale' : `resale at ${newPrice} sats → ${built.preview.payouts.map((p) => `${p.sats} ${p.role === 'seller' ? 'to you' : `royalty to the ${p.role}`}`).join(', ')}`);
console.log(`network fee ${built.fee} sats`);

toWire(built.wc);
const signed = refSign(built.wc, built.inputPaths, holder.key as never);
const txid = await provider.sendRawTransaction(signed);
console.log(`list    ${NET.chipnet.explorer}${txid}`);

await waitForUtxo(provider, vault.contract.tokenAddress, txid);
const after = await readState(provider, vault, mint);
const ok = after.price === newPrice && binToHex(after.ownerPkh) === binToHex(holder.pkh)
  && after.lastSalePrice === before.lastSalePrice && after.fingerprint === before.fingerprint;
console.log(`after: price ${after.price}, owner unchanged ${binToHex(after.ownerPkh) === binToHex(holder.pkh)}, last sale ${after.lastSalePrice}, fingerprint unchanged ${after.fingerprint === before.fingerprint}`);

const history = await readHistory(provider, vault, mint, data.contract);
console.log('history:');
for (const e of history) console.log(`  ${e.kind.padEnd(8)} ${String(e.price).padStart(7)} sats  ${e.height > 0 ? `block ${e.height}` : 'mempool'}  ${NET.chipnet.explorer}${e.txid}`);
process.exit(ok ? 0 : 1);
