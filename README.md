# Tribal Authentica

**Built for BCH BLAZE 2026** (DoraHacks, Mainnet track).

Digital titles for **traditional Ivorian masks**. Each mask stays physically with its custodian in
Côte d'Ivoire; the buyer (diaspora, art lovers abroad) buys the mask's one-of-one digital title and its story.
Nothing is shipped.

Each mask has its own CashTokens category with one certificate NFT, locked forever in that mask's
CashScript covenant (the RoyaltyVault). The certificate commits to the mask's **fingerprint** (sha256 of its
photos and story), and the contract keeps that fingerprint unchanged on every sale.

- **First sale:** 90 % to the mask's custodian, 10 % to Emtée (the platform).
- **Every resale, forever:** at least 10 % to the custodian, enforced on-chain.
  The royalty is `max(10 % × price, 10 % × last sale price, floor)`, so a cheap "wash" resale can't dodge it.
- No minting baton exists for any mask, so nobody can issue a second certificate.

The current collection is a **demo**: masks photographed by Emtée, payout to a pilot custodian in Abidjan.
In production, payouts go to the workshop or family that holds the mask.

| | |
|---|---|
| Hosted demo | https://tribal-authentica.vercel.app |
| Pitch deck | [DECK_URL] |
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
| 1. First sale at 6,000 sats | [`e392570e…`](https://chipnet.bch.ninja/tx/e392570e0d5f5dc867c6d19a4573fed81d9926744361f8dc1542aa16a459ee5e) | **5,400 → custodian**, 600 → Emtée; certificate stays in the vault, now in the buyer's name |
| 2. Owner resells at 8,000 sats (`list()`, owner-signed) | [`67653847…`](https://chipnet.bch.ninja/tx/67653847a17b1fb45450ba03e574d1d3567542f91fb4bedc7ed7287a097ffa18) | nothing; price set to 8,000, owner and last sale unchanged |
| 3. Second buyer buys the resale | [`25657110…`](https://chipnet.bch.ninja/tx/25657110abec8459536a2a86af7a699fe53b913e460c02bfd71ccd81c9b74a6c) | 7,000 → seller, **1,000 → custodian** (royalty floor, since 10 % of 8,000 = 800) |

The fingerprint in the certificate is identical after all three transactions. Reproduce with
`npm run buy:chipnet -- --mask 1`, `npm run resell:chipnet -- --mask 1 --price 8000`,
`npm run buy:chipnet -- --mask 1 --as BUYER2` in `scripts/`.

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
