// -----------------------------------------------------------------------------
// Publication automatique sur Instagram.
//
// Chaque nouvelle vidéo donne lieu à une publication : la miniature, une
// légende construite depuis le titre et l'émission, et — c'est là que se joue
// l'audience — une invitation à collaborer envoyée aux comptes concernés.
//
// Trois choses méritent d'être sues avant de lire le code :
//
//   1. Meta ne téléverse rien. On lui donne l'ADRESSE d'une image publique,
//      qu'il va chercher lui-même. D'où deux appels : créer un conteneur, puis
//      le publier.
//   2. Une collaboration se propose, elle ne s'impose pas. L'invitation part
//      automatiquement ; la publication n'apparaît chez le partenaire que s'il
//      l'accepte. L'API ne peut pas faire mieux, et c'est très bien ainsi.
//   3. Publier est irréversible. Les garde-fous (nombre par exécution, âge
//      maximal des vidéos) ne sont pas décoratifs : sans eux, une première
//      synchronisation publierait mille cent vidéos d'un coup.
// -----------------------------------------------------------------------------

// Voie « Instagram Login » : l'hôte est graph.instagram.com, et non
// graph.facebook.com qui sert la voie « Facebook Login » (celle qui exige une
// page Facebook). Se tromper d'hôte donne une erreur d'authentification
// incompréhensible : le jeton est valide, mais pas pour ce domaine.
const API = 'https://graph.instagram.com/v21.0';

/** Appel à l'API Meta. Rend { ok, data } plutôt que de lever : un échec de
 *  publication ne doit jamais faire échouer la construction du site. */
async function api(chemin, params, token) {
  const url = new URL(`${API}/${chemin}`);
  const corps = new URLSearchParams({ ...params, access_token: token });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: corps,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, erreur: data?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, erreur: err.message };
  }
}

/**
 * Légendes des dernières publications du compte.
 *
 * C'est notre mémoire, et elle a l'avantage d'être la seule qui ne puisse pas
 * mentir : plutôt que de tenir un fichier « déjà publié » qui dériverait du
 * réel, on demande à Instagram ce qu'il a réellement. Un fichier d'état perdu,
 * un site reconstruit de zéro, une exécution interrompue — rien de tout cela
 * ne peut provoquer un doublon.
 *
 * Rend un tableau de textes (vide en cas d'échec — l'appelant décidera alors
 * de s'abstenir plutôt que de risquer une republication).
 */
export async function legendesRecentes({ token, userId, limite = 25 } = {}) {
  if (!token || !userId) return null;
  const url = new URL(`${API}/${userId}/media`);
  url.searchParams.set('fields', 'caption,timestamp');
  url.searchParams.set('limit', String(limite));
  url.searchParams.set('access_token', token);
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return (data?.data || []).map((m) => ({
      texte: String(m.caption || ''),
      date: m.timestamp ? Date.parse(m.timestamp) : 0,
    }));
  } catch {
    return null;
  }
}

/**
 * Légende d'une publication.
 *
 * Instagram ne rend cliquable aucun lien dans une légende : inutile d'y coller
 * une adresse, elle resterait du texte mort. On renvoie donc vers le lien du
 * profil, qui lui est cliquable, et on garde la légende courte — les premières
 * lignes sont les seules lues avant le « plus ».
 */
export function legende(video, { config, emission = '', invites = [] } = {}) {
  const i = config.instagram || {};
  const tv = config.tv || {};
  let modele = i.captionTemplate
    || '{titre}\n\n{emission} — à revoir sur {site}, et à l\'antenne sur le canal {canal}.';

  // Une vidéo hors rubrique donnerait « Tandem TV — à revoir sur Tandem TV » :
  // le nom deux fois dans la même phrase, ce qui sonne faux. Sans rubrique, on
  // retire proprement la mention et le tiret qui la suit.
  const rubrique = emission && emission !== config.siteName ? emission : '';
  if (!rubrique) modele = modele.replace(/\{emission\}\s*[—–-]\s*/g, '');

  const texte = modele
    .replace(/\{titre\}/g, video.title || '')
    .replace(/\{emission\}/g, rubrique)
    .replace(/\{invites\}/g, invites.join(', '))
    .replace(/\{site\}/g, config.siteName)
    .replace(/\{canal\}/g, tv.channelNumber || '14');

  const mots = Array.isArray(i.hashtags) ? i.hashtags.filter(Boolean) : [];
  return mots.length ? `${texte}\n\n${mots.map((m) => (m.startsWith('#') ? m : `#${m}`)).join(' ')}` : texte;
}

