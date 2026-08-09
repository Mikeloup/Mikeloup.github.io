// -----------------------------------------------------------------------------
// Repérage des personnes citées dans le catalogue : invités et présentateurs.
//
// Pourquoi : les données de Search Console montrent que l'essentiel des
// recherches qui mènent à Tandem TV sont des recherches de NOMS — « samuel madar
// wikipédia », « stephan zeev goldin biographie », « justine varin ». Aucune page
// du site ne répondait à ces requêtes. Ce module les fabrique à partir de ce que
// la chaîne publie déjà, sans rien inventer sur les personnes.
// -----------------------------------------------------------------------------

import { slugify } from './util.mjs';

// Mots qui, présents dans un candidat, prouvent que ce n'est pas un nom de
// personne mais un lieu, un thème ou une formule d'émission.
const PAS_UN_NOM = new RegExp([
  'israel', 'israël', 'gaza', 'tsahal', 'iran', 'hamas', 'hezbollah', 'houthis',
  'juif', 'juive', 'juifs', 'antisémitisme', 'antisemitisme', 'sionisme', 'sioniste',
  'proche', 'orient', 'judée', 'samarie', 'cisjordanie', 'france', 'paris', 'liban',
  'syrie', 'egypte', 'égypte', 'jordanie', 'qatar', 'yémen', 'yemen', 'turquie',
  'maroc', 'tunisie', 'algérie', 'europe', 'amérique', 'russie', 'ukraine', 'chine',
  'torah', 'talmud', 'shabbat', 'chabbat', 'pourim', 'hanouka', 'hannouka', 'pessah',
  'kippour', 'souccot', 'knesset', 'jérusalem', 'jerusalem', 'tel aviv', 'haïfa',
  'onu', 'otan', 'unesco', 'union', 'hébreu', 'hebreu', 'alya', 'shoah', 'holocauste',
  'guerre', 'paix', 'otages', 'attentat', 'terrorisme', 'islam', 'islamisme',
  'interview', 'entretien', 'analyse', 'edito', 'édito', 'invité', 'invitée',
  'émission', 'emission', 'spécial', 'special', 'exclusif', 'exclusive', 'replay',
  'reportage', 'témoignage', 'temoignage', 'débat', 'debat', 'histoire', 'histoires',
  'actu', 'actualité', 'monde', 'société', 'societe', 'politique', 'économie',
].join('|'), 'i');

const PARTICULES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'ben', 'bar', 'el', 'al', 'van', 'von', 'da', 'di', 'd', 'l']);

/**
 * Valide qu'une chaîne ressemble à un nom de personne : deux à quatre mots,
 * chacun commençant par une majuscule (les particules exceptées), aucun chiffre,
 * aucun mot de lieu ou de thème.
 */
