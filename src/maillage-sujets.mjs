/**
 * RELIER LES PAGES DE SUJET AUX VIDEOS QUI EN PARLENT.
 *
 * Ecrit le 18 septembre 2026. Mesure du meme jour, en marquant six editions et
 * en cherchant le marqueur dans les 1 310 pages produites : les dix-neuf pages
 * « /sujets/ » recevaient entre DEUX ET NEUF liens internes, et tous venaient
 * d'une autre page « /sujets/ ». Aucun depuis l'accueil, le catalogue ou les
 * 1 051 pages video. Dans l'autre sens, « /sujets/histoire-de-jerusalem/ » ne
 * pointait vers AUCUNE video, AUCUNE emission, AUCUN invite.
 *
 * Un ilot de dix-neuf pages qui ne se citent qu'entre elles, a cote d'un
 * catalogue de 1 022 transcriptions sur Israel, Jerusalem, l'archeologie et
 * l'histoire. Search Console, sur 90 jours : ces dix-neuf pages totalisent eize
 * onze affichages et zero clic.
 *
 * Ce module cherche, dans les transcriptions, les videos qui parlent VRAIMENT
 * d'un sujet. Il ne devine pas : il lit ce qui a ete dit a l'antenne.
 *
 * --- LA REGLE, ET POURQUOI ELLE EST CELLE-CI -------------------------------
 *
 * Trois essais ont ete necessaires, sur les vraies transcriptions :
 *
 * 1. Le simple comptage de mots remontait « conserve » dans un texte sur des
 *    croquettes pour chien, et « millions » a propos de confines chinois.
 * 2. Exiger un mot RARE a supprime ce bruit -- mais « L'histoire de Jerusalem »
 *    est tombee a zero video, parce que « jerusalem » est partout dans le
 *    catalogue, donc jamais rare, alors que c'est justement LE mot du sujet.
 * 3. D'ou la regle retenue : MENTIONNER N'EST PAS PARLER DE. Une video est
 *    retenue si elle prononce un mot rare du sujet au moins trois fois, OU le
 *    mot de l'adresse au moins cinq fois ET densement. Prononcer « Jerusalem »
 *    cinquante-six fois, ce n'est pas la mentionner.
 *
 * Et en dessous d'un score plancher, on n'affiche RIEN. Quatre videos justes
 * valent mieux que huit dont trois sont fausses : une rubrique « A voir » qui
 * se trompe une fois sur trois cesse d'etre lue.
 */

/** Minuscules, sans accents. */
export function plat(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

// Mots trop communs pour distinguer quoi que ce soit.
const VIDES = new Set(`avec dans pour mais donc cette cettes elle elles leur leurs
plus tout tous toute toutes sans sous entre chez vers depuis apres avant pendant
selon meme aussi alors encore jamais toujours quand comme parce autre autres deux
trois quatre cinq etre avoir fait faire dit ete sont etait etaient cela celui ceux
quoi dont bien moins beaucoup chose choses annees annee jour jours fois grand
grande grands grandes petit petite petits petites`.split(/\s+/));

/** Les mots exploitables d'un texte : au moins cinq lettres, pas un mot vide. */
export function termes(...textes) {
  return plat(textes.join(' '))
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 5 && !VIDES.has(m));
}

/**
 * L'index du catalogue : le texte de chaque transcription, et son nombre de
 * mots. Construit une fois par build, a partir de la Map deja chargee -- aucun
 * fichier n'est relu.
 */
export function indexerTranscriptions(transcriptions) {
  const docs = new Map();
  for (const [id, t] of transcriptions || []) {
    const texte = plat((t.blocs || []).map((b) => b.texte).join(' '));
    if (texte) docs.set(id, { texte, mots: Math.max(1, t.mots || texte.split(/\s+/).length) });
  }
  return { docs, total: docs.size };
}

const RARE = 0.04;        // un terme distinctif parait dans moins de 4 % du catalogue
const MINI_RARE = 3;      // et y est prononce au moins trois fois
const MINI_TETE = 5;      // un mot de l'adresse doit etre prononce cinq fois
const DENSITE = 1.0;      // et au moins une fois pour mille mots
const PLANCHER = 90;      // en dessous, on n'affiche rien