/**
 * Comptes à inviter en collaboration pour une vidéo donnée.
 *
 * Deux sources : le nom des personnes citées dans la vidéo, et la rubrique
 * dont elle relève. Trois au maximum, c'est la limite de Meta — on privilégie
 * les personnes, dont l'audience est la plus proche du sujet.
 */
export function collaborateursDe(video, { emissionSlug = '', invites = [], carnet = {} } = {}) {
  const parNom = carnet.personnes || {};
  const parRubrique = carnet.rubriques || {};
  const clef = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const index = new Map(Object.entries(parNom).map(([k, v]) => [clef(k), v]));
  const trouves = [];
  for (const nom of invites) {
    const compte = index.get(clef(nom));
    if (compte && !trouves.includes(compte)) trouves.push(compte);
  }
  const rub = parRubrique[emissionSlug];
  if (rub && !trouves.includes(rub)) trouves.push(rub);

  return trouves.slice(0, 3).map((c) => String(c).replace(/^@/, ''));
}

/**
 * Publie une vidéo. Rend { ok, id } ou { ok: false, erreur }.
 *
 * L'image doit être un JPEG ou un PNG accessible publiquement, dans un rapport
 * compris entre 4:5 et 1,91:1. Une miniature YouTube (16:9, soit 1,78:1) entre
 * dans cette fourchette — c'est ce qui permet de démarrer sans fabriquer
 * d'images sur mesure.
 */
export async function publier({
  token, userId, imageUrl, caption, collaborateurs = [],
}) {
  if (!token || !userId) return { ok: false, erreur: 'jeton ou identifiant de compte manquant' };
  if (!imageUrl) return { ok: false, erreur: 'aucune image' };

  const params = { image_url: imageUrl, caption };
  if (collaborateurs.length) params.collaborators = JSON.stringify(collaborateurs);

  let conteneur = await api(`${userId}/media`, params, token);

  // Une invitation à collaborer est un bonus, jamais une condition. Si Meta la
  // refuse — compte inexistant, renommé, ou champ indisponible sur ce type de
  // jeton —, on republie sans elle plutôt que de perdre la publication.
  if (!conteneur.ok && collaborateurs.length) {
    const sansAmis = { image_url: imageUrl, caption };
    const secours = await api(`${userId}/media`, sansAmis, token);
    if (secours.ok) conteneur = secours;
  }
  if (!conteneur.ok) return { ok: false, erreur: `conteneur refusé : ${conteneur.erreur}` };

  const id = conteneur.data?.id;
  if (!id) return { ok: false, erreur: 'conteneur sans identifiant' };

  // Meta télécharge l'image de façon asynchrone : publier trop tôt échoue.
  await new Promise((r) => setTimeout(r, 4000));

  const publication = await api(`${userId}/media_publish`, { creation_id: id }, token);

  // Meta peut accepter le conteneur AVEC l'invitation, puis refuser la
  // publication a cause d'elle — sans jamais le dire. On refait alors le
  // chemin complet sans invitation plutot que de perdre la publication.
  if (!publication.ok && collaborateurs.length) {
    const nu = await api(`${userId}/media`, { image_url: imageUrl, caption }, token);
    const idNu = nu.ok ? nu.data?.id : null;
    if (idNu) {
      await new Promise((r) => setTimeout(r, 4000));
      const secours = await api(`${userId}/media_publish`, { creation_id: idNu }, token);
      if (secours.ok) {
        return {
          ok: true,
          id: secours.data?.id || idNu,
          avertissement: `collaboration refusée par Meta (@${collaborateurs.join(', @')}) — publié sans elle.`,
        };
      }
    }
  }
  if (!publication.ok) return { ok: false, erreur: `publication refusée : ${publication.erreur}` };

  return { ok: true, id: publication.data?.id || id };
}


