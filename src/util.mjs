// Petites fonctions utilitaires partagées par le générateur.

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'categorie';
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Date + heure, en heure locale d'Israël : sert à afficher en pied de page
 * le moment exact de la dernière synchronisation avec YouTube.
 */
export function formatDateTime(value, timeZone = 'Asia/Jerusalem') {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'long', timeStyle: 'short', timeZone,
    }).format(d);
  } catch {
    return formatDate(d.toISOString());
  }
}

export function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10).split('-').reverse().join('/');
}

export function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatCount(n) {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace('.0', '').replace('.', ',')} k`;
  return String(n);
}

/** Nombre entier avec séparateur de milliers français (1100 → 1 100). */
export function formatNumber(n) {
  if (!n && n !== 0) return '';
  return new Intl.NumberFormat('fr-FR').format(n).replace(/\u202f/g, '\u00a0');
}

export function truncate(str = '', max = 180) {
  const clean = String(str).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/**
 * Transforme la description YouTube brute en HTML lisible :
 * liens cliquables, timecodes cliquables, paragraphes.
 */
export function descriptionToHtml(text = '', videoId = '') {
  const blocks = String(text).split(/\n{2,}/).filter((b) => b.trim());
  return blocks
    .map((block) => {
      let html = escapeHtml(block.trim());
      html = html.replace(
        /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g,
        '<a href="$1" rel="noopener nofollow" target="_blank">$1</a>',
      );
      if (videoId) {
        html = html.replace(/(^|\s)((?:\d{1,2}:)?\d{1,2}:\d{2})(?=\s|$)/g, (_m, ws, ts) => {
          const parts = ts.split(':').map(Number);
          const sec = parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts[0] * 60 + parts[1];
          return `${ws}<a class="timecode" href="https://www.youtube.com/watch?v=${videoId}&t=${sec}s" target="_blank" rel="noopener">${ts}</a>`;
        });
      }
      return `<p>${html.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}

/**
 * Extrait les chapitres d'une description YouTube.
 * Reconnaît « 12:34 Titre », « 12:34 - Titre » et « Titre 12:34 ».
 * Renvoie [] si moins de `min` chapitres : mieux vaut ne rien afficher
 * qu'un sommaire d'une seule ligne bâti sur un timecode isolé.
 */
