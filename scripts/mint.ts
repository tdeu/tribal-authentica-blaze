// Mints mask certificates: one CashTokens category per mask, one mutable NFT, straight into that mask's vault.
//   npm run mint -- --network chipnet --mask 1
//   npm run mint -- --network chipnet --mask all
//   npm run mint -- --network mainnet --mask 1             prints the plan only
//   npm run mint -- --network mainnet --mask 1 --confirm   sends (mainnet: ask first, state the amount)
//   add --dry-run to print the plan without sending on any network
//
// Per mask, 2 txs: prep (output 0 → category ID = prep txid) then genesis (prep:0 → the NFT in the vault,
// nothing else). Masks are minted one after the other, each prep spending the previous change.
// categoryId and the mint record are written back to app/src/data/masks.json after each mask.
import { binToHex } from '@bitauth/libauth';
import {
  loadMasks, saveMasks, refreshFingerprints, placeholdersIn, parsePayout, loadFunder, makeProvider, vaultContract,
  buildPrep, buildGenesis, checkGenesis, waitForUtxo, encodeCommitment, arg, flag, NET, FEE_RATE, GENESIS_FEE,
  type Network, type Mask,
} from './lib.ts';

const network = arg('--network') as Network;
if (network !== 'chipnet' && network !== 'mainnet') throw new Error('usage: --network chipnet|mainnet --mask <id>|all [--confirm] [--dry-run]');
const maskArg = arg('--mask');
if (!maskArg) throw new Error('--mask <catalogueId>|all is required');

const provider = makeProvider(network);
const funder = loadFunder(network);
const funderUtxos = (await provider.getUtxos(funder.address)).filter((u) => !u.token);
const balance = funderUtxos.reduce((s, u) => s + u.satoshis, 0n);
console.log(`funder (${network}) ${funder.address}  balance ${balance} sats`);

const data = loadMasks();
const stale = refreshFingerprints(data);
if (stale.length) throw new Error(`masks.json is stale (${stale.join(', ')}). Run: npm run fingerprint, review, commit, then mint.`);

const selected: Mask[] = maskArg === 'all' ? data.masks : data.masks.filter((m) => m.catalogueId === Number(maskArg));
if (!selected.length) throw new Error(`no mask with catalogueId ${maskArg}`);

const platform = parsePayout(data.platformPayoutAddress[network], network, 'platform payout address');
const { vaultSats: vs, platformBps } = data.contract;
const vaultSats = BigInt(vs);

// ---------------------------------------------------------------- plan (all checks before anything is sent)

let usdPerBch: number | undefined;
try {
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd');
  usdPerBch = Number((await r.json())?.['bitcoin-cash']?.usd) || undefined;
} catch { /* display only */ }
const usd = (sats: bigint | number) => (usdPerBch ? ` (≈ $${((Number(sats) / 1e8) * usdPerBch).toFixed(2)})` : '');

const FAKE_TXID = '00'.repeat(32);
const PREP_FEE_EST = BigInt(Math.ceil((10 + 148 + 2 * 34) * FEE_RATE)); // 1 funder input; more inputs on the first prep
const plan = selected.map((m) => {
  const where = `mask ${m.catalogueId}`;
  if (m.categoryId[network]) throw new Error(`${where} is already minted on ${network} (category ${m.categoryId[network]}). Clear categoryId/mint in masks.json to re-mint.`);
  if (network === 'mainnet') {
    const ph = placeholdersIn(m);
    if (ph.length) throw new Error(`${where}: refusing a mainnet mint with placeholder content (${ph.join(' | ')}). The fingerprint would freeze it forever.`);
  }
  const custodian = parsePayout(m.payoutAddress[network], network, `${where} payout address`);
  const price = BigInt(m.priceSats[network]);
  const cut = price * BigInt(platformBps) / 10000n;
  if (cut < 546n || price - cut < 546n) throw new Error(`${where}: price ${price} gives a dust share (platform ${cut}, custodian ${price - cut})`);
  const commitment = encodeCommitment({ catalogueId: m.catalogueId, fingerprint: m.fingerprint!, ownerPkh: custodian.pkh, price, lastSalePrice: 0n });
  // Size check of the genesis tx with a placeholder category (same size as the real one)
  const v = vaultContract(data, custodian.lock, platform.lock, FAKE_TXID, provider);
  const fakePrep = { txid: FAKE_TXID, vout: 0, satoshis: vaultSats + GENESIS_FEE, lockingBytecode: '76a914' + binToHex(funder.pkh) + '88ac' };
  const hex = buildGenesis(provider, funder, fakePrep, v.tokenAddress, vaultSats, commitment).build();
  const { size, dust } = checkGenesis(hex, FAKE_TXID, v.lockingBytecode, commitment);
  if (BigInt(Math.ceil(size * FEE_RATE)) > GENESIS_FEE) throw new Error(`${where}: genesis is ${size} bytes, GENESIS_FEE ${GENESIS_FEE} too low`);
  if (vaultSats < dust) throw new Error(`${where}: vaultSats ${vaultSats} below dust ${dust}`);
  return { m, custodian, price, cut, commitment, genesisSize: size };
});