// LES DEUX SENS N'ONT PAS LA MEME EXIGENCE, 19 septembre 2026.
//
// Sous une page de sujet, « A voir sur Tandem TV » est une suggestion. Sous
// une video, « Pour aller plus loin : Cesaree maritime » est une AFFIRMATION
// sur ce que la video raconte. Mesure du jour sur le site : la video
// « Jerusalem a l'epoque d'Herode le Grand » renvoyait vers Cesaree -- parce
// que les mots de Cesaree sont surtout « herode », « romain », « pierre »,
// que cette video contient tous, sans jamais prononcer « Cesaree ».
//
// Le renvoi exige donc que la video prononce le mot MEME du sujet, celui de
// son adresse, au moins trois fois. C'est `MINI_TETE_RENVOI`, lu par build.mjs.
export const MINI_TETE_RENVOI = 3;

// QUI A LE DROIT D'ANCRER. Premier essai a 60 : « Tsipori » remontait une video
// sur un PARKING (parking x12), et « Saint-Jean-d'Acre » une video ou le mot
// « prison » revient sans qu'il s'agisse de celle-la. Le mot fautif venait
// chaque fois de la DESCRIPTION de la page, ou il figure en passant.
//
// Le titre et l'adresse disent de quoi la page parle ; la description ajoute
// des details. Seuls les deux premiers peuvent donc decider qu'une video entre
// -- la description continue de compter dans le score, elle ne suffit plus a
// faire entrer.

/**
 * Les videos qui parlent du sujet, les meilleures d'abord.
 *
 * `page` est une entree de site.config.json (slug, title, description).
 * Rend [{ id, score, termes: [[mot, occurrences], …] }].
 */
export function videosDuSujet(page, index, { max = 4 } = {}) {
  const { docs, total } = index;
  if (!total) return [];

  const adresse = String(page.slug || '').split('/').pop().replace(/-/g, ' ');
  const tetes = new Set(termes(adresse));
  // Les mots qui peuvent faire entrer une video : ceux de l'adresse et du titre.
  const ancreurs = new Set(termes(adresse, page.title || ''));
  const poids = new Map();
  for (const m of termes(adresse, page.title || '', page.description || '')) {
    poids.set(m, (poids.get(m) || 0) + 1);
  }

  // Frequence documentaire : un mot present partout ne distingue rien. Sauf
  // s'il vient de l'ADRESSE -- « jerusalem » est banal dans ce catalogue et
  // c'est pourtant le sujet de la page.
  const df = new Map();
  for (const m of poids.keys()) {
    let n = 0;
    for (const d of docs.values()) if (d.texte.includes(m)) n++;
    df.set(m, n);
  }
  const retenus = [...poids.keys()]
    .filter((m) => df.get(m) > 0 && (df.get(m) <= total * 0.33 || tetes.has(m)));
  if (!retenus.length) return [];
  const idf = (m) => Math.log((total + 1) / (df.get(m) + 1));

  const res = [];
  for (const [id, d] of docs) {
    let score = 0; const detail = []; let ancre = false;
    for (const m of retenus) {
      const n = compter(d.texte, m);
      if (!n) continue;
      score += n * idf(m) * (1 + 0.3 * poids.get(m));
      detail.push([m, n]);
      if (ancreurs.has(m) && df.get(m) <= total * RARE && n >= MINI_RARE) ancre = true;
      if (tetes.has(m) && n >= MINI_TETE && (1000 * n) / d.mots >= DENSITE) ancre = true;
    }
    if (ancre && score >= PLANCHER) {
      // Combien de fois la video prononce-t-elle le mot MEME du sujet, celui
      // de son adresse ? Le sens « video -> sujet » s'en sert (voir plus bas).
      let tete = 0;
      for (const m of tetes) tete = Math.max(tete, compter(d.texte, m));
      res.push({ id, score, tete, termes: detail.sort((a, b) => b[1] - a[1]).slice(0, 4) });
    }
  }
  return res.sort((a, b) => b.score - a.score).slice(0, max);
}

/** Combien de fois ce mot apparait dans ce texte. */
function compter(texte, mot) {
  let n = 0; let i = texte.indexOf(mot);
  while (i !== -1) { n++; i = texte.indexOf(mot, i + mot.length); }
  return n;
}
