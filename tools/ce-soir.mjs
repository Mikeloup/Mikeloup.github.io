// -----------------------------------------------------------------------------
// « Ce soir sur le canal 14 » : la fiche du soir, tirée de la grille.
//
// Pourquoi ce fichier existe : les Reels des partenaires sont exclus faute de
// droits sur leurs contenus. Mais ANNONCER qu'un programme passe à telle heure
// n'est pas une reprise de contenu — c'est un fait, et une promotion gratuite
// pour eux. Aucun accord n'est nécessaire, et cela donne à Instagram le rythme
// quotidien qu'il récompense.
//
// Ce module ne dessine rien et ne publie rien. Il prépare la matière :
// dist/insta/ce-soir.json, que l'outil d'image lit pour dessiner la fiche, et
// que le workflow du soir lit pour composer la légende.
// -----------------------------------------------------------------------------

/** « 20:01 » se lit « 20 h » : la régie travaille à la minute, l'affiche non.
 *  On arrondit au quart d'heure le plus proche, comme le fait la grille du
 *  site — annoncer 20 h 01 donnerait l'air de compter les secondes. */
function heureLisible(h) {
  const [hh, mm] = String(h).split(':').map(Number);
  const total = Math.round((hh * 60 + mm) / 15) * 15;
  const H = Math.floor((total % 1440) / 60);
  const M = total % 60;
  return M ? `${H} h ${String(M).padStart(2, '0')}` : `${H} h`;
}

/** Programmes à heure fixe de la soirée, dans l'ordre. */
export function soiree(grilleBrute, jour, { depuis = '19:00' } = {}) {
  const lignes = (grilleBrute?.rows || [])
    .filter((r) => r.date_diffusion === jour)
    .filter((r) => r.heure_fixe && r.heure_debut && r.heure_debut >= depuis)
    .sort((a, b) => String(a.heure_debut).localeCompare(String(b.heure_debut)));
  // Les doublons d'horaire arrivent quand la régie corrige un créneau sans
  // supprimer l'ancien : on garde le premier et on ignore les suivants.
  const vus = new Set();
  return lignes.filter((r) => !vus.has(r.heure_debut) && vus.add(r.heure_debut));
}

/** Sans accents ni ponctuation : « Jérôme Haas » et « JEROME HAAS » doivent se
 *  reconnaître. */
