// -----------------------------------------------------------------------------
// « Qui est cette personne ? » — la réponse est déjà dans vos descriptions.
//
// Search Console, 18 août 2026 : les requêtes les plus fortes du site sont
// biographiques. « stephan zeev goldin origine parents » pèse 897 impressions,
// « maxime loth » 700, « samuel madar wikipédia » 603. Les gens cherchent QUI
// sont ces personnes ; la fiche répondait par une grille de vignettes.
//
// Michael ne peut pas écrire cinquante biographies, et les inventer serait une
// faute — ce sont des personnes réelles. Mais la chaîne présente chacun de ses
// invités, à chaque fois, dans la description de l'émission :
//
//   « le géopolitologue Michel Fayad, spécialiste du Proche et du Moyen-Orient »
//   « Stéphane Goldin, expert militaire et défense »
//   « Pierre Martinet, ancien agent du service action de la DGSE »
//
// Ce module extrait cette apposition. Le résultat n'est ni inventé ni emprunté
// à un tiers : c'est une phrase de la chaîne, vérifiable dans la vidéo d'où
// elle vient.
//
// PRUDENCE DÉLIBÉRÉE. Une fonction fausse sur une personne réelle est pire que
// pas de fonction du tout. Trois garde-fous :
//   1. on n'accepte qu'un groupe nominal — tout candidat contenant un verbe
//      conjugué est rejeté ;
//   2. on exige que la même formulation revienne, ou qu'elle soit seule ;
//   3. en cas de doute, on ne rend rien.
// -----------------------------------------------------------------------------

/** Retire les accents et la casse, pour comparer des chaînes. */
const nu = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Échappe une chaîne pour l'insérer dans une expression régulière. */
const echapper = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Verbes qui marquent la fin de la présentation et le début du propos. Leur
// présence dans un candidat signe une phrase, pas une fonction.
const VERBES = [
  'analyse', 'analysent', 'revient', 'reviennent', 'décrypte', 'décryptent',
  'explique', 'expliquent', 'alerte', 'alertent', 'répond', 'répondent',
  'livre', 'livrent', 'présente', 'présentent', 'questionne', 'questionnent',
  'estime', 'estiment', 'raconte', 'racontent', 'dénonce', 'dénoncent',
  'interpelle', 'interpellent', 'propose', 'proposent', 'décrit', 'décrivent',
  'rappelle', 'rappellent', 'affirme', 'affirment', 'reçoit', 'reçoivent',
  'poursuit', 'poursuivent', 'met', 'mettent', 'donne', 'donnent',
  'est', 'sont', 'était', 'a', 'ont', 'peut', 'veut', 'fait',
  'accorde', 'accordent', 'retrouve', 'retrouvent', 'lance', 'lancent',
  'décide', 'décident', 'apporte', 'apportent', 'partage', 'partagent',
];
const RE_VERBE = new RegExp(`(^|[^a-zà-ÿ-])(${VERBES.join('|')})([^a-zà-ÿ-]|$)`, 'i');

// Mots qui trahissent un fragment de phrase plutôt qu'une fonction.
const INTERDITS = /\b(dans cette?|dans ce|sur tandem|pour tandem|cette interview|cet entretien|cet édito|il |elle |nous |vous |je |qui |que |dont |lorsqu|aujourd)\b/i;

// Une fonction commence rarement par ces mots — signe qu'on a attrapé autre chose.
const DEBUTS_DOUTEUX = /^(et|ou|mais|donc|puis|alors|ainsi|aussi|depuis|avec|sans|pour|par|en|au|aux|du|des|de|la|le|les|un|une)\b/i;

/** Un candidat est-il un groupe nominal plausible pour une fonction ? */
function plausible(x) {
  const t = String(x || '').trim().replace(/\s+/g, ' ');
  if (t.length < 5 || t.length > 90) return '';
  if (RE_VERBE.test(t)) return '';
  if (INTERDITS.test(t)) return '';
  if (DEBUTS_DOUTEUX.test(t)) return '';
  if (!/^[a-zà-ÿ]/.test(t)) return '';        // une fonction s'écrit en minuscule
  if ((t.match(/,/g) || []).length > 2) return '';
  return t.replace(/[\s,;:–—-]+$/, '');
}

