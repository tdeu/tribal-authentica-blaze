// Dev-only page: prove one real mainnet broadcast through Selene + WizardConnect.
// Three explicit steps (build → sign → broadcast); nothing is sent until step 3 is clicked.
import QRCode from 'qrcode';
import { wallet } from '../wallet/wizard';
import { buildPlainSend, checkSigned, broadcast, type BuiltTx } from '../wallet/chain';
import { NETWORK, explorerTx } from '../config';

const AMOUNT = 1_000n;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let built: BuiltTx | undefined;
let signedHex: string | undefined;

wallet.subscribe((s) => {
  const lines = [
    `app network: ${NETWORK}`,
    `relay: ${s.relay}${s.relayError ? ` (${s.relayError})` : ''}`,
    s.walletName ? `wallet: ${s.walletName}` : '',
    s.dappKey && !s.approved ? `dapp key (compare in Selene's dialog): ${s.dappKey}` : '',
    s.relay !== 'idle' && !s.approved ? '→ Approve the connection in Selene. Nothing works until you do.' : '',
    s.approved ? `wallet network: ${s.walletNetwork}${s.networkMismatch ? '  ← MISMATCH, sending disabled' : ''}` : '',
    s.address ? `receive/0: ${s.address}` : '',
    s.tokenAddress ? `token address: ${s.tokenAddress}` : '',
    s.pending ? 'signature request pending in Selene…' : '',
  ];
  $('conn').textContent = lines.filter(Boolean).join('\n');
  $('qr').hidden = $('copy').hidden = !s.qrUri || s.approved;
  if (s.address && !$<HTMLInputElement>('to').value) $<HTMLInputElement>('to').value = s.address;
  $<HTMLButtonElement>('build').disabled = !s.approved || s.networkMismatch || s.pending;
  $('cancel').hidden = !s.pending;
});

$('connect').onclick = async () => {
  wallet.connect();
  if (wallet.state.qrUri) await QRCode.toCanvas($<HTMLCanvasElement>('qr'), wallet.state.qrUri, { width: 240, margin: 1 });
};
$('copy').onclick = () => navigator.clipboard.writeText(wallet.state.pairingUri ?? '');
$('cancel').onclick = () => wallet.cancelPending();

$('build').onclick = async () => {
  built = undefined; signedHex = undefined;
  $<HTMLButtonElement>('broadcast').disabled = true; $('signed').textContent = ''; $('result').textContent = '';
  try {
    built = await buildPlainSend($<HTMLInputElement>('to').value.trim(), AMOUNT, `Tribal Authentica: send ${AMOUNT} sats (broadcast test)`);
    const s = built.summary;
    $('built').textContent = [
      `inputs total: ${s.inputs} sats  (${built.inputPaths.map((p) => `${p[1]}/${p[2]}`).join(', ')})`,
      ...s.outputs.map((o, i) => `output ${i}: ${o.sats} sats → ${o.address}`),
      `fee: ${s.fee} sats`,
    ].join('\n');
    $<HTMLInputElement>('confirm').disabled = false;
  } catch (e) { $('built').textContent = `Build failed: ${(e as Error).message}`; }
};
$('confirm').onchange = () => { $<HTMLButtonElement>('sign').disabled = !$<HTMLInputElement>('confirm').checked || !built; };

$('sign').onclick = async () => {
  if (!built) return;
  $<HTMLButtonElement>('sign').disabled = true;
  $('signed').textContent = 'Waiting for Selene… approve the request in the app.';
  const r = await wallet.sign(built.wire, built.inputPaths);
  if (!r.ok) { $('signed').textContent = `FAILED (${r.side}): ${r.message}`; $<HTMLButtonElement>('sign').disabled = false; return; }
  const problem = checkSigned(built.unsignedHex, r.signedHex);
  if (problem) { $('signed').textContent = `Wallet returned a different tx, NOT broadcasting: ${problem}`; return; }
  signedHex = r.signedHex;
  $('signed').textContent = `Signed by Selene, matches what we built.\n${r.signedHex}`;
  $<HTMLButtonElement>('broadcast').disabled = false;
};

$('broadcast').onclick = async () => {
  if (!signedHex) return;
  $<HTMLButtonElement>('broadcast').disabled = true;
  try {
    const txid = await broadcast(signedHex);
    $('result').innerHTML = `<span class="ok">BROADCAST OK</span>\ntxid ${txid}\n<a href="${explorerTx(txid)}" target="_blank" rel="noreferrer">${explorerTx(txid)}</a>`;
  } catch (e) {
    $('result').textContent = `Node rejected it: ${(e as Error).message}`;
    $<HTMLButtonElement>('broadcast').disabled = false;
  }
};

wallet.resume();
