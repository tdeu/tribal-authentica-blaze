# Wallet checklist (WizardConnect × Selene)

These lessons come from the pre-hackathon spike (`preparation/decisions.md`, "Wallet connection — spike 11 Nov").
Each item lists where the app applies it. The numbers match the `(n)` comments in `src/wallet/`.

| # | Rule | Applied in |
|---|---|---|
| 1 | **Approve before xpubs.** Selene's first `wallet_ready` has `paths: []`. The xpubs arrive in a second `wallet_ready` only after the user taps **Connect** in Selene. Until then sign requests are silently dropped. The UI says "Approve the connection in Selene" and no sign button works before `approved`. | `wizard.ts` `onWalletReady()`, `sign()` guard |
| 2 | **The tx must be hex.** Selene rejects a decoded tx object, so `transaction` = `binToHex(encodeTransaction(tx))`. | `wire.ts` `toWire()` |
| 3 | **No BigInt or Uint8Array on the wire.** The relay does a plain `JSON.stringify`. `sourceOutputs` go through libauth `stringify`, then `JSON.parse`. `toWire()` proves the result serializes before anything is sent. | `wire.ts` |
| 4 | **Sighash `0x61` only** (ALL \| UTXOS \| FORKID). Selene refuses any other. Contract inputs that need the owner's signature use `placeholderSignature()` / `placeholderPublicKey()` and an `inputPaths` entry, and never a custom sighash. | Vault `list()` builder: `buildList` in app/src/chain/vault.ts (resell sheet), input 0 in `inputPaths` |
| 5 | **Dedupe and time out.** One sign request in flight. Asking again for the same tx returns the same promise, and a different tx is refused. Requests time out after 180 s. Broadcast is idempotent per txid, and a node answering "already known" counts as success. | `wizard.ts` `sign()`, `chain.ts` `broadcast()` |
| 6 | **The relay flaps every 10–30 s.** The relay status is shown to the user. A `disconnect` older than the latest `wallet_ready` (or the current relay session) is a replay and is ignored. | `wizard.ts` constructor, `onRelay` |
| 7 | **Never rebuild a pending tx.** The exact wire object is kept until the wallet answers, it times out, or the user cancels. Reconnects don't rebuild anything. | `wizard.ts` `inFlight`, `chain.ts` `BuiltTx.wire` |
| 8 | **Label failures by side:** request not sent (ours), wallet error (Selene), no answer (timeout), cancelled, or connection lost. | `wizard.ts` `SignOutcome` |
| 9 | **Selene mobile only, mainnet only.** Selene web has no chipnet and can't paste `wiz://` links. Show a QR **and** a "Copy connection link" button. If the wallet's xpub network doesn't match `VITE_NETWORK`, signing is disabled. | `config.ts`, `wizard.ts` `networkMismatch`, UI |
| 10 | **Check what comes back.** The wallet may only add signatures. The signed tx must have the same inputs and outputs as the one we built, or it is never broadcast. | `chain.ts` `checkSigned()` |
| 11 | **Keep the tab in front** while a request is pending, because a mobile or backgrounded tab drops the relay. The UI says so while `pending`. | UI |

## Funds discovery

Selene's BCH can sit on any HD address. The app scans `receive/0–9` and `change/0–9` (derived from the session xpubs)
for BCH-only UTXOs and sends each input's `[index, "receive" | "change", addressIndex]` in `inputPaths`.
Change goes back to `receive/0`.
