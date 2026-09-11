// -----------------------------------------------------------------------------
// Couche d'accès à l'API YouTube Data v3.
// Tout ce qui touche au réseau est ici. Le reste du build ne manipule que des
// objets simples ({ videos, playlists, channel }).
// -----------------------------------------------------------------------------

const API = 'https://www.googleapis.com/youtube/v3';

let apiKey = null;
let quotaUsed = 0;
const quotaParEndpoint = new Map();

export function setApiKey(key) {
  apiKey = key;
}

export function getQuotaUsed() {
  return quotaUsed;
}

/** Où est parti le quota, endpoint par endpoint. « playlistItems 42, videos 21 ». */
export function detailQuota() {
  return [...quotaParEndpoint.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([e, n]) => `${e} ${n}`)
    .join(', ') || 'aucun appel';
}

// Plafond de consommation pour UNE construction.
//
// Le 11 septembre 2026 : le site n'avait plus lu YouTube depuis trois jours.
// La console Google donnait le chiffre sans appel — 9 985 unités sur 10 000
// consommées dans la journée, sur un projet flambant neuf où une seule
// construction avait tourné. Or une synchronisation complète en coûte environ
// cent cinquante : channels, une soixantaine de playlists, leurs pages, le
// détail des vidéos par lots de cinquante. Il manquait donc un zéro et demi,
// et le seul endroit du code capable de faire dix mille appels sans que
// personne s'en aperçoive était la boucle de pagination ci-dessous, qui
// tournait tant que YouTube renvoyait un jeton de page suivante — sans
// plafond, sans mémoire des jetons déjà vus, sans rien.
//
// D'où ce budget. Il ne corrige pas la boucle (elle est corrigée plus bas) :
// il garantit qu'aucune erreur future, connue ou pas, ne puisse consommer la
// journée entière. Dépasser 1 500 unités n'arrive dans aucun fonctionnement
// normal ; c'est dix fois le coût réel, et il reste alors 85 % du quota du
// jour pour publier le correctif. La construction s'arrête et DIT où est
// parti le quota — un garde-fou muet ne protège personne.
const BUDGET_PAR_CONSTRUCTION = 1500;

async function api(endpoint, params, { cost = 1 } = {}) {
  if (!apiKey) throw new Error('YOUTUBE_API_KEY manquante.');
  if (quotaUsed + cost > BUDGET_PAR_CONSTRUCTION) {
    throw new Error(
      `Budget de quota dépassé : ${quotaUsed} unités consommées par cette seule construction `
      + `(plafond ${BUDGET_PAR_CONSTRUCTION}, une synchronisation normale en coûte ~150). `
      + `Répartition : ${detailQuota()}. Arrêt avant d'épuiser le quota de la journée.`,
    );
  }
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  url.searchParams.set('key', apiKey);

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { referer: 'https://www.tandemtv.net' } });
      quotaUsed += cost;
      quotaParEndpoint.set(endpoint, (quotaParEndpoint.get(endpoint) || 0) + cost);
      if (res.ok) return await res.json();

      const body = await res.text();
      // 403 = quota dépassé ou clé invalide : inutile de réessayer.
      if (res.status === 403 || res.status === 400) {
        throw new Error(`YouTube API ${res.status} sur ${endpoint} : ${body.slice(0, 400)}`);
      }
      lastError = new Error(`YouTube API ${res.status} sur ${endpoint} : ${body.slice(0, 200)}`);
    } catch (err) {
      if (String(err.message).includes('403') || String(err.message).includes('400')) throw err;
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw lastError;
}

/**
 * Parcourt toutes les pages d'un endpoint paginé.
 *
 * « Toutes les pages » était pris au pied de la lettre : on redemandait tant
 * que YouTube renvoyait un jeton de page suivante. C'est exactement ce que
 * demande la documentation, et c'est ce qui a coûté dix mille unités de quota
 * en treize minutes le 11 septembre 2026, puis trois jours de site figé.
 *
 * Une boucle qui s'arrête sur une condition dictée par le serveur d'en face
 * n'est pas une boucle bornée. Il suffit que ce serveur renvoie indéfiniment
 * un jeton — cas connu sur les playlists contenant des vidéos supprimées ou
 * privées, où une page peut être vide tout en annonçant une suite — pour que
 * le programme tourne jusqu'à ce qu'on lui coupe les vivres.
 *
 * Trois arrêts s'ajoutent donc à celui de YouTube, chacun pour un scénario
 * distinct, et chacun dit ce qu'il a vu :
 *   - le même jeton revient : YouTube tourne en rond ;
 *   - trois pages vides d'affilée alors qu'une suite est annoncée : plus rien
 *     à lire ;
 *   - plus de 'maxPages' pages : quelque chose d'imprévu. La chaîne compte
 *     ~1 100 vidéos, soit 22 pages de 50 ; 60 laisse la place de tripler sans
 *     rien changer, et arrête net à trois fois le budget prévu.
 *
 * Aucun de ces arrêts ne fait échouer la construction : on rend ce qu'on a lu
 * et on le signale. Mieux vaut un catalogue incomplet et un avertissement
 * qu'un site figé — c'est la leçon de septembre.
 */
