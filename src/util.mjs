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
