# Sankofa

Formerly Tribal Authentica (repo name kept).

**Built for BCH BLAZE 2026** (DoraHacks, Mainnet track).

Digital titles for **traditional African masks**. The buyer (diaspora, art lovers abroad) buys the mask's
one-of-one digital title and its story. The physical mask can stay with its source or travel with its buyer:
Sankofa tracks provenance, not location. The title and its sealed story stay valid wherever the mask goes,
and the source keeps earning 10 % of every resale.

Each mask has its own CashTokens category with one certificate NFT, locked forever in that mask's
CashScript covenant (the RoyaltyVault). The certificate commits to the mask's **fingerprint** (sha256 of its
photos and story), and the contract keeps that fingerprint unchanged on every sale.

- **First sale:** 90 % to the mask's custodian, 10 % to Sankofa (the platform).
- **Every resale, forever:** at least 10 % to the custodian, enforced on-chain.
  The royalty is `max(10 % × price, 10 % × last sale price, floor)`, so a cheap "wash" resale can't dodge it.
- No minting baton exists for any mask, so nobody can issue a second certificate.

**Demo collection** — masks kept in Abidjan by Emtée Studio, the team behind Sankofa. Keeper payouts go to demo
wallets held by Emtée. In production, payouts go to the workshop or family that keeps the mask.
Sankofa is built by Emtée Studio.

