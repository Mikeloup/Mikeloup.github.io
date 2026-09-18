/**
 * Essai du maillage sujets ↔ vidéos, sur les VRAIES transcriptions.
 *
 * Ecrit le 18 septembre 2026. N'interroge ni YouTube ni le reseau : il lit
 * data/transcriptions/ et site.config.json, exactement ce que lit le build.
 *
 *   node tools/essai-maillage-sujets.mjs                 (les 19 sujets)
 *   node tools/essai-maillage-sujets.mjs histoire-de-jerusalem
 *
 * A relancer chaque fois qu'on touche a la regle : c'est ce fichier qui dit si
 * les correspondances sont justes, AVANT de reconstruire quoi que ce soit.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireTranscription } from '../src/transcriptions.mjs';
import { indexerTranscriptions, videosDuSujet } from '../src/maillage-sujets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));

const dossier = path.join(ROOT, 'data', 'transcriptions');
const transcriptions = new Map();
for (const f of await fs.readdir(dossier)) {
  const m = /^(.+)\.(srt|vtt|txt)$/i.exec(f);
  if (!m) continue;
  const t = lireTranscription(await fs.readFile(path.join(dossier, f), 'utf8'), { extension: m[2] });
  if (t) transcriptions.set(m[1], t);
}
const index = indexerTranscriptions(transcriptions);
console.log(`${index.total} transcriptions lues.\n`);

const filtre = process.argv.slice(2);
const sujets = (config.pages || [])
  .filter((p) => (p.slug || '').startsWith('sujets/'))
  .filter((p) => !filtre.length || filtre.some((f) => p.slug.includes(f)));

let vides = 0; let totalVideos = 0;
for (const pg of sujets) {
  const trouvees = videosDuSujet(pg, index, { max: 4 });
  totalVideos += trouvees.length;
  if (!trouvees.length) vides++;
  console.log(`${'='.repeat(78)}\n/${pg.slug}/`);
  console.log(`  ${pg.title.slice(0, 74)}`);
  if (!trouvees.length) {
    console.log('  → AUCUNE vidéo retenue.\n');
    continue;
  }
  for (const v of trouvees) {
    const mots = v.termes.map(([m, n]) => `${m}×${n}`).join(', ');
    console.log(`  [${v.score.toFixed(0).padStart(4)}]  https://youtu.be/${v.id}   ${mots}`);
  }
  console.log();
}
console.log(`${sujets.length} sujet(s) — ${totalVideos} vidéo(s) retenue(s), `
  + `${vides} sujet(s) sans aucune correspondance.`);
