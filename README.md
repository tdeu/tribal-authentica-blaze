# Tribal Authentica

**Built for BCH BLAZE 2026** (DoraHacks, Mainnet track).

CashTokens NFT certificates for contemporary Ivorian masks. Each mask has one certificate NFT,
locked forever in a CashScript covenant (the RoyaltyVault):

- **First sale:** 90 % to the artisan, 10 % to Emtée (the platform).
- **Every resale, forever:** at least 10 % to the artisan, enforced on-chain.
  The royalty is `max(10 % × price, 10 % × last sale price, floor)`, so a cheap "wash" resale can't dodge it.

Ownership is the owner recorded in the NFT inside the vault, not "holding a token in your wallet",
so the certificate can't be moved without paying the artisan.

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

**During BLAZE:** every commit after that tag. The contracts in [`contracts/`](contracts/) are rewritten
from the spec, not copied from the spikes, and the app in [`app/`](app/) is new.

## Repository layout

| Folder | Content | When |
|---|---|---|
| `preparation/` | Specs, decisions, spike report | Before BLAZE, unchanged |
| `spikes/` | Throwaway pre-hackathon spikes | Before BLAZE, unchanged |
| `contracts/` | RoyaltyVault + PatronDispenser, test suite, spec | During BLAZE |
| `app/` | Web app (Vite + React + TypeScript), WizardConnect wallet | During BLAZE |

## License

MIT, see [LICENSE](LICENSE).
