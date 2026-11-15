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
| Hosted demo | [DEMO_URL] |
| Pitch deck | [DECK_URL] |
| "Before" demo (frozen) | [BEFORE_DEMO_URL] |
| Pre-hackathon code | [tribal-authentica-preparation @ before-blaze-14nov](https://github.com/tdeu/tribal-authentica-preparation/tree/before-blaze-14nov) |
| Donations (CashTokens-aware) | `bitcoincash:zr0krft3nnzhggqah9tdl3qpvyahyzwrfvjqagkdux` |

## Before / During BLAZE

The official build window opened on **14 Nov 2026, 14:00 UTC**.

**Before (tag [`before-blaze-14nov`](https://github.com/tdeu/tribal-authentica-preparation/tree/before-blaze-14nov), commit `8ee22a4`):**
written specs and design decisions, throwaway CLI spikes of both contracts tested on **chipnet only**,
and a WizardConnect × Selene **sign-only** dry run (nothing broadcast). No product UI, no frontend,
no mainnet deployment. This work is kept unchanged in [`preparation/`](preparation/) and [`spikes/`](spikes/).

**During BLAZE:** every commit after that tag. The contract in [`contracts/`](contracts/) is rewritten
from the spec, not copied from the spikes, and the app in [`app/`](app/) is new.

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
