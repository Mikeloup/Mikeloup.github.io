// -----------------------------------------------------------------------------
// Gabarits HTML du site. Aucune dépendance réseau ici : on reçoit des données
// déjà normalisées et on renvoie des chaînes HTML.
// -----------------------------------------------------------------------------

import {
  escapeHtml, formatDate, formatDuration, formatCount, truncate, descriptionToHtml,
} from './util.mjs';

const YT_THUMB = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// --- Briques réutilisables ---------------------------------------------------

export function videoCard(video, { showCategory = true, eager = false } = {}) {
  const cat = showCategory && video.playlists?.[0];
  return `
<article class="card">
  <a class="card-thumb" href="/video/${video.id}/" aria-label="${escapeHtml(video.title)}">
    <img src="${escapeHtml(video.thumbnail || YT_THUMB(video.id))}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async" width="480" height="270">
    ${video.duration ? `<span class="badge-duration">${formatDuration(video.duration)}</span>` : ''}
    <span class="card-play" aria-hidden="true"></span>
  </a>
  <div class="card-body">
    ${cat ? `<a class="card-cat" href="/emissions/${cat.slug}/">${escapeHtml(cat.title)}</a>` : ''}
    <h3 class="card-title"><a href="/video/${video.id}/">${escapeHtml(video.title)}</a></h3>
    <p class="card-meta">
      <time datetime="${video.publishedAt || ''}">${formatDate(video.publishedAt)}</time>
      ${video.views ? `<span class="dot">·</span><span>${formatCount(video.views)} vues</span>` : ''}
    </p>
  </div>
</article>`;
}

function grid(videos, opts = {}) {
  if (!videos.length) return '<p class="empty">Aucune vidéo dans cette rubrique pour le moment.</p>';
  return `<div class="grid">${videos.map((v, i) => videoCard(v, { ...opts, eager: i < 4 })).join('')}</div>`;
}

function row(title, href, videos) {
  if (!videos.length) return '';
  return `
<section class="row">
  <div class="row-head">
    <h2 class="row-title"><a href="${href}">${escapeHtml(title)}</a></h2>
    <a class="row-more" href="${href}">Tout voir <span aria-hidden="true">→</span></a>
  </div>
  ${grid(videos, { showCategory: false })}
</section>`;
}

function hero(video, category) {
  if (!video) return '';
  return `
<section class="hero">
  <a class="hero-media" href="/video/${video.id}/">
    <img src="${escapeHtml(video.thumbnail || YT_THUMB(video.id))}" alt="" fetchpriority="high" decoding="async" width="1280" height="720">
    <span class="hero-play" aria-hidden="true"></span>
  </a>
  <div class="hero-body">
    <p class="kicker"><span class="live-dot" aria-hidden="true"></span>Dernière publication${category ? ` · <a href="/emissions/${category.slug}/">${escapeHtml(category.title)}</a>` : ''}</p>
    <h1 class="hero-title"><a href="/video/${video.id}/">${escapeHtml(video.title)}</a></h1>
    <p class="hero-desc">${escapeHtml(truncate(video.description, 260))}</p>
    <p class="hero-meta">
      <time datetime="${video.publishedAt || ''}">${formatDate(video.publishedAt)}</time>
      ${video.duration ? `<span class="dot">·</span>${formatDuration(video.duration)}` : ''}
      ${video.views ? `<span class="dot">·</span>${formatCount(video.views)} vues` : ''}
    </p>
    <a class="btn btn-primary" href="/video/${video.id}/">Regarder</a>
  </div>
</section>`;
}

function pagination(baseHref, page, totalPages) {
  if (totalPages <= 1) return '';
  const href = (p) => (p === 1 ? baseHref : `${baseHref}page/${p}/`);
  const nums = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      nums.push(p === page
        ? `<span class="page current" aria-current="page">${p}</span>`
        : `<a class="page" href="${href(p)}">${p}</a>`);
    } else if (nums[nums.length - 1] !== '<span class="page gap">…</span>') {
      nums.push('<span class="page gap">…</span>');
    }
  }
  return `
<nav class="pagination" aria-label="Pagination">
  ${page > 1 ? `<a class="page nav" href="${href(page - 1)}" rel="prev">← Précédent</a>` : ''}
  ${nums.join('')}
  ${page < totalPages ? `<a class="page nav" href="${href(page + 1)}" rel="next">Suivant →</a>` : ''}
</nav>`;
}

// --- Enveloppe ---------------------------------------------------------------

