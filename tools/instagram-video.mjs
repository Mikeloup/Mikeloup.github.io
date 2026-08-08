// -----------------------------------------------------------------------------
// Publication d'une nouvelle video sur Instagram, APRES le deploiement.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Meta ne recoit pas l'image : il va la chercher a son adresse publique. Or la
// vignette 4:5 est fabriquee pendant la construction du site, et n'est en ligne
// qu'une fois le deploiement termine. La publication logee dans build.mjs se
// trouvait donc toujours un tour trop tot : elle constatait que la vignette
// n'existait pas encore et reportait a la construction suivante — deux heures
// plus tard. Constate en vrai le 8 aout 2026 : une video passee en public
// n'etait toujours pas publiee une heure apres.
//
// Ce script, lui, est declenche par la REUSSITE du deploiement. A ce moment la
// vignette est en ligne, la legende est prete dans le manifeste, et il n'y a
// plus qu'a publier. Delai : une minute au lieu de quatre heures.
//
// Il ne calcule rien : le site a deja ecrit la legende et les collaborations
// dans dist/insta/manifest.json. Ici on lit, on verifie, on publie.
//
// Memoire : Instagram lui-meme. Aucun fichier d'etat, donc aucun doublon
// possible meme si build.mjs publie de son cote au meme moment.
//
// Variables : INSTAGRAM_TOKEN, PUBLIER=oui (sinon simple apercu).
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as insta from '../src/instagram.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));

const token = process.env.INSTAGRAM_TOKEN;
const userId = config.instagram?.userId;
const publier = String(process.env.PUBLIER || 'non').toLowerCase() === 'oui';
const base = String(config.siteUrl || '').replace(/\/$/, '');

if (!config.instagram?.enabled) {
  console.log('Instagram : publication désactivée dans site.config.json. Rien à faire.');
  process.exit(0);
}

// 1. Le manifeste en ligne — celui du site deploye, pas celui d'un dossier local.
const res = await fetch(`${base}/insta/manifest.json`, { cache: 'no-store' });
if (!res.ok) {
  console.error(`ECHEC : manifeste introuvable en ligne (HTTP ${res.status}).`);
  process.exit(1);
}
const entrees = await res.json();
if (!Array.isArray(entrees) || !entrees.length) {
  console.log('Aucune vidéo dans le manifeste. Rien à faire.');
  process.exit(0);
}

// 2. Ce qu'Instagram a reellement publie. En cas d'echec de lecture on
//    s'abstient : republier devant toute l'audience coute plus cher qu'attendre.
if (!token || !userId) { console.error('ECHEC : jeton ou identifiant absent.'); process.exit(1); }
const recentes = await insta.legendesRecentes({ token, userId, limite: 25 });
if (recentes === null) {
  console.error("ECHEC : impossible de relire les publications récentes. Rien n'est publié.");
  process.exit(1);
}

// 3. Espacement minimal. Sans ce frein, une reprise de catalogue deverserait
//    huit publications en quelques minutes.
const espacement = (config.instagram?.minMinutesBetween ?? 180) * 60000;
const derniere = Math.max(0, ...recentes.map((m) => m.date || 0));
const maintenant = Date.now();
if (derniere && maintenant - derniere < espacement) {
  const reste = Math.ceil((espacement - (maintenant - derniere)) / 60000);
  console.log(`Publication précédente trop récente : prochaine possible dans ~${reste} min.`);
  process.exit(0);
}

// 4. La plus ancienne des videos jamais publiees, pour respecter l'ordre de
//    parution. Un titre court ne suffit pas a identifier : on exige huit
//    caracteres, sans quoi « Katava » matcherait n'importe quoi.
const dejaPublie = (titre) => {
  const t = String(titre || '').trim();
  return t.length > 8 && recentes.some((m) => m.texte.includes(t));
};
const heures = config.instagram?.maxAgeHours ?? 48;
const candidates = entrees
  .filter((e) => e.legende && !dejaPublie(e.titre))
  .filter((e) => !e.vuLe || (maintenant - Date.parse(e.vuLe)) < heures * 3600 * 1000)
  .sort((a, b) => Date.parse(a.vuLe || 0) - Date.parse(b.vuLe || 0));

if (!candidates.length) { console.log('Aucune nouvelle vidéo à publier.'); process.exit(0); }

const video = candidates[0];
const imageUrl = `${base}/insta/${video.id}.jpg`;

// 5. La vignette doit etre EN LIGNE. C'est tout l'objet de ce script, mais la
//    verification reste indispensable : un deploiement peut reussir sans que
//    l'image soit servie (cache, propagation).
const essai = await fetch(imageUrl, { headers: { range: 'bytes=0-1' } });
if (!essai.ok && essai.status !== 206) {
  console.error(`ECHEC : la vignette n'est pas en ligne (HTTP ${essai.status}) — ${imageUrl}`);
  process.exit(1);
}
try { await essai.body?.cancel(); } catch { /* rien à fermer */ }

console.log('--- Publication -------------------------------------------------');
console.log(`Vidéo   : ${video.titre}`);
console.log(`Image   : ${imageUrl}`);
console.log(`Légende :\n${video.legende}`);
if (video.collaborateurs?.length) console.log(`Collaborations : @${video.collaborateurs.join(', @')}`);
console.log(`En attente : ${candidates.length - 1} autre(s) vidéo(s).`);
console.log('-----------------------------------------------------------------');

if (!publier) { console.log("Aperçu seulement : rien n'a été envoyé."); process.exit(0); }

const resultat = await insta.publier({
  token, userId, imageUrl, caption: video.legende,
  collaborateurs: video.collaborateurs || [],
});
if (resultat.ok) {
  console.log(`SUCCES : publiée (identifiant ${resultat.id}).`);
} else {
  console.error(`ECHEC : ${resultat.erreur}`);
  process.exit(1);
}
