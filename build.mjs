#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Générateur du site Tandem TV.
//
//   node build.mjs           → build réel (nécessite YOUTUBE_API_KEY)
//   node build.mjs --demo    → build avec les données de démonstration
//
// Le site produit est entièrement statique et se trouve dans ./dist
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yt from './src/youtube.mjs';
import { markdownToHtml } from './src/markdown.mjs';
import {
  slugify, escapeHtml, truncate, excerpt, paginate, cleanDescription, smartTitle,
  titreLisible, titreDecoratif,
} from './src/util.mjs';
import * as R from './src/render.mjs';
import { collecterPersonnes } from './src/personnes.mjs';
import { lireTranscription } from './src/transcriptions.mjs';
import { prepareGrille, indexerVideos, jourIsrael } from './src/grille.mjs';
import { lireArchive } from './src/archive.mjs';
import * as insta from './src/instagram.mjs';
import { ficheDuSoir } from './tools/ce-soir.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PER_PAGE = 24;

const DEMO = process.argv.includes('--demo') || process.env.DEMO === '1';

/**
 * Empreinte du contenu d'un fichier d'assets, pour l'ajouter a son adresse.
 *
 * Le 29 aout 2026 : une modification du CSS publiee, verifiee correcte sur le
 * serveur, s'affichait cassee sur le telephone de Michael -- nouveau HTML,
 * ancien CSS. La feuille de style s'appelle toujours /assets/style.css et
 * GitHub Pages la sert avec cache-control: max-age=600 ; un navigateur qui
 * l'avait chargee peu avant gardait l'ancienne, et Safari plus longtemps
 * encore. Un fichier qui change de contenu doit changer d'adresse, sinon on
 * ne sait jamais quelle version le visiteur regarde.
 */
async function empreinte(relatif) {
  try {
    const contenu = await fs.readFile(path.join(ROOT, relatif));
    return createHash('sha1').update(contenu).digest('hex').slice(0, 8);
  } catch {
    return '';  // pas d'empreinte plutot qu'une construction qui echoue
  }
}
const buildTime = process.env.SOURCE_DATE || new Date().toISOString();
// `buildTime` est une CHAINE ISO. Toute soustraction directe avec un nombre
// de millisecondes rend NaN — et `NaN < seuil` vaut false, silencieusement.
// C'est ainsi que la detection des nouveautes n'a jamais rien detecte :
// aucune erreur, aucun avertissement, juste « aucune nouvelle video » a
// chaque execution. D'ou cette horloge numerique, a utiliser pour tout
// calcul de duree.
const buildMs = Date.parse(buildTime);

const log = (...a) => console.log('▸', ...a);
const warn = (...a) => console.warn('⚠', ...a);

// --- Petits helpers fichiers -------------------------------------------------

async function writeFile(relPath, contents) {
  const full = path.join(DIST, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, contents, 'utf8');
}

// Adresses reellement produites par le site. Sert de garde-fou aux pages de
// transfert : le 8 aout 2026, l'ancienne adresse Wix « /partenaires » a ecrase
// la toute nouvelle page « Nos partenaires », parce que les transferts sont
// ecrits APRES les pages. Le menu pointait vers une redirection vers
// /sponsoring/, sans aucune erreur nulle part.
const PAGES_ECRITES = new Set();

// Transferts refuses faute de destination. Rempli par transfererAnciennesAdresses,
// affiche en fin de construction : c'est du contenu qui existait et que Google
// connait encore, mais dont la page d'arrivee a disparu.
const TRANSFERTS_SANS_CIBLE = [];

