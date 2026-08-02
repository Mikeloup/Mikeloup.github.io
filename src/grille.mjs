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

// -----------------------------------------------------------------------------
// Nettoyage des titres d'épisode.
//
// Ce que contient l'export n'est pas un titre : c'est un nom de fichier de
// régie. « 20230618 Tour d Israel Jeru Musulmane », « un jour une histoire28.05 »,
// « INVITE : BRUNO DRAY ». Corriger ces lignes à la main serait du travail perdu,
// puisque l'export est régénéré à chaque diffusion. On les nettoie donc par
// règles, à l'affichage seulement — le fichier source n'est jamais modifié.
//
// Trois principes :
//   1. Quand la ligne correspond à une vidéo publiée, son titre YouTube fait
//      autorité : il a été écrit pour être lu, celui de la régie non.
//   2. On retire ce qui relève de la tuyauterie (dates de tournage collées,
//      numéros de version, préfixes de production, nom de l'émission répété).
//   3. On ne réécrit jamais les mots eux-mêmes. Les CAPITALES sont ramenées en
//      bas de casse parce que c'est une décision de mise en forme, pas de fond.
// -----------------------------------------------------------------------------

const PREFIXES_REGIE = /^(?:invit[ée]e?s?|inv|sujet|thème|theme|titre|rush|master|pad|vf|hd)\s*[:\-–—]\s*/i;

// Mots qui gardent leur minuscule à l'intérieur d'un nom de personne.
const MOTS_LIENS = new Set(['et', 'de', 'du', 'des', 'da', 'di', 'la', 'le', 'les', 'van', 'von', 'ben', 'bar', 'el', 'al']);

/** Le titre est-il écrit tout en capitales ? */
function toutEnCapitales(t) {
  const lettres = t.match(/\p{L}/gu) || [];
  if (lettres.length <= 2) return false;
  return (t.match(/\p{Lu}/gu) || []).length / lettres.length >= 0.7;
}

/**
 * Le titre ressemble-t-il à un nom de personne plutôt qu'à une phrase ?
 *
 * La distinction compte : « JEAN-MARC DREYFUS » doit devenir « Jean-Marc
 * Dreyfus » et non « Jean-marc dreyfus ». Le critère est volontairement strict —
 * peu de mots, aucun chiffre, aucune ponctuation de phrase — pour qu'une vraie
 * phrase en capitales ne soit jamais traitée comme un patronyme.
 */
