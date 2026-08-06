// -----------------------------------------------------------------------------
// Essai de publication Instagram, déclenché à la main.
//
// Pourquoi cet outil existe : la publication automatique ne se déclenche qu'à
// l'arrivée d'une nouvelle vidéo. Attendre cet instant pour découvrir qu'un
// réglage cloche, c'est découvrir la panne au pire moment. Ce script rejoue
// exactement le même chemin — même légende, même image, même API — mais quand
// on le décide.
//
// Deux modes, et le mode prudent est celui par défaut :
//
//   PUBLIER absent ou différent de « oui » : affiche ce qui serait publié,
//   n'envoie rien. C'est un essai à blanc.
//
//   PUBLIER=oui : publie réellement. Irréversible — Instagram ne connaît pas
//   le brouillon.
//
// Variables : INSTAGRAM_TOKEN (obligatoire), YOUTUBE_API_KEY (obligatoire),
// VIDEO_ID (facultatif — à défaut, la dernière vidéo de la chaîne), PUBLIER.
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yt from '../src/youtube.mjs';
import * as insta from '../src/instagram.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const token = process.env.INSTAGRAM_TOKEN;
const cle = process.env.YOUTUBE_API_KEY;
const publier = String(process.env.PUBLIER || '').trim().toLowerCase() === 'oui';

if (!token) { console.error('ECHEC : INSTAGRAM_TOKEN absent.'); process.exit(1); }
if (!cle) { console.error('ECHEC : YOUTUBE_API_KEY absent.'); process.exit(1); }

const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
const userId = config.instagram?.userId;
if (!userId) { console.error('ECHEC : instagram.userId absent de site.config.json.'); process.exit(1); }

yt.setApiKey(cle);

// --- Quelle vidéo ? ----------------------------------------------------------

let videoId = String(process.env.VIDEO_ID || '').trim();

// Une adresse YouTube collée telle quelle plutôt qu'un identifiant : c'est
// l'erreur naturelle, autant l'accepter.
const dansUrl = videoId.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
if (dansUrl) videoId = dansUrl[1];

if (!videoId) {
  const chaine = await yt.fetchChannel(config.channelId, config.channelHandle);
  const ids = await yt.fetchPlaylistVideoIds(chaine.uploadsPlaylistId);
  videoId = ids[0];
  console.log(`Aucune vidéo précisée : on prend la plus récente de la chaîne (${videoId}).`);
}

const [video] = await yt.fetchVideos([videoId]);
if (!video) { console.error(`ECHEC : vidéo ${videoId} introuvable.`); process.exit(1); }

// --- Ce qui serait publié ----------------------------------------------------

const imageUrl = video.thumbnail || `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`;
const caption = insta.legende(video, { config, emission: '' });

console.log('');
console.log('--- Publication envisagée ---------------------------------------');
console.log(`Compte  : ${userId}`);
console.log(`Vidéo   : ${video.title}`);
console.log(`Image   : ${imageUrl}`);
console.log('Légende :');
console.log(caption);
console.log('-----------------------------------------------------------------');
console.log('');

if (!publier) {
  console.log('Essai à blanc : rien n\'a été envoyé à Instagram.');
  console.log('Pour publier réellement, relancer avec PUBLIER=oui.');
  process.exit(0);
}

// --- Publication réelle ------------------------------------------------------

const resultat = await insta.publier({ token, userId, imageUrl, caption });

if (resultat.ok) {
  console.log(`SUCCES : publication créée (identifiant ${resultat.id}).`);
  console.log('À vérifier sur le compte Instagram — c\'est le seul juge.');
} else {
  console.error(`ECHEC : ${resultat.erreur}`);
  process.exit(1);
}
