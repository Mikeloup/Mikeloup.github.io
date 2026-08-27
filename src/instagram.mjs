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

  // `media_type` sépare structurellement un Reel (VIDEO) d'une image (IMAGE).
  // On le demande, mais JAMAIS au prix du reste : si Meta refusait ce champ,
  // la requête entière échouerait et plus rien ne serait publié — ni plaquette,
  // ni Reel, puisque estDejaEnLigne() s'abstient quand il ne sait pas. On
  // réessaie donc sans le champ, et on rend `type: null` — « je ne sais pas »,
  // que l'appelant doit traiter comme tel.
  const lire = async (champs) => {
    const url = new URL(`${API}/${userId}/media`);
    url.searchParams.set('fields', champs);
    url.searchParams.set('limit', String(limite));
    url.searchParams.set('access_token', token);
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    return res.ok ? (data?.data || []) : null;
  };

  try {
    let avecType = true;
    let medias = await lire('caption,timestamp,media_type');
    if (medias === null) {
      avecType = false;
      medias = await lire('caption,timestamp');
    }
    if (medias === null) return null;
    return medias.map((m) => ({
      texte: String(m.caption || ''),
      date: m.timestamp ? Date.parse(m.timestamp) : 0,
      type: avecType ? String(m.media_type || '') : null,
    }));
  } catch {
    return null;
  }
}

// Modèle de légende par défaut. Défini ICI, à l'endroit où la légende est
// fabriquée, parce que deux fichiers s'en servent : celui qui écrit la légende
// et celui qui reconnaît nos propres plaquettes dans le fil. Écrit deux fois,
// il aurait divergé — c'est exactement ce qui a coûté un Reel le 11 août et un
// autre le 15.
export const MODELE_LEGENDE_DEFAUT =
  '{titre}\n\n{emission} — à revoir sur {site}, et à l\'antenne sur le canal {canal}.';

/**
 * Ce média est-il une PLAQUETTE que nous avons publiée ?
 *
 * Rend true, false, ou null (impossible de trancher).
 *
 * POURQUOI CETTE FONCTION EXISTE
 * ------------------------------
 * Le 19 août 2026, la plaquette de « Deux communautés, un même rejet ? » n'est
 * jamais partie. Journal de la publication : « Publication précédente trop
 * récente : prochaine possible dans ~120 min. » L'espacement de trois heures
 * était calculé sur TOUTES les publications du compte — la carte « CE SOIR »
 * quotidienne et chaque Reel compris. La plaquette n'avait donc quasiment
 * jamais sa fenêtre, et au bout de 48 h elle cessait d'être candidate. Un frein
 * destiné à éviter huit publications d'affilée empêchait en fait la seule
 * publication qu'il devait espacer.
 *
 * Reconnaître nos plaquettes demande DEUX critères, et pas un :
 *
 *   - le type : un Reel est un VIDEO, une plaquette une IMAGE ;
 *   - la fin de la légende : la carte CE SOIR est aussi une IMAGE, mais elle
 *     se termine par « Toute la grille sur … », jamais par la fin de notre
 *     modèle de légende.
 *
 * Le texte seul ne suffirait pas : la légende des Reels, fabriquée par le
 * pipeline du Mac, se termine par les mêmes mots (« … du bouquet Annatel TV.
 * \n\nLien dans la bio ↑ »). Vérifié dans scripts/reels_pipeline.py, ligne 531,
 * avant d'écrire cette fonction.
 */
export function estUnePlaquette(media, config = {}) {
  if (!media) return null;

  const modele = config.instagram?.captionTemplate || MODELE_LEGENDE_DEFAUT;
  // La partie invariable du modèle : tout ce qui suit le dernier champ à
  // remplacer. Se déduit du modèle, donc suit ses modifications.
  const fin = modele.slice(modele.lastIndexOf('}') + 1).trim();
  if (fin.length < 12) return null; // trop court pour identifier quoi que ce soit

  if (media.type === null || media.type === undefined) return null; // type inconnu
  if (media.type !== 'IMAGE') return false;                          // Reel, carrousel…
  return String(media.texte || '').includes(fin);
}