async function apiAll(endpoint, params, { cost = 1, max = Infinity, maxPages = 60, quoi = '' } = {}) {
  const items = [];
  const jetonsVus = new Set();
  const ou = quoi ? `${endpoint} (${quoi})` : endpoint;
  let pageToken;
  let pages = 0;
  let videsDaffilee = 0;

  do {
    const data = await api(endpoint, { ...params, pageToken, maxResults: 50 }, { cost });
    const lot = data.items || [];
    items.push(...lot);
    pages += 1;

    const suivant = data.nextPageToken;
    if (!suivant) break;

    if (jetonsVus.has(suivant)) {
      console.warn(`⚠ ${ou} : YouTube renvoie un jeton de page déjà vu après ${pages} page(s) `
        + `et ${items.length} élément(s). Pagination interrompue.`);
      break;
    }
    jetonsVus.add(suivant);

    videsDaffilee = lot.length === 0 ? videsDaffilee + 1 : 0;
    if (videsDaffilee >= 3) {
      console.warn(`⚠ ${ou} : trois pages vides d'affilée alors qu'une suite est annoncée, `
        + `après ${items.length} élément(s). Pagination interrompue.`);
      break;
    }

    if (pages >= maxPages) {
      console.warn(`⚠ ${ou} : ${maxPages} pages lues (${items.length} éléments) sans que YouTube `
        + `annonce la fin. Pagination interrompue pour ne pas consommer le quota de la journée.`);
      break;
    }

    pageToken = suivant;
  } while (items.length < max);

  return items;
}

// --- Normalisation -----------------------------------------------------------

const PRIVATE_TITLES = new Set(['Private video', 'Deleted video', 'Vidéo privée', 'Vidéo supprimée']);

function bestThumb(thumbnails = {}) {
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null
  );
}

