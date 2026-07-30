// -----------------------------------------------------------------------------
// Mini-convertisseur Markdown → HTML (sans aucune dépendance externe).
// Couvre ce dont les pages éditoriales ont besoin : titres, paragraphes, listes,
// tableaux, citations, séparateurs, liens, gras/italique, code, images.
// -----------------------------------------------------------------------------

import { escapeHtml } from './util.mjs';

function inline(text) {
  let s = escapeHtml(text);

  // code `...`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // images ![alt](src)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_, alt, src, title) => `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">`);
  // liens [texte](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//.test(href) && !href.includes('tandemtv.net');
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  // gras puis italique
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|\s)_([^_\n]+)_/g, '$1<em>$2</em>');
  // retour à la ligne forcé (deux espaces en fin de ligne)
  s = s.replace(/ {2}\n/g, '<br>\n');
  return s;
}

function tableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

export function markdownToHtml(md) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join('\n'))}</p>`);
    buf.length = 0;
  };
  const para = [];

  while (i < lines.length) {
    const line = lines[i];

    // Commentaires HTML : conservés tels quels (invisibles pour le lecteur).
    if (/^\s*<!--/.test(line)) {
      flushParagraph(para);
      const block = [];
      while (i < lines.length) {
        block.push(lines[i]);
        if (/-->/.test(lines[i])) { i += 1; break; }
        i += 1;
      }
      out.push(block.join('\n'));
      continue;
    }

    // Ligne vide
    if (!line.trim()) { flushParagraph(para); i += 1; continue; }

    // Séparateur
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph(para); out.push('<hr>'); i += 1; continue;
    }

    // Titre
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushParagraph(para);
      out.push(`<h${h[1].length}>${inline(h[2].trim())}</h${h[1].length}>`);
      i += 1; continue;
    }

    // Tableau
    if (line.includes('|') && /^\s*\|?[\s:-]*\|[\s|:-]*$/.test(lines[i + 1] || '')) {
      flushParagraph(para);
      const head = tableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(tableRow(lines[i])); i += 1;
      }
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    // Citation
    if (/^\s*>\s?/.test(line)) {
      flushParagraph(para);
      const block = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        block.push(lines[i].replace(/^\s*>\s?/, '')); i += 1;
      }
      out.push(`<blockquote>${markdownToHtml(block.join('\n'))}</blockquote>`);
      continue;
    }

    // Listes
    const bullet = /^\s*[-*+]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      flushParagraph(para);
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(re.exec(lines[i])[1]); i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }

    para.push(line.trim());
    i += 1;
  }
  flushParagraph(para);
  return out.join('\n');
}

export default { markdownToHtml };
