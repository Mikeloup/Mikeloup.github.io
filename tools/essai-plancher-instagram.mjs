// -----------------------------------------------------------------------------
// Essai du garde-fou qui decide ce qui peut partir sur Instagram.
//
// N'appelle AUCUNE API, ne publie rien, ne touche a rien : il interroge
// src/instagram.mjs avec des cas connus et dit si chacun tombe du bon cote.
//
// Il existe parce que la regle « pas de vieille video » a deja ete ecrite deux
// fois (04/10/2026 dans tools/instagram-video.mjs, 24/10 dans build.mjs) sans
// qu'on puisse verifier qu'elle s'appliquait vraiment. Elle vit maintenant a
// un seul endroit ; ceci le prouve a la demande.
//
//     node tools/essai-plancher-instagram.mjs
// -----------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as insta from '../src/instagram.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
const plancher = config.instagram?.minPublicationDate ?? insta.PLANCHER_PUBLICATION_DEFAUT;

// On se place a une heure fixe : un essai dont le resultat depend de l'heure
// qu'il est ne prouve rien le lendemain.
const MAINTENANT = Date.parse(`${plancher}T00:00:00Z`) + 86400000; // le lendemain du plancher
const jour = (d) => new Date(Date.parse(`${plancher}T00:00:00Z`) + d * 86400000)
  .toISOString().slice(0, 19) + 'Z';

const cas = [
  [false, 'Les Experts du 13/03/2025 (ce qui a ete publie le 23/10/2026)',
          { titre: 'Les Experts — 13 mars 2025', publication: '2025-03-13T18:00:00Z' }],
  [false, 'une emission de 2023',
          { titre: 'Emission de 2023', publication: '2023-05-04T10:00:00Z' }],
  [false, 'une video de 2023 REDATEE du jour par une panne de quota YouTube '
          + '(vuLe ment, publishedAt non)',
          { titre: 'Emission de 2023 redatee', vuLe: jour(1), publication: '2023-05-04T10:00:00Z' }],
  [false, 'une video sans aucune date de publication',
          { titre: 'Sans date', publication: '' }],
  [false, 'la veille du plancher',
          { titre: 'Veille du plancher', publication: jour(-1) }],
  [true,  'le jour meme du plancher',
          { titre: 'Jour du plancher', publication: jour(0) }],
  [true,  'le lendemain du plancher',
          { titre: 'Lendemain', publication: jour(1) }],
  [true,  'la meme, nommee comme dans build.mjs (title / publishedAt)',
          { title: 'Via build', publishedAt: jour(1) }],
  [false, 'forme build.mjs, vieille video',
          { title: 'Vieille via build', publishedAt: '2025-03-13T18:00:00Z' }],
];

const source = config.instagram?.minPublicationDate
  ? 'site.config.json'
  : 'src/instagram.mjs (PLANCHER_PUBLICATION_DEFAUT)';
console.log(`Plancher applique : ${plancher}   [lu dans ${source}]`);
console.log('');

let rates = 0;
for (const [attendu, quoi, entree] of cas) {
  const v = insta.videoAutoriseeSurInstagram(entree, config, MAINTENANT);
  const bon = v.ok === attendu;
  if (!bon) rates++;
  console.log(`${bon ? '  ok  ' : ' RATE '} ${attendu ? 'doit passer       ' : 'doit etre ecartee '} | ${quoi}`);
  if (!v.ok) console.log(`         raison : ${v.raison}`);
}

// Un plancher illisible ne doit pas ouvrir la porte en grand.
const casse = { ...config, instagram: { ...config.instagram, minPublicationDate: 'n importe quoi' } };
const v = insta.videoAutoriseeSurInstagram({ titre: 'Neuve', publication: jour(1) }, casse, MAINTENANT);
if (v.ok) { rates++; console.log(' RATE  un plancher illisible laisse tout passer'); }
else console.log(`  ok   plancher illisible -> refus : ${v.raison}`);

console.log('');
console.log(rates ? `>>> ${rates} CAS RATE(S) — NE PAS PUBLIER` : '>>> les 10 cas tombent du bon cote');
process.exit(rates ? 1 : 0);