/**
 * Cette légende est-elle DÉJÀ en ligne sur le compte ?
 *
 * Rend true (déjà publiée), false (absente), ou null (impossible de savoir).
 * Les trois réponses sont distinctes et l'appelant doit traiter null comme un
 * refus de publier : ne pas savoir n'est pas la même chose que savoir que non.
 *
 * POURQUOI CETTE FONCTION EXISTE
 * ------------------------------
 * Le 17 août 2026, Michael constate « beaucoup de Reels postés en double ».
 * Trois chemins menaient au doublon, et ils ont tous la même racine : on
 * décidait de republier sur la foi de la RÉPONSE de Meta, alors que la seule
 * chose qui compte est ce qui se trouve RÉELLEMENT sur le compte.
 *
 *   - Meta répond « An unexpected error has occurred » à un media_publish qui
 *     a pourtant publié. Le repli sans collaboration republiait par-dessus.
 *   - Le Mac cesse d'attendre le verdict de GitHub au bout de dix minutes et
 *     remet la vidéo dans la file, pendant que GitHub, lui, va au bout.
 *   - Un fichier d'historique perdu ou réécrit fait oublier une publication.
 *
 * Un fichier d'état ne peut pas couvrir les trois : il décrit ce que nous
 * croyons avoir fait. Instagram, lui, décrit ce qui est. On lui demande.
 *
 * L'empreinte est la première ligne non vide de la légende — le titre. C'est
 * ce qu'il y a de plus stable : les hashtags et la mention du canal sont
 * identiques d'une publication à l'autre et ne distinguent rien. En dessous de
 * douze caractères on refuse de conclure : trop court pour identifier.
 */
export async function estDejaEnLigne({ token, userId, caption, limite = 25 } = {}) {
  const empreinte = String(caption || '')
    .split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  if (empreinte.length < 12) return null;
  const recentes = await legendesRecentes({ token, userId, limite });
  if (recentes === null) return null;
  return recentes.some((m) => m.texte.includes(empreinte));
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
  let modele = i.captionTemplate || MODELE_LEGENDE_DEFAUT;

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

  // Un compte que Meta a déjà refusé n'est plus jamais invité. Une invitation
  // exige un compte professionnel, public, actif depuis trente jours ; sinon
  // Meta ne l'ignore pas, il refuse la publication entière. Le 9 août 2026,
  // deux Reels ont été perdus ainsi.
  const refuses = new Set((carnet.refuses || [])
    .map((c) => String(c).replace(/^@/, '').toLowerCase()));

  return trouves
    .map((c) => String(c).replace(/^@/, ''))
    .filter((c) => !refuses.has(c.toLowerCase()))
    .slice(0, 3);
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
    // Même précaution que pour les Reels : l'erreur peut arriver APRÈS que la
    // publication a eu lieu. On regarde le compte avant de refaire le chemin.
    await new Promise((r) => setTimeout(r, 8000));
    const deja = await estDejaEnLigne({ token, userId, caption });
    if (deja === true) {
      return { ok: true, id, dejaEnLigne: true,
        avertissement: `Meta a renvoyé une erreur (${publication.erreur}) alors que `
          + "la publication avait eu lieu. Rien n'a été republié." };
    }
    if (deja === null) {
      return { ok: false, erreur: `${publication.erreur} — et impossible de vérifier `
        + "si la publication a malgré tout eu lieu : on s'abstient de réessayer." };
    }
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

  // Avant de solliciter Meta : ce Reel est-il déjà en ligne ? Le Mac peut
  // relancer la même vidéo (verdict de GitHub non obtenu, historique perdu) ;
  // c'est ici, au dernier mètre, qu'on l'arrête. On ne publie pas si l'on ne
  // sait pas : republier devant toute l'audience coûte plus cher qu'attendre.
  const avant = await estDejaEnLigne({ token, userId, caption });
  if (avant === true) {
    return { ok: true, id: null, dejaEnLigne: true,
      avertissement: 'ce Reel est déjà en ligne — rien n\'a été republié.' };
  }
  if (avant === null) {
    return { ok: false, erreur: 'impossible de relire les publications récentes '
      + '— on s\'abstient plutôt que de risquer un doublon.' };
  }

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
  //
  // MAIS : une erreur de Meta au dernier geste ne veut pas dire que rien n'a
  // été publié. Le 17 août 2026, c'est ce repli qui doublait les Reels — il
  // refaisait tout le chemin par-dessus une publication déjà en ligne. On
  // vérifie donc avant de repartir, après quelques secondes le temps que la
  // publication apparaisse dans le fil.
  await new Promise((r) => setTimeout(r, 8000));
  const apres = await estDejaEnLigne({ token, userId, caption });
  if (apres === true) {
    return { ok: true, id: null, dejaEnLigne: true,
      avertissement: `Meta a renvoyé une erreur (${premier.erreur}) alors que le `
        + "Reel était bien publié. Rien n'a été republié." };
  }
  if (apres === null) {
    return { ok: false, erreur: `${premier.erreur} — et impossible de vérifier si `
      + "la publication a malgré tout eu lieu : on s'abstient de réessayer." };
  }

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