/** Convertit une durée ISO 8601 (PT1H2M3S) en secondes. */
export function parseDuration(iso) {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

function normalizeVideo(v) {
  const sn = v.snippet || {};
  const duration = parseDuration(v.contentDetails?.duration);
  return {
    id: v.id,
    title: sn.title || '',
    description: sn.description || '',
    publishedAt: sn.publishedAt || v.contentDetails?.videoPublishedAt || null,
    // « public », « unlisted » ou « private ». Michael televerse ses videos en
    // prive et les publie quand il le decide : annoncer sur Instagram une
    // video que personne ne peut encore voir enverrait les curieux vers une
    // page vide. Cette valeur est le seul garde-fou fiable.
    privacy: v.status?.privacyStatus || '',
    thumbnail: bestThumb(sn.thumbnails),
    tags: sn.tags || [],
    duration,
    isShort: duration > 0 && duration <= 60,
    // Une reprise de Reel, montée par nous en Short YouTube.
    //
    // La règle « isShort » s'arrête à 60 secondes ; nos Reels durent 60 à 90.
    // Sans ce second marqueur, ils entraient dans le site comme des vidéos
    // ordinaires, et le plus récent serait devenu « la dernière vidéo » sur la
    // page d'accueil — un extrait de 80 secondes à la place de l'émission.
    //
    // On ne peut pas s'en remettre à la durée : « La Turquie d'Erdogan
    // remplace-t-elle l'Iran ? » dure 2 min 38 et c'est un vrai édito. Le seul
    // signal sûr est celui que NOUS écrivons dans le titre au moment de
    // téléverser — voir scripts/short_youtube.py sur le Mac.
    estRepriseCourte: /#shorts\b/i.test(sn.title || ''),
    // Video verticale : hauteur superieure a largeur dans le lecteur que
    // YouTube decrit. Une chaine de television produit du 16/9 ; ce qui arrive
    // en portrait est une reprise pour les reseaux.
    //
    // Le champ reste vide aujourd'hui : les dimensions ne sont renvoyees que
    // si l'on demande « part=player », et cet appel-la met douze minutes (voir
    // fetchVideos). La regle ci-dessous est donc en sommeil, prete a servir le
    // jour ou l'information arrivera autrement -- par exemple ecrite par notre
    // propre script de publication au moment du televersement, ce qui ne coute
    // rien du tout.
    //
    // Deux precautions y sont deja posees : on n'en conclut rien si les deux
    // dimensions manquent -- ne pas savoir n'est pas une raison de retirer une
    // video -- et l'on borne a cinq minutes, au-dela desquelles une video
    // verticale n'est plus un Short.
    estVertical: Number(v.player?.embedHeight) > Number(v.player?.embedWidth)
      && Number(v.player?.embedWidth) > 0
      && duration > 0 && duration <= 300,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    playlists: [],
  };
}

// Une video entre-t-elle dans le site ?
//
// Michael, 29 aout 2026 : « les videos de 90 sec ne sont pas sensees etre sur
// le site ». C'etait deja l'intention, mais la regle etait ecrite en deux
// morceaux, a deux endroits, et les deux ne disaient pas la meme chose :
//
//   build.mjs        .filter((v) => !v.estRepriseCourte)
//                    .filter((v) => !v.isShort || v.playlists.length)
//   personnes.mjs    aucune regle -- les videos venaient de cat.videos
//
// Consequence mesuree le 29 aout sur le site en ligne : « Israel : ou sont les
// hommes d'Etat ? #Shorts » etait absent de search.json, absent du catalogue,
// et pourtant affiche deux fois sur la fiche de Rony Akrich. Une video exclue
// du site rentrait par la porte des fiches d'invites, parce que cette porte-la
// ne connaissait pas la regle.
//
// La regle vit donc ici, une seule fois, et tout ce qui construit le site
// l'appelle. Le seuil est celui que Michael a fixe : 90 secondes.
//
// Une duree inconnue (0) ne fait pas sortir la video. Ne pas savoir combien de
// temps dure une video n'est pas une raison de la retirer -- c'est une raison
// de ne rien conclure.
export const DUREE_MINIMALE_SITE = 90;

// Videos tenues hors du site a la main, par leur identifiant YouTube.
//
// Michael, 8 septembre 2026 : « tu as publie un short (le short du JT du
// 7 septembre), on ne publie pas les shorts sur le site ca fait doublon ».
//
// Ce Short-la est passe entre les mailles : il dure 2 min 08, donc au-dessus
// du seuil de 90 secondes, et son titre ne porte pas « #Shorts » parce qu'il
// n'a pas ete publie par notre script de Shorts. Les deux regles automatiques
// etaient aveugles, chacune pour une bonne raison.
//
// D'ou cette liste : le dernier mot, ecrit a la main, qui n'attend aucune
// heuristique. Une regle automatique finira toujours par manquer un cas ; il
// faut alors pouvoir corriger en une ligne, sans toucher au code.
let EXCLUES = new Map();
export function declarerVideosExclues(fiches) {
  EXCLUES = new Map(Object.entries(fiches || {}));
}
export function raisonExclusion(id) { return EXCLUES.get(id) || null; }

export function entreDansLeSite(v) {
  if (!v) return false;
  if (EXCLUES.has(v.id)) return false;
  if (v.estRepriseCourte) return false;
  if (v.estVertical) return false;
  if ((v.duration || 0) > 0 && v.duration <= DUREE_MINIMALE_SITE) return false;
  return true;
}

// --- API publique du module --------------------------------------------------

export async function fetchChannel(channelId, handle) {
  // On tente d'abord l'ID ; si aucun ID n'est fourni (ou s'il est invalide),
  // on retrouve la chaîne via son identifiant @handle.
  let data = null;
  if (channelId) {
    data = await api('channels', {
      part: 'snippet,contentDetails,statistics,brandingSettings',
      id: channelId,
    });
  }
  if (!data?.items?.length && handle) {
    data = await api('channels', {
      part: 'snippet,contentDetails,statistics,brandingSettings',
      forHandle: String(handle).replace(/^@/, ''),
    });
  }
  const c = data?.items?.[0];
  if (!c) throw new Error(`Chaîne introuvable (id: ${channelId || '—'}, handle: ${handle || '—'})`);
  return {
    id: c.id,
    title: c.snippet.title,
    description: c.snippet.description,
    customUrl: c.snippet.customUrl,
    avatar: bestThumb(c.snippet.thumbnails),
    banner: c.brandingSettings?.image?.bannerExternalUrl || null,
    uploadsPlaylistId: c.contentDetails.relatedPlaylists.uploads,
    subscribers: Number(c.statistics?.subscriberCount || 0),
    videoCount: Number(c.statistics?.videoCount || 0),
    totalViews: Number(c.statistics?.viewCount || 0),
  };
}

/**
 * Fiche publique d'une chaîne tierce, à partir de son identifiant @handle.
 *
 * Sert aux programmes que Tandem TV diffuse sans les produire : plutôt que de
 * faire recopier à la main un nom, un texte et une vignette pour chacun, on les
 * lit à la source. Le partenaire change son avatar, le site suit.
 *
 * Une unité de quota par chaîne, une fois toutes les 100 minutes grâce au cache.
 * Une chaîne introuvable ne fait pas échouer la construction : elle rend null,
 * et la page se contente de ce qui a été saisi à la main.
 */
export async function fetchChaineTierce(handle) {
  const h = String(handle || '').replace(/^@/, '');
  if (!h) return null;
  try {
    const data = await api('channels', { part: 'snippet,statistics', forHandle: h });
    const c = data?.items?.[0];
    if (!c) return null;
    return {
      id: c.id,
      title: c.snippet.title,
      description: c.snippet.description || '',
      customUrl: c.snippet.customUrl || `@${h}`,
      avatar: bestThumb(c.snippet.thumbnails),
      subscribers: Number(c.statistics?.subscriberCount || 0),
      videoCount: Number(c.statistics?.videoCount || 0),
    };
  } catch {
    return null;
  }
}

export async function fetchPlaylists(channelId) {
  const items = await apiAll('playlists', { part: 'snippet,contentDetails', channelId }, { quoi: channelId, maxPages: 20 });
  return items.map((p) => ({
    id: p.id,
    title: p.snippet.title,
    description: p.snippet.description || '',
    thumbnail: bestThumb(p.snippet.thumbnails),
    itemCount: p.contentDetails?.itemCount || 0,
    publishedAt: p.snippet.publishedAt,
    videoIds: [],
  }));
}

/** Renvoie les IDs de vidéos d'une playlist, dans l'ordre de la playlist. */
export async function fetchPlaylistVideoIds(playlistId) {
  const items = await apiAll(
    'playlistItems',
    { part: 'snippet,contentDetails', playlistId },
    { quoi: playlistId, maxPages: 60 },
  );
  return items
    .filter((it) => !PRIVATE_TITLES.has(it.snippet?.title))
    .filter((it) => it.snippet?.resourceId?.kind === 'youtube#video')
    .map((it) => it.contentDetails?.videoId || it.snippet.resourceId.videoId)
    .filter(Boolean);
}

/** Détail complet des vidéos, par lots de 50 (1 unité de quota par lot). */
export async function fetchVideos(ids) {
  const unique = [...new Set(ids)];
  const out = [];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    // ESSAI ABANDONNE, 8 septembre 2026 — a ne pas refaire tel quel.
    //
    // L'API ne dit nulle part « ceci est un Short ». Le seul signal connu est
    // la FORME de la video : en demandant « part=player » avec un « maxWidth »,
    // YouTube renvoie les dimensions du lecteur, et une video verticale y
    // porte une hauteur superieure a sa largeur.
    //
    // Techniquement juste, pratiquement inutilisable ici : la construction du
    // site est passee de 90 secondes a plus de 12 minutes. YouTube fabrique le
    // code d'integration de chaque video, cinquante par appel, vingt et un
    // appels. Or le site se publie toutes les dix minutes et le depot
    // n'autorise qu'une construction a la fois : deux passages se seraient
    // mis en file l'un derriere l'autre, et la publication se serait arretee.
    //
    // Un controle qui empeche de publier ne protege plus rien. Les Shorts sont
    // donc ecartes par les trois regles qui ne coutent rien -- duree, marqueur
    // « #Shorts » dans le titre, et la liste data/videos-exclues.json.
    const data = await api('videos', {
      part: 'snippet,contentDetails,statistics,status',
      id: batch.join(','),
    });
    for (const v of data.items || []) {
      if (v.status && v.status.privacyStatus === 'private') continue;
      out.push(normalizeVideo(v));
    }
  }
  return out;
}
