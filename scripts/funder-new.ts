// Generates a funder key into scripts/.env (gitignored) and prints ONLY its address.
//   npm run funder:new                     mainnet (MAINNET_FUNDER_WIF)
//   npm run funder:new -- --network chipnet
// Never overwrites an existing key: an existing funder may still hold coins.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generatePrivateKey, encodePrivateKeyWif } from '@bitauth/libauth';
import { NET, loadFunder, arg, type Network } from './lib.ts';

const network = (arg('--network') ?? 'mainnet') as Network;
if (network !== 'mainnet' && network !== 'chipnet') throw new Error('--network mainnet|chipnet');
const envName = NET[network].wifEnv;
const ENV = fileURLToPath(new URL('.env', import.meta.url));

if (process.env[envName]) {
  console.log(`${envName} already exists in scripts/.env, not overwriting.`);
} else {
  const wif = encodePrivateKeyWif(generatePrivateKey(), NET[network].wifType);
  const prev = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  fs.writeFileSync(ENV, `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}# ${network.toUpperCase()} funder, created ${new Date().toISOString()} - never commit, back up this file\n${envName}=${wif}\n`);
  process.env[envName] = wif;
  console.log(`new ${network} funder key written to scripts/.env (${envName})`);
}
console.log(`funder address: ${loadFunder(network).address}`);