export function layout({
  config, categories, title, description, canonical, image, bodyClass = '',
  content, jsonLd = null, buildTime,
}) {
  const fullTitle = title === config.siteName ? `${config.siteName} — ${config.tagline}` : `${title} | ${config.siteName}`;
  const url = config.siteUrl.replace(/\/$/, '') + canonical;
  const navCats = categories.slice(0, 7);
  const analytics = [
    config.analytics?.plausibleDomain
      ? `<script defer data-domain="${escapeHtml(config.analytics.plausibleDomain)}" src="https://plausible.io/js/script.js"></script>`
      : '',
    config.analytics?.gaMeasurementId
      ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(config.analytics.gaMeasurementId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${escapeHtml(config.analytics.gaMeasurementId)}');</script>`
      : '',
  ].join('');

  return `<!doctype html>
<html lang="${config.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(truncate(description, 300))}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(config.siteName)}">
<meta property="og:locale" content="${config.locale}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(truncate(description, 300))}">
<meta property="og:url" content="${escapeHtml(url)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://i.ytimg.com" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.siteName)}" href="/rss.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/style.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
${analytics}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Aller au contenu</a>

<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true">T</span>
      <span class="brand-text"><strong>TANDEM</strong><span>TV</span></span>
    </a>

    <nav class="utility" aria-label="Pages du site">
      <a href="/revue-de-presse/">Revue de presse</a>
      <a href="/partenaires/">Partenaires</a>
      <a href="/a-propos/">À propos</a>
      <a href="/contact/">Contact</a>
    </nav>

    <form class="search" action="/recherche/" method="get" role="search">
      <input type="search" name="q" placeholder="Rechercher une vidéo…" aria-label="Rechercher une vidéo">
      <button type="submit" aria-label="Lancer la recherche">⌕</button>
    </form>

    <a class="btn btn-yt" href="${escapeHtml(config.channelUrl)}" target="_blank" rel="noopener">S'abonner</a>

    <button class="burger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button>
  </div>

  <nav class="nav" id="nav" aria-label="Émissions">
    <div class="wrap nav-inner">
      <a href="/">Accueil</a>
      ${navCats.map((c) => `<a href="/emissions/${c.slug}/">${escapeHtml(c.title)}</a>`).join('')}
      <a href="/emissions/">Toutes les émissions</a>
      <span class="nav-only-mobile-sep" aria-hidden="true"></span>
      <a class="nav-alt" href="/revue-de-presse/">Revue de presse</a>
      <a class="nav-alt" href="/partenaires/">Partenaires</a>
      <a class="nav-alt" href="/a-propos/">À propos</a>
      <a class="nav-alt" href="/contact/">Contact</a>
    </div>
  </nav>
</header>

<main id="main">
${content}
</main>

<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-col">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">T</span>
        <span class="brand-text"><strong>TANDEM</strong><span>TV</span></span>
      </a>
      <p class="muted">${escapeHtml(config.tagline)}</p>
      <p class="muted small">Toutes les vidéos sont publiées sur <a href="${escapeHtml(config.channelUrl)}" target="_blank" rel="noopener">la chaîne YouTube Tandem TV</a>.</p>
    </div>
    <div class="footer-col">
      <h4>Émissions</h4>
      <ul>${categories.slice(0, 8).map((c) => `<li><a href="/emissions/${c.slug}/">${escapeHtml(c.title)}</a></li>`).join('')}</ul>
    </div>
    <div class="footer-col">
      <h4>Le site</h4>
      <ul>
        <li><a href="/a-propos/">À propos</a></li>
        <li><a href="/partenaires/">Partenaires</a></li>
        <li><a href="/revue-de-presse/">Revue de presse</a></li>
        <li><a href="/contact/">Contact</a></li>
        <li><a href="/rss.xml">Flux RSS</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <p class="muted small">© ${new Date(buildTime).getUTCFullYear()} ${escapeHtml(config.siteName)} — Tous droits réservés.</p>
    <p class="muted small">Site mis à jour automatiquement · dernière synchronisation le ${formatDate(buildTime)}</p>
  </div>
</footer>

<script src="/assets/app.js" defer></script>
</body>
</html>`;
}

// --- Pages -------------------------------------------------------------------

export function homePage({ config, categories, latest, buildTime }) {
  const featured = latest[0];
  const featuredCat = featured?.playlists?.[0];
  const rest = latest.slice(1, config.home.latestCount + 1);

  const rows = categories
    .filter((c) => c.videos.length)
    .map((c) => row(c.title, `/emissions/${c.slug}/`, c.videos.slice(0, config.home.rowSize)))
    .join('');

  const content = `
<div class="wrap">
  ${hero(featured, featuredCat)}

  <section class="row">
    <div class="row-head">
      <h2 class="row-title"><a href="/emissions/">Dernières vidéos</a></h2>
      <a class="row-more" href="/emissions/">Tout voir <span aria-hidden="true">→</span></a>
    </div>
    ${grid(rest)}
  </section>

  <section class="cats">
    <h2 class="row-title">Nos rubriques</h2>
    <div class="cat-chips">
      ${categories.map((c) => `<a class="chip" href="/emissions/${c.slug}/">${escapeHtml(c.title)} <span>${c.videos.length}</span></a>`).join('')}
    </div>
  </section>

  ${rows}
</div>`;

  return layout({
    config, categories, buildTime,
    title: config.siteName,
    description: config.description,
    canonical: '/',
    image: featured?.thumbnail,
    bodyClass: 'page-home',
    content,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: config.siteName,
      url: config.siteUrl,
      inLanguage: config.lang,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${config.siteUrl}/recherche/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  });
}

export function categoryPage({ config, categories, category, videos, page, totalPages, buildTime }) {
  const base = `/emissions/${category.slug}/`;
  const content = `
<div class="wrap">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <a href="/emissions/">Émissions</a> <span>›</span> <span>${escapeHtml(category.title)}</span></nav>
  <header class="page-head">
    <p class="kicker">Émission</p>
    <h1>${escapeHtml(category.title)}</h1>
    ${category.description ? `<p class="lede">${escapeHtml(truncate(category.description, 400))}</p>` : ''}
    <p class="muted small">${category.videos.length} vidéo${category.videos.length > 1 ? 's' : ''}${page > 1 ? ` · page ${page} sur ${totalPages}` : ''}</p>
  </header>
  ${grid(videos, { showCategory: false })}
  ${pagination(base, page, totalPages)}
</div>`;

  return layout({
    config, categories, buildTime,
    title: page > 1 ? `${category.title} — page ${page}` : category.title,
    description: category.description || `Toutes les vidéos de l'émission ${category.title} sur ${config.siteName}.`,
    canonical: page > 1 ? `${base}page/${page}/` : base,
    image: category.thumbnail || videos[0]?.thumbnail,
    bodyClass: 'page-category',
    content,
  });
}

export function allCategoriesPage({ config, categories, videos, page, totalPages, buildTime }) {
  const content = `
<div class="wrap">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>Émissions</span></nav>
  <header class="page-head">
    <p class="kicker">Catalogue</p>
    <h1>Toutes les émissions</h1>
    <div class="cat-chips">
      ${categories.map((c) => `<a class="chip" href="/emissions/${c.slug}/">${escapeHtml(c.title)} <span>${c.videos.length}</span></a>`).join('')}
    </div>
  </header>
  <h2 class="row-title">Toutes les vidéos</h2>
  ${grid(videos)}
  ${pagination('/emissions/', page, totalPages)}
</div>`;

  return layout({
    config, categories, buildTime,
    title: page > 1 ? `Toutes les émissions — page ${page}` : 'Toutes les émissions',
    description: `L'intégralité des émissions et vidéos de ${config.siteName}, classées par rubrique.`,
    canonical: page > 1 ? `/emissions/page/${page}/` : '/emissions/',
    bodyClass: 'page-all',
    content,
  });
}

export function videoPage({ config, categories, video, related, buildTime }) {
  const cat = video.playlists?.[0];
  const desc = descriptionToHtml(video.description, video.id);

  const content = `
<div class="wrap">
  <nav class="breadcrumb">
    <a href="/">Accueil</a> <span>›</span>
    ${cat ? `<a href="/emissions/${cat.slug}/">${escapeHtml(cat.title)}</a> <span>›</span>` : ''}
    <span>${escapeHtml(truncate(video.title, 70))}</span>
  </nav>

  <article class="article">
    <header class="article-head">
      ${cat ? `<a class="kicker link" href="/emissions/${cat.slug}/">${escapeHtml(cat.title)}</a>` : ''}
      <h1>${escapeHtml(video.title)}</h1>
      <p class="article-meta">
        <time datetime="${video.publishedAt || ''}">${formatDate(video.publishedAt)}</time>
        ${video.duration ? `<span class="dot">·</span>${formatDuration(video.duration)}` : ''}
        ${video.views ? `<span class="dot">·</span>${formatCount(video.views)} vues` : ''}
      </p>
    </header>

    <div class="player" data-video="${video.id}" data-title="${escapeHtml(video.title)}">
      <img class="player-poster" src="${escapeHtml(video.thumbnail || YT_THUMB(video.id))}" alt="${escapeHtml(video.title)}" fetchpriority="high" width="1280" height="720">
      <button class="player-btn" type="button" aria-label="Lire la vidéo"></button>
      <noscript><a class="btn btn-primary" href="https://www.youtube.com/watch?v=${video.id}" target="_blank" rel="noopener">Voir sur YouTube</a></noscript>
    </div>

    <div class="share">
      <span class="muted small">Partager :</span>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${config.siteUrl}/video/${video.id}/`)}" target="_blank" rel="noopener">Facebook</a>
      <a href="https://x.com/intent/tweet?url=${encodeURIComponent(`${config.siteUrl}/video/${video.id}/`)}&text=${encodeURIComponent(video.title)}" target="_blank" rel="noopener">X</a>
      <a href="https://wa.me/?text=${encodeURIComponent(`${video.title} ${config.siteUrl}/video/${video.id}/`)}" target="_blank" rel="noopener">WhatsApp</a>
      <a href="mailto:?subject=${encodeURIComponent(video.title)}&body=${encodeURIComponent(`${config.siteUrl}/video/${video.id}/`)}">E-mail</a>
      <a class="right" href="https://www.youtube.com/watch?v=${video.id}" target="_blank" rel="noopener">Voir sur YouTube ↗</a>
    </div>

    ${desc ? `<div class="prose article-body">${desc}</div>` : ''}

    ${video.playlists?.length > 1 ? `<p class="tags">Aussi dans : ${video.playlists.slice(1).map((p) => `<a class="chip small" href="/emissions/${p.slug}/">${escapeHtml(p.title)}</a>`).join(' ')}</p>` : ''}
  </article>

  ${related.length ? `
  <section class="row">
    <div class="row-head">
      <h2 class="row-title">${cat ? `Autres vidéos — ${escapeHtml(cat.title)}` : 'À voir aussi'}</h2>
      ${cat ? `<a class="row-more" href="/emissions/${cat.slug}/">Tout voir <span aria-hidden="true">→</span></a>` : ''}
    </div>
    ${grid(related, { showCategory: false })}
  </section>` : ''}
