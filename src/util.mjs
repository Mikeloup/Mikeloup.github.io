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
export function cleanDescription(desc = '', title = '') {
  const norm = (x) => x.replace(/\s+/g, ' ').trim().toLowerCase();
  const lines = String(desc).replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && (!lines[0].trim() || norm(lines[0]) === norm(title))) lines.shift();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