const perMask = vaultSats + GENESIS_FEE + PREP_FEE_EST;
const total = perMask * BigInt(plan.length);

console.log(`\nMINT PLAN — ${network.toUpperCase()}`);
console.log(`funder   ${funder.address}  balance ${balance} sats${usd(balance)}`);
console.log(`platform ${platform.address}`);
console.log(`contract royalty ${data.contract.royaltyBps / 100} %, platform ${platformBps / 100} % of first sale, royalty floor ${data.contract.minRoyaltySats} sats\n`);
for (const p of plan) {
  console.log(`mask ${String(p.m.catalogueId).padStart(3, '0')}  ${p.m.title}`);
  console.log(`  custodian payout  ${p.custodian.address}`);
  console.log(`  price             ${p.price} sats${usd(p.price)}  → first sale: ${p.price - p.cut} custodian / ${p.cut} platform`);
  console.log(`  fingerprint       ${p.m.fingerprint}`);
  console.log(`  commitment        ${binToHex(p.commitment)} (${p.commitment.length} bytes)`);
  console.log(`  genesis tx        ${p.genesisSize} bytes, NFT mutable, no minting baton`);
}
console.log(`\ncost: ${plan.length} × (${vaultSats} locked in vault + ${GENESIS_FEE} genesis fee + ~${PREP_FEE_EST} prep fee) ≈ ${total} sats${usd(total)}`);
if (balance < total) { console.error(`\nfunder balance too low: has ${balance}, needs ≈ ${total}. Fund ${funder.address}.`); process.exit(1); }

if (flag('--dry-run')) { console.log('\n--dry-run: nothing sent.'); process.exit(0); }
if (network === 'mainnet' && !flag('--confirm')) { console.log('\nMAINNET: nothing sent. Re-run with --confirm to broadcast.'); process.exit(0); }

// ---------------------------------------------------------------- send

const ex = NET[network].explorer;
for (const p of plan) {
  const id = p.m.catalogueId;
  const utxos = (await provider.getUtxos(funder.address)).filter((u) => !u.token);
  const { txid: prepTxid } = await buildPrep(provider, funder, utxos, vaultSats + GENESIS_FEE).send();
  console.log(`\nmask ${id} prep     ${ex}${prepTxid}`);
  const prep0 = (await waitForUtxo(provider, funder.address, prepTxid)).find((u) => u.vout === 0)!;
  if (prep0.satoshis !== vaultSats + GENESIS_FEE) throw new Error('prep output 0 has an unexpected value');

  const categoryId = prepTxid;
  const vault = vaultContract(data, p.custodian.lock, platform.lock, categoryId, provider);
  const genesis = buildGenesis(provider, funder, prep0, vault.tokenAddress, vaultSats, p.commitment);
  checkGenesis(genesis.build(), categoryId, vault.lockingBytecode, p.commitment);
  const { txid: genesisTxid } = await genesis.send();
  console.log(`mask ${id} genesis  ${ex}${genesisTxid}`);

  const [nft] = await waitForUtxo(provider, vault.tokenAddress, genesisTxid);
  if (nft.token?.category !== categoryId || nft.token.nft?.capability !== 'mutable' || nft.token.nft.commitment !== binToHex(p.commitment)) {
    throw new Error(`mask ${id}: vault UTXO does not match what was minted: ${JSON.stringify(nft.token, (_, v) => (typeof v === 'bigint' ? String(v) : v))}`);
  }
  p.m.categoryId[network] = categoryId;
  p.m.mint[network] = {
    categoryId, vaultTokenAddress: vault.tokenAddress, prepTxid, genesisTxid, commitment: binToHex(p.commitment),
    priceSats: Number(p.price), custodianAddress: p.custodian.address, platformAddress: platform.address,
    mintedAt: new Date().toISOString(),
  };
  saveMasks(data);
  console.log(`mask ${id} in vault ${vault.tokenAddress}\n         category ${categoryId} → written to masks.json`);
}
console.log('\ndone.');
