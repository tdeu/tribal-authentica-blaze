# Contracts spec (BLAZE version)

Written during BCH BLAZE 2026. Based on [`preparation/contract-spec.md`](../preparation/contract-spec.md)
(pre-hackathon) with the changes listed under **Changes from the preparation spec**. The contract in
`src/` was rewritten from this spec. No spike code was copied.

## Product model (15 Nov 2026)

Each listing is one **traditional mask** that stays physically with its **custodian** in Côte d'Ivoire.
The buyer buys the mask's 1/1 digital title and its story. Nothing is shipped.

- One CashTokens **category per mask**, holding exactly one **mutable** NFT. No minting baton is ever created.
- The NFT lives in that mask's **RoyaltyVault** forever. Ownership is the owner recorded in the commitment.
- The commitment starts with the mask's **fingerprint**, which the vault keeps unchanged on every spend
  ("fingerprint locked by the contract").
- Before the first sale, the on-chain owner is the custodian's key. The UI says **"Not yet sold"**.

## RoyaltyVault

One contract instance per mask.

### Parameters

| Parameter | Meaning | Checked by `scripts/mint.ts` |
|---|---|---|
| `maskCategory` (bytes32) | This mask's category (= its prep txid), **VM byte order** (reversed from explorers) | Set from the prep tx |
| `custodianLockingBytecode` | P2PKH of the mask's payout address (`z…` or `q…`) | Valid P2PKH cashaddr on the right network |
| `platformLockingBytecode` | Emtée P2PKH | Valid P2PKH cashaddr on the right network |
| `royaltyBps` | Resale royalty, 1000 = 10 % | `0 < royaltyBps < 10000` |
| `platformBps` | Platform share of the first sale, 1000 = 10 % | `0 < platformBps < 10000` |
| `minRoyaltySats` | Royalty floor | `>= 546` (dust) |

### Commitment (70 bytes)

| Bytes | Field | Changes? |
|---|---|---|
| 0–1 | `catalogueId` (uint16 LE) | Frozen |
| 2–33 | `fingerprint` = sha256 of the mask's canonical JSON | Frozen |
| 34–53 | `ownerPkh` | `buy()` |
| 54–61 | `price` (uint64 LE, 0 = not for sale) | `list()`, `buy()` |
| 62–69 | `lastSalePrice` (uint64 LE) | `buy()` |

70 bytes needs the BCH 2026 upgrade (commitment limit 40 → 128 bytes). `scripts/commitment-probe.ts`
proves it on chipnet before any mint. If it fails, the fallback is the old 36-byte commitment with the
34-byte fingerprint in an OP_RETURN of the prep tx (the category ID is that txid, so it still commits).

**Fingerprint.** sha256 of the canonical JSON (keys sorted, UTF-8, no whitespace) of
`{catalogueId, title, story: {fr, en}, custodianLabel, photos: [sha256 of each photo file, in masks.json order]}`.
Code: [`app/src/data/fingerprint.ts`](../app/src/data/fingerprint.ts), shared by the scripts and the in-browser Verify.

### Global rules (both functions)

- The vault is **input 0** (`this.activeInputIndex == 0`), so there can be only one vault input per tx.
- Input 0's token category is `maskCategory + 0x01` (mutable). Any other category at the vault address is rejected.
- The commitment is exactly 70 bytes.
- Output 0 has the same locking bytecode, the same category and capability, `tokenAmount == 0`,
  value ≥ the input value, and the new commitment, whose first 34 bytes equal the input's.

### `list(pubkey ownerPk, sig ownerSig, int newPrice)`

- `hash160(ownerPk) == ownerPkh` and `checkSig(ownerSig, ownerPk)`.
- `newPrice >= 0`. `0` delists.
- If `newPrice > 0` and the owner is the custodian: `platformCut = newPrice × platformBps / 10000 >= 546` and `newPrice − platformCut >= 546`.
- If `newPrice > 0` and the owner is not the custodian: `newPrice >= royalty(newPrice) + 546`.
- New commitment: `head || ownerPkh || newPrice || lastSalePrice`.

### `buy(bytes20 buyerPkh)`

- `price > 0`.
- New commitment: `head || buyerPkh || 0 || price`, so the new owner holds it delisted, with `lastSalePrice = price`.
- **Seller is the custodian** (first sale, or the custodian selling again):
  - output 1 → custodian, value ≥ `price − platformCut`;
  - output 2 → platform, value ≥ `platformCut`, where `platformCut = price × platformBps / 10000` (rounded down).
- **Resale** (seller is anyone else), with no platform share:
  - output 1 → seller, value ≥ `price − royalty`;
  - output 2 → custodian, value ≥ `royalty`.
- `royalty(p) = max(p × royaltyBps / 10000, lastSalePrice × royaltyBps / 10000, minRoyaltySats)`.

## Mint (off-chain, `scripts/mint.ts`)

Two transactions per mask, chained across masks:

1. **Prep:** funder → output 0 (to the funder) holding `vaultSats + genesis fee`. The category ID is this txid.
2. **Genesis:** spends prep:0 and has **one output**: a mutable NFT of the new category, straight into the
   vault (whose address depends on the category), with commitment `catalogueId || fingerprint || custodianPkh || price || 0`.

The script checks before sending that the genesis has exactly one output, no minting capability anywhere,
the NFT is at the vault with the expected commitment, and the vault output is above dust. Since no
minting baton exists, nobody (the platform included) can ever create a second certificate for a mask.

## Changes from the preparation spec

| Change | Why |
|---|---|
| One category and one vault **per mask** (was one platform category with a minting baton, one vault per artisan) | No baton means no trusted minter after genesis |
| 70-byte commitment with a frozen `catalogueId + fingerprint` head | The certificate commits to the mask's photos and story, and no spend can change that |
| `artisan…` → `custodian…` | Traditional masks held by a custodian, not contemporary pieces by an artisan |
| First sale: 90 % custodian / 10 % platform (`platformLockingBytecode`, `platformBps`). It was 100 % (D2). | Product decision, 14 Nov 2026 |
| `maskCategory` parameter, checked on every spend | Rejects any other token sent to the vault address |
| `list()`: `newPrice >= 0`, plus dust checks on both first-sale shares when the custodian lists | Otherwise a listing could be unbuyable |
| PatronDispenser removed | Out of scope for the custodian model. It stays in git history (`f3ff622`). |
| Every `require` has a message | The tests assert *which* rule rejected each bypass attempt |

## Tests

`npm test` compiles the contract and runs the vitest suite on `MockNetworkProvider` (local BCH 2026 VM, nothing
broadcast): the 14 bypass attempts from the spike, the 90/10 first-sale split, the three cases of
`royalty = max(…)` (each exact and 1 sat short), the dust rules on `list()`, the category and capability
checks, the structural rules (input 0, two vault inputs, value drain), and the frozen fingerprint
(changed fingerprint or catalogueId on `buy()`/`list()`, 36- and 71-byte commitments).

`scripts/` has its own suite (`cd scripts && npm test`): prep + genesis on the mock chain, no minting-capable
output in the category, then first sale and resale against the minted NFT.