/**
 * Toutes les façons dont un texte présente une personne.
 * Rend un tableau de candidats, dans l'ordre où ils apparaissent.
 */
export function candidatsIdentite(noms, texte) {
  const t = String(texte || '').replace(/\s+/g, ' ');
  const listeNoms = (Array.isArray(noms) ? noms : [noms]).filter(Boolean);
  if (!t || !listeNoms.length) return [];

  let devant = '', derriere = '';
  for (const nom of listeNoms) {
    const N = echapper(nom);

    // 1. « le géopolitologue Michel Fayad » — la fonction PRÉCÈDE le nom.
    if (!devant) {
      const m = t.match(new RegExp(`\\b(?:le|la|l'|les)\\s+([a-zà-ÿ][a-zà-ÿ'’\\- ]{3,44}?)\\s+${N}\\b`, 'i'));
      if (m) devant = plausible(m[1]);
    }

    // 2. « Stéphane Goldin, expert militaire et défense » — elle SUIT le nom.
    if (!derriere) {
      const m = t.match(new RegExp(`${N}\\s*,\\s*([^.?!;]{4,90})`, 'i'));
      if (m) {
        // On coupe à la première virgule, et c'est volontairement brutal.
        //
        // « Rony Akrich, historiosophe de la Bible, développe une réflexion
        // sur… » : sans cette coupe, la liste de verbes interdits laissait
        // passer « développe » — qui n'y figurait pas — et la fiche affichait
        // une demi-phrase tronquée en guise de fonction. Une liste de verbes
        // ne sera jamais complète ; la virgule, elle, ferme toujours
        // l'apposition. On perd parfois un complément, on ne publie jamais un
        // fragment de phrase sur le compte de quelqu'un.
        let bout = m[1].split(',')[0];
        const coupe = bout.search(RE_VERBE);
        if (coupe > 0) bout = bout.slice(0, coupe);
        derriere = plausible(bout);
      }
    }
  }

  // Les deux formes se complètent plutôt qu'elles ne se concurrencent :
  // « le linguiste Bruno Dray, auteur de nombreux ouvrages » donne les deux
  // moitiés d'une même présentation.
  if (devant && derriere && nu(derriere).startsWith(nu(devant))) return [derriere];
  if (devant && derriere) return [`${devant}, ${derriere}`, derriere, devant];
  return [devant || derriere].filter(Boolean);
}

/**
 * Ligne d'identité d'une personne, tirée des descriptions de ses vidéos.
 * Rend '' plutôt qu'une approximation.
 *
 * `videos` : objets portant `description`.
 */
export function identiteDe(noms, videos = []) {
  // On regroupe par MOT DE TÊTE, pas par phrase exacte.
  //
  // La chaîne varie ses formulations d'une émission à l'autre : « expert
  // militaire et défense », « expert en sécurité et défense », « spécialiste
  // des questions sécuritaires ». Compter les phrases exactes donnait 1
  // occurrence à chacune, donc aucune ne passait le seuil, et Stéphane Goldin
  // — présent dans quatre émissions qui le présentent toutes — se retrouvait
  // sans identité. Ce sont pourtant trois façons de dire la même chose.
  const groupes = new Map();       // mot de tête -> { formes: Map, n }
  for (const v of videos) {
    const cs = candidatsIdentite(noms, v?.description);
    if (!cs.length) continue;
    const c = cs[0];                                  // la forme la plus complète
    const tete = nu(c).split(/[\s,']/)[0];
    const g = groupes.get(tete) || { formes: new Map(), n: 0 };
    g.n += 1;
    g.formes.set(nu(c), c.length > (g.formes.get(nu(c))?.length || 0) ? c : g.formes.get(nu(c)));
    groupes.set(tete, g);
  }
  if (!groupes.size) return '';

  const gagnant = [...groupes.values()].sort((a, b) => b.n - a.n)[0];

  // Un seul groupe rencontré une seule fois, alors que la personne est passée
  // souvent : la présentation n'est pas assez établie pour être affichée comme
  // une identité. On préfère ne rien dire.
  if (gagnant.n === 1 && videos.length > 4 && groupes.size > 1) return '';

  // Dans le groupe retenu, la formulation la plus complète.
  return [...gagnant.formes.values()].sort((a, b) => b.length - a.length)[0] || '';
}