async function writePage(routePath, html) {
  const rel = routePath.endsWith('.html')
    ? routePath.replace(/^\//, '')
    : path.join(routePath.replace(/^\//, ''), 'index.html');
  PAGES_ECRITES.add(`/${String(routePath).replace(/^\//, '').replace(/\/$/, '')}`);
  await writeFile(rel, html);
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(src, dst);
    else await fs.copyFile(src, dst);
  }
}

async function readJson(p, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readText(p, fallback = '') {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return fallback;
  }
}

// --- Récupération des données ------------------------------------------------

async function collectFromApi(config) {
  yt.setApiKey(process.env.YOUTUBE_API_KEY);

  log('Chaîne…');
  const channel = await yt.fetchChannel(config.channelId, config.channelHandle);
  log(`  ${channel.title} — ${channel.videoCount} vidéos, ${channel.subscribers} abonnés`);

  log('Playlists…');
  const playlists = await yt.fetchPlaylists(channel.id);
  log(`  ${playlists.length} playlist(s) trouvée(s)`);

  log('Contenu des playlists…');
  for (const p of playlists) {
    p.videoIds = await yt.fetchPlaylistVideoIds(p.id);
    log(`  ${p.title} → ${p.videoIds.length}`);
  }

  log('Toutes les vidéos de la chaîne…');
  const uploadIds = await yt.fetchPlaylistVideoIds(channel.uploadsPlaylistId);
  log(`  ${uploadIds.length} vidéo(s) publiée(s)`);

  const allIds = [...new Set([...uploadIds, ...playlists.flatMap((p) => p.videoIds)])];
  log(`Détail de ${allIds.length} vidéo(s)…`);
  const videos = await yt.fetchVideos(allIds);

  const partenaires = await collecterPartenaires();

  log(`Quota API consommé : ~${yt.getQuotaUsed()} unités (limite quotidienne : 10 000)`);
  return { channel, playlists, videos, partenaires, fetchedAt: buildTime };
}

/**
 * Récupère le catalogue, en évitant d'appeler YouTube quand ce n'est pas utile.
 *
 * Le site se reconstruit à chaque envoi sur la branche principale — y compris
 * lorsque seule la grille de diffusion a bougé, ce qui arrive plusieurs fois
 * par heure. Or une synchronisation complète coûte plus de cent unités de
 * quota, et YouTube n'en accorde que dix mille par jour : à ce rythme, la
 * chaîne cesserait purement et simplement de se mettre à jour, un matin, sans
 * prévenir.
 *
 * On garde donc le catalogue en mémoire d'une exécution à l'autre. En deçà de
 * 'cacheMinutes', on le réutilise tel quel — zéro appel réseau. Au-delà, on
 * resynchronise. Les reconstructions déclenchées par la grille deviennent
 * gratuites, et les synchronisations programmées continuent d'apporter les
 * nouvelles vidéos au rythme prévu.
 */
/**
 * Fiches publiques des chaînes tierces dont Tandem TV diffuse les programmes.
 *
 * Isolé du reste de la collecte pour une raison précise : le catalogue peut
 * venir du cache, écrit avant que cette fonction n'existe ou avant l'ajout
 * d'une nouvelle source. Dans ce cas le cache ne contient rien pour elles, et
 * la page afficherait des fiches nues sans que rien ne l'explique. On peut donc
 * l'appeler séparément — huit unités de quota, sur dix mille.
 */
async function collecterPartenaires() {
  const partenaires = {};
  const dossier = await readJson(path.join(ROOT, 'data', 'partenaires.json'), null);
  const aLire = Object.entries(dossier?.sources || {})
    .map(([cle, s]) => [cle, /youtube\.com\/@([^/?#\s]+)/i.exec(s.url || '')?.[1]])
    .filter(([, h]) => h);
  if (!aLire.length) return partenaires;

  // Radio Shalom alimente deux fiches : une seule interrogation suffit.
  const parHandle = new Map();
  const uniques = [...new Set(aLire.map(([, h]) => h))];
  log(`Programmes extérieurs : ${uniques.length} chaîne(s) YouTube à lire pour ${aLire.length} fiche(s)…`);
  for (const handle of uniques) {
    const fiche = await yt.fetchChaineTierce(handle);
    if (fiche) parHandle.set(handle, fiche);
    else warn(`Chaîne tierce introuvable : @${handle}. Les fiches concernées s'afficheront avec les seules informations saisies à la main.`);
  }
  for (const [cle, handle] of aLire) {
    if (parHandle.has(handle)) partenaires[cle] = parHandle.get(handle);
  }
  return partenaires;
}

/**
 * Date a laquelle chaque video est apparue pour la premiere fois dans notre
 * catalogue.
 *
 * Pourquoi ne pas se fier a `publishedAt` : Michael televerse ses videos en
 * prive, parfois des semaines a l'avance, et les rend publiques quand il le
 * decide. YouTube est cense mettre `publishedAt` a jour a ce moment-la ; dans
 * les faits, on a constate le 7 aout 2026 qu'une video passee en public depuis
 * moins de 48 h portait encore une date bien anterieure. Toute logique de
 * « nouveaute » fondee sur cette date rate donc precisement les videos qui
 * comptent.
 *
 * Cette empreinte-ci ne peut pas mentir : une video n'entre dans le catalogue
 * qu'une fois publique, puisque l'API n'expose rien d'autre. Le jour ou nous la
 * voyons pour la premiere fois EST le jour de sa publication.
 *
 * Deux precautions contre l'inondation :
 *   - au tout premier passage (aucun cache), tout le catalogue est date de sa
 *     publication YouTube — sinon mille cent videos paraitraient nouvelles ;
 *   - une video deja presente dans l'ancien cache mais sans empreinte (cas de
 *     la migration) herite de sa date YouTube, pas de l'instant present.
 */
function marquerPremiereVue(data, ancien) {
  const videos = data?.videos || [];
  const anciennes = ancien?.videos || [];
  const idsConnus = new Set(anciennes.map((v) => v.id));
  const empreintes = new Map(anciennes.filter((v) => v.vuLe).map((v) => [v.id, v.vuLe]));
  const premierPassage = idsConnus.size === 0;

  let nouvelles = 0;
  for (const v of videos) {
    if (empreintes.has(v.id)) { v.vuLe = empreintes.get(v.id); continue; }
    if (premierPassage || idsConnus.has(v.id)) { v.vuLe = v.publishedAt || buildTime; continue; }
    v.vuLe = buildTime;
    nouvelles += 1;
  }
  if (nouvelles) log(`${nouvelles} vidéo(s) apparue(s) dans le catalogue à cette synchronisation.`);
}

async function collectData(config) {
  const cachePath = path.join(ROOT, 'data', 'cache.json');
  const cacheMinutes = Number(process.env.CACHE_MINUTES ?? config.youtube?.cacheMinutes ?? 100);

  if (!DEMO && !process.env.YOUTUBE_API_KEY) {
    throw new Error(
      "YOUTUBE_API_KEY absente. Sur GitHub : Settings → Secrets and variables → Actions → "
      + "New repository secret, nom « YOUTUBE_API_KEY ». En local : "
      + "YOUTUBE_API_KEY=votre_clé node build.mjs (ou node build.mjs --demo pour la démo).",
    );
  }

  if (DEMO) {
    const demo = await readJson(path.join(ROOT, 'data', 'demo.json'));
    if (!demo) throw new Error('data/demo.json introuvable.');
    log('Mode démonstration : données fictives.');
    return demo;
  }

  // Catalogue encore frais : on ne dérange pas YouTube.
  if (cacheMinutes > 0 && !process.env.FORCE_SYNC) {
    const cached = await readJson(cachePath);
    const age = cached?.fetchedAt
      ? (buildMs - Date.parse(cached.fetchedAt)) / 60000
      : Infinity;
    if (cached?.videos?.length && age >= 0 && age < cacheMinutes) {
      log(`Catalogue repris du cache (${Math.round(age)} min, seuil ${cacheMinutes} min) — aucun appel à YouTube.`);
      // Le cache peut être antérieur à l'ajout d'une source extérieure : on
      // comble le manque plutôt que de publier des fiches vides pendant deux
      // heures, sans que personne comprenne pourquoi.
      if (!cached.partenaires) {
        yt.setApiKey(process.env.YOUTUBE_API_KEY);
        cached.partenaires = await collecterPartenaires();
        await fs.writeFile(cachePath, JSON.stringify(cached), 'utf8');
      }
      return cached;
    }
  }

  try {
    const data = await collectFromApi(config);
    marquerPremiereVue(data, await readJson(cachePath));
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(data), 'utf8');
    return data;
  } catch (err) {
    warn(`Échec de l'appel API : ${err.message}`);
    const cached = await readJson(cachePath);
    if (cached) {
      warn('Utilisation du cache de la dernière synchronisation réussie.');
      return cached;
    }
    throw err;
  }
}

// --- Mise en forme des données -----------------------------------------------

/** Clé de comparaison insensible à la casse, aux accents et aux espaces. */
function normKey(str = '') {
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Repare les fautes d'accent arrivees de YouTube, a l'affichage seulement.
 *
 * Les descriptions sont ecrites dans YouTube Studio, souvent vite, parfois
 * depuis un telephone : « en Israel », « Jerome Haas », « l'Etat Hebreu ».
 * Le site les recopiait telles quelles.
 *
 * La liste des corrections n'a pas ete devinee. Elle a ete etablie le 29 aout
 * 2026 en comparant, dans le catalogue lui-meme, chaque mot ecrit sans accent
 * aux mots accentues presents ailleurs : « Israel » 35 fois contre « Israel »
 * accentue 149 fois, « Jerome » 16 fois contre « Jerome » accentue 29 fois.
 * On ne corrige que ce que la chaine ecrit deja correctement autre part.
 *
 * Ce que cette methode proposait et qu'on a REFUSE : « laisse » -> « laisse »
 * accentue, « lance » -> « lance » accentue, « expose », « frappe », « cesse »,
 * « ferme », « affiche », « livre », « des », « sur », « meme ». Ces mots
 * existent en francais sans accent. Les corriger aurait invente des fautes la
 * ou il n'y en avait pas. Une machine sait reperer un candidat ; elle ne sait
 * pas decider a sa place.
 *
 * Les noms propres qui s'ecrivent vraiment sans accent sont mis a l'abri
 * AVANT correction : « Nelly Ben Israel », « Israel Start Up Nation »,
 * « Dental Volunteers for Israel », « Mychef Israel ». Sans cette etape, une
 * correction sur 6 aurait abime un nom propre.
 */
/**
 * Corrige a l'affichage le titre d'une rubrique, sans toucher a son adresse.
 *
 * La cle de `display.renames` est le titre de la playlist tel qu'il est ecrit
 * sur YouTube. Mais ce titre peut arriver en majuscules (smartTitle le remet
 * alors en minuscules) et son apostrophe peut etre droite ou courbe selon le
 * clavier utilise ce jour-la. Chercher la cle a l'identique, c'est prendre le
 * risque qu'une correction ne s'applique jamais sans que rien ne le signale.
 *
 * On essaie donc, dans l'ordre : le titre brut, le titre affiche, puis une
 * comparaison sourde aux apostrophes, aux accents et a la casse. Cette
 * derniere n'est permissive que parce que la liste des cles est ecrite a la
 * main : elle ne peut rapprocher que des titres qu'on a explicitement demande
 * de corriger.
 */
function renommer(config, titreBrut, titreAffiche) {
  const renames = config.display?.renames;
  if (!renames) return titreAffiche;
  if (renames[titreBrut] !== undefined) return renames[titreBrut];
  if (renames[titreAffiche] !== undefined) return renames[titreAffiche];
  const sourd = (t) => String(t || '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  const cible = sourd(titreBrut);
  const cibleAffichee = sourd(titreAffiche);
  for (const [cle, valeur] of Object.entries(renames)) {
    const k = sourd(cle);
    if (k === cible || k === cibleAffichee) return valeur;
  }
  return titreAffiche;
}

function corrigerOrthographe(texte, config) {
  const regles = config.display?.orthographe;
  if (!texte || !regles?.corriger) return texte;

  // 1. Mise a l'abri des noms propres, par un jeton qu'aucune regle ne touche.
  const abris = [];
  let out = String(texte);
  for (const expression of regles.proteger || []) {
    if (!expression) continue;
    const motif = new RegExp(expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(motif, () => {
      abris.push(expression);
      return `\u0000${abris.length - 1}\u0000`;
    });
  }

  // 2. Correction mot entier, casse respectee (les cles portent leur casse).
  for (const [faux, bon] of Object.entries(regles.corriger)) {
    const motif = new RegExp(`(?<![\\p{L}\\p{M}])${faux.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{M}])`, 'gu');
    out = out.replace(motif, bon);
  }

  // 3. Retour des noms propres.
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => abris[Number(i)]);
}

function buildModel(config, data) {
  // Titres écrits en caractères décoratifs Unicode : illisibles pour Google.
  // On les ramène à des lettres ordinaires et on garde la liste pour le journal.
  const titresCorriges = [];
  const byId = new Map(data.videos.map((v) => {
    const titre = titreLisible(v.title);
    if (titreDecoratif(v.title)) titresCorriges.push({ id: v.id, avant: v.title, apres: titre });
    return [v.id, {
      ...v,
      title: corrigerOrthographe(titre, config),
      description: corrigerOrthographe(cleanDescription(v.description, titre), config),
      playlists: [],
    }];
  }));
  if (titresCorriges.length) {
    log(`${titresCorriges.length} titre(s) en caractères décoratifs normalisé(s) pour Google :`);
    for (const t of titresCorriges.slice(0, 10)) log(`   ${t.avant}  →  ${t.apres}`);
  }

  // 1. Playlists exclues par la configuration (titre ou identifiant).
  const excluded = new Set((config.playlists?.exclude || []).map(normKey));
  let playlists = data.playlists.filter((p) => !excluded.has(normKey(p.title)) && !excluded.has(p.id));
  if (playlists.length !== data.playlists.length) {
    log(`${data.playlists.length - playlists.length} playlist(s) exclue(s) par la configuration.`);
  }

  // 2. Fusion des playlists qui ne diffèrent que par la casse ou les accents.
  if (config.playlists?.mergeDuplicates !== false) {
    const merged = new Map();
    for (const p of playlists) {
      const key = normKey(p.title);
      const found = merged.get(key);
      if (!found) {
        merged.set(key, { ...p, videoIds: [...p.videoIds] });
      } else {
        found.videoIds.push(...p.videoIds);
        if ((p.description || '').length > (found.description || '').length) found.description = p.description;
        if (!found.thumbnail) found.thumbnail = p.thumbnail;
      }
    }
    const before = playlists.length;
    playlists = [...merged.values()].map((p) => ({ ...p, videoIds: [...new Set(p.videoIds)] }));
    if (before !== playlists.length) log(`${before - playlists.length} playlist(s) en doublon fusionnée(s).`);
  }

  // 3. Ordre : `order` d'abord, puis activité la plus récente.
  const order = config.playlists?.order || [];
  const rank = (p) => {
    const i = order.findIndex((o) => normKey(o) === normKey(p.title) || o === p.id);
    return i === -1 ? order.length + 1 : i;
  };

  const themeKeys = new Set((config.groups?.themes?.playlists || []).map(normKey));

  const categories = playlists
    .map((p) => {
      const videos = p.videoIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        // Même règle que pour allVideos, et c'est la même fonction : une
        // rubrique ne doit pas contenir ce que le catalogue rejette.
        .filter(yt.entreDansLeSite)
        .sort((a2, b2) => new Date(b2.publishedAt) - new Date(a2.publishedAt));
      return {
        ...p,
        rawTitle: p.title,
        // L'affichage corrige les titres tout en majuscules ; les comparaisons
        // (thèmes, exclusions, ordre) continuent de porter sur le titre d'origine.
        //
        // `display.renames` passe avant : c'est la seule façon de corriger une
        // faute que YouTube nous envoie. La playlist s'appelle « Cafe Daat »
        // sans accent sur YouTube ; smartTitle ne peut rien pour elle, il
        // corrige les majuscules, pas l'orthographe. Renommer la playlist sur
        // YouTube marcherait aussi, mais dépendrait d'un geste manuel qu'un
        // futur renommage effacerait — et l'adresse /emissions/cafe-daat/, elle,
        // est déjà indexée par Google. Le slug reste donc calculé sur le titre
        // BRUT : on corrige ce que le visiteur lit, jamais l'adresse.
        title: (() => {
          const affiche = config.display?.smartCase === false
            ? p.title
            : smartTitle(p.title, config.display?.properNouns || []);
          return renommer(config, p.title, affiche);
        })(),
        slug: slugify(p.title),
        group: themeKeys.has(normKey(p.title)) ? 'themes' : 'shows',
        videos,
      };
    })
    .filter((c) => c.videos.length >= (config.playlists?.minVideos ?? 1))
    .sort((a2, b2) => rank(a2) - rank(b2)
      || new Date(b2.videos[0]?.publishedAt || 0) - new Date(a2.videos[0]?.publishedAt || 0)
      || b2.videos.length - a2.videos.length);

  // 4. Slugs uniques
  const seen = new Map();
  for (const c of categories) {
    const n = (seen.get(c.slug) || 0) + 1;
    seen.set(c.slug, n);
    if (n > 1) c.slug = `${c.slug}-${n}`;
  }

  // 5. Rattachement des vidéos à leurs rubriques : une émission d'abord,
  //    pour que l'étiquette affichée sur une vignette soit le rendez-vous.
  const ordered = [...categories].sort((a2, b2) => (a2.group === 'shows' ? 0 : 1) - (b2.group === 'shows' ? 0 : 1));
  for (const c of ordered) {
    for (const v of c.videos) v.playlists.push({ id: c.id, title: c.title, slug: c.slug, group: c.group });
  }

  const allVideos = [...byId.values()]
    // La règle d'entrée dans le site vit dans src/youtube.mjs, une seule fois.
    // Elle était écrite ici en deux filtres, et les fiches d'invités, qui
    // passent par cat.videos, ne la connaissaient pas du tout.
    .filter(yt.entreDansLeSite)
    .sort((a2, b2) => new Date(b2.publishedAt) - new Date(a2.publishedAt));

  // Une rubrique sort des menus quand elle n'a rien publié depuis N mois.
  const maxAgeMonths = config.playlists?.menuMaxAgeMonths ?? 0;
  const cutoff = maxAgeMonths > 0
    ? new Date(buildMs - maxAgeMonths * 30.44 * 86_400_000)
    : null;
  // Règle mixte : une rubrique reste au menu si elle a publié récemment
  // OU si son catalogue dépasse un certain volume.
  const menuMin = config.playlists?.menuMinVideos ?? 0;
  const inMenu = (c) => {
    const recent = !cutoff
      || (c.videos[0]?.publishedAt ? new Date(c.videos[0].publishedAt) >= cutoff : false);
    const substantial = menuMin > 0 && c.videos.length >= menuMin;
    return recent || substantial;
  };
  // Volontairement PAS de sous-familles « à l'antenne » / « archives ».
  //
  // Michael, 10 août 2026 : « je ne veux pas de tris dans emissions, juste
  // toutes les émissions passées et présentes ». Et il a raison : classer une
  // rubrique en « archives » revient à déclarer l'émission terminée, ce qui est
  // une décision éditoriale — la sienne — pas le résultat d'un calcul sur une
  // date de dernière publication. Une émission peut reprendre.
  // Le menu reste un raccourci vers les rubriques les plus fournies ou les plus
  // actives ; la page /emissions/ liste tout, sans hiérarchie.
  const shows = categories.filter((c) => c.group === 'shows');
  const themes = categories.filter((c) => c.group === 'themes');
  // Ordre des menus et des index : par activité récente (défaut) ou alphabétique.
  // `categories` est déjà trié par activité, un simple filtre conserve cet ordre.
  const alpha = (list) => [...list].sort((a2, b2) => a2.title.localeCompare(b2.title, 'fr', { sensitivity: 'base' }));
  const sortMode = config.playlists?.sort === 'alpha' ? alpha : ((list) => list);
  const nav = {
    shows,
    themes,
    showsIndex: sortMode(shows),
    themesIndex: sortMode(themes),
    menuShows: sortMode(shows.filter(inMenu)),
    menuThemes: sortMode(themes.filter(inMenu)),
  };
  if (cutoff || menuMin) {
    const shown = nav.menuShows.length + nav.menuThemes.length;
    log(`Menus : ${shown} rubrique(s) sur ${categories.length} `
      + `(actives depuis moins de ${maxAgeMonths} mois, ou ${menuMin}+ vidéos). `
      + 'Les autres restent dans le catalogue et la recherche.');
  }

  return { channel: data.channel, categories, allVideos, byId, nav };
}

// --- Fichiers annexes --------------------------------------------------------

function rssFeed(config, videos, { title = config.siteName, path = '/rss.xml', description = config.description } = {}) {
  const items = videos.slice(0, 50).map((v) => `
  <item>
    <title>${escapeHtml(v.title)}</title>
    <link>${config.siteUrl}/video/${v.id}/</link>
    <guid isPermaLink="true">${config.siteUrl}/video/${v.id}/</guid>
    <pubDate>${new Date(v.publishedAt).toUTCString()}</pubDate>
    ${v.playlists?.[0] ? `<category>${escapeHtml(v.playlists[0].title)}</category>` : ''}
    <description>${escapeHtml(excerpt(v.description, 500) || v.title)}</description>
  </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeHtml(title)}</title>
  <link>${config.siteUrl}/</link>
  <atom:link href="${config.siteUrl}${path}" rel="self" type="application/rss+xml"/>
  <description>${escapeHtml(description)}</description>
  <language>${config.lang}</language>
  <lastBuildDate>${new Date(buildTime).toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;
}

/** Rend une URL absolue (les miniatures YouTube le sont déjà). */
function absoluteUrl(config, url) {
  if (!url) return '';
  return /^https?:\/\//.test(url) ? url : `${config.siteUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Sitemap vidéo au format Google : une entrée par vidéo, avec le lecteur,
 * la miniature, la durée et la date. C'est le signal le plus explicite pour
 * l'indexation vidéo.
 */
function videoSitemap(config, videos) {
  const items = videos
    .filter((v) => v.duration > 0 && v.duration <= 28_800)
    .map((v) => `  <url>
    <loc>${config.siteUrl}/video/${v.id}/</loc>
    <video:video>
      <video:thumbnail_loc>${escapeHtml(absoluteUrl(config, v.thumbnail) || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}</video:thumbnail_loc>
      <video:title>${escapeHtml(truncate(v.title, 100))}</video:title>
      <video:description>${escapeHtml(excerpt(v.description, 2000) || v.title)}</video:description>
      <video:player_loc allow_embed="yes">https://www.youtube-nocookie.com/embed/${v.id}</video:player_loc>
      <video:duration>${v.duration}</video:duration>
      <video:publication_date>${new Date(v.publishedAt).toISOString()}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
      <video:live>no</video:live>
      <video:uploader info="${config.channelUrl}">${escapeHtml(config.siteName)}</video:uploader>
    </video:video>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${items}
</urlset>`;
}

/**
 * Sitemap Google Actualités. Google exige des articles de moins de 48 heures,
 * mille au maximum — au-delà, le fichier est ignoré. Le nôtre est donc
 * volontairement minuscule : uniquement ce qui vient de paraître.
 */
function newsSitemap(config, videos) {
  const limite = Date.now() - 48 * 3600 * 1000;
  const recentes = videos
    .filter((v) => v.publishedAt && new Date(v.publishedAt).getTime() >= limite)
    .slice(0, 1000);

  const corps = recentes.map((v) => `  <url>
    <loc>${config.siteUrl}/video/${v.id}/</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeHtml(config.siteName)}</news:name>
        <news:language>${config.lang || 'fr'}</news:language>
      </news:publication>
      <news:publication_date>${new Date(v.publishedAt).toISOString()}</news:publication_date>
      <news:title>${escapeHtml(v.title)}</news:title>
    </news:news>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${corps}
</urlset>`;
}

function sitemapIndex(config, files) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files.map((f) => `  <sitemap><loc>${config.siteUrl}/${f}</loc><lastmod>${new Date(buildTime).toISOString().slice(0, 10)}</lastmod></sitemap>`).join('\n')}
</sitemapindex>`;
}

function sitemap(config, urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${config.siteUrl}${u.loc}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}<changefreq>${u.freq || 'weekly'}</changefreq><priority>${u.priority || '0.6'}</priority></url>`).join('\n')}
</urlset>`;
}

// --- Build -------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
  // Les adresses des assets portent l'empreinte de leur contenu : un fichier
  // modifie change d'adresse et ne peut donc pas etre servi depuis un cache.
  config.empreintes = {
    css: await empreinte('assets/style.css'),
    js: await empreinte('assets/app.js'),
  };
  config.siteUrl = config.siteUrl.replace(/\/$/, '');

  const data = await collectData(config);
  const { channel, categories, allVideos, byId, nav } = buildModel(config, data);

  if (!allVideos.length) throw new Error('Aucune vidéo récupérée : build interrompu.');
  log(`${allVideos.length} vidéos, ${categories.length} rubriques (${nav.shows.length} émissions, ${nav.themes.length} thèmes).`);

  // Présentation des rubriques. La plupart des playlists YouTube n'ont pas de
  // description : sans ce fichier, les pages de rubrique n'affichent aucun
  // texte, ni pour le visiteur ni pour Google. Un texte écrit à la main
  // l'emporte sur celui venu de YouTube.
  const textesRubriques = await readJson(path.join(ROOT, 'data', 'rubriques.json'), {});
  let ecrites = 0;
  for (const c of categories) {
    const t = textesRubriques[c.slug];
    if (typeof t === 'string' && t.trim()) { c.description = t.trim(); ecrites++; }
  }
  const muettes = categories.filter((c) => !(c.description || '').trim());
  log(`Présentations de rubriques : ${ecrites} écrites à la main, ${categories.length - ecrites - muettes.length} venues de YouTube, ${muettes.length} sans texte.`);
  if (muettes.length) {
    warn(`Rubriques sans présentation : ${muettes.map((c) => c.slug).join(', ')}`);
    // Une rubrique sans texte est invisible pour Google et muette pour le
    // visiteur. Pour en écrire la présentation il faut savoir de quoi elle
    // parle : le journal livre donc, pour chacune, son présentateur supposé et
    // ses titres les plus récents. C'est la matière qui manque, et elle n'est
    // nulle part ailleurs.
    log('Matière pour rédiger ces présentations — présentateur, nombre de vidéos, derniers titres :');
    for (const c of muettes) {
      const titres = c.videos.slice(0, 5).map((v) => `« ${truncate(v.title, 80)} »`).join(' · ');
      log(`   [${c.slug}] ${c.title} — ${c.videos.length} vidéo(s)`);
      log(`      ${titres}`);
    }
  }

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const ctx = { config, categories, nav, buildTime, channel };
  const urls = [];

  // Les transcriptions sont chargées AVANT les fiches de personnes, et ce
  // n'est pas un detail d'ordre : depuis le 28 aout, une video transcrite
  // compte comme « quelque chose a dire » sur la personne qui y parle. Une
  // page d'invite adossee a trois mille mots de ce qu'il a reellement dit
  // n'est pas une page vide -- c'est le contraire. Le critere reste celui
  // pose le 18 aout : du texte, pas un nombre de passages.
  //
  // La reconnaissance « ce fichier appartient a cette video » vit ici et
  // nulle part ailleurs : elle accepte l'identifiant YouTube comme le titre,
  // et la refaire une seconde fois pour les personnes aurait garanti que les
  // deux finissent par diverger.
  // Transcriptions déposées à la main dans data/transcriptions/<id>.<srt|vtt|txt>.
  // Elles ne sont ni produites ni devinées ici : sans fichier, pas de bloc.
  const lexique = await readJson(path.join(ROOT, 'data', 'lexique-transcription.json'), {});
  const transcriptions = new Map();
  const sansVideo = [];
  try {
    const dossier = path.join(ROOT, 'data', 'transcriptions');
    for (const nom of await fs.readdir(dossier)) {
      const ext = path.extname(nom).toLowerCase();
      if (!['.srt', '.vtt', '.txt'].includes(ext)) continue;
      const base = path.basename(nom, ext);
      // Le fichier peut être nommé par l'identifiant de la vidéo, ou tout
      // simplement par son titre : les outils de transcription reprennent le
      // titre, et renommer mille fichiers à la main n'a pas de sens.
      const id = allVideos.some((v) => v.id === base)
        ? base
        : (allVideos.find((v) => normKey(v.title) === normKey(base))
          || (normKey(base).length > 20
            ? allVideos.find((v) => normKey(v.title).startsWith(normKey(base)))
            : null))?.id;
      if (!id) { sansVideo.push(nom); continue; }
      const t = lireTranscription(await readText(path.join(dossier, nom)), {
        corrections: lexique.corrections || {}, extension: ext,
      });
      if (t) transcriptions.set(id, t);
    }
  } catch { /* dossier absent : rien à faire */ }
  if (sansVideo.length) {
    warn(`${sansVideo.length} fichier(s) de transcription sans vidéo correspondante — renommez-les avec l'identifiant YouTube ou le titre exact :`);
    sansVideo.forEach((n) => warn(`   ${n}`));
  }
  if (transcriptions.size) {
    const mots = [...transcriptions.values()].reduce((n, t) => n + t.mots, 0);
    log(`${transcriptions.size} transcription(s) chargée(s), ${mots.toLocaleString('fr-FR')} mots au total.`);
  }


  // Fiches des invités et des présentateurs. Les données de Search Console
  // montrent que l'essentiel des recherches menant au site sont des recherches
  // de noms : ce sont ces pages qui leur répondent.
  const fichesManuelles = await readJson(path.join(ROOT, 'data', 'personnes.json'), {});
  const { personnes, presentateurParRubrique, fichesOrphelines } =
    collecterPersonnes(categories, allVideos, fichesManuelles,
                       new Set(transcriptions.keys()));
  if (fichesOrphelines?.length) {
    warn(`${fichesOrphelines.length} fiche(s) de personnes.json ne correspondent à personne `
      + `— orthographe à vérifier : ${fichesOrphelines.join(', ')}`);
  }
  ctx.presentateurParRubrique = presentateurParRubrique;

  const personnesParVideo = new Map();
  for (const p of personnes) {
    for (const v of p.videos) {
      if (!personnesParVideo.has(v.id)) personnesParVideo.set(v.id, []);
      personnesParVideo.get(v.id).push(p);
    }
  }
  ctx.personnesParVideo = personnesParVideo;

  if (personnes.length) {
    await writePage('/invites/', R.personIndexPage({ ...ctx, personnes }));
    urls.push({ loc: '/invites/', freq: 'weekly', priority: '0.6' });
    for (const personne of personnes) {
      await writePage(`/invites/${personne.slug}/`, R.personPage({ ...ctx, personne }));
      urls.push({
        loc: `/invites/${personne.slug}/`,
        freq: 'monthly',
        priority: '0.6',
        lastmod: personne.videos[0]?.publishedAt,
      });
    }
    log(`${personnes.length} fiche(s) d'invités ou de présentateurs : ${personnes.slice(0, 6).map((p) => `${p.nom} (${p.videos.length})`).join(', ')}…`);
  }


  // Grille des programmes du canal 14, si un export est présent.
  const grilleBrute = await readJson(path.join(ROOT, 'data', 'grille.json'), null);
  const grilleEmissions = await readJson(path.join(ROOT, 'data', 'grille-emissions.json'), {});
  const grille = grilleBrute
    ? prepareGrille(grilleBrute, {
      emissions: grilleEmissions,
      index: indexerVideos(allVideos),
      aujourdhui: jourIsrael(new Date(buildTime)),
      arrondi: config.tv?.arrondiMinutes ?? 5,
      // La régie exporte sept jours ; on n'en montre que trois tant que la
      // fiabilité de J-3 à J-6 n'a pas été mesurée. Voir prepareGrille.
      joursAffiches: config.tv?.joursAffiches ?? 3,
      smartTitre: (t) => smartTitle(t, config.display?.properNouns || []),
      rubriques: categories.map((c) => ({ slug: c.slug, title: c.title })),
    })
    : null;
  ctx.grille = grille;
  if (grille) nav.grille = true;   // fait apparaître l'entrée « Grille TV » dans le menu

  // --- Programmes diffusés mais non produits par Tandem TV -------------------
  //
  // Ils n'ont aucune vidéo dans le catalogue : sans cette page, ils occupent
  // l'antenne plusieurs fois par jour et n'existent nulle part sur le site.
  // On les regroupe par source — une chaîne peut fournir plusieurs émissions —
  // et on lit dans la grille leur rythme réel de diffusion.
  const dossierPart = await readJson(path.join(ROOT, 'data', 'partenaires.json'), null);
  const partenaires = [];
  if (dossierPart?.sources) {
    const fiches = data.partenaires || {};

    // Occurrences par identifiant de programme, horaires et clips confondus.
    const passages = new Map();
    const ajouter = (id, date, heure) => {
      if (!id) return;
      if (!passages.has(id)) passages.set(id, []);
      passages.get(id).push([date, heure]);
    };
    if (grille) {
      for (const j of grille.jours) {
        for (const p of j.programmes) {
          if (p.type === 'programme') ajouter(p.id, j.date, p.heure);
          else if (p.type === 'clips') for (const id of p.ids || []) ajouter(id, j.date, p.heure || '');
        }
      }
    }
    const nbJours = grille?.jours?.length || 1;

    for (const [cle, src] of Object.entries(dossierPart.sources)) {
      const fiche = fiches[cle] || null;
      const reseau = /instagram\.com/i.test(src.url || '') ? 'instagram'
        : (/youtube\.com/i.test(src.url || '') ? 'youtube' : 'web');

      const programmes = (src.programmes || []).map((id) => ({
        id,
        nom: grilleEmissions[id]?.nom || String(id).replace(/_/g, ' '),
        passages: (passages.get(id) || []).length,
      }));

      const tous = (src.programmes || []).flatMap((id) => passages.get(id) || []);
      const avecHeure = tous.filter(([, h]) => h).sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));

      partenaires.push({
        cle,
        // Ce qui est saisi à la main l'emporte : Michael connaît ses partenaires
        // mieux que la fiche YouTube, qui est parfois vide ou mal tenue.
        // Dernier recours si YouTube n'a rien rendu : le nom de l'émission
        // elle-même, toujours plus parlant qu'un identifiant technique.
        nom: src.nom || fiche?.title || programmes[0]?.nom || cle,
        // Quand le nom affiché n'est pas celui de la chaîne d'origine — deux
        // émissions de Radio Shalom présentées séparément, par exemple — on dit
        // d'où elles viennent, sinon le texte repris de YouTube parle d'une
        // maison que rien ne nomme sur la fiche.
        source: (src.nom && fiche?.title && src.nom !== fiche.title) ? fiche.title : '',
        url: src.url || '',
        reseau,
        avatar: src.image || fiche?.avatar || '',
        description: src.description || excerpt(fiche?.description || '', 240),
        abonnes: fiche?.subscribers || 0,
        programmes,
        passages: tous.length,
        parJour: tous.length / nbJours,
        prochains: avecHeure.slice(0, 40),
        // Certaines sources n'ont volontairement pas de texte : inutile de le
        // rappeler à chaque construction, un avertissement qu'on ignore finit
        // par masquer ceux qui comptent.
        texteFacultatif: Boolean(src.texteFacultatif),
      });
    }

    // Les plus présents à l'antenne d'abord : c'est l'ordre que produirait un
    // téléspectateur à qui on demanderait qui il voit le plus souvent.
    partenaires.sort((a, b) => b.passages - a.passages || a.nom.localeCompare(b.nom, 'fr'));
  }
  ctx.partenaires = partenaires;
  // Index programme → source, pour que la grille puisse nommer, illustrer et
  // relier ce qu'elle diffuse sans le produire.
  const externes = new Map();
  for (const p of partenaires) {
    for (const e of p.programmes) externes.set(e.id, { cle: p.cle, nom: p.nom, avatar: p.avatar });
  }
  ctx.externes = externes;

  // --- Prochaines diffusions ------------------------------------------------
  //
  // La grille sait quand chaque programme repasse. Jusqu'ici cette information
  // ne vivait que sur la page grille ; elle a bien plus de valeur là où le
  // visiteur se trouve déjà — sur la page d'une vidéo qu'il vient de regarder,
  // ou sur celle d'une émission qu'il suit. C'est ce qui distingue un catalogue
  // d'un programme de télévision : savoir quand ça repasse.
  //
  // On ne pose sur chaque page que les créneaux qui la concernent : quelques
  // dizaines d'octets, là où embarquer la grille entière coûterait 5 ko par page.
  const diffusionsVideo = new Map();
  const diffusionsRubrique = new Map();
  if (grille) {
    for (const j of grille.jours) {
      for (const p of j.programmes) {
        if (p.type !== 'programme' || !p.heure) continue;
        const creneau = [j.date, p.heure, p.fixe ? 1 : 0];
        if (p.videoId) {
          if (!diffusionsVideo.has(p.videoId)) diffusionsVideo.set(p.videoId, []);
          diffusionsVideo.get(p.videoId).push(creneau);
        }
        if (p.rubrique) {
          if (!diffusionsRubrique.has(p.rubrique)) diffusionsRubrique.set(p.rubrique, []);
          diffusionsRubrique.get(p.rubrique).push([...creneau, p.titre || '']);
        }
      }
    }
    const tri = (a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1);
    for (const v of diffusionsVideo.values()) v.sort(tri);
    for (const v of diffusionsRubrique.values()) v.sort(tri);
    log(`Prochaines diffusions : ${diffusionsVideo.size} vidéo(s) et ${diffusionsRubrique.size} rubrique(s) annoncent leur passage à l'antenne.`);
  }
  ctx.diffusionsVideo = diffusionsVideo;
  ctx.diffusionsRubrique = diffusionsRubrique;

  // --- Ordre des rubriques --------------------------------------------------
  //
  // Michael, 10 août 2026 : « je trierai d'abord par les émissions
  // actuellement diffusées, ensuite par nombre de vidéos par émission ».
  //
  // « Actuellement diffusée » se lit dans la grille du canal 14, pas dans les
  // dates de publication YouTube : une émission peut n'avoir rien publié
  // depuis des mois et passer à l'antenne cette semaine. C'est un fait
  // vérifiable, pas un jugement sur la vitalité d'une rubrique — d'où le refus,
  // plus haut, de trier en « archives » et « à l'antenne ».
  //
  // Ce tri arrive ici, et pas au moment où `nav` est construit, pour une raison
  // simple : la grille n'est lue qu'après. On réordonne donc les listes déjà
  // constituées, sans toucher à leur contenu.
  const ordreAlpha = (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
  // Les listes exhaustives passent en ordre alphabétique : sur 76 rubriques,
  // c'est le seul ordre où le visiteur qui cherche « Guide en Tandem » sait
  // d'avance où regarder. L'ordre par activité n'a de sens que sur une liste
  // courte, or celle-ci ne l'est pas.
  nav.showsIndex = [...nav.showsIndex].sort(ordreAlpha);
  nav.themesIndex = [...nav.themesIndex].sort(ordreAlpha);

  // Le menu déroulant « Émissions » ne garde QUE ce qui passe à l'antenne.
  //
  // Michael, 10 août 2026. Le menu cesse d'être un palmarès calculé pour
  // devenir un fait : voici ce que la chaîne diffuse en ce moment. Tout le
  // reste est à un clic, sur une page qui s'annonce comme exhaustive.
  //
  // Le risque était qu'une émission hebdomadaire sorte du menu les semaines
  // creuses, faisant changer la navigation toute seule. Vérifié sur les 15
  // journées de grille disponibles le 10 août, en fenêtre glissante de 3 et de
  // 7 jours : le même ensemble de 7 rubriques à chaque fois, sans exception.
  //
  // Les thèmes (Gaza, Antisémitisme, Iran…) ne sont pas des rendez-vous
  // d'antenne : leur menu garde la règle d'origine, sans quoi il se viderait.
  // À l'intérieur, la plus fraîche d'abord — Michael, 10 août : « si la dernière
  // vidéo publiée est une interview de Jérôme, il vient en première position ».
  // `categories` trie déjà les vidéos de chaque rubrique du plus récent au plus
  // ancien : la date à comparer est donc celle de la première.
  const derniereVideo = (c) => c.videos[0]?.publishedAt || '';
  const plusRecenteDAbord = (a, b) => (derniereVideo(b) < derniereVideo(a) ? -1
    : derniereVideo(b) > derniereVideo(a) ? 1 : ordreAlpha(a, b));
  if (diffusionsRubrique.size) {
    const aLAntenne = nav.shows.filter((c) => diffusionsRubrique.has(c.slug)).sort(plusRecenteDAbord);
    if (aLAntenne.length) {
      nav.menuShows = aLAntenne;
      log(`Menu « Émissions » : ${aLAntenne.length} rubrique(s) à l'antenne, la plus fraîche d'abord — `
        + aLAntenne.map((c) => `${c.title} (${derniereVideo(c).slice(0, 10)})`).join(', '));
    }
  }
  nav.menuThemes = [...nav.menuThemes].sort(ordreAlpha);

  // --- Historique de diffusion ---------------------------------------------
  //
  // Ce que la chaîne a réellement diffusé, relu dans l'archive nocturne. À la
  // différence de tout le reste du site, cette information ne peut pas être
  // reconstituée après coup : elle n'existe que parce qu'on la conserve depuis
  // le 2 août 2026.
  const archive = await lireArchive(path.join(ROOT, 'data', 'grille-archive'), {
    emissions: grilleEmissions,
    index: indexerVideos(allVideos),
    smartTitre: (t) => smartTitle(t, config.display?.properNouns || []),
    rubriques: categories.map((c) => ({ slug: c.slug, title: c.title })),
    joursMax: config.tv?.historiqueJours ?? 120,
  });
  ctx.archive = archive;
  if (archive.jours) {
    log(`Historique de diffusion : ${archive.jours} journée(s) archivée(s) du ${archive.premier} au ${archive.dernier} — ${archive.parVideo.size} vidéo(s) avec un passage daté.`);
  }
  // Les pages de sujet sont declarees sous « sujets/ » dans site.config.json.
  // Une seule ligne les fait apparaitre au menu : leur simple existence.
  if ((config.pages || []).some((pg) => pg.slug.startsWith('sujets/'))) nav.sujets = true;
  if (partenaires.length) nav.partenaires = true;

  // Medias amis (une radio, un groupe Telegram…). Distinct des producteurs
  // ci-dessus : aucun programme n'est echange, c'est un partenariat editorial.
  const medias = await readJson(path.join(ROOT, 'data', 'partenaires-medias.json'), null);
  if (medias?.partenaires?.length) { nav.medias = true; ctx.medias = medias; }
  if (grille) {
    const relies = grille.jours.flatMap((j) => j.programmes).filter((p) => p.videoId).length;
    const a = grille.apparies;
    log(`Grille TV : ${grille.jours.length} journée(s), ${grille.total} programme(s), ${relies} relié(s) à une vidéo du site (${a.titre} par le titre, ${a.rubrique} par la rubrique).`);
    if (grille.sansCatalogue.length) {
      log(`${grille.sansCatalogue.length} programme(s) extérieur(s) sans replay, ce qui est normal : ${grille.sansCatalogue.join(', ')}`);
    }
    if (grille.nonApparies.length) {
      warn(`${grille.nonApparies.length} diffusion(s) d'une production Tandem TV sans vidéo correspondante — les 12 premières :`);
      for (const x of grille.nonApparies.slice(0, 12)) warn(`   ${x}`);
    }
    if (grille.orphelines.length) {
      warn(`${grille.orphelines.length} rubrique(s) de la grille pointent vers une adresse qui n'existe plus (playlist renommée ?). Le rattachement s'est fait par le nom de l'émission ; corrigez le champ « site » dans data/grille-emissions.json :`);
      for (const o of grille.orphelines) warn(`   ${o}`);
    }
    if (grille.perimee) warn("Grille TV périmée : l'export ne couvre plus aucune journée à venir.");
    const inconnus = [...new Set(grilleBrute.rows.map((r) => r.channel_id))].filter((id) => !grilleEmissions[id]);
    if (inconnus.length) warn(`Programmes sans nom d'affichage dans data/grille-emissions.json : ${inconnus.join(', ')}`);
    await writePage('/grille/', R.grillePage({ ...ctx, grille }));
    urls.push({ loc: '/grille/', freq: 'daily', priority: '0.8' });
  }

  // Accueil.
  //
  // Le chapeau vient de content/accueil.md : la page d'accueil ne contenait
  // aucune phrase rédigée, ce qui la rendait muette pour un visiteur qui
  // arrive de Google sans connaître la chaîne — et quasi vide pour Google
  // lui-même. Supprimer le fichier fait simplement disparaître le bloc.
  let introHtml = '';
  const introMd = await readText(path.join(ROOT, 'content', 'accueil.md'));
  if (introMd && introMd.trim()) introHtml = markdownToHtml(introMd.trim());

  // Portrait du présentateur en tête de chaque rangée d'émission.
  // Rapprochement insensible aux accents : le nom retenu pour l'affichage
  // (« Jérôme Haas ») n'est pas toujours celui lu dans le titre de la rubrique.
  const sansAccents = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const parNom = new Map(personnes.map((p) => [sansAccents(p.nom), p]));
  const personneParRubrique = new Map();
  for (const [slug, nom] of presentateurParRubrique) {
    const p = parNom.get(sansAccents(nom));
    if (p) personneParRubrique.set(slug, p);
  }

  if (partenaires.length) {
    await writePage('/autres-programmes/', R.partenairesPage({ ...ctx }));
    urls.push({ loc: '/autres-programmes/', freq: 'weekly', priority: '0.7' });
    const sansTexte = partenaires.filter((p) => !p.description && !p.texteFacultatif).map((p) => p.nom);
    log(`Autres programmes : ${partenaires.length} source(s), ${partenaires.reduce((n, p) => n + p.programmes.length, 0)} émission(s), ${partenaires.reduce((n, p) => n + p.passages, 0)} passage(s) dans la grille.`);
    if (sansTexte.length) warn(`${sansTexte.length} source(s) sans texte de présentation : ${sansTexte.join(', ')}`);
  }

  if (ctx.medias) {
    await writePage('/partenaires/', R.partenairesMediasPage({ ...ctx }));
    urls.push({ loc: '/partenaires/', freq: 'monthly', priority: '0.6' });
    log(`Partenaires médias : ${ctx.medias.partenaires.length} média(s) présenté(s).`);
  }

  await writePage('/', R.homePage({
    ...ctx, latest: allVideos, personnes, personneParRubrique, introHtml,
  }));
  urls.push({ loc: '/', freq: 'daily', priority: '1.0', lastmod: allVideos[0]?.publishedAt });

  // Catalogue complet (sous /emissions/), paginé
  const allPages = paginate(allVideos, PER_PAGE);
  for (const [i, pageVideos] of allPages.entries()) {
    const page = i + 1;
    const route = page === 1 ? '/emissions/' : `/emissions/page/${page}/`;
    await writePage(route, R.groupIndexPage({
      ...ctx, group: 'shows', items: nav.showsIndex, videos: pageVideos, page, totalPages: allPages.length,
    }));
    urls.push({ loc: route, freq: 'daily', priority: page === 1 ? '0.9' : '0.4' });
  }

  // Index des thèmes
  await writePage('/themes/', R.groupIndexPage({
    ...ctx, group: 'themes', items: nav.themesIndex, rows: nav.themes, videos: null, page: 1, totalPages: 1,
  }));
  urls.push({ loc: '/themes/', freq: 'weekly', priority: '0.8' });

  // Une page (paginée) par rubrique
  for (const category of categories) {
    // Un flux par rubrique : on suit un rendez-vous précis sans recevoir toute
    // la chaîne. Coût nul, et c'est un canal que personne ne peut nous couper.
    await writeFile(`emissions/${category.slug}/rss.xml`, rssFeed(config, category.videos, {
      title: `${config.siteName} — ${category.title}`,
      path: `/emissions/${category.slug}/rss.xml`,
      description: category.description
        ? truncate(category.description, 400)
        : `Toutes les vidéos de la rubrique « ${category.title} » sur ${config.siteName}.`,
    }));

    const pages = paginate(category.videos, PER_PAGE);
    for (const [i, pageVideos] of pages.entries()) {
      const page = i + 1;
      const route = page === 1 ? `/emissions/${category.slug}/` : `/emissions/${category.slug}/page/${page}/`;
      await writePage(route, R.categoryPage({
        ...ctx, category, videos: pageVideos, page, totalPages: pages.length,
      }));
      urls.push({ loc: route, freq: 'weekly', priority: page === 1 ? '0.8' : '0.4', lastmod: category.videos[0]?.publishedAt });
    }
  }

  // Une page par vidéo
  for (const video of allVideos) {
    const cat = video.playlists?.[0];
    const pool = cat ? categories.find((c) => c.slug === cat.slug).videos : allVideos;
    const related = pool.filter((v) => v.id !== video.id).slice(0, 8);
    await writePage(`/video/${video.id}/`, R.videoPage({
      ...ctx, video, related, transcription: transcriptions.get(video.id) || null,
    }));
    urls.push({ loc: `/video/${video.id}/`, freq: 'monthly', priority: '0.7', lastmod: video.publishedAt });
  }

  // Pages éditoriales (Markdown) — la liste est pilotée par site.config.json
  const contentDir = path.join(ROOT, 'content');
  const sujetsEcrits = [];
  for (const pg of config.pages || []) {
    let md;
    try {
      md = await fs.readFile(path.join(contentDir, `${pg.slug}.md`), 'utf8');
    } catch {
      warn(`Page « ${pg.title} » ignorée : content/${pg.slug}.md est introuvable.`);
      continue;
    }
    const analyticsNote = config.analytics?.cloudflareToken
      ? "La fréquentation du site est mesurée avec **Cloudflare Web Analytics**. Cet outil ne dépose aucun cookie, n'utilise pas d'empreinte numérique et ne permet pas de vous identifier ni de vous suivre d'un site à l'autre. Il compte les pages vues et les provenances, de façon agrégée."
      : "Aucun outil de mesure d'audience n'est actif à ce jour. Si nous en installons un, ce sera une solution respectueuse de la vie privée, sans cookie et sans identification individuelle, et cette page sera mise à jour en conséquence.";
    const pushNote = config.push?.oneSignalAppId
      ? "Le site propose de vous prévenir des nouvelles vidéos par notification du navigateur. **Rien ne se déclenche sans votre accord explicite** : tant que vous n'avez pas accepté, aucun identifiant n'est créé. Si vous acceptez, votre navigateur génère un identifiant technique anonyme, confié à notre prestataire **OneSignal**, qui achemine les notifications. Cet identifiant n'est associé ni à votre nom, ni à votre adresse électronique — nous ne les connaissons pas. Vous pouvez retirer cette autorisation à tout moment dans les réglages de votre navigateur, sans avoir à nous en informer. Voir la [politique de confidentialité de OneSignal](https://onesignal.com/privacy_policy)."
      : "Le site n'envoie aucune notification.";
    const newsletterNote = config.newsletter?.formId
      ? "Le site propose de recevoir les nouvelles vidéos par courrier électronique. **L'inscription est volontaire** : seule l'adresse que vous saisissez vous-même est enregistrée, et rien d'autre — ni nom, ni suivi de navigation. Elle est confiée à notre prestataire d'expédition **Kit** (Kit.com, ex-ConvertKit), qui l'utilise uniquement pour acheminer ces envois. Nous ne la cédons, ne la louons et ne la vendons à personne. Chaque message contient un lien de désinscription qui prend effet immédiatement ; vous pouvez aussi nous écrire pour être retiré de la liste. Voir la [politique de confidentialité de Kit](https://kit.com/privacy)."
      : "Le site ne propose pas de lettre d'information et ne collecte aucune adresse électronique.";
    // {{rendezvous}} — les emissions encore a l'antenne, calculees a chaque
    // construction. Michael, 28 aout 2026 : « dans les rdv de la chaine ne mets
    // que les chaines des 4 derniers mois, le reste dans Toutes les emissions ».
    // Une liste ecrite a la main aurait vieilli des la premiere emission
    // arretee, et personne ne s'en serait apercu. Ici elle se corrige seule :
    // une rubrique qui cesse de publier disparait toute seule au bout de
    // quatre mois, et une nouvelle apparait des sa premiere video.
    const RENDEZ_VOUS_MOIS = 4;
    const limiteRdv = buildMs - RENDEZ_VOUS_MOIS * 30.44 * 86_400_000;
    const rendezVous = (nav.shows || [])
      .filter((c) => c.videos[0]?.publishedAt
        && Date.parse(c.videos[0].publishedAt) >= limiteRdv)
      .map((c) => `- **[${c.title}](/emissions/${c.slug}/)**`
        + ` — ${c.videos.length} vidéo${c.videos.length > 1 ? 's' : ''}`)
      .join('\n');
    // {{video:IDENTIFIANT}} — la vignette de l'emission, dans la page du sujet.
    //
    // Michael, 28 aout 2026 : « pourquoi ne pas mettre le lien vers la video
    // dans les sujets (avec la vignette) pour illustrer ». Une page de sujet
    // sans image, c'est exactement le defaut qu'on venait de reparer sur les
    // anciennes adresses : Google n'a rien a montrer, et le lecteur non plus.
    //
    // On reutilise la vignette du site (videoCard), pas une image ecrite a la
    // main : titre, duree, date et rubrique restent justes tout seuls.
    //
    // Le remplacement se fait APRES la conversion Markdown. Injecter du HTML
    // avant, c'est laisser le convertisseur l'emballer dans un paragraphe.
    const cartes = [];
    const poserVignette = (h) => h.replace(
      /<p>\s*\{\{video:([A-Za-z0-9_-]{4,24})\}\}\s*<\/p>|\{\{video:([A-Za-z0-9_-]{4,24})\}\}/g,
      (_, a, b) => {
        const id = a || b;
        const video = byId.get(id);
        if (!video) {
          warn(`content/${pg.slug}.md appelle la video ${id}, absente du catalogue : `
            + 'la vignette est retiree.');
          return '';
        }
        cartes.push(video);
        return `<div class="grid">${R.videoCard(video, { accroche: true })}</div>`;
      },
    );
    const html = poserVignette(markdownToHtml(md
      .replace(/\{\{rendezvous\}\}/g, rendezVous)
      .replace(/\{\{email\}\}/g, config.contactEmail)
      .replace(/\{\{analytics\}\}/g, analyticsNote)
      .replace(/\{\{push\}\}/g, pushNote)
      .replace(/\{\{newsletter\}\}/g, newsletterNote)));
    await writePage(`/${pg.slug}/`, R.contentPage({
      ...ctx,
      title: pg.title,
      libelle: pg.menuTitle || pg.title,
      description: pg.description || `${pg.title} — ${config.siteName}.`,
      canonical: `/${pg.slug}/`,
      html,
      // L'image de partage de la page est celle de sa premiere emission. Rien a
      // declarer dans site.config.json : la page qui montre une video la porte
      // aussi dans Google et sur les reseaux.
      image: cartes[0]?.thumbnail || (cartes[0] ? `https://i.ytimg.com/vi/${cartes[0].id}/maxresdefault.jpg` : undefined),
    }));
    urls.push({ loc: `/${pg.slug}/`, freq: 'monthly', priority: '0.5' });
    if (pg.slug.startsWith('sujets/')) sujetsEcrits.push(pg);
  }

  // Sommaire des pages de sujet.
  //
  // La liste ne s'ecrit nulle part a la main : elle est faite des pages
  // REELLEMENT produites juste au-dessus. Une page declaree dont le fichier
  // Markdown manque est ignoree par la boucle -- elle ne doit donc pas non plus
  // figurer ici, sinon le sommaire promet une page qui renvoie une erreur.
  if (sujetsEcrits.length) {
    const md = ['# Sujets',
      '',
      'Des réponses construites à partir de ce qui a été dit à l\'antenne de '
      + `${config.siteName}, avec les émissions d'où elles viennent.`,
      '',
      ...sujetsEcrits.map((pg) => `- [${pg.menuTitle || pg.title}](/${pg.slug}/)`
        + (pg.description ? ` — ${pg.description}` : '')),
    ].join('\n');
    await writePage('/sujets/', R.contentPage({
      ...ctx,
      title: 'Sujets',
      description: `Les sujets traités à l'antenne de ${config.siteName}, expliqués et sourcés.`,
      canonical: '/sujets/',
      html: markdownToHtml(md),
    }));
    urls.push({ loc: '/sujets/', freq: 'weekly', priority: '0.6' });
  }

  // Sponsoring : chiffres de la chaîne, relevés à chaque synchronisation
  await writePage('/sponsoring/', R.sponsoringPage({
    ...ctx, videoCount: allVideos.length, showCount: nav.shows.length,
  }));
  urls.push({ loc: '/sponsoring/', freq: 'monthly', priority: '0.5' });

  // Page d'arrivée après inscription à la lettre (Kit y renvoie l'abonné)
  if (config.newsletter?.formId) {
    await writePage('/merci/', R.thanksPage({ ...ctx, latest: allVideos.slice(0, 4) }));
  }

  // Page « Installer » : le site est déjà une application, encore faut-il le dire
  await writePage('/installer/', R.installPage(ctx));
  urls.push({ loc: '/installer/', freq: 'monthly', priority: '0.5' });

  // Page « Suivre » : tous les canaux d'abonnement au même endroit
  await writePage('/suivre/', R.followPage(ctx));
  urls.push({ loc: '/suivre/', freq: 'monthly', priority: '0.6' });

  // Recherche (index JSON + page cliente)
  await writePage('/recherche/', R.searchPage(ctx));
  await writeFile('search.json', JSON.stringify(allVideos.map((v) => ({
    i: v.id,
    t: v.title,
    d: excerpt(v.description, 220),
    p: v.publishedAt,
    c: v.playlists?.[0]?.title || '',
    s: v.playlists?.[0]?.slug || '',
    u: v.duration,
    n: v.thumbnail,
    v: v.views || 0,
    f: v.vuLe || v.publishedAt || null,
  }))));
  urls.push({ loc: '/recherche/', freq: 'monthly', priority: '0.3' });

  // 404, flux, sitemap, robots, assets
  await writePage('/404.html', R.notFoundPage(ctx));
  await writeFile('rss.xml', rssFeed(config, allVideos));
  await writeFile('sitemap.xml', sitemap(config, urls));
  await writeFile('sitemap-video.xml', videoSitemap(config, allVideos));
  await writeFile('sitemap-news.xml', newsSitemap(config, allVideos));
  await writeFile('sitemap-index.xml', sitemapIndex(config, ['sitemap.xml', 'sitemap-video.xml', 'sitemap-news.xml']));
  await writeFile('robots.txt',
    `User-agent: *\nAllow: /\n\n`
    + `Sitemap: ${config.siteUrl}/sitemap-index.xml\n`
    + `Sitemap: ${config.siteUrl}/sitemap.xml\n`
    + `Sitemap: ${config.siteUrl}/sitemap-video.xml\n`
    + `Sitemap: ${config.siteUrl}/sitemap-news.xml\n`);
  await writeFile('.nojekyll', '');

  // Manifeste : permet l'ajout à l'écran d'accueil (et les notifications sur iOS).
  await writeFile('manifest.webmanifest', JSON.stringify({
    name: config.siteName,
    short_name: config.siteName,
    description: config.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#180058',
    lang: config.lang,
    shortcuts: [
      { name: 'Dernières vidéos', url: '/' },
      { name: 'Toutes les émissions', url: '/emissions/' },
      { name: 'Rechercher', url: '/recherche/' },
    ],
    icons: [
      { src: '/favicon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/favicon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2));

  // Agent de service : doit être servi à la racine du domaine.
  //
  // Un seul agent peut contrôler la racine d'un site. Celui de OneSignal occupe
  // déjà la place, on lui ajoute donc ici le gestionnaire « fetch » que Chrome
  // exige pour considérer le site comme installable — et qui sert au passage à
  // afficher un message correct en cas de coupure réseau. Rien n'est mis en
  // cache : le site reste toujours à jour.
  const swBody = `${config.push?.oneSignalAppId
    ? 'importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");\n\n'
    : ''}self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(function () {
    return new Response(
      '<!doctype html><html lang="fr"><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>Hors connexion — ${escapeHtml(config.siteName)}</title>'
      + '<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:20vh auto;padding:0 1.5rem;text-align:center;color:#180058">'
      + '<h1>Pas de connexion</h1>'
      + '<p>Impossible de joindre ${escapeHtml(config.siteName)} pour le moment. '
      + 'Vérifiez votre connexion, puis réessayez.</p>'
      + '<p><button onclick="location.reload()" style="padding:.7rem 1.4rem;border:0;border-radius:6px;background:#180058;color:#fff;font-size:1rem;cursor:pointer">Réessayer</button></p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
    );
  }));
});
`;
  await writeFile(config.push?.oneSignalAppId ? 'OneSignalSDKWorker.js' : 'sw.js', swBody);

  // Anciennes adresses Wix : elles reçoivent encore l'essentiel du trafic Google
  await transfererAnciennesAdresses(config, categories, allVideos);

  const domain = config.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (domain && !domain.includes('github.io')) await writeFile('CNAME', `${domain}\n`);

  await copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  // favicon.ico : aucune page du site ne le demande -- chaque page declare
  // <link rel="icon" href="/favicon.png">, et les navigateurs recents s'y
  // tiennent. Mais les robots et lecteurs de flux qui ignorent la balise vont
  // chercher /favicon.ico a la racine, et recevaient un 404 (verifie le
  // 29 aout 2026). Trois kilo-octets pour ne plus repondre « absent » a une
  // question qu'on nous pose quand meme.
  for (const f of ['favicon.png', 'favicon.ico']) {
    try {
      await fs.copyFile(path.join(ROOT, 'assets', f), path.join(DIST, f));
    } catch { /* facultatif */ }
  }

  if (TRANSFERTS_SANS_CIBLE.length) {
    warn(`${TRANSFERTS_SANS_CIBLE.length} ancienne(s) adresse(s) sans destination — `
      + 'aucun transfert écrit, le visiteur recevra le 404 du site :');
    TRANSFERTS_SANS_CIBLE.forEach((c) => warn(`   ${c}`));
    warn('   Corrigez la destination dans data/anciennes-adresses.json, ou créez la page.');
  }

  log(`✅ ${urls.length} pages générées dans dist/ en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await ecrireManifesteInsta(config, allVideos, await presentateursParRubrique(categories), personnesParVideo);

  // Page de coulisses : les stories 9:16 a publier a la main. Volontairement
  // hors menus, hors plan du site et non indexable — c'est un outil de travail,
  // pas une page pour le public.
  {
    const manif = await readJson(path.join(DIST, 'insta', 'manifest.json'), []);
    if (Array.isArray(manif) && manif.length) {
      await writePage('/story/', R.storiesPage({ ...ctx, stories: manif }));
      log(`Stories : ${manif.length} image(s) 9:16 proposée(s) sur /story/.`);
    }
  }
  await ecrireFicheDuSoir(config, grilleBrute, externes);
  await annonceNouveautes(config, allVideos, personnesParVideo);
}

// --- Détection des nouveautés ------------------------------------------------

/**
 * Remplit un modèle de texte : {emission}, {titre}, {site}.
 */
function fillTemplate(tpl, video, config) {
  return String(tpl || '')
    .replace(/\{emission\}/g, video.playlists?.[0]?.title || config.siteName)
    .replace(/\{titre\}/g, video.title)
    .replace(/\{site\}/g, config.siteName);
}

/**
 * Identifiants des vidéos déjà en ligne, lus dans le search.json publié.
 * Aucun état n'est stocké dans le dépôt : la version en ligne fait foi.
 * Renvoie null si la liste est illisible ou vide — dans ce cas on n'envoie
 * rien du tout : une annonce manquée vaut mieux qu'un envoi en double à
 * toute l'audience.
 */
async function fetchPublishedIds(config) {
  try {
    const res = await fetch(`${config.siteUrl}/search.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const published = await res.json();
    if (!Array.isArray(published) || published.length === 0) {
      warn('Nouveautés : liste publiée vide ou inattendue. Aucun envoi par sécurité.');
      return null;
    }
    return new Set(published.map((v) => v.i));
  } catch (err) {
    warn(`Nouveautés : liste publiée illisible (${err.message}). Aucun envoi.`);
    return null;
  }
}

/** Vidéos absentes de la version en ligne et publiées depuis moins de N heures. */
function freshVideos(allVideos, known, maxAgeHours) {
  const maxAgeMs = maxAgeHours * 3600 * 1000;
  return allVideos
    .filter((v) => !known.has(v.id))
    .filter((v) => v.publishedAt && (buildMs - Date.parse(v.publishedAt)) < maxAgeMs)
    .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
}

/**
 * Chef d'orchestre des annonces : la liste publiée n'est lue qu'une fois,
 * puis servie aux deux canaux (notifications navigateur, lettre d'information).
 */
async function annonceNouveautes(config, allVideos, personnesParVideo = new Map()) {
  if (DEMO) return;

  const push = Boolean(config.push?.oneSignalAppId) && config.push?.notifyOnNewVideos !== false;
  const lettre = Boolean(config.newsletter?.formId) && config.newsletter?.sendOnNewVideos !== false;
  const gram = Boolean(config.instagram?.enabled) && config.instagram?.publishOnNewVideos !== false;
  if (!push && !lettre && !gram) return;

  const known = await fetchPublishedIds(config);
  if (!known) return;

  if (push) await notifyNewVideos(config, allVideos, known);
  if (lettre) await sendNewsletter(config, allVideos, known);
  if (gram) await publierInstagram(config, allVideos, known, personnesParVideo);
}

// --- Instagram ---------------------------------------------------------------

/**
 * Publie les nouvelles vidéos sur Instagram, en invitant les comptes concernés
 * à collaborer.
 *
 * Publier est irréversible : on ne se contente pas de vérifier la clé, on
 * refuse de démarrer si un seul des garde-fous manque. Un compte Instagram
 * inondé de mille publications ne se rattrape pas.
 */
/** Une adresse répond-elle ? Sert à savoir si une vignette est déjà en ligne. */
async function enLigne(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Liste des vignettes 4:5 à fabriquer, déposée dans dist/insta/manifest.json.
 *
 * C'est `tools/vignette-insta.py` qui les dessine, juste après cette
 * construction : Node sait assembler un site, pas composer une image, et
 * ajouter une dépendance de traitement d'image au projet pour cela seul
 * serait payer cher un besoin marginal.
 */
/**
 * Nom du chroniqueur, par rubrique du site.
 *
 * Deux sources, la seconde l'emportant : le champ `presentateur` des
 * programmes de la grille (relié à une rubrique par son champ `site`), et la
 * table `presentateurs` de personnes.json, qui permet de nommer une rubrique
 * qui ne passe pas à l'antenne.
 *
 * On ecarte le nom quand il figure deja dans le titre de la rubrique :
 * « L'édito de Rony Hayot » suivi de « Rony Hayot » se lirait comme un
 * begaiement — arbitrage de Michael, 8 aout 2026.
 */
async function presentateursParRubrique(categories) {
  const emissions = await readJson(path.join(ROOT, 'data', 'grille-emissions.json'), {});
  const personnes = await readJson(path.join(ROOT, 'data', 'personnes.json'), {});
  const parSlug = new Map();
  for (const e of Object.values(emissions)) {
    if (e && typeof e === 'object' && e.site && e.presentateur) parSlug.set(e.site, e.presentateur);
  }
  for (const [titre, nom] of Object.entries(personnes.presentateurs || {})) {
    const c = categories.find((x) => normKey(x.title) === normKey(titre));
    if (c && nom) parSlug.set(c.slug, nom);
  }
  for (const c of categories) {
    const nom = parSlug.get(c.slug);
    if (nom && normKey(c.title).includes(normKey(nom))) parSlug.delete(c.slug);
  }
  return parSlug;
}

async function ecrireManifesteInsta(config, allVideos, presentateurs = new Map(), personnesParVideo = new Map()) {
  // Volontairement independant de `instagram.enabled` : les vignettes sont de
  // simples images sur le site, sans effet de bord. Les fabriquer avant
  // d'activer la publication permet de les regarder en vrai — et de corriger
  // la maquette — sans rien publier.
  // Volontairement genereux : les huit dernieres videos publiques, sans
  // condition d'age. Une vignette est une simple image sur le site — la
  // fabriquer pour rien ne coute rien, tandis qu'une vignette manquante fait
  // reporter la publication d'un tour. La severite est du cote de la
  // publication, pas de l'illustration.
  const recentes = allVideos
    .filter((v) => v.privacy === 'public')
    .sort((a, b) => Date.parse(b.vuLe || b.publishedAt || 0) - Date.parse(a.vuLe || a.publishedAt || 0))
    .slice(0, 8);
  if (!recentes.length) { log('Instagram : aucune vidéo publique, aucune vignette à fabriquer.'); return; }

  const tv = config.tv || {};
  const pied = `À revoir sur ${String(config.siteUrl || '').replace(/^https?:\/\/(www\.)?/, '')}`
    + `  ·  canal ${tv.channelNumber || '14'} du bouquet Annatel TV`;

  // La legende et les collaborations sont calculees ICI, et deposees dans le
  // manifeste. Raison : la publication ne peut pas avoir lieu pendant cette
  // construction — la vignette n'est en ligne qu'apres le deploiement. Un
  // workflow separe, declenche des que le deploiement reussit, reprend ce
  // manifeste et publie. Sans ces deux champs il lui faudrait refaire tout le
  // travail du site (rubriques, invites, carnet) pour reconstituer une phrase.
  const carnet = await readJson(path.join(ROOT, 'data', 'instagram-collaborateurs.json'), {});

  const dossier = path.join(DIST, 'insta');
  await fs.mkdir(dossier, { recursive: true });
  await fs.writeFile(path.join(dossier, 'manifest.json'), JSON.stringify(
    recentes.map((v) => {
      const cat = v.playlists?.[0];
      const invites = (personnesParVideo.get(v.id) || []).map((p) => p.nom);
      return {
        id: v.id,
        titre: v.title,
        rubrique: cat?.title || '',
        presentateur: presentateurs.get(cat?.slug) || '',
        pied,
        image: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`,
        vuLe: v.vuLe || v.publishedAt || '',
        youtube: `https://www.youtube.com/watch?v=${v.id}`,
        legende: insta.legende(v, { config, emission: cat?.title || '', invites }),
        collaborateurs: insta.collaborateursDe(v, {
          emissionSlug: cat?.slug || '', invites, carnet,
        }),
      };
    }), null, 2), 'utf8');
  log(`Instagram : ${recentes.length} vignette(s) 4:5 à fabriquer.`);
}


/**
 * Fiche « ce soir sur le canal 14 », deposee dans dist/insta/.
 *
 * Ecrite a chaque construction : la grille peut changer jusqu'a son
 * verrouillage, et la fiche doit toujours refleter la derniere version en
 * ligne. C'est le workflow du soir qui decide quand publier — ici on ne fait
 * que preparer.
 */
async function ecrireFicheDuSoir(config, grilleBrute, externes = new Map()) {
  if (!grilleBrute) return;
  const jour = jourIsrael(new Date(buildTime));
  // Logo de chaque programme extérieur : l'image saisie à la main si elle
  // existe, sinon l'avatar de la chaîne YouTube relevé à la synchronisation.
  const avatars = {};
  for (const [id, e] of externes) if (e?.avatar) avatars[id] = e.avatar;
  const fiche = ficheDuSoir({
    grilleBrute,
    jour,
    emissions: await readJson(path.join(ROOT, 'data', 'grille-emissions.json'), {}),
    partenaires: await readJson(path.join(ROOT, 'data', 'partenaires.json'), {}),
    carnet: await readJson(path.join(ROOT, 'data', 'instagram-collaborateurs.json'), {}),
    personnes: await readJson(path.join(ROOT, 'data', 'personnes.json'), {}),
    avatars,
    config,
  });
  if (!fiche) { log('Ce soir : aucun programme à heure fixe ce soir, pas de fiche.'); return; }

  const dossier = path.join(DIST, 'insta');
  await fs.mkdir(dossier, { recursive: true });
  await fs.writeFile(path.join(dossier, 'ce-soir.json'),
    JSON.stringify(fiche, null, 2), 'utf8');
  log(`Ce soir : ${fiche.lignes.length} programme(s) — `
    + `${fiche.lignes.map((l) => `${l.heure} ${l.rubrique}`).join(' · ')}`
    + (fiche.collaborateurs.length ? ` — collaborations : @${fiche.collaborateurs.join(', @')}` : ''));
}

async function publierInstagram(config, allVideos, known, personnesParVideo = new Map()) {
  const token = process.env.INSTAGRAM_TOKEN;
  const userId = config.instagram?.userId;
  if (!token) { warn('Instagram : secret INSTAGRAM_TOKEN absent, aucune publication.'); return; }
  if (!userId) { warn('Instagram : « userId » absent de site.config.json, aucune publication.'); return; }

  // Mémoire : ce qu'Instagram a réellement publié, et non ce que nous croyons
  // avoir publié. En cas d'échec de lecture, on s'abstient — republier une
  // vidéo devant toute l'audience coûte plus cher que sauter un tour.
  const recentes = await insta.legendesRecentes({ token, userId });
  if (recentes === null) {
    warn('Instagram : impossible de relire les publications récentes. Aucune publication ce tour-ci.');
    return;
  }
  const dejaPublie = (titre) => {
    const t = String(titre || '').trim();
    return t.length > 8 && recentes.some((m) => m.texte.includes(t));
  };

  // Espacement minimal entre deux publications. Le site se reconstruit toutes
  // les quinze minutes : sans ce frein, l'activation initiale déverserait
  // quarante-huit heures de vidéos en une matinée. Un fil qui se remplit d'un
  // coup fait fuir, et fait chuter la moyenne de vues par publication.
  const espacement = (config.instagram?.minMinutesBetween ?? 180) * 60000;
  const derniere = Math.max(0, ...recentes.map((m) => m.date || 0));
  if (derniere && buildMs - derniere < espacement) {
    const reste = Math.ceil((espacement - (buildMs - derniere)) / 60000);
    log(`Instagram : publication précédente trop récente, prochaine dans ~${reste} min.`);
    return;
  }

  // Candidates : les vidéos parues récemment, qu'elles soient déjà en ligne
  // sur le site ou non — car leur vignette 4:5 n'est mise en ligne qu'à la
  // construction suivante (voir plus bas).
  const heures = config.instagram?.maxAgeHours ?? 48;
  const candidates = allVideos
    // Seules les vidéos réellement publiques. Michael téléverse en privé puis
    // publie quand il le décide : annoncer plus tôt enverrait les curieux vers
    // une vidéo qui n'existe pas encore pour eux.
    .filter((v) => v.privacy === 'public')
    .filter((v) => v.vuLe && (buildMs - Date.parse(v.vuLe)) < heures * 3600 * 1000)
    .sort((a, b) => new Date(a.vuLe) - new Date(b.vuLe))
    .filter((v) => !dejaPublie(v.title));

  if (!candidates.length) { log('Instagram : aucune nouvelle vidéo à publier.'); return; }

  const max = config.instagram?.maxPerRun ?? 1;
  const carnet = await readJson(path.join(ROOT, 'data', 'instagram-collaborateurs.json'), {});
  let publiees = 0;

  for (const video of candidates) {
    if (publiees >= max) {
      log(`Instagram : ${candidates.length - publiees} vidéo(s) en attente, publiées aux prochains tours.`);
      break;
    }

    // La vignette 4:5 est fabriquée pendant CETTE construction, mais elle ne
    // sera en ligne qu'après le déploiement. Instagram, lui, va chercher
    // l'image à son adresse publique : on ne publie donc que si elle y est
    // déjà. Une vidéo trop fraîche attend simplement le tour suivant.
    const imageUrl = `${config.siteUrl}/insta/${video.id}.jpg`;
    if (!(await enLigne(imageUrl))) {
      log(`Instagram : vignette pas encore en ligne pour « ${truncate(video.title, 50)} », publication reportée.`);
      continue;
    }

    const cat = video.playlists?.[0];
    const invites = (personnesParVideo.get(video.id) || []).map((p) => p.nom);
    const collaborateurs = insta.collaborateursDe(video, {
      emissionSlug: cat?.slug || '', invites, carnet,
    });

    publiees += 1;
    const resultat = await insta.publier({
      token,
      userId,
      imageUrl,
      caption: insta.legende(video, { config, emission: cat?.title || '', invites }),
      collaborateurs,
    });

    if (resultat.ok) {
      log(`Instagram : « ${truncate(video.title, 60)} » publiée${collaborateurs.length ? ` — collaboration proposée à ${collaborateurs.map((c) => `@${c}`).join(', ')}` : ''}.`);
    } else {
      warn(`Instagram : publication refusée pour « ${truncate(video.title, 60)} » — ${resultat.erreur}`);
    }
  }
}


// --- Transfert des anciennes adresses Wix ------------------------------------

const MOTS_VIDES = new Set(('le la les un une des du de d l au aux et ou en dans sur pour par avec sans '
  + 'post posts blog article articles page video videos emission emissions les fr en index html php '
  + 'ce ces cet cette qui que quoi son sa ses nos vos leur est sont ont ils elles nous vous mais donc '
  + 'car ne pas plus tout tous').split(' '));

function motsUtiles(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ')
    .filter((w) => w.length > 2 && !MOTS_VIDES.has(w));
}

/** Score de recouvrement entre les mots demandés et ceux d'un titre. */
function recouvrement(demandes, disponibles) {
  let hits = 0;
  for (const w of demandes) {
    for (const h of disponibles) {
      if (h === w || (w.length >= 4 && h.startsWith(w)) || (h.length >= 4 && w.startsWith(h))) { hits++; break; }
    }
  }
  return { hits, score: demandes.length ? hits / demandes.length : 0 };
}

/**
 * Page de transfert vers une adresse du nouveau site.
 *
 * GitHub Pages ne sait pas produire de redirection 301. On écrit donc une page
 * qui porte une adresse canonique (c'est elle que Google suit pour transmettre
 * l'ancienneté), un rafraîchissement immédiat, et un lien visible pour le cas
 * où le navigateur n'exécute rien. Surtout pas de `noindex` : il empêcherait
 * justement la consolidation qu'on recherche.
 */
// Une ancienne adresse ne redirige plus : elle PORTE le contenu.
//
// Constate le 28 aout 2026 dans l'export Search Console de six mois. Sur les
// 81 303 impressions du site, 73 672 -- 90 % -- tombent sur les anciennes
// adresses Wix. /post/interview-de-samuel-madar... en fait 5 633 a elle
// seule, en position 6,9. Ce sont ELLES que Google classe, et non les pages
// vers lesquelles elles renvoient : /invites/myriam-shermer/ fait 1
// impression la ou /post/myriam-shermer-... en fait 450.
//
// Or la page de transfert ne pesait que 400 octets : un titre, un lien, une
// redirection. Aucune image, aucune fiche VideoObject. Google ne pouvait donc
// afficher aucune vignette -- c'est Michael qui l'a vu le premier sur sa
// capture du 28 aout : « dommage qu'il n'y ait pas de photo ou de video
// affichee ». La page /video/... correspondante, elle, est complete :
// og:image, twitter:card, VideoObject. Elle n'est simplement jamais montree.
// Le rapport « Apparence dans les resultats » le confirme : 266 impressions
// en Videos sur six mois, position 66.
//
// Six mois sans que Google bascule sur les nouvelles adresses, parce que
// GitHub Pages ne sait pas repondre une redirection HTTP 301 : la redirection
// est ecrite en JavaScript, un signal faible que Google met tres longtemps a
// suivre. On cesse donc d'attendre la bascule.
//
// L'ancienne adresse sert desormais une COPIE de sa page de destination, avec
// l'adresse canonique de celle-ci. Google garde le classement qu'il a deja,
// sur une page qui peut enfin porter une vignette et un resultat video ; le
// visiteur arrive sur du contenu reel au lieu d'un eclair de redirection ; et
// le canonique continue de transmettre l'anciennete vers la nouvelle adresse.
//
// Si la destination est illisible, on retombe sur l'ancienne coquille de
// redirection : degrade, mais jamais casse.

/**
 * Le HTML de la page de destination, tel qu'il vient d'etre ecrit dans dist/.
 * Les transferts sont produits APRES les pages (voir PAGES_ECRITES), donc le
 * fichier est la. Renvoie null si on ne peut pas le lire.
 */
async function contenuDeLaDestination(cible) {
  const rel = cible.replace(/^\//, '').replace(/\/$/, '');
  const candidats = rel.endsWith('.html')
    ? [rel]
    : [path.join(rel, 'index.html'), `${rel}.html`];
  for (const candidat of candidats) {
    try {
      return await fs.readFile(path.join(DIST, candidat), 'utf8');
    } catch { /* on essaie la forme suivante */ }
  }
  return null;
}

/**
 * La copie, avec une seule chose imposee : l'adresse canonique.
 *
 * Le canonique de la copie DOIT designer la destination, jamais l'ancienne
 * adresse -- sinon les deux pages se disputent le meme contenu et Google n'en
 * consolide aucune. La page copiee porte deja le bon canonique puisqu'elle
 * pointe sur elle-meme ; on le reecrit quand meme, pour que la regle vive ici
 * et ne depende pas de ce qu'une autre fonction aura pense a faire.
 *
 * On retire aussi toute redirection automatique heritee : une page qui porte
 * le contenu ne doit surtout pas fuir avant d'etre lue.
 */
function pageMiroir(html, abs) {
  let out = html.replace(/<meta\s+http-equiv=["']refresh["'][^>]*>/gi, '');
  const lien = `<link rel="canonical" href="${escapeHtml(abs)}">`;
  out = /<link\s+rel=["']canonical["'][^>]*>/i.test(out)
    ? out.replace(/<link\s+rel=["']canonical["'][^>]*>/i, lien)
    : out.replace(/<\/head>/i, `${lien}\n</head>`);
  const og = `<meta property="og:url" content="${escapeHtml(abs)}">`;
  if (/<meta\s+property=["']og:url["'][^>]*>/i.test(out)) {
    out = out.replace(/<meta\s+property=["']og:url["'][^>]*>/i, og);
  }
  return out;
}

function pageDeRedirection(config, abs, libelle) {
  return `<!doctype html>
<html lang="${config.lang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(libelle)} — ${escapeHtml(config.siteName)}</title>
<link rel="canonical" href="${escapeHtml(abs)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(abs)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:20vh auto;padding:0 1.5rem;text-align:center;color:#180058">
<p>Cette page a déménagé.</p>
<p><a href="${escapeHtml(abs)}" style="color:#180058;font-weight:600">${escapeHtml(libelle)}</a></p>
<script>location.replace(${JSON.stringify(abs)});</script>
</body>
</html>`;
}

async function pageDeTransfert(config, cible, libelle) {
  const abs = `${config.siteUrl.replace(/\/$/, '')}${cible}`;
  const copie = await contenuDeLaDestination(cible);
  return copie ? pageMiroir(copie, abs) : pageDeRedirection(config, abs, libelle);
}

async function transfererAnciennesAdresses(config, categories, allVideos) {
  const carte = await readJson(path.join(ROOT, 'data', 'anciennes-adresses.json'));
  if (!carte) return [];

  const ecrire = async (ancien, cible, libelle) => {
    const rel = ancien.replace(/^\//, '').replace(/\/$/, '');
    // Jamais par-dessus une vraie page. Une ancienne adresse qui porte
    // aujourd'hui le nom d'une page du site n'est plus une ancienne adresse :
    // c'est une collision, et la page vivante l'emporte toujours.
    if (PAGES_ECRITES.has(`/${rel}`)) {
      warn(`L'ancienne adresse /${rel}/ porte le nom d'une page existante du site : `
        + 'le transfert est ignoré, la page est conservée. Retirez cette entrée de '
        + 'data/anciennes-adresses.json.');
      return false;
    }

    // Et surtout : ne JAMAIS transférer vers une page qui n'existe pas.
    //
    // Constaté en ligne le 18 août 2026 sur
    // /post/frères-musulmans-…-florence-bergeaud-blackler : la redirection
    // partait correctement vers /invites/florence-bergeaud-blackler/ — qui
    // n'existe pas. Le visiteur atterrissait sur la page d'erreur nue de
    // GitHub (« Unicorn! »), sans logo, sans menu, sans la moindre issue.
    //
    // Un garde-fou existait, mais il se contentait d'un avertissement dans le
    // journal de construction, que personne ne lit. Un contrôle qui n'empêche
    // rien ne protège de rien : il est désormais bloquant. Sans transfert, le
    // visiteur reçoit le 404 du site — celui qui porte le menu et propose la
    // vidéo la plus proche. Une page d'erreur utile vaut mieux qu'une
    // redirection vers le vide.
    const dest = `/${cible.replace(/^\//, '').replace(/\/$/, '')}`;
    if (!PAGES_ECRITES.has(dest)) {
      TRANSFERTS_SANS_CIBLE.push(`${ancien} → ${cible}`);
      return false;
    }
    const page = await pageDeTransfert(config, cible, libelle);
    await writeFile(path.join(rel, 'index.html'), page);

    // ET le meme contenu en FICHIER, a cote du dossier. Ce doublon repare la
    // plus grosse fuite de trafic du site, decouverte dans Search Console le
    // 18 aout 2026 : six des dix pages les plus visitees renvoyaient une
    // erreur 404, soit plus d'un tiers des clics de trois mois.
    //
    // Le defaut ne touchait QUE les adresses accentuees. Demandee sans barre
    // finale -- la forme exacte que Google a indexee --, une adresse qui
    // designe un DOSSIER fait repondre a GitHub Pages une redirection vers la
    // meme adresse suivie d'une barre. Et dans cette redirection, il
    // ré-encode : « é » (%C3%A9) devient « Ã© » (%C3%83%C2%A9). L'adresse
    // obtenue ne correspond plus a rien, et c'est un 404.
    //
    // Verifie en vrai, les trois cas :
    //   /post/…-lucas-moulard            (sans accent) -> fonctionne
    //   /post/le-7-octobre-vécu-…        (accent)      -> 404
    //   /post/le-7-octobre-vécu-…/index.html           -> fonctionne
    // Le fichier de transfert etait donc bien en ligne ; seule la resolution
    // du dossier le rendait inatteignable.
    //
    // Un FICHIER, lui, se sert directement : pas de barre a ajouter, donc pas
    // de redirection, donc rien a ré-encoder. Le dossier reste ecrit pour la
    // forme avec barre finale, qui marche deja et que des liens exterieurs
    // peuvent porter.
    if (!rel.endsWith('.html')) await writeFile(`${rel}.html`, page);
    return true;
  };

  const urls = [];
  for (const [ancien, cible] of Object.entries(carte.manuel || {})) {
    if (await ecrire(ancien, cible, 'Continuer sur Tandem TV')) urls.push(ancien);
  }

  // Rubriques renommées sur YouTube.
  //
  // L'adresse d'une rubrique dérive du titre de sa playlist : la renommer
  // déplace la page, et tout ce que Google savait d'elle tombe dans le vide.
  // On garde donc un pont depuis l'ancienne adresse. La cible est désignée par
  // le NOUVEAU TITRE, pas par la nouvelle adresse — un accent ou une majuscule
  // qui diffère de ce qu'on avait prévu ne casse alors rien.
  const cleNom = (x) => String(x || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const parNomRubrique = new Map(categories.map((c) => [cleNom(c.title), c]));
  let renommees = 0;
  for (const [ancienSlug, nouveauTitre] of Object.entries(carte.renommees || {})) {
    const c = parNomRubrique.get(cleNom(nouveauTitre));
    if (!c) {
      warn(`Rubrique renommée introuvable : « ${nouveauTitre} ». L'ancienne adresse /emissions/${ancienSlug}/ reste orpheline — vérifiez l'orthographe exacte du titre de la playlist sur YouTube.`);
      continue;
    }
    if (c.slug === ancienSlug) continue;      // renommage pas encore visible côté YouTube
    if (!await ecrire(`/emissions/${ancienSlug}/`, `/emissions/${c.slug}/`, c.title)) continue;
    urls.push(`/emissions/${ancienSlug}/`);
    renommees++;
  }
  if (renommees) log(`${renommees} rubrique(s) renommée(s) : ancienne adresse redirigée.`);

  const rubriques = categories.map((c) => ({ c, mots: motsUtiles(c.title) }));
  const videos = allVideos.map((v) => ({ v, mots: motsUtiles(`${v.title} ${v.playlists?.[0]?.title || ''}`) }));

  let versVideo = 0; let versRubrique = 0; const sansSuite = [];

  for (const ancien of carte.auto || []) {
    const demandes = motsUtiles(decodeURIComponent(ancien).replace(/^\/post\//, ''));
    if (demandes.length < 2) { sansSuite.push(ancien); continue; }

    // Une ancienne adresse de rubrique doit conduire à la rubrique.
    let meilleureRubrique = null;
    for (const r of rubriques) {
      const { hits, score } = recouvrement(demandes, r.mots);
      if (!meilleureRubrique || score > meilleureRubrique.score) meilleureRubrique = { r, score, hits };
    }
    if (meilleureRubrique && meilleureRubrique.score >= 0.8 && meilleureRubrique.hits >= 2) {
      if (await ecrire(ancien, `/emissions/${meilleureRubrique.r.c.slug}/`, meilleureRubrique.r.c.title)) {
        urls.push(ancien); versRubrique++;
      }
      continue;
    }

    let best = null; let second = 0;
    for (const item of videos) {
      const { hits, score } = recouvrement(demandes, item.mots);
      if (!best || score > best.score) { second = best ? best.score : 0; best = { item, score, hits }; }
      else if (score > second) second = score;
    }

    // Trois conditions cumulées, comme pour le rattrapage côté navigateur :
    // mieux vaut laisser une erreur 404 qu'envoyer Google sur la mauvaise page.
    if (best && best.score >= 0.8 && best.hits >= 3 && best.score - second >= 0.2) {
      if (await ecrire(ancien, `/video/${best.item.v.id}/`, best.item.v.title)) {
        urls.push(ancien); versVideo++;
      }
    } else {
      sansSuite.push(ancien);
    }
  }

  log(`Anciennes adresses : ${urls.length} transfert(s) écrit(s) — ${Object.keys(carte.manuel || {}).length} imposé(s), ${versRubrique} vers une rubrique, ${versVideo} vers une vidéo.`);

  // Rapport publié : il permet de contrôler l'état des transferts depuis
  // l'extérieur, sans avoir à ouvrir le journal des Actions GitHub. Ce n'est
  // pas une page : rien n'y renvoie, et le fichier n'apparaît pas au sitemap.
  await writeFile('rapport-transferts.json', JSON.stringify({
    genere: buildTime,
    transferts: urls.length,
    imposes: Object.keys(carte.manuel || {}).length,
    versRubrique,
    versVideo,
    sansCorrespondance: sansSuite,
  }, null, 1));

  if (sansSuite.length) {
    warn(`Anciennes adresses : ${sansSuite.length} sans correspondance certaine, laissées en 404 (le rattrapage du navigateur prend le relais) :`);
    sansSuite.forEach((u) => warn(`   ${u}`));
  }
  return urls;
}

// --- Notifications navigateur ------------------------------------------------

async function notifyNewVideos(config, allVideos, known) {
  const appId = config.push.oneSignalAppId;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!apiKey) {
    warn('Notifications : secret ONESIGNAL_API_KEY absent, aucun envoi.');
    return;
  }

  const fresh = freshVideos(allVideos, known, config.push?.maxAgeHours ?? 72);

  if (fresh.length === 0) {
    log('Notifications : aucune nouvelle vidéo à annoncer.');
    return;
  }

  const max = config.push?.maxPerRun ?? 3;
  if (fresh.length > max) {
    warn(`Notifications : ${fresh.length} nouveautés détectées, seules les ${max} plus récentes seront annoncées.`);
  }
  const toSend = fresh.slice(-max);

  const fill = (tpl, video) => fillTemplate(tpl, video, config);

  for (const video of toSend) {
    const payload = {
      app_id: appId,
      target_channel: 'push',
      included_segments: ['Subscribed Users'],
      headings: { en: fill(config.push?.titleTemplate || 'Nouvelle vidéo · {emission}', video) },
      contents: { en: fill(config.push?.bodyTemplate || '{titre}', video) },
      url: `${config.siteUrl}/video/${video.id}/`,
      chrome_web_image: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
    };

    try {
      const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.text();
      if (res.ok && !/\"errors\"/.test(body)) {
        log(`Notification envoyée : ${video.title}`);
      } else {
        warn(`Notification refusée pour « ${video.title} » — HTTP ${res.status} ${body.slice(0, 300)}`);
      }
    } catch (err) {
      warn(`Notification impossible pour « ${video.title} » : ${err.message}`);
    }
  }
}

// --- Lettre d'information (Kit) ----------------------------------------------

/**
 * Crée chez Kit une diffusion par nouvelle vidéo et la programme deux minutes
 * plus tard. On programme au lieu d'envoyer sur-le-champ parce que l'API ne
 * propose pas d'envoi immédiat : sans `send_at`, la diffusion resterait un
 * brouillon dans le tableau de bord.
 *
 * Mêmes garde-fous que les notifications : rien n'est envoyé si la liste
 * publiée est illisible, si la vidéo est trop ancienne, ou au-delà de
 * `maxPerRun` envois par synchronisation.
 */
async function sendNewsletter(config, allVideos, known) {
  const apiKey = process.env.KIT_API_KEY;
  const n = config.newsletter;

  if (!apiKey) {
    warn("Lettre d'information : secret KIT_API_KEY absent, aucun envoi.");
    return;
  }

  const fresh = freshVideos(allVideos, known, n.maxAgeHours ?? 72);
  if (fresh.length === 0) {
    log("Lettre d'information : aucune nouvelle vidéo à annoncer.");
    return;
  }

  const max = n.maxPerRun ?? 2;
  if (fresh.length > max) {
    warn(`Lettre d'information : ${fresh.length} nouveautés détectées, seules les ${max} plus récentes seront envoyées.`);
  }
  const toSend = fresh.slice(-max);

  // Deux minutes de battement : le temps que la page de la vidéo soit en ligne
  // sur GitHub Pages avant que le premier abonné ne clique.
  const sendAt = new Date(buildMs + 2 * 60 * 1000).toISOString();

  for (const video of toSend) {
    const subject = fillTemplate(n.subjectTemplate || '{emission} — {titre}', video, config);
    const intro = fillTemplate(n.introTemplate || '', video, config);
    const payload = {
      subject,
      preview_text: intro || video.title,
      description: `Envoi automatique — ${video.title}`,
      content: R.newsletterEmail(config, video, { intro }),
      public: false,
      published_at: null,
      send_at: sendAt,
      subscriber_filter: null,
    };

    try {
      const res = await fetch('https://api.kit.com/v4/broadcasts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Kit-Api-Key': apiKey,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.text();
      if (res.ok) {
        log(`Lettre d'information programmée : ${video.title}`);
      } else {
        warn(`Lettre d'information refusée pour « ${video.title} » — HTTP ${res.status} ${body.slice(0, 300)}`);
      }
    } catch (err) {
      warn(`Lettre d'information impossible pour « ${video.title} » : ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Build échoué :', err.message);
  process.exit(1);
});