function ressembleAUnNom(t) {
  if (/[.,;:?!«»"]/.test(t) || /\d/.test(t)) return false;
  const mots = t.split(/\s+/).filter(Boolean);
  return mots.length >= 1 && mots.length <= 5;
}

/** Capitale à chaque nom, minuscule aux particules. Gère les prénoms composés. */
function casseNomsPropres(t) {
  let premier = true;
  return t.replace(/[\p{L}\p{M}]+/gu, (mot) => {
    const bas = mot.toLocaleLowerCase('fr');
    const cap = bas.charAt(0).toLocaleUpperCase('fr') + bas.slice(1);
    if (premier) { premier = false; return cap; }
    return MOTS_LIENS.has(bas) ? bas : cap;
  });
}

/** Nettoie un titre d'épisode issu de la régie. Rend '' si rien d'utile ne reste. */
export function nettoyerTitre(brut, { emission = '', smart = (x) => x } = {}) {
  let t = String(brut || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!t) return '';

  // Date de tournage en tête : « 20230618 Tour d Israel… »
  t = t.replace(/^(?:\d{6,8}|\d{2}[.\-/]\d{2}[.\-/]\d{2,4})\s+/, '');

  // Date ou numéro de version en queue, collé ou non : « …histoire28.05 »,
  // « …histoire 2206025 ». On exige une lettre juste avant, pour ne pas amputer
  // un titre qui se termine légitimement par un nombre (« …convoi 53 »).
  t = t.replace(/(\p{L})\s*\d{1,2}[.\-/]\d{2}(?:[.\-/]\d{2,4})?$/u, '$1');
  t = t.replace(/(\p{L})\s+\d{5,8}$/u, '$1');

  // Préfixe de production : « INVITE : BRUNO DRAY »
  t = t.replace(PREFIXES_REGIE, '');

  // Numéro d'ordre en tête : « 2. UJUH Eurovision »
  t = t.replace(/^\d{1,2}\s*[.)\-–—]\s*/, '');

  // Nom de l'émission répété en tête, en toutes lettres (« TEL AVIV NEW YORK- …»)
  // ou en sigle maison (« UJUH » pour Un jour, une histoire).
  if (emission) {
    const cle = (x) => sansAccents(x).replace(/[^a-z0-9]+/g, '');
    const sigle = (sansAccents(emission).match(/[a-z0-9]+/g) || []).map((m) => m[0]).join('');
    const formes = new Set([cle(emission)]);
    if (sigle.length >= 3) formes.add(sigle);
    for (let n = t.length; n >= 3; n--) {
      const tete = cle(t.slice(0, n));
      if (tete && formes.has(tete)) { t = t.slice(n).replace(/^\s*[:\-–—]\s*/, ''); break; }
    }
  }

  // « EPISODE 14- SEMAINE… » : le tiret collé au chiffre est une habitude de
  // nommage de fichier, pas une ponctuation.
  t = t.replace(/(\d)\s*[-–—]\s+/g, '$1 – ');
  t = t.replace(/\s*[:\-–—]\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';

  // Un patronyme en capitales se remet en casse de nom ; une phrase en capitales
  // se remet en casse de phrase.
  t = toutEnCapitales(t) && ressembleAUnNom(t) ? casseNomsPropres(t) : smart(t);
  t = t.replace(/^Episode\b/, 'Épisode');

  // Un titre qui ne fait que répéter le nom de l'émission n'apprend rien.
  const cle = (x) => sansAccents(x).replace(/[^a-z0-9]+/g, '');
  if (emission && cle(t) === cle(emission)) return '';
  return retirerSignature(t, emission);
}

/**
 * Retire la signature du présentateur en fin de titre quand elle fait double
 * emploi avec le nom de l'émission.
 *
 * Sur YouTube, « … | Rony Hayot » est utile : le titre voyage seul dans un flux
 * où rien n'indique la provenance. Sur la grille, le nom de l'émission est écrit
 * juste au-dessus — la signature ne fait plus qu'allonger la ligne et repousser
 * l'information utile hors de l'écran sur un téléphone.
 */
function retirerSignature(titre, emission) {
  if (!emission || !titre.includes('|')) return titre;
  const cle = (x) => sansAccents(x).replace(/[^a-z0-9]+/g, '');
  const morceaux = titre.split('|');
  const queue = morceaux[morceaux.length - 1].trim();
  const c = cle(queue);
  if (c.length < 6 || !cle(emission).includes(c)) return titre;
  const reste = morceaux.slice(0, -1).join('|').trim().replace(/\s*[|·\-–—:]\s*$/, '');
  return reste || titre;
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

export function prepareGrille(donnees, {
  emissions = {}, index = new Map(), aujourdhui, arrondi = 0, smartTitre = (x) => x,
  rubriques = [],
} = {}) {
  const lignes = Array.isArray(donnees?.rows) ? donnees.rows : [];
  if (!lignes.length) return null;

  const nomDe = (id) => emissions[id]?.nom || String(id || '').replace(/_/g, ' ');

  // Rattachement d'un programme à sa rubrique du site.
  //
  // Le champ 'site' contient une adresse, or cette adresse est dérivée du titre
  // de la playlist YouTube : renommer la playlist déplace la page, et le lien
  // écrit ici tombe dans le vide. Plutôt que d'exiger une correction manuelle à
  // chaque renommage — qui n'arrivera jamais au bon moment — on retombe sur le
  // NOM de l'émission, qui lui est stable. Le site se répare donc tout seul.
  const parSlug = new Set(rubriques.map((r) => r.slug));
  const parNom = new Map();
  for (const r of rubriques) {
    const k = sansAccents(r.title).replace(/[^a-z0-9]+/g, '');
    if (k && !parNom.has(k)) parNom.set(k, r.slug);
  }
  const orphelines = new Set();
  const rubriqueDe = (id) => {
    const e = emissions[id];
    if (!e) return '';
    if (e.site && parSlug.has(e.site)) return e.site;
    if (e.site && rubriques.length) orphelines.add(`${id} → « ${e.site} »`);
    const secours = parNom.get(sansAccents(e.nom || '').replace(/[^a-z0-9]+/g, ''));
    return secours || (rubriques.length ? '' : e.site || '');
  };

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
    const nomEmission = nomDe(l.channel_id);
    // Le titre YouTube fait autorité quand il existe : il a été écrit pour être lu.
    const titre = video?.title
      ? retirerSignature(String(video.title).normalize('NFKC').replace(/\s+/g, ' ').trim(), nomEmission)
      : nettoyerTitre(l.title, { emission: nomEmission, smart: smartTitre });
    liste.push({
      type: 'programme',
      heure: arrondirHeure(l.heure_debut || '', arrondi, l.heure_fixe ? 'proche' : 'bas'),
      heureExacte: l.heure_debut || '',
      fixe: Boolean(l.heure_fixe),
      ancre: l.type === 'ANCRE',
      emission: nomEmission,
      rubrique: rubriqueDe(l.channel_id),
      titre,
      titreRegie: l.title || '',
      videoId: video?.id || null,
    });
  }

  const tous = [...parJour.keys()].sort().map((date) => {
    const programmes = parJour.get(date);
    const avecHeure = programmes.filter((x) => x.type === 'programme' && x.heure);
    return {
      date,
      programmes,
      nbProgrammes: programmes.filter((x) => x.type === 'programme').length,
      debut: avecHeure[0]?.heure || '',
      fin: avecHeure[avecHeure.length - 1]?.heure || '',
      // La journée se termine-t-elle sur des clips sans horaire ?
      finEnClips: programmes[programmes.length - 1]?.type === 'clips',
    };
  });

  // L'heure de reprise, le lendemain : sans elle, « clips jusqu'au lendemain »
  // laisse le lecteur devant une question sans réponse.
  for (let i = 0; i < tous.length; i++) tous[i].repriseLendemain = tous[i + 1]?.debut || '';

  // Une journée révolue n'a plus rien à dire à personne : le 1er août affiché
  // le 2 donne l'impression d'un site abandonné, ce qui est exactement l'inverse
  // de ce que prouve une grille tenue à jour. On les retire — sauf si TOUTES
  // sont passées, auquel cas mieux vaut une grille visiblement ancienne, avec
  // son avertissement, qu'une page vide sans explication.
  const aVenir = aujourdhui ? tous.filter((j) => j.date >= aujourdhui) : tous;
  const jours = aVenir.length ? aVenir : tous;

  // Les journées déjà passées ne sont pas retirées : l'export peut dater, et
  // mieux vaut une grille visiblement ancienne qu'une page vide sans explication.
  const derniere = tous[tous.length - 1]?.date;
  const perimee = Boolean(aujourdhui && derniere && derniere < aujourdhui);

  return {
    jours,
    perimee,
    orphelines: [...orphelines],
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