export function nomDePersonne(chaine) {
  let s = String(chaine || '').replace(/\s+/g, ' ').trim()
    .replace(/^[«»"'’\-–—\s]+/, '').replace(/[«»"'’\-–—\s.!?]+$/, '');
  if (!s || s.length > 40 || /\d/.test(s)) return null;
  if (PAS_UN_NOM.test(s)) return null;

  const mots = s.split(' ');
  if (mots.length < 2 || mots.length > 4) return null;

  let majuscules = 0;
  for (const mot of mots) {
    if (PARTICULES.has(mot.toLowerCase())) continue;
    const base = mot.replace(/^[dl]['’]/i, '');
    if (!/^[A-ZÀ-ÖØ-Þ]/.test(base)) return null;
    majuscules++;
  }
  return majuscules >= 2 ? s : null;
}

/** Candidats extraits d'un titre de vidéo, par ordre de fiabilité décroissante. */
function candidatsDuTitre(titre) {
  const out = [];
  const barres = titre.split('|');
  if (barres.length > 1) out.push(barres[barres.length - 1]);
  const deuxPoints = titre.split(':');
  if (deuxPoints.length > 1) out.push(deuxPoints[0]);
  const m = titre.match(/(?:interview|entretien|rencontre|invité|invitée)\s+(?:de|avec|d['’])\s+([^:|,?]+)/i);
  if (m) out.push(m[1]);
  return out;
}

/** Présentateur déduit du nom d'une rubrique : « L'invité de William Zerbib ». */
export function presentateurDeLaRubrique(titreRubrique) {
  const m = String(titreRubrique || '').match(/(?:\bde\s+|\bavec\s+|\bpar\s+|[-–—]\s*)(.+)$/i);
  return m ? nomDePersonne(m[1]) : null;
}

/**
 * Construit la liste des personnes du catalogue.
 * `config` = bloc `personnes` de site.config.json ; `manuel` = data/personnes.json.
 */
export function collecterPersonnes(categories, allVideos, manuel = {}) {
  const exclure = new Set((manuel.exclure || []).map((x) => x.toLowerCase()));
  const alias = new Map(Object.entries(manuel.alias || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const inclure = new Set((manuel.inclure || []).map((x) => x.toLowerCase()));
  const seuil = manuel.minVideos ?? 2;

  const canonique = (nom) => alias.get(nom.toLowerCase()) || nom;

  // Clé de regroupement : sans accents ni casse. « Jérôme Haas », « Jérome Haas »
  // et « Jerome Haas » sont la même personne — le repérage automatique lisait
  // les trois orthographes dans les titres et créait trois fiches.
  const clef = (nom) => nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  /** @type {Map<string, {nom:string, slug:string, videos:any[], rubriques:Set<string>, presente:Set<string>}>} */
  const gens = new Map();
  const ajouter = (nomBrut, video, rubriqueTitre) => {
    const nom = canonique(nomBrut);
    if (exclure.has(nom.toLowerCase()) || exclure.has(clef(nom))) return;
    const cle = clef(nom);
    if (!gens.has(cle)) {
      gens.set(cle, { nom, slug: slugify(nom), videos: [], rubriques: new Set(), presente: new Set(), graphies: new Map() });
    }
    const p = gens.get(cle);
    // On mémorise chaque orthographe rencontrée : la plus fréquente sera
    // retenue pour l'affichage, à égalité celle qui porte des accents.
    p.graphies.set(nom, (p.graphies.get(nom) || 0) + 1);
    if (video && !p.videos.some((v) => v.id === video.id)) p.videos.push(video);
    if (rubriqueTitre) p.rubriques.add(rubriqueTitre);
  };

  // 1. Présentateurs, déduits du nom des émissions.
  const presentateurParRubrique = new Map();
  for (const cat of categories) {
    const nom = manuel.presentateurs?.[cat.title] || presentateurDeLaRubrique(cat.title);
    if (!nom || exclure.has(canonique(nom).toLowerCase())) continue;
    presentateurParRubrique.set(cat.slug, canonique(nom));
    for (const v of cat.videos) ajouter(nom, v, cat.title);
    const p = gens.get(clef(canonique(nom)));
    if (p) p.presente.add(cat.title);
  }

  // 2. Invités, déduits des titres de vidéos.
  for (const v of allVideos) {
    for (const c of candidatsDuTitre(v.title)) {
      const nom = nomDePersonne(c);
      if (nom) { ajouter(nom, v, v.playlists?.[0]?.title); break; }
    }
  }

  // 3. Rattrapage par les descriptions.
  //
  // Le titre ne cite pas toujours la personne : « Benjamin Netanyahu bientôt en
  // prison ? » est un épisode de Galith Benzimra, et seule la description le dit
  // (« Dans cet épisode, Galith Benzimra revient sur… »). Sans cette passe, sa
  // fiche affichait 12 vidéos là où la recherche du site en trouvait 66.
  //
  // On ne cherche que les personnes DÉJÀ identifiées par un titre ou par le nom
  // d'une émission : jamais un nom nouveau, pour ne pas transformer chaque
  // personnalité citée en passant en intervenante de la chaîne.
  const sansAccents = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const descriptions = allVideos.map((v) => ({ v, d: sansAccents(v.description) }));

  for (const p of gens.values()) {
    const cle = sansAccents(p.nom);
    if (cle.length < 6) continue;
    const trouves = descriptions.filter(({ d }) => {
      const i = d.indexOf(cle);
      if (i === -1) return false;
      // Bornes de mot : « Bruno Dray » ne doit pas correspondre à « Bruno Draye ».
      const avant = i === 0 ? ' ' : d[i - 1];
      const apres = d[i + cle.length] || ' ';
      return !/[a-z0-9]/.test(avant) && !/[a-z0-9]/.test(apres);
    });

    // Garde-fou : un nom présent dans plus de la moitié d'un catalogue déjà
    // fourni n'est pas un intervenant, c'est une mention de pied de
    // description. Le seuil ne s'applique pas aux petits catalogues, où une
    // même personne peut légitimement être partout.
    if (allVideos.length > 40 && trouves.length > allVideos.length * 0.5) continue;

    for (const { v } of trouves) {
      if (!p.videos.some((x) => x.id === v.id)) p.videos.push(v);
      if (v.playlists?.[0]?.title) p.rubriques.add(v.playlists[0].title);
    }
  }

  // Orthographe d'affichage : la plus fréquente ; à égalité, celle qui porte
  // des accents (« Jérôme » plutôt que « Jerome »).
  const accents = (x) => (x.normalize('NFD').match(/[\u0300-\u036f]/g) || []).length;
  for (const p of gens.values()) {
    p.nom = [...p.graphies.entries()]
      .sort((a, b) => b[1] - a[1] || accents(b[0]) - accents(a[0]))[0][0];
    p.slug = slugify(p.nom);
  }

  // Les fiches ecrites a la main sont retrouvees SANS ACCENTS, SANS CASSE et
  // SANS TITRE DE CIVILITE. Une clef mal accentuee — ou un « Maitre » oublie —
  // ne faisait rien du tout, en silence, et l'on cherchait le defaut dans le
  // code. « Rav Saadia Morali », « Saadia Morali » et « saadia morali »
  // designent la meme personne.
  const sansTitre = (nom) => clef(nom)
    .replace(/^(maitre|me|rav|rabbin|grand rabbin|dr|docteur|pr|professeur|general|colonel)\s+/, '');
  const fiches = new Map();
  for (const [k, v] of Object.entries(manuel.fiches || {})) {
    fiches.set(clef(k), v);
    fiches.set(sansTitre(k), v);
  }
  const ficheDe = (nom) => fiches.get(clef(nom)) || fiches.get(sansTitre(nom)) || null;

  const retenues = [...gens.values()]
    .filter((p) => p.videos.length >= seuil || inclure.has(p.nom.toLowerCase()))
    .map((p) => ({
      ...p,
      rubriques: [...p.rubriques],
      presente: [...p.presente],
      videos: p.videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
      fiche: ficheDe(p.nom),
    }))
    .sort((a, b) => b.videos.length - a.videos.length || a.nom.localeCompare(b.nom, 'fr'));

  // Une fiche qui ne correspond a personne est une faute de frappe : on la
  // signale plutot que de la laisser dormir.
  const vues = new Set(retenues.flatMap((p) => [clef(p.nom), sansTitre(p.nom)]));
  const orphelines = [...new Set(Object.keys(manuel.fiches || {}))]
    .filter((k) => !vues.has(clef(k)) && !vues.has(sansTitre(k)));

  return { personnes: retenues, presentateurParRubrique, fichesOrphelines: orphelines };
}
