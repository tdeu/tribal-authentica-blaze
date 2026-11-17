// CHIPNET ONLY. Throwaway test keys standing in for Selene (which has no chipnet), signed with the spike's
// reference wallet. Each key lives in scripts/.env (gitignored), is created if missing, and is topped up
// from the chipnet funder when it runs low.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SignatureTemplate, TransactionBuilder, type NetworkProvider } from 'cashscript';
import { generatePrivateKey, encodePrivateKeyWif, encodeCashAddress, hash160 } from '@bitauth/libauth';
import { loadFunder, waitForUtxo, NET, FEE_RATE } from './lib.ts';

const ENV = fileURLToPath(new URL('.env', import.meta.url));

export function chipnetKey(envName: string) {
  if (!process.env[envName]) {
    const wif = encodePrivateKeyWif(generatePrivateKey(), 'testnet');
    fs.appendFileSync(ENV, `${envName}=${wif}\n`);
    process.env[envName] = wif;
  }
  const key = new SignatureTemplate(process.env[envName]!);
  const pkh = hash160(key.publicKey) as Uint8Array;
  const address = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address;
  return { envName, key, pkh, address };
}
export type ChipnetKey = ReturnType<typeof chipnetKey>;

export const bchBalance = async (provider: NetworkProvider, address: string) =>
  (await provider.getUtxos(address)).filter((u) => !u.token).reduce((s, u) => s + u.satoshis, 0n);

/** Makes sure `who` holds at least `need` sats (BCH only), topping up from the chipnet funder. */
export async function topUp(provider: NetworkProvider, who: ChipnetKey, need: bigint) {
  const have = await bchBalance(provider, who.address);
  if (have >= need) return;
  const funder = loadFunder('chipnet');
  const fu = (await provider.getUtxos(funder.address)).filter((u) => !u.token);
  const funds = fu.reduce((s, u) => s + u.satoshis, 0n);
  const amount = need - have;
  if (funds < amount + 500n) {
    throw new Error(`chipnet funder ${funder.address} has ${funds} sats, needs about ${amount + 500n} to top up ${who.envName}. Fund it, then re-run.`);
  }
  const { txid } = await new TransactionBuilder({ provider })
    .addInputs(fu, funder.key.unlockP2PKH())
    .addOutput({ to: who.address, amount })
    .addBchChangeOutputIfNeeded({ to: funder.address, feeRate: FEE_RATE })
    .send();
  console.log(`top-up ${who.envName} +${amount}  ${NET.chipnet.explorer}${txid}`);
  await waitForUtxo(provider, who.address, txid);
}

/** The key's BCH UTXOs in the shape the page's builders take (as Selene's receive/0). */
export const walletOf = async (provider: NetworkProvider, who: ChipnetKey) => ({
  pkh: who.pkh, changeAddress: who.address, path: ['receive', 0] as [string, number],
  utxos: (await provider.getUtxos(who.address)).filter((u) => !u.token)
    .map((u) => ({ ...u, pathName: 'receive', index: 0, address: who.address })),
});
