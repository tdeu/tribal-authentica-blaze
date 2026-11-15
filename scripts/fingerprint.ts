// Computes each mask's fingerprint (sha256 of canonical JSON, see app/src/data/fingerprint.ts) and
// writes it, plus each photo's sha256, into app/src/data/masks.json.
//   npm run fingerprint              update masks.json
//   npm run fingerprint -- --check   exit 1 if anything in masks.json is stale
// Photos live in app/public/<file>; their sha256 is of the raw file bytes.
import { loadMasks, saveMasks, placeholdersIn, refreshFingerprints, flag } from './lib.ts';

const data = loadMasks();
if (new Set(data.masks.map((m) => m.catalogueId)).size !== data.masks.length) throw new Error('duplicate catalogueId');
const stale = refreshFingerprints(data);
for (const m of data.masks) {
  const ph = placeholdersIn(m);
  console.log(`mask ${String(m.catalogueId).padStart(3, '0')}  ${m.fingerprint}  photos ${m.photos.length}${ph.length ? `  (${ph.length} placeholder fields)` : ''}`);
}
if (flag('--check')) {
  if (stale.length) { console.error(`stale:\n  ${stale.join('\n  ')}\nrun: npm run fingerprint`); process.exit(1); }
  console.log('up to date');
} else {
  saveMasks(data);
  console.log(stale.length ? `updated ${stale.length} value(s) in masks.json` : 'masks.json already up to date');
}
