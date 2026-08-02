// -----------------------------------------------------------------------------
// Grille des programmes du canal 14.
//
// Les données viennent d'un export du planning de diffusion, déposé dans
// data/grille.json. Le site ne les invente pas et ne les complète pas : il les
// met en forme, les relie au catalogue quand un titre correspond à une vidéo
// publiée, et laisse le navigateur calculer ce qui passe à l'antenne.
//
// Toutes les heures sont des heures d'Israël. C'est le point le plus facile à
// oublier et le plus visible pour un spectateur en France, qui a une heure de
// décalage : la page le dit explicitement, et l'encart « en ce moment » calcule
// sur l'heure de Jérusalem, quel que soit le fuseau du visiteur.
// -----------------------------------------------------------------------------

const FUSEAU = 'Asia/Jerusalem';

const sansAccents = (x) => String(x || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Clé de rapprochement entre un titre de grille et un titre de vidéo. */
function clefTitre(t) {
  return sansAccents(t)
    .replace(/\|.*$/, '')            // « … | Stéphane Goldin »
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Le programme correspond-il à une vidéo publiée sur le site ? */
function trouverVideo(titre, index) {
  const c = clefTitre(titre);
  if (c.length < 12) return null;    // trop court pour être sûr
  if (index.has(c)) return index.get(c);
  for (const [cle, v] of index) {
    if (cle.startsWith(c) || c.startsWith(cle)) return v;
  }
  return null;
}

export function indexerVideos(allVideos) {
  const index = new Map();
  for (const v of allVideos) {
    const c = clefTitre(v.title);
    if (c.length >= 12 && !index.has(c)) index.set(c, v);
  }
  return index;
}

/**
 * Met la grille en forme : un tableau de journées, chacune contenant ses
 * programmes. Les blocs de clips consécutifs sont fondus en une seule ligne
 * discrète — dans l'export ils se répètent, et affichés tels quels ils
 * noieraient les vraies émissions.
 */
/**
 * Arrondit une heure au pas de temps demandé. Affichage uniquement : la grille
 * réelle lue par la régie n'est jamais modifiée.
 *
 * Deux sens, et le choix n'est pas cosmétique :
 *
 * - `bas` pour les horaires approximatifs. Un spectateur qui arrive à l'heure
 *   annoncée et attend deux minutes n'a rien perdu ; celui qui arrive après le
 *   début a manqué l'ouverture. On ne promet donc jamais plus tard que la
 *   diffusion réelle.
 * - `proche` pour les rendez-vous à heure fixe. Ceux-là visent une heure ronde
 *   et la manquent de peu dans l'export (13:59 pour 14:00, 12:01 pour 12:00) :
 *   les arrondir vers le bas afficherait 13:55, soit plus faux que la valeur
 *   d'origine. L'écart introduit reste inférieur à la moitié du pas.
 */
function arrondirHeure(heure, pas, sens = 'bas') {
  if (!pas || !heure) return heure;
  const [h, m] = heure.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return heure;
  const total = sens === 'proche'
    ? Math.round((h * 60 + m) / pas) * pas
    : Math.floor((h * 60 + m) / pas) * pas;
  const minuit = total % 1440;                    // 23:59 arrondi au plus proche → 00:00
  return `${String(Math.floor(minuit / 60)).padStart(2, '0')}:${String(minuit % 60).padStart(2, '0')}`;
}

export function prepareGrille(donnees, { emissions = {}, index = new Map(), aujourdhui, arrondi = 0 } = {}) {
  const lignes = Array.isArray(donnees?.rows) ? donnees.rows : [];
  if (!lignes.length) return null;

  const nomDe = (id) => emissions[id]?.nom || String(id || '').replace(/_/g, ' ');
  const rubriqueDe = (id) => emissions[id]?.site || '';

  const parJour = new Map();
  for (const l of lignes) {
    const jour = l.date_diffusion;
    if (!jour) continue;
    if (!parJour.has(jour)) parJour.set(jour, []);
    const liste = parJour.get(jour);

    if (l.type === 'CLIPS_CHAINE') {
      const dernier = liste[liste.length - 1];
      if (dernier?.type === 'clips') {
        if (!dernier.sources.includes(nomDe(l.channel_id))) dernier.sources.push(nomDe(l.channel_id));
      } else {
        liste.push({ type: 'clips', sources: [nomDe(l.channel_id)] });
      }
      continue;
    }

    const video = l.title ? trouverVideo(l.title, index) : null;
    liste.push({
      type: 'programme',
      heure: arrondirHeure(l.heure_debut || '', arrondi, l.heure_fixe ? 'proche' : 'bas'),
      heureExacte: l.heure_debut || '',
      fixe: Boolean(l.heure_fixe),
      ancre: l.type === 'ANCRE',
      emission: nomDe(l.channel_id),
      rubrique: rubriqueDe(l.channel_id),
      titre: l.title || '',
      videoId: video?.id || null,
    });
  }

  const jours = [...parJour.keys()].sort().map((date) => ({
    date,
    programmes: parJour.get(date),
    nbProgrammes: parJour.get(date).filter((x) => x.type === 'programme').length,
  }));

  // Les journées déjà passées ne sont pas retirées : l'export peut dater, et
  // mieux vaut une grille visiblement ancienne qu'une page vide sans explication.
  const derniere = jours[jours.length - 1]?.date;
  const perimee = Boolean(aujourdhui && derniere && derniere < aujourdhui);

  return {
    jours,
    perimee,
    exporteLe: donnees.exported_at || null,
    fuseau: FUSEAU,
    total: jours.reduce((n, j) => n + j.nbProgrammes, 0),
    arrondi,
    // Version compacte pour le calcul « en ce moment », côté navigateur.
    pourNavigateur: jours.flatMap((j) => j.programmes
      .filter((p) => p.type === 'programme' && p.heure)
      .map((p) => [j.date, p.heure, p.emission, p.titre, p.videoId || ''])),
  };
}

/** Date du jour dans le fuseau de la chaîne, au format AAAA-MM-JJ. */
export function jourIsrael(instant = new Date()) {
  const f = new Intl.DateTimeFormat('fr-CA', {
    timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return f.format(instant);
}
