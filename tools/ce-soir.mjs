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
}) {
  const rows = soiree(grilleBrute, jour);
  if (!rows.length) return null;

  const sources = partenaires.sources || {};
  const parRubrique = carnet.rubriques || {};

  // channel_id -> { nom, url, compte }
  const tiers = {};
  for (const [slug, p] of Object.entries(sources)) {
    const url = p.url || '';
    const insta = url.match(/instagram\.com\/([^/?#]+)/);
    const compte = insta ? insta[1] : String(parRubrique[slug] || '').replace(/^@/, '');
    for (const id of (p.programmes || [])) {
      tiers[id] = { nom: p.nom || slug.replace(/-/g, ' '), url, compte };
    }
  }

  const lignes = rows.map((r) => {
    const t = tiers[r.channel_id];
    const emission = emissions[r.channel_id] || {};
    return {
      heure: heureLisible(r.heure_debut),
      rubrique: t?.nom || emission.nom || r.channel_id,
      titre: String(r.title || '').trim(),
      url: (t?.url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
      compte: t?.compte || '',
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
