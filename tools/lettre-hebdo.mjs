// -----------------------------------------------------------------------------
// Lettre d'information hebdomadaire.
//
// Ce script ne reconstruit rien et n'interroge pas YouTube : il lit le
// `search.json` du site en ligne, qui contient déjà tout ce qu'il faut — titre,
// rubrique, miniature, vues, et la date de première apparition au catalogue.
// Coût : une requête HTTP, zéro unité de quota, aucune dépendance au cache.
//
// Il choisit trois choses :
//   - la vidéo de tête : la plus récente de la période ;
//   - les autres de la période, dans l'ordre ;
//   - « À revoir » : parmi les vidéos plus anciennes, les plus vues — celles
//     qu'un abonné récent n'a jamais croisées.
//
// Puis il programme UN envoi chez Kit. Un seul, jamais plus : si l'exécution
// échouait à mi-chemin, mieux vaut une lettre manquée qu'une lettre en double.
//
// Variables : KIT_API_KEY (obligatoire), ENVOYER=oui pour envoyer réellement
// (sinon, simple aperçu dans le journal), FORCER=oui pour ignorer le contrôle
// de l'heure locale.
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../src/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
const n = config.newsletter || {};
const hebdo = n.hebdomadaire || {};

const envoyer = String(process.env.ENVOYER || '').toLowerCase() === 'oui';
const forcer = String(process.env.FORCER || '').toLowerCase() === 'oui';

// --- L'heure locale ----------------------------------------------------------
//
// GitHub ne connaît que l'heure UTC, Israël change d'heure deux fois par an.
// Le workflow se déclenche donc à deux heures UTC possibles, et c'est ce
// contrôle-ci qui décide laquelle est la bonne — sinon la lettre partirait
// deux fois, ou une heure trop tôt six mois par an.
const heureVoulue = Number(hebdo.heureLocale ?? 10);
const heureIsrael = Number(new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false,
}).format(new Date()));

if (!forcer && heureIsrael !== heureVoulue) {
  console.log(`Lettre : il est ${heureIsrael} h en Israël, l'envoi est prévu à ${heureVoulue} h. Rien à faire.`);
  process.exit(0);
}

// --- Le catalogue en ligne ---------------------------------------------------

const res = await fetch(`${config.siteUrl}/search.json`, { cache: 'no-store' });
if (!res.ok) {
  console.error(`ECHEC : search.json illisible (HTTP ${res.status}).`);
  process.exit(1);
}
const toutes = await res.json();
if (!Array.isArray(toutes) || !toutes.length) {
  console.error('ECHEC : catalogue vide.');
  process.exit(1);
}

const maintenant = Date.now();
const date = (v) => Date.parse(v.f || v.p || 0) || 0;
const jours = Number(hebdo.jours ?? 8);
const recentes = toutes
  .filter((v) => maintenant - date(v) < jours * 86400000)
  .sort((a, b) => date(b) - date(a));

if (!recentes.length) {
  console.log("Lettre : aucune vidéo depuis la dernière lettre. Rien n'est envoyé.");
  process.exit(0);
}

const [une, ...suite] = recentes;
const autres = suite.slice(0, Number(hebdo.autres ?? 4));
const retenues = new Set([une, ...autres].map((v) => v.i));

// « À revoir » : les plus vues parmi les vidéos plus anciennes que la période,
// et pas trop vieilles non plus — une pépite d'il y a trois ans reste une
// pépite, mais l'actualité d'il y a trois ans ne l'est plus.
const moisRetour = Number(hebdo.moisRetour ?? 18);
const aRevoir = toutes
  .filter((v) => !retenues.has(v.i))
  .filter((v) => maintenant - date(v) >= jours * 86400000)
  .filter((v) => maintenant - date(v) < moisRetour * 30.44 * 86400000)
  .sort((a, b) => (b.v || 0) - (a.v || 0))
  .slice(0, Number(hebdo.aRevoir ?? 2));

// --- La lettre ---------------------------------------------------------------

const sujet = (hebdo.sujet || '{titre}')
  .replace(/\{titre\}/g, une.t || '')
  .replace(/\{emission\}/g, une.c || config.siteName)
  .replace(/\{site\}/g, config.siteName);

const contenu = R.lettreHebdo(config, {
  une, autres, aRevoir, intro: hebdo.intro || '',
});

console.log('--- Lettre hebdomadaire ------------------------------------------');
console.log(`Sujet   : ${sujet}`);
console.log(`En tête : ${une.t}`);
autres.forEach((v) => console.log(`Aussi   : ${v.t}`));
aRevoir.forEach((v) => console.log(`À revoir: ${v.t} (${v.v} vues)`));
console.log('------------------------------------------------------------------');

if (!envoyer) {
  console.log("Aperçu seulement : rien n'a été envoyé. Relancer avec ENVOYER=oui.");
  process.exit(0);
}

const apiKey = process.env.KIT_API_KEY;
if (!apiKey) { console.error('ECHEC : KIT_API_KEY absente.'); process.exit(1); }

const envoi = await fetch('https://api.kit.com/v4/broadcasts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Kit-Api-Key': apiKey,
  },
  body: JSON.stringify({
    subject: sujet,
    preview_text: hebdo.intro || une.t,
    description: `Lettre hebdomadaire — ${une.t}`,
    content: contenu,
    public: false,
    published_at: null,
    send_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    subscriber_filter: null,
  }),
});

const corps = await envoi.text();
if (!envoi.ok) {
  console.error(`ECHEC : Kit a refusé la lettre — HTTP ${envoi.status} ${corps.slice(0, 400)}`);
  process.exit(1);
}
console.log('SUCCES : lettre programmée, envoi dans cinq minutes.');
