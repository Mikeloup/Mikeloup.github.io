// -----------------------------------------------------------------------------
// Publication quotidienne « ce soir sur le canal 14 ».
//
// Le site prepare la matiere a chaque construction (dist/insta/ce-soir.json et
// ce-soir.jpg). Ce script, lui, ne fabrique rien : il lit ce que le site a
// publie, verifie que la fiche est bien celle d'aujourd'hui, et publie.
//
// Pourquoi cette separation : l'image doit etre EN LIGNE avant que Meta puisse
// aller la chercher. Preparer et publier dans la meme execution reviendrait a
// donner une adresse qui n'existe pas encore.
//
// Variables : INSTAGRAM_TOKEN, PUBLIER=oui, FORCER=oui (ignorer l'heure).
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
const forcer = String(process.env.FORCER || '').toLowerCase() === 'oui';

const heureVoulue = Number(config.tv?.ceSoirHeure ?? 16);
const heureIsrael = Number(new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false,
}).format(new Date()));

// Fenetre, et non heure exacte. GitHub retarde couramment ses taches
// programmees de dix a trente minutes quand ses serveurs sont charges : avec
// une egalite stricte, un demarrage a 17 h 05 concluait « ce n'est pas
// l'heure » et n'envoyait rien, sans la moindre erreur. Constate le 8 aout
// 2026. Le doublon reste impossible : la memoire, c'est Instagram lui-meme.
const fenetre = Number(config.tv?.ceSoirFenetreHeures ?? 3);
if (!forcer && (heureIsrael < heureVoulue || heureIsrael >= heureVoulue + fenetre)) {
  console.log(`Ce soir : il est ${heureIsrael} h en Israël, l'envoi est prévu entre `
    + `${heureVoulue} h et ${heureVoulue + fenetre} h. Rien à faire.`);
  process.exit(0);
}
if (!forcer && heureIsrael !== heureVoulue) {
  console.log(`Ce soir : démarrage tardif (${heureIsrael} h au lieu de ${heureVoulue} h) — `
    + 'GitHub a retardé la tâche. On publie quand même.');
}

const base = String(config.siteUrl || '').replace(/\/$/, '');
const res = await fetch(`${base}/insta/ce-soir.json`, { cache: 'no-store' });
if (!res.ok) {
  console.log(`Ce soir : aucune fiche en ligne (HTTP ${res.status}) — rien à publier.`);
  process.exit(0);
}
const fiche = await res.json();

// La fiche doit etre celle d'aujourd'hui. Une construction en retard, un
// deploiement bloque, et l'on annoncerait la soiree de la veille.
const aujourdhui = new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
if (fiche.date !== aujourdhui) {
  console.error(`ECHEC : la fiche en ligne date du ${fiche.date}, or nous sommes le ${aujourdhui}. `
    + 'Le site n\'a pas été reconstruit depuis. Rien n\'est publié.');
  process.exit(1);
}

const image = `${base}/insta/ce-soir.jpg`;
console.log('--- Ce soir ------------------------------------------------------');
console.log(`Image   : ${image}`);
console.log(`Légende :\n${fiche.legende}`);
if (fiche.collaborateurs?.length) console.log(`Collaborations : @${fiche.collaborateurs.join(', @')}`);
console.log('------------------------------------------------------------------');

const essai = await fetch(image, { headers: { range: 'bytes=0-1' } });
if (!essai.ok && essai.status !== 206) {
  console.error(`ECHEC : l'image n'est pas en ligne (HTTP ${essai.status}).`);
  process.exit(1);
}
try { await essai.body?.cancel(); } catch { /* rien à fermer */ }

if (!publier) {
  console.log("Aperçu seulement : rien n'a été envoyé.");
  process.exit(0);
}
if (!token || !userId) { console.error('ECHEC : jeton ou identifiant absent.'); process.exit(1); }

// Memoire : ce qu'Instagram a reellement publie. La date en toutes lettres
// dans la legende sert de signature — si elle y est deja, la fiche du jour est
// partie, et une seconde execution ne doit rien faire.
const recentes = await insta.legendesRecentes({ token, userId, limite: 10 });
if (recentes === null) {
  console.error("ECHEC : impossible de relire les publications récentes. Rien n'est publié.");
  process.exit(1);
}
const signature = fiche.legende.split('\n')[0];
if (recentes.some((m) => m.texte.includes(signature))) {
  console.log('Ce soir : la fiche du jour est déjà publiée. Rien à faire.');
  process.exit(0);
}

const resultat = await insta.publier({
  token, userId, imageUrl: image, caption: fiche.legende,
  collaborateurs: fiche.collaborateurs || [],
});
if (resultat.ok) {
  console.log(`SUCCES : fiche publiée (identifiant ${resultat.id}).`);
} else {
  console.error(`ECHEC : ${resultat.erreur}`);
  process.exit(1);
}