| | |
|---|---|
| Hosted demo | https://sankofa-bch.vercel.app (the old https://tribal-authentica.vercel.app redirects there) |
| What if something goes wrong? | [8 answers, each with its proof](#what-if-something-goes-wrong) |
| Pitch deck | [Google Slides](https://docs.google.com/presentation/d/1wRwPAqEoICa7sl4T7qwZa7WGzh77cil6-C260JdPCE4/edit?usp=sharing) |
| "Before" demo (frozen) | https://tribal-authentica-before.vercel.app |
| Pre-hackathon code | [tribal-authentica-preparation @ before-blaze-14nov](https://github.com/tdeu/tribal-authentica-preparation/tree/before-blaze-14nov) |
| Donations (CashTokens-aware) | `bitcoincash:zr0krft3nnzhggqah9tdl3qpvyahyzwrfvjqagkdux` |

## Before / During BLAZE

The official build window opened on **14 Nov 2026, 14:00 UTC**.

**Before (tag [`before-blaze-14nov`](https://github.com/tdeu/tribal-authentica-preparation/tree/before-blaze-14nov), commit `8ee22a4`):**
written specs and design decisions, throwaway CLI spikes of both contracts tested on **chipnet only**,
and a WizardConnect × Selene **sign-only** dry run (nothing broadcast). No product UI, no frontend,
no mainnet deployment. This work is kept unchanged in [`preparation/`](preparation/) and [`spikes/`](spikes/).

The **frozen "before" demo** at https://tribal-authentica-before.vercel.app is `spikes/wizardconnect`
built from that tag, deployed once as its own Vercel project, and never redeployed: it shows exactly
what existed before the build window (a bare WizardConnect connect + sign test page).

**During BLAZE:** every commit after that tag. The contract in [`contracts/`](contracts/) is rewritten
from the spec, not copied from the spikes, and the app in [`app/`](app/) is new.

| Date | What was built |
|---|---|
| 14 Nov | RoyaltyVault rewritten from the spec + test suite (spike bypass attempts, 90/10 split, royalty max); app scaffold, WizardConnect wallet module, mask page, BLAZE banner, connect sheet |
| 15 Nov | One vault per mask with a 70-byte commitment (frozen fingerprint, owner, price, last sale); fingerprint + mint tooling; gallery, live on-chain status, buy sheet; shared vault module used by both the page and the chipnet scripts |
| 16 Nov | Masks 1 and 2 minted on chipnet |
| 17 Nov | Certificate page: in-browser Verify, owner, sale history, Resell with the royalty shown before signing; full buy → resell → resale loop on chipnet (below) |

The chipnet test scripts sign with the spike's reference wallet (`spikes/wizardconnect/scripts/refwallet.ts`)
as a stand-in for Selene, which has no chipnet. They import it; the spike itself is unchanged.

## Proof: the full loop on chipnet

Mask 001, using the same transaction builders the web page sends to the wallet
(`app/src/chain/vault.ts`), on 17 Nov 2026:

| Step | Transaction | Paid out (read back from the transaction) |
|---|---|---|
| 1. First sale at 6,000 sats | [`e392570e…`](https://chipnet.bch.ninja/tx/e392570e0d5f5dc867c6d19a4573fed81d9926744361f8dc1542aa16a459ee5e) | **5,400 → custodian**, 600 → Sankofa; certificate stays in the vault, now in the buyer's name |
| 2. Owner resells at 8,000 sats (`list()`, owner-signed) | [`67653847…`](https://chipnet.bch.ninja/tx/67653847a17b1fb45450ba03e574d1d3567542f91fb4bedc7ed7287a097ffa18) | nothing; price set to 8,000, owner and last sale unchanged |
| 3. Second buyer buys the resale | [`25657110…`](https://chipnet.bch.ninja/tx/25657110abec8459536a2a86af7a699fe53b913e460c02bfd71ccd81c9b74a6c) | 7,000 → seller, **1,000 → custodian** (royalty floor, since 10 % of 8,000 = 800) |

The fingerprint in the certificate is identical after all three transactions. Reproduce with
`npm run buy:chipnet -- --mask 1`, `npm run resell:chipnet -- --mask 1 --price 8000`,
`npm run buy:chipnet -- --mask 1 --as BUYER2` in `scripts/`.

## Mainnet

Mask 001, *Crested mask with brass plates*, is minted on Bitcoin Cash mainnet (19 Nov 2026):

| | |
|---|---|
| Category ID | `c2b532553c45e6c4da0f03e01c61cb3f56d0682bcab1daa4db67684c0d6830f9` |
| Prep tx (creates the category) | [`c2b53255…`](https://blockchair.com/bitcoin-cash/transaction/c2b532553c45e6c4da0f03e01c61cb3f56d0682bcab1daa4db67684c0d6830f9) |
| Genesis tx (the title, into its vault) | [`a165a94d…`](https://blockchair.com/bitcoin-cash/transaction/a165a94df6342eb62682247bf92e7a7d333446c2a8e57940b3eab6a73b8132d9) |
| Vault | `bitcoincash:rv064cvkhdlc0c74y02957ctuxx9k2lpe0l94z7c0753rsc0hmalwlgyadjgf` |
| Fingerprint | `31c05e3e7a19c85d76ec08d5db8ea0f137ba2a3ce588c9f3f34b6ca73411770c` |
| Price | 470,000 sats: 423,000 to the keeper, 47,000 to Sankofa on the first sale |

**First sale on mainnet:** mask 003, *Two-horned mask with a metal ring*, bought with Paytaca on 21 Nov 2026 in
[`bd6fcbb1…`](https://blockchair.com/bitcoin-cash/transaction/bd6fcbb10bb238cf13c2a4b274ebe8d2c7aabd8e9a561be0de4838f438c2f63c):
470,000 sats paid, 423,000 to the keeper and 47,000 to Sankofa (outputs 1 and 2, as the vault requires), network fee 916 sats.
The title stayed in its vault, now in the buyer's name, with price 0 (not for sale) and last sale price 470,000.

### How the demo was funded

The mint funder `bitcoincash:qp8syd9hwppgm5nvlgyhlcxw50lvym454ytp2mkg0e` was funded from Revolut with one
transaction, [`0d6fc602…`](https://blockchair.com/bitcoin-cash/transaction/0d6fc6028789d092c830a03a779891af68d9e4361def5c0c39c4c45c23126a4d), which delivered 435,983 sats. Minting mask 001 cost
1,849 sats (1,000 locked in the vault with the title, 600 genesis fee, 249 prep fee). The buyer wallet used for the
first purchase was funded separately. Keeper and Sankofa payouts go to demo wallets held by Emtée Studio.

## Wallets

Sankofa is built on the May 2026 network upgrade (128-byte NFT commitments, new VM limits).

The app connects with **WizardConnect** (`@wizardconnect/core` 0.2.5, `@wizardconnect/dapp` 0.2.2).

| Wallet | Status |
|---|---|
| **Paytaca** | Supported |
| **Cashonize** | Supported |
| Selene | Not yet supported |

Checked on 21 Nov 2026 by running each wallet's own WizardConnect request checks and signing code (Cashonize `main` 78e0984,
Paytaca `main` f474603) on our mask 002 buy request: both return a fully signed transaction, which passes libauth
3.1.0-next.8's 2026 VM rules, the rules mainnet enforces now. Nothing was broadcast in that test.

**Why not Selene yet:** each certificate is a 70-byte NFT commitment (mask ID, fingerprint, owner, price, last sale),
which the May 2026 network upgrade allows (the limit went from 40 to 128 bytes). Selene (version of 14 Oct 2026,
libauth 3.0.0) still refuses any commitment over 40 bytes before signing, and checks the signed transaction against
the 2023 VM rules, where the RoyaltyVault also exceeds the old 201-operation limit. Selene will work as soon as it moves to the 2026 rules; nothing in the contract needs to change.

<a id="what-if-something-goes-wrong"></a>
## What if something goes wrong?

Each answer is a fact about this code, with its proof. Masks 001–005 are minted on mainnet, and mask 003's first sale is on mainnet ([`bd6fcbb1…`](https://blockchair.com/bitcoin-cash/transaction/bd6fcbb10bb238cf13c2a4b274ebe8d2c7aabd8e9a561be0de4838f438c2f63c)); the resale proofs stay on chipnet until a mask is resold on mainnet. "Test" means the network's script validator (the BCH VM) refuses the attack in our test suite (`contracts/`: 49 tests, `scripts/`: 15 tests).

1. **Does the title prove the mask is genuine?** It records on-chain that Sankofa minted this title for this keeper, when, and the fingerprint of its photos and story, which can never change (Verify recomputes it in your browser). It does not prove the object itself; in this demo, Emtée Studio photographed and listed the masks.
   Proof: [genesis tx, mask 001 (mainnet)](https://blockchair.com/bitcoin-cash/transaction/a165a94df6342eb62682247bf92e7a7d333446c2a8e57940b3eab6a73b8132d9) · [chipnet](https://chipnet.bch.ninja/tx/aa225bb5705d86428d8aac06e91d599444d0c37462ac7fdb9f3f74a31ab0f24c) · [tests: fingerprint frozen by the contract](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/test/RoyaltyVault.test.ts#L320)
2. **Can the keeper go unpaid on the first sale?** No: 90% goes to the keeper's address in the same transaction that hands you the title.
   Proof: [first sale, 5,400 of 6,000 sats to the keeper](https://chipnet.bch.ninja/tx/e392570e0d5f5dc867c6d19a4573fed81d9926744361f8dc1542aa16a459ee5e)
3. **Can a reseller skip the keeper's 10%?** No. Every resale must pay the keeper the highest of: 10% of the new price, 10% of the last sale price, or 1,000 sats. A lowballed resale still pays 10% of the last sale. The network refuses any resale that pays the keeper less, and any listing not signed by the owner.
   Proof: [resale, 1,000 sats royalty](https://chipnet.bch.ninja/tx/25657110abec8459536a2a86af7a699fe53b913e460c02bfd71ccd81c9b74a6c) · tests in [`RoyaltyVault.test.ts`](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/test/RoyaltyVault.test.ts): [8. resale with no custodian payment](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/test/RoyaltyVault.test.ts#L217), [11. royalty not indexed on the last sale](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/test/RoyaltyVault.test.ts#L235), [12. royalty 1 sat short](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/test/RoyaltyVault.test.ts#L242), [14. floor-only case](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/test/RoyaltyVault.test.ts#L254), [6. wash relist at 2 000 after a 50 000 sale](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/test/RoyaltyVault.test.ts#L206), [1](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/test/RoyaltyVault.test.ts#L179) and [2](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/test/RoyaltyVault.test.ts#L184): non-owner `list()`; [wrong signer](https://github.com/tdeu/tribal-authentica-blaze/blob/main/scripts/test/resale.test.ts#L149) in `scripts/test/resale.test.ts`
4. **Can anyone create a second copy?** No. The mask's category never had a minting capability, and the contract freezes the identity bytes (mask ID + fingerprint); only owner, price and last sale price change on a sale.
   Proof: [genesis tx, mask 001 (mainnet)](https://blockchair.com/bitcoin-cash/transaction/a165a94df6342eb62682247bf92e7a7d333446c2a8e57940b3eab6a73b8132d9) · [chipnet](https://chipnet.bch.ninja/tx/aa225bb5705d86428d8aac06e91d599444d0c37462ac7fdb9f3f74a31ab0f24c) · [test: the category has no minting-capable output, ever](https://github.com/tdeu/tribal-authentica-blaze/blob/main/scripts/test/mint.test.ts#L66)
5. **Where is my title, and what if this website disappears?** Your title stays in the mask's vault, registered to your address. That is what makes the royalty impossible to skip, so you won't see it as a token in your wallet; your certificate shows it. The vault and its history are on-chain, and anyone can re-run Verify from this repo without our site: `cd app && npm install && npm run dev`, then open a mask's certificate (it reads a public BCH server directly, [`app/src/chain/vault.ts`](https://github.com/tdeu/tribal-authentica-blaze/blob/main/app/src/chain/vault.ts)).
6. **What if I pay and nothing happens?** Payment and title change happen in one transaction: both or neither.
   Proof: [one tx: title to the buyer, 5,400 to the keeper, 600 to Sankofa](https://chipnet.bch.ninja/tx/e392570e0d5f5dc867c6d19a4573fed81d9926744361f8dc1542aa16a459ee5e)
7. **Honest limit:** if a keeper loses their wallet, their royalties keep going to that address. Roadmap: a recoverable payout address.
   Proof: the payout address is a constructor parameter of [`RoyaltyVault.cash`](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/src/RoyaltyVault.cash), fixed at mint.
8. **Can the physical mask leave its source?** Yes. Sankofa tracks provenance, not location: the title and its sealed story stay valid wherever the mask goes, and the source keeps earning 10% of every resale.
   Proof: [`RoyaltyVault.cash`](https://github.com/tdeu/tribal-authentica-blaze/blob/main/contracts/src/RoyaltyVault.cash) pays the source on every resale and holds no location.

## Repository layout

| Folder | Content | When |
|---|---|---|
| `preparation/` | Specs, decisions, spike report | Before BLAZE, unchanged |
| `spikes/` | Throwaway pre-hackathon spikes | Before BLAZE, unchanged |
| `contracts/` | RoyaltyVault, test suite, spec | During BLAZE |
| `scripts/` | Fingerprint + mint tooling (chipnet / mainnet), mock-chain tests | During BLAZE |
| `app/` | Web app (Vite + React + TypeScript), WizardConnect wallet, mask data (`app/src/data/masks.json`) | During BLAZE |

## License

MIT, see [LICENSE](LICENSE).