function clef(x) {
  return String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * L'illustration d'un programme.
 *
 * Trois sources, dans cet ordre — de la plus juste à la plus générale :
 *
 *   1. Un partenaire a son propre logo : l'image déposée dans partenaires.json,
 *      ou à défaut l'avatar de sa chaîne YouTube, relevé automatiquement.
 *   2. Un programme maison porte le nom de celui qui le tient : « L'édito de
 *      Rony Hayot » donne le portrait de Rony Hayot. Le rapprochement se fait
 *      sur le nom écrit dans grille-emissions.json, sans table supplémentaire à
 *      tenir à jour — ajouter une photo dans personnes.json suffit.
 *   3. Rien de tout cela : le logo de la chaîne. C'est vrai et c'est neutre.
 *
 * Rend une adresse (absolue pour YouTube, commençant par / pour le site) ou
 * une chaîne vide, que l'outil d'image remplace par le logo.
 */
function personneDe(nomEmission, personnes = {}, carnet = {}) {
  const nom = clef(nomEmission);
  if (!nom) return null;
  // Le nom le plus long d'abord : « Rony Akrich » avant « Rony », si un jour
  // les deux coexistent.
  const connus = new Set([
    ...Object.keys(personnes.fiches || {}),
    ...Object.keys(carnet.personnes || {}),
  ]);
  for (const personne of [...connus].sort((a, b) => b.length - a.length)) {
    if (nom.includes(clef(personne))) return personne;
  }
  return null;
}

/**
 * Fiche complète du soir : ce qui sera dessiné, et ce qui sera écrit.
 *
 * Les comptes Instagram connus deviennent des mentions cliquables et des
 * invitations en collaboration. Ceux qui manquent laissent place à l'adresse
 * de la chaîne, en clair. Rien ne bloque : chaque compte ajouté enrichit la
 * fiche du lendemain sans qu'on touche au code.
 */
export function ficheDuSoir({
  grilleBrute, jour, emissions = {}, partenaires = {}, carnet = {}, config = {},
  avatars = {}, personnes = {},
}) {
  const rows = soiree(grilleBrute, jour);
  if (!rows.length) return null;

  const sources = partenaires.sources || {};
  const parRubrique = carnet.rubriques || {};
  const parNom = carnet.personnes || {};
  const fiches = personnes.fiches || {};

  // channel_id -> { nom, url, compte, image }
  const tiers = {};
  for (const [slug, p] of Object.entries(sources)) {
    const url = p.url || '';
    const insta = url.match(/instagram\.com\/([^/?#]+)/);
    const compte = insta ? insta[1] : String(parRubrique[slug] || '').replace(/^@/, '');
    for (const id of (p.programmes || [])) {
      tiers[id] = { nom: p.nom || slug.replace(/-/g, ' '), url, compte, image: p.image || '' };
    }
  }

  const lignes = rows.map((r) => {
    const t = tiers[r.channel_id];
    const emission = emissions[r.channel_id] || {};
    const nom = t?.nom || emission.nom || r.channel_id;

    // Un programme maison porte le nom de celui qui le tient : « L'édito de
    // Rony Hayot » donne le portrait ET le compte de Rony Hayot. Aucune table
    // supplémentaire à tenir : renseigner personnes.json et le carnet suffit.
    const personne = t ? null : personneDe(nom, personnes, carnet);
    const compteMaison = personne && parNom[personne] ? String(parNom[personne]).replace(/^@/, '') : '';

    return {
      heure: heureLisible(r.heure_debut),
      rubrique: nom,
      titre: String(r.title || '').trim(),
      url: (t?.url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
      compte: t?.compte || compteMaison,
      // Production maison ou programme d'un tiers. L'affiche s'en sert pour
      // choisir quoi mettre a defaut de logo : le logo Tandem est exact pour
      // « Tour d'Israël », il serait mensonger pour « Mémoire et vigilance ».
      maison: !t,
      // Logo : l'avatar relevé chez YouTube, l'image saisie à la main, le
      // portrait du présentateur, ou rien — l'affiche mettra alors le logo de
      // la chaîne, ce qui est exact pour une production maison.
      image: avatars[r.channel_id] || t?.image
        || (personne && fiches[personne]?.photo) || '',
    };
  });

  const tv = config.tv || {};
  const canal = tv.channelNumber || '14';
  const texte = lignes.map((l) => {
    const qui = l.compte ? `@${l.compte}` : (l.url || '');
    const titre = l.titre ? ` · ${l.titre}` : '';
    return `${l.heure} — ${l.rubrique}${titre}${qui ? `\n${qui}` : ''}`;
  }).join('\n\n');

  // La date figure dans la legende : elle situe l'annonce, et elle sert de
  // signature — c'est elle qui permet de savoir, en relisant les publications
  // du compte, si la fiche du jour est deja partie.
  const enFrancais = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${jour}T12:00:00Z`));

  const legende = `Ce soir, ${enFrancais}, sur ${config.siteName || 'Tandem TV'}, `
    + `canal ${canal} du bouquet ${tv.operator || 'Annatel TV'} :\n\n${texte}\n\nToute la grille sur `
    + `${String(config.siteUrl || '').replace(/^https?:\/\/(www\.)?/, '')}\n\n`
    + '#TandemTV #Israel #CanalTV #MondeJuif';

  return {
    date: jour,
    date_lisible: enFrancais,
    lignes,
    legende,
    // Trois au maximum, c'est la limite de Meta. Les partenaires du soir
    // d'abord : ce sont eux que la fiche met en avant.
    collaborateurs: [...new Set(lignes.map((l) => l.compte).filter(Boolean))].slice(0, 3),
  };
}
