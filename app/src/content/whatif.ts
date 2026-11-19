// "What if something goes wrong?" — every answer is a fact about our code, with its proof.
// Proof links: chipnet transactions (mainnet ones get added once mask 001 is minted and sold there)
// and the test that makes the network's script validator (the BCH VM) refuse the attack.
import type { Lang } from './mask';

const GH = 'https://github.com/tdeu/tribal-authentica-blaze/blob/main';
const CHIP = 'https://chipnet.bch.ninja/tx/';
const TX = {
  genesis: `${CHIP}aa225bb5705d86428d8aac06e91d599444d0c37462ac7fdb9f3f74a31ab0f24c`,
  firstSale: `${CHIP}e392570e0d5f5dc867c6d19a4573fed81d9926744361f8dc1542aa16a459ee5e`,
  resale: `${CHIP}25657110abec8459536a2a86af7a699fe53b913e460c02bfd71ccd81c9b74a6c`,
};
const VAULT_TEST = `${GH}/contracts/test/RoyaltyVault.test.ts`;
const T = {
  noPayment: `${VAULT_TEST}#L217`,      // 8. resale with no custodian payment
  notIndexed: `${VAULT_TEST}#L235`,     // 11. royalty not indexed on the last sale
  oneShort: `${VAULT_TEST}#L242`,       // 12. royalty 1 sat short
  floor: `${VAULT_TEST}#L254`,          // 14. floor-only case
  wash: `${VAULT_TEST}#L206`,           // 6. wash relist at 2 000 after a 50 000 sale
  nonOwner: `${VAULT_TEST}#L179`,       // 1. non-owner list() with their own key
  ownerPkOwnSig: `${VAULT_TEST}#L184`,  // 2. non-owner list() presenting the owner pubkey with their own signature
  wrongSigner: `${GH}/scripts/test/resale.test.ts#L149`,
  noBaton: `${GH}/scripts/test/mint.test.ts#L66`,
  frozenFp: `${VAULT_TEST}#L320`,       // fingerprint (catalogueId + sha256) is frozen by the contract
  payoutParam: `${GH}/contracts/src/RoyaltyVault.cash`,
  vaultReader: `${GH}/app/src/chain/vault.ts`,
};

export type Proof = { label: string; href: string };
export type WhatIf = { q: string; a: string; proofs: Proof[] };

