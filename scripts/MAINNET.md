# Mainnet go-live checklist

Everything below runs from `scripts/` unless noted. **Nothing here has been sent on mainnet yet.**
The mint command only broadcasts with `--confirm`; without it, it prints the plan and the exact cost.

Status on 17 Nov 2026: chipnet loop proven (README, "Proof"). Mainnet funder
`bitcoincash:qp8syd9hwppgm5nvlgyhlcxw50lvym454ytp2mkg0e` holds **0 sats**. Its key is `MAINNET_FUNDER_WIF`
in `scripts/.env`, which is gitignored.

## 0. What I need from you

| # | Item | Goes into `app/src/data/masks.json` | Notes |
|---|---|---|---|
| 1 | ✅ **Emtée payout address** `bitcoincash:zzdp7rlydlkn5xfqcnvads57yyj5sfcpmgmlxll8dj` (19 Nov, validated) | `platformPayoutAddress.mainnet` | Receives 10 % of each first sale (47,000 sats at 470,000) |
| 2 | ✅ **Keeper payout addresses** (demo wallets held by Emtée, 19 Nov, validated): A `bitcoincash:zzlxp6zyqwazynfaj87388mdhn4em2ac6gykt8f735` for masks 1, 3, 5 · B `bitcoincash:zzufp366rmcjnc65cxalurmpagcxky74c5xk95tw8m` for 2, 4 | `masks[i].payoutAddress.mainnet` | One per mask, or the same one for all. Receives 90 % of the first sale and every royalty. **Frozen into each vault at mint, can't be changed later** |
| 3 | **Final content per mask**: title, story FR + EN, custodian label | `title`, `story.fr`, `story.en`, `custodianLabel` | Mainnet mint refuses any `[PLACEHOLDER]`. Fingerprinted at mint, so **frozen forever** |
| 4 | **Photos** (optional but recommended) | drop into `app/public/masks/` named `001-1.jpg`, `001-2.jpg`…; I list them in `masks[i].photos` | The photo bytes are fingerprinted. Don't recompress or rename them after mint |
| 5 | **Which masks to mint**, all 5 or a subset | `--mask <id>` or `--mask all` | Cost per mask is below |
| 6 | **Mainnet price** per mask, if not 470,000 sats | `masks[i].priceSats.mainnet` | Locked in the first commitment; the custodian key can relist later |
| 7 | **Fund the funder** from Selene | send to `bitcoincash:qp8syd9hwppgm5nvlgyhlcxw50lvym454ytp2mkg0e` | 1 mask ≈ 1,850 sats, 2 ≈ 3,700, 5 ≈ 9,250. **Send 15,000** for headroom |

Optional: `VITE_DECK_URL` on Vercel (the banner shows "Deck" greyed out until it's set).

## 1. Fill in the data (me, once items 1–6 arrive)

```
# edit app/src/data/masks.json with items 1–4 and 6, then:
cd scripts
npm run fingerprint            # recomputes photo hashes + fingerprints into masks.json
npm run fingerprint -- --check # must print "up to date"
npm test                       # 15 mock-chain tests
cd ../contracts && npm test && cd ../scripts
```
Then you review `git diff app/src/data/masks.json` (titles, stories, addresses). I commit and push. Nothing goes on chain at this step.

## 2. Dry run: plan and exact cost, nothing sent

```
npm run mint -- --network mainnet --mask all
```
This prints, per mask: the custodian payout address, price, first-sale split (custodian / Emtée),
fingerprint, commitment, and genesis size. Then the total cost and the funder balance. It stops with
"MAINNET: nothing sent." It refuses to run if any placeholder is left, an address is invalid or on the
wrong network, or the funder has too little.

**Check before step 3:** each address matches what you gave me, and price is 470,000 → 423,000 custodian / 47,000 Emtée.

## 3. Mint, after your explicit "go" with the amount

```
npm run mint -- --network mainnet --mask all --confirm
```
- Cost: about **1,849 sats per mask** = 1,000 locked in the vault (stays with the certificate forever)
  + 600 genesis fee + about 249 prep fee. 5 masks ≈ 9,245 sats.
- Per mask it prints prep and genesis links (blockchair), checks the NFT in the vault, and writes
  `categoryId` + `mint.mainnet` into `masks.json` after each mask.
- If it stops halfway, the masks already minted are saved. Re-run with only the remaining ids,
  e.g. `--mask 4`. Any unused prep output stays with the funder.

```
cd .. && git add app/src/data/masks.json && git commit -m "Mainnet: masks minted" && git push
```
The push deploys on its own (root `vercel.json`). Then check `vercel ls tribal-authentica --scope tdeus-projects`
shows **Ready**, and https://tribal-authentica.vercel.app shows "Not yet sold" + an active Buy button.

## 4. Early Selene test purchase (you, on your phone)

1. Selene on **mainnet**, holding at least **price + 3,000 sats**: 473,000 sats for a 470,000 mask (the fee is about 1,000).
2. On the live site, open the mask, click **Buy with Bitcoin Cash**, connect, then **Confirm in Selene**.
   The sheet shows 423,000 → custodian, 47,000 → Emtée before you sign.
3. After "Bought ✓", open **View the certificate**. Check that Owner says "Yours…", **Verify** shows Match ✓,
   and History lists the sale with the blockchair link.

Cost to you: the price (470,000 sats, of which 423,000 goes to the custodian and 47,000 to Emtée,
which is your own payout address) + about 1,000 sats fee.

## 5. Optional: resale test on mainnet

Only if you want the royalty proven on mainnet too: list from the certificate page (**Resell**, about 1,000 sats fee),
then buy from a second wallet. At 470,000 the royalty is 47,000 to the custodian (10 % of the price,
or of the last sale, whichever is higher).

## Never

- No mainnet broadcast without your explicit go and the amount (mint uses `--confirm`).
- Never commit `scripts/.env` or any WIF.
- Don't redeploy `tribal-authentica-before` (frozen "before" demo).
- Deploy only to `tdeus-projects/tribal-authentica` for the main site.