/**
 * Publie un Reel. Rend { ok, id } ou { ok: false, erreur }.
 *
 * Trois differences avec une image, et chacune peut faire echouer la
 * publication si on l'ignore :
 *
 *   1. `media_type: 'REELS'` — sans quoi Meta refuse une video.
 *   2. Le traitement est ASYNCHRONE. Meta telecharge la video, la reencode,
 *      en extrait une couverture : cela prend de quelques secondes a
 *      plusieurs minutes selon le poids. Publier avant la fin echoue avec un
 *      message peu clair. On interroge donc l'etat du conteneur jusqu'a
 *      « FINISHED ».
 *   3. `share_to_feed` decide si le Reel apparait aussi dans la grille du
 *      profil. Sans lui, il n'existe que dans l'onglet Reels — et la grille
 *      est la premiere chose que voit un visiteur qui decouvre le compte.
 */
export async function publierReel({
  token, userId, videoUrl, caption, collaborateurs = [],
  attenteMax = 300, partagerAuFil = true,
}) {
  if (!token || !userId) return { ok: false, erreur: 'jeton ou identifiant de compte manquant' };
  if (!videoUrl) return { ok: false, erreur: 'aucune vidéo' };

  /** Un essai complet : conteneur, attente du traitement, publication. */
  const essai = async (amis) => {
    const params = {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: partagerAuFil ? 'true' : 'false',
    };
    if (amis.length) params.collaborators = JSON.stringify(amis);

    const conteneur = await api(`${userId}/media`, params, token);
    if (!conteneur.ok) return { ok: false, erreur: `conteneur refusé : ${conteneur.erreur}` };
    const id = conteneur.data?.id;
    if (!id) return { ok: false, erreur: 'conteneur sans identifiant' };

    // Attente du traitement. On interroge toutes les cinq secondes plutôt que
    // d'attendre une durée fixe : une vidéo de vingt mégaoctets peut être prête
    // en quinze secondes comme en trois minutes, selon la charge de Meta.
    const debut = Date.now();
    let etat = '';
    while ((Date.now() - debut) / 1000 < attenteMax) {
      await new Promise((r) => setTimeout(r, 5000));
      const url = new URL(`${API}/${id}`);
      url.searchParams.set('fields', 'status_code,status');
      url.searchParams.set('access_token', token);
      try {
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        etat = data?.status_code || '';
        if (etat === 'FINISHED') break;
        if (etat === 'ERROR') {
          return { ok: false, erreur: `Meta a rejeté la vidéo : ${data?.status || 'sans détail'}` };
        }
      } catch { /* réseau instable : on retente au tour suivant */ }
    }
    if (etat !== 'FINISHED') {
      return { ok: false, erreur: `traitement inachevé après ${attenteMax} s (état « ${etat || 'inconnu'} »)` };
    }

    const publication = await api(`${userId}/media_publish`, { creation_id: id }, token);
    if (!publication.ok) return { ok: false, erreur: `publication refusée : ${publication.erreur}` };
    return { ok: true, id: publication.data?.id || id, amis };
  };

  const premier = await essai(collaborateurs);
  if (premier.ok || !collaborateurs.length) return premier;

  // Une collaboration se propose, elle ne s'impose pas — et Meta ne le dit pas
  // proprement. Le 9 août 2026, un Reel invitant @williamzerbib a été refusé
  // deux fois de suite par « An unexpected error has occurred », au tout
  // dernier geste, alors que la vidéo était acceptée et encodée. Le seul Reel
  // publié jusque-là n'invitait personne. Meta traite l'invitation à part, et
  // la refuse sans jamais dire pourquoi : compte introuvable, renommé, privé,
  // ou n'acceptant pas d'être identifié.
  //
  // On republie donc sans elle. Perdre l'invitation coûte une audience ; perdre
  // la publication coûte le travail entier.
  const secours = await essai([]);
  if (secours.ok) {
    return {
      ...secours,
      erreur: null,
      avertissement: `collaboration refusée par Meta (@${collaborateurs.join(', @')}) — `
        + 'publié sans elle. Vérifiez que le compte existe, est public, et '
        + "autorise qu'on l'identifie.",
    };
  }
  return { ok: false, erreur: `${premier.erreur} (et sans collaboration : ${secours.erreur})` };
}