export const WHAT_IF: Record<Lang, { label: string; title: [string, string]; proof: string; items: WhatIf[] }> = {
  en: {
    label: '01 / WHAT IF SOMETHING GOES WRONG?',
    title: ['WHAT IF', 'SOMETHING GOES WRONG?'],
    proof: 'Proof',
    items: [
      {
        q: 'Does the title prove the mask is genuine?',
        a: 'It records on-chain that Emtée minted this title for this keeper, when, and the fingerprint of its photos and story, which can never change (Verify recomputes it in your browser). It does not prove the object itself; in this demo, Emtée photographed and listed the masks.',
        proofs: [{ label: 'genesis tx, mask 001 (chipnet)', href: TX.genesis }, { label: 'test: fingerprint frozen by the contract', href: T.frozenFp }],
      },
      {
        q: 'Can the keeper go unpaid on the first sale?',
        a: 'No: 90% goes to the keeper’s address in the same transaction that hands you the title.',
        proofs: [{ label: 'first sale: 5,400 of 6,000 sats to the keeper (chipnet)', href: TX.firstSale }],
      },
      {
        q: 'Can a reseller skip the keeper’s 10%?',
        a: 'No. Every resale must pay the keeper the highest of: 10% of the new price, 10% of the last sale price, or 1,000 sats. A lowballed resale still pays 10% of the last sale. The network refuses any resale that pays the keeper less, and any listing not signed by the owner.',
        proofs: [
          { label: 'resale: 1,000 sats royalty (chipnet)', href: TX.resale },
          { label: 'test 8: no keeper payment', href: T.noPayment },
          { label: 'test 11: royalty not indexed on the last sale', href: T.notIndexed },
          { label: 'test 12: royalty 1 sat short', href: T.oneShort },
          { label: 'test 14: below the 1,000-sat floor', href: T.floor },
          { label: 'test 6: lowball relist', href: T.wash },
          { label: 'tests 1–2: listed by a non-owner', href: T.nonOwner },
          { label: 'test: wrong signer', href: T.wrongSigner },
        ],
      },
      {
        q: 'Can anyone create a second copy?',
        a: 'No. The mask’s category never had a minting capability, and the contract freezes the identity bytes (mask ID + fingerprint); only owner, price and last sale price change on a sale.',
        proofs: [{ label: 'genesis tx, mask 001 (chipnet)', href: TX.genesis }, { label: 'test: the category has no minting-capable output, ever', href: T.noBaton }],
      },
      {
        q: 'Where is my title, and what if this website disappears?',
        a: 'Your title stays in the mask’s vault, registered to your address. That is what makes the royalty impossible to skip, so you won’t see it as a token in your wallet; your certificate shows it. The vault and its history are on-chain, and anyone can re-run Verify from this repo without our site.',
        proofs: [{ label: 'vault reader (reads a public BCH server directly)', href: T.vaultReader }],
      },
      {
        q: 'What if I pay and nothing happens?',
        a: 'Payment and title change happen in one transaction: both or neither.',
        proofs: [{ label: 'one tx: title to the buyer + keeper + Emtée (chipnet)', href: TX.firstSale }],
      },
      {
        q: 'Honest limit',
        a: 'If a keeper loses their wallet, their royalties keep going to that address. Roadmap: a recoverable payout address.',
        proofs: [{ label: 'payout address is fixed in the contract', href: T.payoutParam }],
      },
    ],
  },
  fr: {
    label: '01 / ET SI QUELQUE CHOSE TOURNE MAL ?',
    title: ['ET SI QUELQUE CHOSE', 'TOURNE MAL ?'],
    proof: 'Preuve',
    items: [
      {
        q: 'Le titre prouve-t-il que le masque est authentique ?',
        a: 'Il enregistre sur la blockchain qu’Emtée a créé ce titre pour ce gardien, quand, et l’empreinte de ses photos et de son histoire, qui ne peut jamais changer (Vérifier la recalcule dans votre navigateur). Il ne prouve pas l’objet lui-même ; dans cette démo, Emtée a photographié et mis en vente les masques.',
        proofs: [{ label: 'tx de création, masque 001 (chipnet)', href: TX.genesis }, { label: 'test : empreinte figée par le contrat', href: T.frozenFp }],
      },
      {
        q: 'Le gardien peut-il ne pas être payé à la première vente ?',
        a: 'Non : 90 % vont à l’adresse du gardien dans la même transaction qui vous remet le titre.',
        proofs: [{ label: 'première vente : 5 400 sur 6 000 sats au gardien (chipnet)', href: TX.firstSale }],
      },
      {
        q: 'Un revendeur peut-il éviter les 10 % du gardien ?',
        a: 'Non. Chaque revente doit payer au gardien le plus élevé de : 10 % du nouveau prix, 10 % du dernier prix de vente, ou 1 000 sats. Une revente bradée paie quand même 10 % de la dernière vente. Le réseau refuse toute revente qui paie moins au gardien, et toute mise en vente non signée par le propriétaire.',
        proofs: [
          { label: 'revente : 1 000 sats de redevance (chipnet)', href: TX.resale },
          { label: 'test 8 : gardien non payé', href: T.noPayment },
          { label: 'test 11 : redevance non indexée sur la dernière vente', href: T.notIndexed },
          { label: 'test 12 : redevance à 1 sat près', href: T.oneShort },
          { label: 'test 14 : sous le plancher de 1 000 sats', href: T.floor },
          { label: 'test 6 : remise en vente bradée', href: T.wash },
          { label: 'tests 1–2 : mise en vente par un non-propriétaire', href: T.nonOwner },
          { label: 'test : mauvais signataire', href: T.wrongSigner },
        ],
      },
      {
        q: 'Quelqu’un peut-il créer une seconde copie ?',
        a: 'Non. La catégorie du masque n’a jamais eu de capacité de création, et le contrat fige les octets d’identité (n° du masque + empreinte) ; seuls le propriétaire, le prix et le dernier prix de vente changent lors d’une vente.',
        proofs: [{ label: 'tx de création, masque 001 (chipnet)', href: TX.genesis }, { label: 'test : la catégorie n’a jamais de sortie capable de créer', href: T.noBaton }],
      },
      {
        q: 'Où est mon titre, et si ce site disparaît ?',
        a: 'Votre titre reste dans le coffre du masque, enregistré à votre adresse. C’est ce qui rend la redevance impossible à éviter : vous ne le verrez donc pas comme un jeton dans votre portefeuille ; votre certificat le montre. Le coffre et son historique sont sur la blockchain, et chacun peut relancer la vérification depuis ce dépôt, sans notre site.',
        proofs: [{ label: 'lecteur du coffre (interroge directement un serveur BCH public)', href: T.vaultReader }],
      },
      {
        q: 'Et si je paie et que rien ne se passe ?',
        a: 'Le paiement et le changement de titre se font dans une seule transaction : les deux ou aucun.',
        proofs: [{ label: 'une tx : titre à l’acheteur + gardien + Emtée (chipnet)', href: TX.firstSale }],
      },
      {
        q: 'Limite honnête',
        a: 'Si un gardien perd son portefeuille, ses redevances continuent d’aller à cette adresse. Prochaine étape : une adresse de paiement récupérable.',
        proofs: [{ label: 'l’adresse de paiement est fixée dans le contrat', href: T.payoutParam }],
      },
    ],
  },
};
