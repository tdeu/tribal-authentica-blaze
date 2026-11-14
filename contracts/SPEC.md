# Contracts spec (BLAZE version)

Written during BCH BLAZE 2026. Based on [`preparation/contract-spec.md`](../preparation/contract-spec.md)
(pre-hackathon) with the changes listed under **Changes from the preparation spec**. The contracts in
`src/` were rewritten from this spec. No spike code was copied.

## RoyaltyVault

One contract per artisan. Each mask is one **mutable** CashTokens NFT of the platform's mask
category, locked in the vault forever. Ownership is the owner recorded in the commitment, not "holding the token".

### Parameters

| Parameter | Meaning | Checked by the deploy script |
|---|---|---|
| `maskCategory` (bytes32) | The platform's mask category, **VM byte order** (reversed from the txid explorers show) | Matches the platform's minting baton |
| `artisanLockingBytecode` | Artisan P2PKH locking bytecode | 25-byte P2PKH |
| `platformLockingBytecode` | Emtée P2PKH locking bytecode | 25-byte P2PKH |
| `royaltyBps` | Resale royalty, 1000 = 10 % | `0 < royaltyBps < 10000` |
| `platformBps` | Platform share of the first sale, 1000 = 10 % | `0 < platformBps < 10000` |
| `minRoyaltySats` | Royalty floor | `>= 546` (dust) |

### Commitment (36 bytes)

`ownerPkh (20) || price (8 LE, 0 = not for sale) || lastSalePrice (8 LE)`

### Global rules (both functions)

- The vault is **input 0** (`this.activeInputIndex == 0`), so there can be only one vault input per tx.
- Input 0's token category is `maskCategory + 0x01` (mutable). A forged NFT sent to the vault address is rejected.
- Output 0 has the same locking bytecode, the same category and capability, `tokenAmount == 0`, value ≥ the input value, and the new commitment.

### `list(pubkey ownerPk, sig ownerSig, int newPrice)`

- `hash160(ownerPk) == ownerPkh` and `checkSig(ownerSig, ownerPk)`.
- `newPrice >= 0`. `0` delists.
- If `newPrice > 0` and the owner is the artisan: `platformCut = newPrice × platformBps / 10000 >= 546` and `newPrice − platformCut >= 546`.
- If `newPrice > 0` and the owner is not the artisan: `newPrice >= royalty(newPrice) + 546`.
- New commitment: `ownerPkh || newPrice || lastSalePrice`. The owner and the last sale price are unchanged.

### `buy(bytes20 buyerPkh)`

- `price > 0`.
- New commitment: `buyerPkh || 0 || price`, so the new owner holds it delisted, with `lastSalePrice = price`.
- **Seller is the artisan** (first sale, or the artisan selling again):
  - output 1 → artisan, value ≥ `price − platformCut`;
  - output 2 → platform, value ≥ `platformCut`, where `platformCut = price × platformBps / 10000` (rounded down).
- **Resale** (seller is anyone else), with no platform share:
  - output 1 → seller, value ≥ `price − royalty`;
  - output 2 → artisan, value ≥ `royalty`.
- `royalty(p) = max(p × royaltyBps / 10000, lastSalePrice × royaltyBps / 10000, minRoyaltySats)`.

### Mint (off-chain, platform)

The platform holds one **minting baton** for the mask category. Each mint creates a mutable NFT at the
vault's token address with commitment `hash160(artisanPk) || firstSalePrice || 0`, so the mask is listed from mint.
The mint script must check `firstSalePrice × platformBps / 10000 >= 546`, or the first sale can't be built (dust).

Trust: whoever holds the minting baton can mint masks into any vault. That is the platform, by design.

## PatronDispenser

Unchanged from the preparation spec. It holds fungible Patron tokens, and `claim()` gives exactly 1 token for ≥ `patronPriceSats` paid to the artisan.

- Parameters: `artisanLockingBytecode`, `patronPriceSats` (≥ 546, deploy check), `patronCategory` (VM byte order).
- Stock > 1: `[0]` stock − 1 back to the dispenser, `[1]` artisan ≥ price, `[2]` exactly 1 token.
- Stock = 1: `[0]` artisan ≥ price + that UTXO's BCH, `[1]` exactly 1 token. Nothing is left at the contract.
- No platform share on Patron tokens.

## Changes from the preparation spec

| Change | Why |
|---|---|
| First sale: 90 % artisan / 10 % platform (`platformLockingBytecode`, `platformBps`). It was 100 % artisan (D2). | Product decision, 14 Nov 2026. It applies whenever the seller is the artisan, so an artisan selling again also pays the platform share. |
| `maskCategory` parameter, checked on every spend | Rejects forged NFTs sent to the vault address (open point in the preparation spec) |
| `list()`: `newPrice >= 0`, plus dust checks on both first-sale shares when the artisan lists | Without these the artisan could list at a price whose platform share is dust, and the mask could not be bought |
| Every `require` has a message | The tests assert *which* rule rejected each bypass attempt |

## Tests

`npm test` compiles both contracts and runs the vitest suite on `MockNetworkProvider` (local BCH VM, nothing broadcast).
It covers the 14 vault and 6 Patron bypass attempts from the spike, the 90/10 first-sale split, the three cases of
`royalty = max(…)` (each at the exact royalty and at 1 sat short), the dust rules on `list()`, the category and
capability checks, and the structural rules (input 0, two vault inputs, value drain).

## Costs (to measure on mainnet)

Each vault spend carries the full redeem script. The spike measured about 700 bytes for `buy`/`list` (≈ 700 sats at 1 sat/byte).
The BLAZE version adds the category check and the platform output. The size will be measured again at deploy.
