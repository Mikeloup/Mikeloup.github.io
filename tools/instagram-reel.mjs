// -----------------------------------------------------------------------------
// Publication d'un Reel, declenchee depuis le Mac de Michael.
//
// Pourquoi ce detour : le jeton Instagram vit dans les secrets GitHub, et il
// doit y rester. Plutot que d'en deposer une copie sur le Mac — deuxieme
// endroit a proteger, deuxieme endroit a mettre a jour tous les soixante
// jours —, c'est le Mac qui appelle GitHub : il televerse la video dans une
// « release » du depot, puis declenche ce workflow avec l'adresse publique.
// Le jeton ne bouge pas.
//
// Variables : INSTAGRAM_TOKEN (secret), VIDEO_URL, LEGENDE, COLLABORATEURS
// (facultatif, separes par des virgules), PUBLIER=oui pour publier reellement.
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as insta from '../src/instagram.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));

const token = process.env.INSTAGRAM_TOKEN;
const userId = config.instagram?.userId;
const videoUrl = (process.env.VIDEO_URL || '').trim();
const legende = (process.env.LEGENDE || '').trim();
const publier = String(process.env.PUBLIER || 'non').toLowerCase() === 'oui';
const collaborateurs = (process.env.COLLABORATEURS || '')
  .split(',').map((c) => c.trim().replace(/^@/, '')).filter(Boolean).slice(0, 3);

if (!videoUrl) { console.error('ECHEC : VIDEO_URL absente.'); process.exit(1); }
if (!userId) { console.error('ECHEC : instagram.userId absent de site.config.json.'); process.exit(1); }

console.log('--- Reel envisagé ------------------------------------------------');
console.log(`Compte  : ${userId}`);
console.log(`Vidéo   : ${videoUrl}`);
console.log(`Légende :\n${legende}`);
if (collaborateurs.length) console.log(`Collaborations : @${collaborateurs.join(', @')}`);
console.log('------------------------------------------------------------------');

// La vidéo doit être accessible à Meta : s'il ne peut pas la télécharger, la
// publication échoue plusieurs minutes plus tard avec un message obscur.
// Mieux vaut le savoir tout de suite.
try {
  const tete = await fetch(videoUrl, { method: 'HEAD' });
  if (!tete.ok) {
    console.error(`ECHEC : la vidéo n'est pas accessible publiquement (HTTP ${tete.status}).`);
    process.exit(1);
  }
  const poids = Number(tete.headers.get('content-length') || 0);
  if (poids) console.log(`Poids   : ${(poids / 1048576).toFixed(1)} Mo`);
} catch (err) {
  console.error(`ECHEC : adresse injoignable (${err.message}).`);
  process.exit(1);
}

if (!publier) {
  console.log("Aperçu seulement : rien n'a été envoyé. Relancer avec PUBLIER=oui.");
  process.exit(0);
}
if (!token) { console.error('ECHEC : INSTAGRAM_TOKEN absent.'); process.exit(1); }

const resultat = await insta.publierReel({
  token, userId, videoUrl, caption: legende, collaborateurs,
});

if (resultat.ok) {
  console.log(`SUCCES : Reel publié (identifiant ${resultat.id}).`);
  console.log('À vérifier sur le compte Instagram — c\'est le seul juge.');
} else {
  console.error(`ECHEC : ${resultat.erreur}`);
  process.exit(1);
}