export function extractChapters(text = '', { min = 3 } = {}) {
  const TIME = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}`;
  const leading = new RegExp(`^\\s*(${TIME})\\s*(?:[-–—:.)\\]]|\\|)?\\s*(.+?)\\s*$`);
  const trailing = new RegExp(`^\\s*(.+?)\\s*(?:[-–—:(\\[]|\\|)?\\s*(${TIME})\\s*$`);
  const seen = new Set();
  const chapters = [];
  const lines = String(text).split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let time = null;
    let label = null;
    const a = leading.exec(line);
    if (a) { [, time, label] = a; } else {
      const b = trailing.exec(line);
      if (b) { [, label, time] = b; }
    }
    if (!time || !label) continue;

    label = label.replace(/^[\s\-–—:|.)\]]+/, '').replace(/[\s\-–—:|(\[]+$/, '').trim();
    if (label.length < 2 || label.length > 120) continue;
    // Une ligne qui n'est qu'un second timecode n'est pas un titre de chapitre.
    if (new RegExp(`^${TIME}$`).test(label)) continue;

    const parts = time.split(':').map(Number);
    const seconds = parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
    if (seen.has(seconds)) continue;
    seen.add(seconds);
    chapters.push({ time, seconds, label, index });
  }

  if (chapters.length < min) return [];
  // Un vrai sommaire est chronologique ; sinon on a ramassé autre chose.
  for (let i = 1; i < chapters.length; i += 1) {
    if (chapters[i].seconds <= chapters[i - 1].seconds) return [];
  }
  return chapters;
}

/**
 * Retire de la description les lignes déjà reprises dans le sommaire,
 * ainsi qu'un éventuel intertitre devenu orphelin (« Sommaire », « Chapitres »…).
 */
export function removeChapterLines(text = '', chapters = []) {
  if (!chapters.length) return String(text);
  const lines = String(text).split(/\r?\n/);
  const drop = new Set(chapters.map((c) => c.index));
  const HEADING = /^\s*(?:au\s+)?(?:sommaire|chapitres?|timecodes?|minutage|programme)\s*:?\s*$/i;

  const first = Math.min(...drop);
  for (let i = first - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (HEADING.test(line)) drop.add(i);
    break;
  }

  return lines
    .filter((_, i) => !drop.has(i))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Découpe un tableau en pages de n éléments. */
export function paginate(arr, perPage) {
  const pages = [];
  for (let i = 0; i < arr.length; i += perPage) pages.push(arr.slice(i, i + perPage));
  return pages.length ? pages : [[]];
}

/**
 * Nettoie une description YouTube : supprime la répétition du titre en tête
 * et les lignes vides superflues.
 */
// Lignes de fin de description YouTube : appels à l'abonnement, liens vers les
// réseaux, mentions légales de la chaîne, chapelets de mots-dièse. Elles se
// répètent à l'identique sur des centaines de vidéos : pour un moteur de
// recherche, c'est du texte dupliqué qui dilue le contenu réel de la page.
const PROMO = [
  /abonn(ez|e)[- ]?vous/i,
  /s'abonner/i,
  /rejoignez[- ]nous/i,
  /suivez[- ]nous/i,
  /retrouvez[- ]nous sur/i,
  /(notre|nos) (site|réseaux|chaîne)/i,
  /soutenir la chaîne|soutenez[- ]nous|faire un don/i,
  /^\s*(https?:\/\/|www\.)/i,
  /(facebook|instagram|twitter|tiktok|telegram|linkedin|whatsapp|paypal)\.(com|me)/i,
  /youtube\.com\/(@|channel|c\/)/i,
  /#\w+\s*#\w+/,
  /^\s*[-—=*_•▬►👉🔔📲📱🔴💙]+\s*$/,
  /copyright|tous droits réservés/i,
  // Formules d'appel à l'action de fin de description YouTube. Sans elles, la
  // dernière ligne n'étant pas reconnue, tout le bloc promotionnel survivait.
  /pensez à (aimer|liker|vous abonner|partager|commenter)/i,
  /aimer (la|cette) (vidéo|émission)/i,
  /(laissez|laisser) (un|votre) (commentaire|avis|analyse)/i,
  /partage(z|r) (cette|la|notre) (vidéo|émission|analyse)/i,
  /(activez|cliquez sur) la cloche/i,
  /n'hésitez pas à (vous abonner|liker|partager|commenter)/i,
  /mettre un pouce|pouce bleu/i,
  /like(z|r)?\s+(la|cette|notre)\s+(vidéo|émission)/i,
  /diffuse(z|r)\s+(cette|la|notre)/i,
];

/**
 * Les formules d'appel à l'action changent d'une vidéo à l'autre — « Likez »,
 * « Diffusez », « Pensez à aimer »… Une liste de tournures sera toujours en
 * retard d'une formulation. Mais elles ont toutes le même signe extérieur :
 * elles commencent par un pictogramme. 👉 🔔 👍 📢
 *
 * On ne s'en sert que pour les lignes de FIN de description, jamais au milieu :
 * un paragraphe éditorial peut légitimement commencer par un emoji, mais pas la
 * dernière ligne d'un texte de présentation.
 */
const COMMENCE_PAR_PICTO = /^\s*(?:\p{Extended_Pictographic}|\p{So})[\p{Emoji_Modifier}\uFE0F\u200D\p{Extended_Pictographic}]*\s*\S/u;

/** Une ligne qui n'est faite que de mots-dièse n'apporte rien à lire. */
function estQueDesDieses(line) {
  const t = line.trim();
  return t.length > 0 && /^#/.test(t) && t.replace(/#\w+/g, '').trim().length === 0;
}

/** Formule explicitement reconnue comme promotionnelle. */
function estPromoFranche(line) {
  const t = line.trim();
  if (!t) return false;
  if (estQueDesDieses(t)) return true;
  return PROMO.some((re) => re.test(t));
}

/** Ligne qui *pourrait* appartenir au bloc promotionnel de fin. */
function estPromoProbable(line) {
  const t = line.trim();
  if (!t) return true;
  return estPromoFranche(t) || COMMENCE_PAR_PICTO.test(t);
}

function estPromo(line) {
  return estPromoFranche(line);
}

/**
 * Nettoie une description YouTube : retire le titre répété en tête, puis la
 * queue promotionnelle. Le nettoyage ne mord que sur la FIN du texte — on
 * remonte tant qu'on rencontre des lignes promotionnelles ou vides — pour ne
 * jamais supprimer un lien cité au milieu d'un propos éditorial.
 */
export function cleanDescription(desc = '', title = '') {
  const norm = (x) => x.replace(/\s+/g, ' ').trim().toLowerCase();
  const lines = String(desc).replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && (!lines[0].trim() || norm(lines[0]) === norm(title))) lines.shift();

  // Retrait du bloc promotionnel de fin. On remonte tant que les lignes
  // *pourraient* en faire partie (formule reconnue, ou ligne ouverte par un
  // pictogramme), puis on ne coupe que si ce bloc contient au moins une formule
  // franchement promotionnelle. Un paragraphe éditorial qui commencerait par un
  // drapeau, seul en fin de texte, est ainsi préservé.
  let debutBloc = lines.length;
  while (debutBloc > 0 && estPromoProbable(lines[debutBloc - 1])) debutBloc--;
  if (debutBloc < lines.length && lines.slice(debutBloc).some(estPromoFranche)) {
    lines.length = debutBloc;
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  // Sécurité : si le nettoyage a tout emporté (description entièrement
  // promotionnelle), mieux vaut garder le texte d'origine que rien du tout.
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return out || String(desc).trim();
}

/**
 * Extrait lisible d'une description YouTube : on écarte les lignes de
 * chapitrage (timecodes), les hashtags, les appels à l'abonnement et les liens
 * bruts, pour ne garder que le texte rédactionnel.
 */
export function excerpt(desc = '', max = 260) {
  const noise = [
    /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\b/,          // 00:00 Introduction
    /^\s*#[^\s]/,                                  // #Israel #Actualite
    /^\s*(?:https?:\/\/|www\.)/i,                  // lien seul
    /abonn|s'inscrire|subscribe|retrouvez-nous|suivez-nous/i,
    /^\s*[-–—=_*•]{3,}\s*$/,                        // séparateurs
    /^[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u, // ligne ouverte par un pictogramme
  ];
  const keep = String(desc)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !noise.some((re) => re.test(l)));
  return truncate(keep.join(' '), max);
}

/**
 * Remet en forme les titres écrits TOUT EN MAJUSCULES : minuscules partout,
 * majuscule à la première lettre, et noms propres rétablis d'après le
 * dictionnaire de la configuration. Les titres déjà correctement casés
 * (« L'invité de William Zerbib ») sont laissés intacts.
 */
export function smartTitle(title = '', properNouns = []) {
  const raw = String(title);
  const letters = raw.match(/\p{L}/gu) || [];
  if (letters.length <= 2) return raw;
  const uppers = raw.match(/\p{Lu}/gu) || [];
  if (uppers.length / letters.length < 0.7) return raw; // déjà bien écrit

  const dict = new Map(properNouns.map((n) => [n.toLocaleLowerCase('fr'), n]));
  let out = raw.toLocaleLowerCase('fr');

  // Noms propres composés d'abord (« Jo Hanna »), puis les mots simples.
  for (const [key, value] of [...dict].sort((a, b) => b[0].length - a[0].length)) {
    if (!key.includes(' ')) continue;
    out = out.replace(new RegExp(`(^|[^\\p{L}])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'giu'),
      (m, pre) => `${pre}${value}`);
  }
  out = out.replace(/\p{L}[\p{L}\p{M}-]*/gu, (word) => dict.get(word.toLocaleLowerCase('fr')) || word);

  // Majuscule initiale (uniquement si le titre commence par une lettre).
  return out.replace(/^\p{L}/u, (c) => c.toLocaleUpperCase('fr'));
}

/**
 * Rend lisible un titre écrit avec des caractères décoratifs Unicode.
 *
 * Certains titres YouTube utilisent le « faux gras » mathématique
 * (𝗟'𝗮𝗳𝗳𝗮𝗶𝗿𝗲 au lieu de L'affaire), des lettres pleine chasse ou entourées.
 * L'œil humain lit sans peine ; les moteurs de recherche, non : pour eux
 * « 𝗚𝗮𝘇𝗮 » et « Gaza » sont deux chaînes sans rapport, et le titre devient
 * introuvable. La normalisation NFKC ramène ces variantes à leurs lettres
 * ordinaires. On ne l'applique qu'aux titres concernés, pour ne pas toucher
 * inutilement à tout le catalogue.
 */
const DECORATIF = /[\u{1D400}-\u{1D7FF}\u{FF01}-\u{FF5E}\u{2460}-\u{24FF}\u{1F110}-\u{1F189}\u{2100}-\u{214F}]/u;

export function titreDecoratif(titre = '') {
  return DECORATIF.test(String(titre));
}

export function titreLisible(titre = '') {
  const s = String(titre);
  if (!DECORATIF.test(s)) return s;
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim();
}