</div>`;

  return layout({
    config, categories, buildTime,
    title: video.title,
    description: truncate(video.description || video.title, 300),
    canonical: `/video/${video.id}/`,
    image: video.thumbnail || YT_THUMB(video.id),
    bodyClass: 'page-video',
    content,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: video.title,
      description: truncate(video.description || video.title, 900),
      thumbnailUrl: [video.thumbnail || YT_THUMB(video.id)],
      uploadDate: video.publishedAt,
      duration: video.duration ? `PT${Math.floor(video.duration / 60)}M${video.duration % 60}S` : undefined,
      embedUrl: `https://www.youtube.com/embed/${video.id}`,
      url: `${config.siteUrl}/video/${video.id}/`,
      publisher: { '@type': 'Organization', name: config.siteName, url: config.siteUrl },
      inLanguage: config.lang,
    },
  });
}

export function contentPage({ config, categories, title, description, canonical, html, buildTime }) {
  const content = `
<div class="wrap narrow">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>${escapeHtml(title)}</span></nav>
  <article class="prose page-prose">
    ${html}
  </article>
</div>`;
  return layout({
    config, categories, buildTime, title, description, canonical,
    bodyClass: 'page-content', content,
  });
}

export function searchPage({ config, categories, buildTime }) {
  const content = `
<div class="wrap">
  <header class="page-head">
    <p class="kicker">Recherche</p>
    <h1>Rechercher une vidéo</h1>
    <form class="search-big" action="/recherche/" method="get" role="search">
      <input type="search" id="q" name="q" placeholder="Un invité, un sujet, un mot-clé…" aria-label="Rechercher" autofocus>
      <button type="submit">Rechercher</button>
    </form>
    <p class="muted small" id="search-count"></p>
  </header>
  <div id="search-results" class="grid"></div>
  <p class="empty" id="search-empty" hidden>Aucun résultat. Essayez un autre mot-clé.</p>
</div>`;
  return layout({
    config, categories, buildTime,
    title: 'Recherche',
    description: `Rechercher parmi toutes les vidéos de ${config.siteName}.`,
    canonical: '/recherche/',
    bodyClass: 'page-search',
    content,
  });
}

export function notFoundPage({ config, categories, buildTime }) {
  const content = `
<div class="wrap narrow">
  <header class="page-head center">
    <p class="kicker">Erreur 404</p>
    <h1>Cette page n'existe pas (ou plus)</h1>
    <p class="lede">La vidéo a peut-être été retirée, ou le lien est incorrect.</p>
    <p><a class="btn btn-primary" href="/">Retour à l'accueil</a> <a class="btn" href="/emissions/">Voir toutes les émissions</a></p>
  </header>
</div>`;
  return layout({
    config, categories, buildTime,
    title: 'Page introuvable',
    description: 'Page introuvable.',
    canonical: '/404.html',
    bodyClass: 'page-404',
    content,
  });
}
