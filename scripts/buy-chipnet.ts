// CHIPNET ONLY. End-to-end buy of a minted mask, with the SAME builder the page uses
// (app/src/chain/vault.ts) and the spike's reference signer (spikes/wizardconnect/scripts/refwallet.ts)
// standing in for Selene, which has no chipnet.
//   npm run buy:chipnet -- --mask 1                 buyer = CHIPNET_BUYER_WIF
//   npm run buy:chipnet -- --mask 1 --as BUYER2     buyer = CHIPNET_BUYER2_WIF (e.g. to buy a resale)
// Buyer keys are created in scripts/.env if missing and topped up from the chipnet funder.
import { binToHex } from '@bitauth/libauth';
import { loadMasks, makeProvider, waitForUtxo, arg, NET } from './lib.ts';
import { vaultOf, readState, buildBuy, type MintRecord } from '../app/src/chain/vault.ts';
import { toWire } from '../app/src/wallet/wire.ts';
import { refSign } from '../spikes/wizardconnect/scripts/refwallet.ts';
import { chipnetKey, topUp, walletOf } from './chipnet-wallets.ts';

const network = 'chipnet' as const;
const id = Number(arg('--mask'));
const data = loadMasks();
const mask = data.masks.find((m) => m.catalogueId === id);
if (!mask) throw new Error('usage: npm run buy:chipnet -- --mask <catalogueId> [--as BUYER2]');
const mint = mask.mint[network] as MintRecord | null;
if (!mint) throw new Error(`mask ${id} is not minted on chipnet`);

const buyer = chipnetKey(`CHIPNET_${arg('--as') ?? 'BUYER'}_WIF`);
const provider = makeProvider(network);
const vault = vaultOf(mint, data.contract, provider);
const before = await readState(provider, vault, mint);
console.log(`mask ${id}: owner ${before.ownerIsCustodian ? 'custodian' : binToHex(before.ownerPkh)}, price ${before.price}, last sale ${before.lastSalePrice}`);
console.log(`buyer ${buyer.address}`);
if (before.price <= 0n) throw new Error(`mask ${id} is not for sale`);

await topUp(provider, buyer, before.price + 3_500n); // buildBuy wants price + 3 000 available

const built = buildBuy(provider, vault, before, data.contract, await walletOf(provider, buyer), `Buy mask ${id}`);
console.log(`${built.kind} sale: ${built.payouts.map((p) => `${p.sats} → ${p.role} ${p.address}`).join(', ')}, fee ${built.fee}`);

toWire(built.wc); // the page sends this exact object over WizardConnect; prove it serializes
const signed = refSign(built.wc, built.inputPaths, buyer.key as never);
const txid = await provider.sendRawTransaction(signed);
console.log(`buy     ${NET.chipnet.explorer}${txid}`);

await waitForUtxo(provider, vault.contract.tokenAddress, txid);
const after = await readState(provider, vault, mint);
const ok = binToHex(after.ownerPkh) === binToHex(buyer.pkh) && after.price === 0n && after.lastSalePrice === before.price
  && after.fingerprint === before.fingerprint;
console.log(`after: owner ${ok ? 'buyer ✓' : binToHex(after.ownerPkh)}, price ${after.price} (not for sale), last sale ${after.lastSalePrice}, fingerprint unchanged ${after.fingerprint === before.fingerprint}, unconfirmed ${after.unconfirmed}`);
process.exit(ok ? 0 : 1);
