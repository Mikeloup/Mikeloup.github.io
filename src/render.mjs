// -----------------------------------------------------------------------------
// Gabarits HTML du site. Aucune dépendance réseau ici : on reçoit des données
// déjà normalisées et on renvoie des chaînes HTML.
// -----------------------------------------------------------------------------

import {
  escapeHtml, formatDate, formatDateTime, formatDuration, formatCount, formatNumber, truncate,
  excerpt, descriptionToHtml, extractChapters, removeChapterLines,
} from './util.mjs';

const YT_THUMB = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// --- Briques réutilisables ---------------------------------------------------

/** Une vidéo publiée depuis moins de `hours` heures mérite d'attirer l'œil. */
export function isFresh(video, hours = 48) {
  if (!video?.publishedAt) return false;
  return (Date.now() - new Date(video.publishedAt).getTime()) < hours * 3600 * 1000;
}

export function videoCard(video, { showCategory = true, eager = false, lead = false } = {}) {
  const cat = showCategory && video.playlists?.[0];
  return `
<article class="card${lead ? ' card--lead' : ''}" data-video-id="${escapeHtml(video.id)}">
  <a class="card-thumb" href="/video/${video.id}/" aria-label="${escapeHtml(video.title)}">
    <img src="${escapeHtml(video.thumbnail || YT_THUMB(video.id))}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" width="480" height="270">
    ${isFresh(video) ? '<span class="badge-new">Nouveau</span>' : ''}
    ${video.duration ? `<span class="badge-duration">${formatDuration(video.duration)}</span>` : ''}
    <span class="card-progress" hidden><span></span></span>
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
  const { lead = false, ...cardOpts } = opts;
  const cls = lead && videos.length > 2 ? 'grid grid-lead' : 'grid';
  return `<div class="${cls}">${videos.map((v, i) => videoCard(v, {
    ...cardOpts, eager: i < 4, lead: lead && i === 0 && videos.length > 2,
  })).join('')}</div>`;
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

function hero(video, category, { pinned = false } = {}) {
  if (!video) return '';
  return `
<section class="hero">
  <a class="hero-media" href="/video/${video.id}/">
    <img src="${escapeHtml(video.thumbnail || YT_THUMB(video.id))}" alt="" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" width="1280" height="720">
    <span class="hero-play" aria-hidden="true"></span>
  </a>
  <div class="hero-body">
    <p class="kicker"><span class="live-dot" aria-hidden="true"></span>${pinned ? 'À la une' : 'Dernière publication'}${category ? ` · <a href="/emissions/${category.slug}/">${escapeHtml(category.title)}</a>` : ''}</p>
    <h1 class="hero-title"><a href="/video/${video.id}/">${escapeHtml(video.title)}</a></h1>
    <p class="hero-desc">${escapeHtml(excerpt(video.description, 260))}</p>
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

function menuPanel(id, label, items, allHref, allLabel) {
  if (!items.length) return `<a href="${allHref}">${escapeHtml(label)}</a>`;
  return `
      <div class="menu">
        <button class="menu-btn" type="button" aria-expanded="false" aria-controls="${id}">
          ${escapeHtml(label)} <span class="caret" aria-hidden="true"></span>
        </button>
        <div class="menu-panel" id="${id}" hidden>
          <div class="wrap menu-panel-inner">
            <div class="menu-grid">
              ${items.map((c) => `<a href="/emissions/${c.slug}/">${escapeHtml(c.title)} <span>${c.videos.length}</span></a>`).join('')}
            </div>
            <a class="menu-all" href="${allHref}">${escapeHtml(allLabel)} <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </div>`;
}

// Marques des réseaux, dessinées en SVG monochrome : aucun fichier à charger,
// aucune requête vers un serveur tiers, et la couleur suit celle du texte.
const SOCIAL_ICONS = {
  youtube: '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/>',
  facebook: '<path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z"/>',
  x: '<path d="M18.9 1.9h3.3l-7.2 8.3L23.5 22h-6.6l-5.2-6.8L5.8 22H2.5l7.7-8.8L2 1.9h6.8l4.7 6.2 5.4-6.2Zm-1.2 18.1h1.8L7.4 3.8H5.5L17.7 20Z"/>',
  instagram: '<path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38C1.35 2.68.93 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13.67.66 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.72 2.13-1.38.66-.67 1.08-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.72-1.46-1.38-2.13C21.32 1.35 20.65.93 19.86.63 19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32Zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7.85-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z"/>',
  telegram: '<path d="M23.9 3.5 20.3 20.4c-.27 1.2-.98 1.5-1.99.93l-5.5-4.05-2.65 2.55c-.29.29-.54.54-1.11.54l.4-5.6L19.6 5.57c.44-.4-.1-.61-.68-.22L6.32 13.16.9 11.47c-1.18-.37-1.2-1.18.25-1.75L22.37 1.5c.98-.36 1.84.22 1.53 2Z"/>',
  linkedin: '<path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13Zm1.78 13.02H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0Z"/>',
  tiktok: '<path d="M16.6 5.82a4.82 4.82 0 0 1-1.05-.91 4.7 4.7 0 0 1-1.13-2.66V2h-3.4v13.5a2.84 2.84 0 0 1-5.1 1.7 2.84 2.84 0 0 1 3.72-4.2V9.4a6.24 6.24 0 1 0 5.31 6.16V8.9a8.1 8.1 0 0 0 4.72 1.51V7.03a4.77 4.77 0 0 1-3.07-1.21Z"/>',
};

function socialIcon(key) {
  const d = SOCIAL_ICONS[key];
  if (!d) return '';
  return `<svg class="social-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false">${d}</svg>`;
}

const SOCIAL_ORDER = [
  ['youtube', 'YouTube'],
  ['facebook', 'Facebook'],
  ['x', 'X'],
  ['instagram', 'Instagram'],
  ['telegram', 'Telegram'],
  ['linkedin', 'LinkedIn'],
  ['tiktok', 'TikTok'],
];

/** Bandeau « Tandem TV, c'est aussi une chaîne de télévision ». */
function tvBanner(config) {
  const tv = config.tv;
  if (!tv?.enabled || !tv.channelNumber) return '';
  const lien = tv.url
    ? ` <a href="${escapeHtml(tv.url)}" target="_blank" rel="noopener">En savoir plus</a>`
    : '';
  return `
<aside class="tv-banner">
  <span class="tv-badge" aria-hidden="true">TV</span>
  <p>
    <strong>Tandem TV est une chaîne de télévision.</strong>
    Retrouvez-nous sur le <strong>canal ${escapeHtml(tv.channelNumber)}</strong>${tv.operator ? ` du bouquet <strong>${escapeHtml(tv.operator)}</strong>` : ''}${tv.schedule ? `, ${escapeHtml(tv.schedule)}` : ''}.${lien}
  </p>
</aside>`;
}

/**
 * Formulaire d'inscription à la lettre d'information.
 * Simple HTML qui poste chez Kit : aucun script tiers, aucune clé exposée,
 * et cela fonctionne même si le visiteur a désactivé JavaScript.
 */
function newsletterForm(config, { compact = false } = {}) {
  const n = config.newsletter;
  if (!n?.formId) return '';
  return `
<form class="newsletter${compact ? ' newsletter--compact' : ''}"
      action="https://app.kit.com/forms/${escapeHtml(n.formId)}/subscriptions"
      method="post" target="_blank">
  <div class="newsletter-text">
    <h2 class="newsletter-title">La lettre de Tandem TV</h2>
    <p>Les nouvelles vidéos dans votre boîte mail, dès leur mise en ligne. Rien d'autre, et vous pouvez vous désinscrire en un clic.</p>
  </div>
  <div class="newsletter-fields">
    <label class="visually-hidden" for="nl-email">Votre adresse e-mail</label>
    <input id="nl-email" type="email" name="email_address" required
           autocomplete="email" placeholder="votre@adresse.fr">
    <button class="btn btn-primary" type="submit">Je m'inscris</button>
  </div>
  <p class="newsletter-note muted small">Un message de confirmation vous sera envoyé : votre inscription ne devient effective qu'après y avoir répondu. Votre adresse ne sert qu'à cet envoi et n'est transmise à personne d'autre que notre prestataire d'expédition.</p>
</form>`;
}

/**
 * Corps HTML d'un envoi de la lettre d'information. Volontairement rustique :
 * tableaux et styles en ligne, parce que les logiciels de messagerie ignorent
 * une bonne partie du CSS moderne. Pas d'image de fond, pas de police externe.
 */
export function newsletterEmail(config, video, { intro = '' } = {}) {
  const url = `${config.siteUrl.replace(/\/$/, '')}/video/${video.id}/`;
  const emission = video.playlists?.[0]?.title || config.siteName;
  const resume = excerpt(video.description || '', 320);
  const thumb = video.thumbnail || YT_THUMB(video.id);
  const P = 'margin:0 0 16px;font-size:16px;line-height:1.55;color:#1a1a1a;';

  return `<div style="max-width:600px;margin:0 auto;padding:8px 16px;font-family:Georgia,'Times New Roman',serif;">
  <p style="margin:0 0 20px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#180058;">${escapeHtml(config.siteName)} · ${escapeHtml(emission)}</p>
  <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#180058;">
    <a href="${escapeHtml(url)}" style="color:#180058;text-decoration:none;">${escapeHtml(video.title)}</a>
  </h1>
  ${intro ? `<p style="${P}">${escapeHtml(intro)}</p>` : ''}
  <p style="margin:0 0 20px;">
    <a href="${escapeHtml(url)}"><img src="${escapeHtml(thumb)}" alt="" width="568" style="width:100%;max-width:568px;height:auto;display:block;border:0;border-radius:6px;"></a>
  </p>
  ${resume ? `<p style="${P}">${escapeHtml(resume)}</p>` : ''}
  <p style="margin:0 0 24px;">
    <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 26px;background:#180058;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-family:Helvetica,Arial,sans-serif;">Regarder la vidéo</a>
  </p>
  <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#555;">
    Vous recevez ce message parce que vous vous êtes inscrit à la lettre de ${escapeHtml(config.siteName)}.
    ${config.tv?.enabled && config.tv?.channelNumber ? `Retrouvez-nous aussi à la télévision, canal ${escapeHtml(config.tv.channelNumber)} d'${escapeHtml(config.tv.operator || '')}.` : ''}
  </p>
  <p style="margin:0;font-size:14px;color:#555;">
    <a href="${escapeHtml(config.siteUrl)}" style="color:#180058;">${escapeHtml(config.siteUrl.replace(/^https?:\/\//, ''))}</a>
  </p>
</div>`;
}


/**
 * Fil d'Ariane balisé pour Google. Il est déjà affiché sur les pages ; sans
 * cette fiche, le moteur ne le reconnaît pas comme tel et continue d'afficher
 * l'adresse brute sous le titre du résultat.
 */
function breadcrumbLd(config, items) {
  const base = config.siteUrl.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${base}${it.path}`,
    })),
  };
}

/** Liste de vidéos balisée : Google comprend qu'une page de rubrique est une collection. */
function itemListLd(config, videos, path) {
  const base = config.siteUrl.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: `${base}${path}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: videos.length,
      itemListElement: videos.map((v, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${base}/video/${v.id}/`,
        name: v.title,
      })),
    },
  };
}

export function layout({
  config, categories, nav = {}, title, description, canonical, image, ogType = 'website', bodyClass = '',
  content, jsonLd = null, buildTime, feed = null, robots = null,
}) {
  const fullTitle = title === config.siteName ? `${config.siteName} — ${config.tagline}` : `${title} | ${config.siteName}`;
  const url = config.siteUrl.replace(/\/$/, '') + canonical;
  const pages = config.pages || [];
  const navPages = pages.filter((pg) => !pg.footerOnly);
  const socialLinks = SOCIAL_ORDER
    .map(([key, label]) => [config.social?.[key], label, key])
    .filter(([href]) => href);
  const menuShows = nav.menuShows || [];
  const menuThemes = nav.menuThemes || [];
  const footerCats = (nav.shows || categories).slice(0, 7);
  const analytics = [
    config.analytics?.cloudflareToken
      ? `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${escapeHtml(config.analytics.cloudflareToken)}"}'></script>`
      : '',
    config.analytics?.plausibleDomain
      ? `<script defer data-domain="${escapeHtml(config.analytics.plausibleDomain)}" src="https://plausible.io/js/script.js"></script>`
      : '',
    config.analytics?.gaMeasurementId
      ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(config.analytics.gaMeasurementId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${escapeHtml(config.analytics.gaMeasurementId)}');</script>`
      : '',
  ].join('');

  const push = config.push?.oneSignalAppId
    ? `<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
<script>
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function (OneSignal) {
  await OneSignal.init({ appId: "${escapeHtml(config.push.oneSignalAppId)}" });
});
</script>`
    : '';

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: config.siteName,
    url: config.siteUrl.replace(/\/$/, '') + '/',
    logo: config.siteUrl.replace(/\/$/, '') + '/assets/logo.png',
    description: config.description,
    email: config.contactEmail || undefined,
    sameAs: socialLinks.map(([href]) => href),
  };

  return `<!doctype html>
<html lang="${config.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(truncate(description, 300))}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${escapeHtml(config.siteName)}">
<meta property="og:locale" content="${config.locale}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(truncate(description, 300))}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(image || `${config.siteUrl.replace(/\/$/, '')}/assets/logo.png`)}">
<meta name="twitter:card" content="summary_large_image">
${robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : ''}
<link rel="preconnect" href="https://i.ytimg.com" crossorigin>
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.siteName)}" href="/rss.xml">
${feed ? `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(feed.title)}" href="${escapeHtml(feed.href)}">` : ''}
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${escapeHtml(config.siteName)}">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/favicon.png">
<link rel="stylesheet" href="/assets/style.css">
${config.googleSiteVerification ? `<meta name="google-site-verification" content="${escapeHtml(config.googleSiteVerification)}">` : ''}
<script type="application/ld+json">${JSON.stringify(orgLd)}</script>
${(Array.isArray(jsonLd) ? jsonLd : [jsonLd]).filter(Boolean)
  .map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
${analytics}
${push}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Aller au contenu</a>

<div class="install-bar" id="install-bar" hidden>
  <div class="wrap install-bar-inner">
    <p>Installez Tandem TV sur votre écran d'accueil — les vidéos en un geste, et les alertes des nouvelles publications.</p>
    <span class="install-bar-actions">
      <button class="btn btn-primary" type="button" id="install-go">Installer</button>
      <a class="btn" href="/installer/">Comment faire</a>
      <button class="install-bar-close" type="button" id="install-close" aria-label="Masquer">×</button>
    </span>
  </div>
</div>

<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${escapeHtml(config.siteName)} — accueil">
      <img src="/assets/logo.png" alt="${escapeHtml(config.siteName)}" width="1000" height="500">
    </a>

    <nav class="utility" aria-label="Pages du site">
      ${navPages.map((pg) => `<a href="/${pg.slug}/">${escapeHtml(pg.title)}</a>`).join('')}
    </nav>

    <form class="search" id="site-search" action="/recherche/" method="get" role="search">
      <input type="search" name="q" placeholder="Rechercher une vidéo…" aria-label="Rechercher une vidéo">
      <button type="submit" aria-label="Lancer la recherche">⌕</button>
    </form>

    <a class="btn btn-yt" href="${escapeHtml(config.channelUrl)}" target="_blank" rel="noopener">
      <svg width="17" height="12" viewBox="0 0 24 17" aria-hidden="true" focusable="false"><path fill="currentColor" d="M23.5 2.7A3 3 0 0 0 21.4.6C19.5 0 12 0 12 0S4.5 0 2.6.6A3 3 0 0 0 .5 2.7C0 4.6 0 8.5 0 8.5s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8ZM9.6 12.1V4.9l6.3 3.6-6.3 3.6Z"/></svg>
      S'abonner sur YouTube
    </a>

    <button class="search-toggle" type="button" aria-label="Rechercher" aria-expanded="false" aria-controls="site-search">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm5.3 12.8L21 21"/></svg>
    </button>

    <button class="burger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button>
  </div>

  <nav class="nav" id="nav" aria-label="Rubriques">
    <div class="wrap nav-inner">
      <a href="/">Accueil</a>
      ${menuPanel('menu-emissions', config.groups?.shows?.label || 'Émissions', menuShows, '/emissions/', 'Voir toutes les émissions')}
      ${menuPanel('menu-themes', config.groups?.themes?.label || 'Thèmes', menuThemes, '/themes/', 'Voir tous les thèmes')}
      <a href="/emissions/">Tout le catalogue</a>
      <a class="nav-follow" href="/suivre/">Suivre</a>
      <span class="nav-only-mobile-sep" aria-hidden="true"></span>
      ${navPages.map((pg) => `<a class="nav-alt" href="/${pg.slug}/">${escapeHtml(pg.title)}</a>`).join('')}
    </div>
  </nav>
</header>

<main id="main">
${content}
</main>

<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-col">
      <a class="brand footer-logo" href="/" aria-label="${escapeHtml(config.siteName)} — accueil">
        <img src="/assets/logo.png" alt="${escapeHtml(config.siteName)}" width="1000" height="500">
      </a>
      <p class="muted">${escapeHtml(config.tagline)}</p>
      <p class="muted small">Toutes les vidéos sont publiées sur <a href="${escapeHtml(config.channelUrl)}" target="_blank" rel="noopener">la chaîne YouTube Tandem TV</a>.</p>
      ${config.tv?.enabled && config.tv.channelNumber ? `<p class="muted small tv-footer"><span class="tv-badge" aria-hidden="true">TV</span> Canal ${escapeHtml(config.tv.channelNumber)}${config.tv.operator ? ` du bouquet ${escapeHtml(config.tv.operator)}` : ''}</p>` : ''}
      ${socialLinks.length ? `<ul class="social" aria-label="Tandem TV sur les réseaux sociaux">
        ${socialLinks.map(([href, label, key]) => `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${socialIcon(key)}<span>${escapeHtml(label)}</span></a></li>`).join('')}
      </ul>` : ''}
    </div>
    <div class="footer-col">
      <h4>Émissions</h4>
      <ul>${footerCats.map((c) => `<li><a href="/emissions/${c.slug}/">${escapeHtml(c.title)}</a></li>`).join('')}
        <li><a href="/emissions/">Tout le catalogue</a></li></ul>
    </div>
    <div class="footer-col">
      <h4>Le site</h4>
      <ul>
        ${pages.map((pg) => `<li><a href="/${pg.slug}/">${escapeHtml(pg.title)}</a></li>`).join('')}
        <li><a href="/suivre/">Suivre Tandem TV</a></li>
        <li><a href="/installer/">Installer l'application</a></li>
        <li><a href="/sponsoring/">Sponsoring</a></li>
        <li><a href="/rss.xml">Flux RSS</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <p class="muted small">© ${new Date(buildTime).getUTCFullYear()} ${escapeHtml(config.siteName)} — Tous droits réservés.</p>
    <p class="muted small">Site mis à jour automatiquement · dernière synchronisation le ${formatDateTime(buildTime)}</p>
  </div>
</footer>

<script src="/assets/app.js" defer></script>
</body>
</html>`;
}

// --- Pages -------------------------------------------------------------------

function chips(items) {
  return `<div class="cat-chips">${items.map((c) => `<a class="chip" href="/emissions/${c.slug}/">${escapeHtml(c.title)} <span>${c.videos.length}</span></a>`).join('')}</div>`;
}

export function homePage({ config, categories, nav, latest, buildTime }) {
  const pinnedId = String(config.home?.featured || '').trim();
  const pinned = pinnedId ? latest.find((v) => v.id === pinnedId) : null;
  const featured = pinned || latest[0];
  const featuredCat = featured?.playlists?.[0];
  const rest = latest
    .filter((v) => v.id !== featured?.id)
    .slice(0, config.home?.latestCount ?? 8);
  const rowSize = config.home?.rowSize ?? 8;

  const themes = nav.themes || [];
  const shows = nav.shows || [];
  const themeRows = themes.slice(0, config.home?.themeRows ?? 3);
  const showRows = shows.slice(0, config.home?.showRows ?? 3);

  const content = `
<div class="wrap">
  ${hero(featured, featuredCat, { pinned: Boolean(pinned) })}

  ${tvBanner(config)}

  <section class="row">
    <div class="row-head">
      <h2 class="row-title"><a href="/emissions/">Dernières vidéos</a></h2>
      <a class="row-more" href="/emissions/">Tout le catalogue <span aria-hidden="true">→</span></a>
    </div>
    ${grid(rest, { lead: true })}
  </section>

  ${themes.length ? `
  <section class="cats">
    <div class="row-head">
      <h2 class="row-title"><a href="/themes/">${escapeHtml(config.groups?.themes?.label || 'Thèmes')}</a></h2>
      <a class="row-more" href="/themes/">Tous les thèmes <span aria-hidden="true">→</span></a>
    </div>
    ${chips(nav.menuThemes?.length ? nav.menuThemes : themes)}
  </section>` : ''}

  ${themeRows.map((c) => row(c.title, `/emissions/${c.slug}/`, c.videos.slice(0, rowSize))).join('')}

  ${shows.length ? `
  <section class="cats">
    <div class="row-head">
      <h2 class="row-title"><a href="/emissions/">${escapeHtml(config.groups?.shows?.label || 'Émissions')}</a></h2>
      <a class="row-more" href="/emissions/">Toutes les émissions <span aria-hidden="true">→</span></a>
    </div>
    ${chips((nav.menuShows?.length ? nav.menuShows : shows).slice(0, 24))}
  </section>` : ''}

  ${showRows.map((c) => row(c.title, `/emissions/${c.slug}/`, c.videos.slice(0, rowSize))).join('')}

  ${newsletterForm(config)}
</div>`;

  return layout({
    config, categories, nav, buildTime,
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

/** Page d'index d'une famille : /emissions/ (avec le catalogue) ou /themes/. */
export function groupIndexPage({
  config, categories, nav, group, items, videos, rows = [], page, totalPages, buildTime,
}) {
  const isShows = group === 'shows';
  const base = isShows ? '/emissions/' : '/themes/';
  const label = config.groups?.[group]?.label || (isShows ? 'Émissions' : 'Thèmes');
  const other = isShows
    ? { href: '/themes/', label: config.groups?.themes?.label || 'Thèmes' }
    : { href: '/emissions/', label: config.groups?.shows?.label || 'Émissions' };

  const content = `
<div class="wrap">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>${escapeHtml(label)}</span></nav>
  <header class="page-head">
    <p class="kicker">${isShows ? 'Nos rendez-vous' : 'Par sujet'}</p>
    <h1>${escapeHtml(label)}</h1>
    <p class="lede">${isShows
      ? "Chaque émission de la chaîne, avec son présentateur et son rythme de publication."
      : "Les grands sujets suivis par Tandem TV, toutes émissions confondues."}</p>
    ${chips(items)}
    <p class="muted small" style="margin-top:1.25rem">${items.length} rubrique${items.length > 1 ? 's' : ''} · Voir aussi <a href="${other.href}">${escapeHtml(other.label)}</a>.</p>
  </header>

  ${rows.map((c) => row(c.title, `/emissions/${c.slug}/`, c.videos.slice(0, 4))).join('')}

  ${videos ? `
  <div class="row-head">
    <h2 class="row-title">Toutes les vidéos</h2>
  </div>
  ${grid(videos)}
  ${pagination(base, page, totalPages)}` : ''}
</div>`;

  return layout({
    config, categories, nav, buildTime,
    title: page > 1 ? `${label} — page ${page}` : label,
    description: isShows
      ? `Toutes les émissions de ${config.siteName}, classées par rendez-vous.`
      : `Tous les thèmes suivis par ${config.siteName}.`,
    canonical: page > 1 ? `${base}page/${page}/` : base,
    bodyClass: 'page-group',
    content,
  });
}

export function categoryPage({ config, categories, nav, category, videos, page, totalPages, buildTime }) {
  const base = `/emissions/${category.slug}/`;
  const content = `
<div class="wrap">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <a href="${category.group === 'themes' ? '/themes/' : '/emissions/'}">${category.group === 'themes' ? escapeHtml(config.groups?.themes?.label || 'Thèmes') : escapeHtml(config.groups?.shows?.label || 'Émissions')}</a> <span>›</span> <span>${escapeHtml(category.title)}</span></nav>
  <header class="page-head">
    <p class="kicker">${category.group === 'themes' ? 'Thème' : 'Émission'}</p>
    <h1>${escapeHtml(category.title)}</h1>
    ${category.description ? `<p class="lede">${escapeHtml(truncate(category.description, 400))}</p>` : ''}
    <p class="muted small">${category.videos.length} vidéo${category.videos.length > 1 ? 's' : ''}${page > 1 ? ` · page ${page} sur ${totalPages}` : ''}
      <span class="dot">·</span> <a class="feed-link" href="${base}rss.xml">S'abonner au flux de cette rubrique</a></p>
  </header>
  ${grid(videos, { showCategory: false })}
  ${pagination(base, page, totalPages)}
</div>`;

  return layout({
    config, categories, nav, buildTime,
    feed: { title: `${config.siteName} — ${category.title}`, href: `${base}rss.xml` },
    jsonLd: [
      breadcrumbLd(config, [
        { name: 'Accueil', path: '/' },
        category.group === 'themes'
          ? { name: config.groups?.themes?.label || 'Thèmes', path: '/themes/' }
          : { name: config.groups?.shows?.label || 'Émissions', path: '/emissions/' },
        { name: category.title, path: base },
      ]),
      itemListLd(config, videos, page > 1 ? `${base}page/${page}/` : base),
    ],
    title: page > 1 ? `${category.title} — page ${page}` : category.title,
    description: category.description || `Toutes les vidéos de l'émission ${category.title} sur ${config.siteName}.`,
    canonical: page > 1 ? `${base}page/${page}/` : base,
    image: category.thumbnail || videos[0]?.thumbnail,
    bodyClass: 'page-category',
    content,
  });
}

export function videoPage({ config, categories, nav, video, related, buildTime }) {
  const cat = video.playlists?.[0];
  const chapters = extractChapters(video.description);
  const desc = descriptionToHtml(removeChapterLines(video.description, chapters), video.id);
  const summary = chapters.length ? `
    <nav class="chapters" aria-label="Sommaire de la vidéo">
      <h2 class="chapters-title">Au sommaire</h2>
      <ol class="chapters-list">
        ${chapters.map((ch) => `<li><a href="https://www.youtube.com/watch?v=${video.id}&amp;t=${ch.seconds}s" data-seek="${ch.seconds}"><span class="chapters-time">${escapeHtml(ch.time)}</span><span class="chapters-label">${escapeHtml(ch.label)}</span></a></li>`).join('')}
      </ol>
    </nav>` : '';

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

    <div class="resume-bar" id="resume-bar" hidden>
      <span class="resume-text">Vous aviez commencé cette vidéo.</span>
      <button class="btn btn-primary btn-sm" id="resume-btn" type="button">Reprendre à <span id="resume-time">0:00</span></button>
      <button class="btn btn-sm" id="resume-restart" type="button">Reprendre au début</button>
    </div>

    <div class="player" data-video="${video.id}" data-title="${escapeHtml(video.title)}"${related[0] ? ` data-next-id="${escapeHtml(related[0].id)}" data-next-title="${escapeHtml(related[0].title)}" data-next-thumb="${escapeHtml(related[0].thumbnail || YT_THUMB(related[0].id))}"` : ''}>
      <img class="player-poster" src="${escapeHtml(video.thumbnail || YT_THUMB(video.id))}" alt="${escapeHtml(video.title)}" fetchpriority="high" width="1280" height="720">
      <button class="player-btn" type="button" aria-label="Lire la vidéo"></button>
      <noscript>
        <iframe src="https://www.youtube-nocookie.com/embed/${video.id}?rel=0&amp;modestbranding=1&amp;hl=fr"
                title="${escapeHtml(video.title)}" width="1280" height="720" loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen></iframe>
      </noscript>
    </div>

    <div class="share">
      <button class="btn btn-primary share-native" id="share-native" type="button" hidden
              data-title="${escapeHtml(video.title)}"
              data-url="${escapeHtml(`${config.siteUrl}/video/${video.id}/`)}">Partager</button>
      <span class="muted small share-label">Partager :</span>
      <a class="share-net" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${config.siteUrl}/video/${video.id}/`)}" target="_blank" rel="noopener">Facebook</a>
      <a class="share-net" href="https://x.com/intent/tweet?url=${encodeURIComponent(`${config.siteUrl}/video/${video.id}/`)}&text=${encodeURIComponent(video.title)}" target="_blank" rel="noopener">X</a>
      <a class="share-net" href="https://wa.me/?text=${encodeURIComponent(`${video.title} ${config.siteUrl}/video/${video.id}/`)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="share-net" href="https://t.me/share/url?url=${encodeURIComponent(`${config.siteUrl}/video/${video.id}/`)}&text=${encodeURIComponent(video.title)}" target="_blank" rel="noopener">Telegram</a>
      <a class="share-net" href="mailto:?subject=${encodeURIComponent(video.title)}&body=${encodeURIComponent(`${config.siteUrl}/video/${video.id}/`)}">E-mail</a>
      <button class="share-time" id="share-at-time" type="button" hidden>Copier le lien à cet instant</button>
      <a class="right" href="https://www.youtube.com/watch?v=${video.id}" target="_blank" rel="noopener">Voir sur YouTube ↗</a>
    </div>

    <aside class="react">
      <h2 class="react-title">Réagir</h2>
      <p class="muted small">Les échanges se passent sur la chaîne : c'est là que la rédaction lit et répond.</p>
      <div class="react-actions">
        <a class="btn btn-yt" href="https://www.youtube.com/watch?v=${video.id}" target="_blank" rel="noopener">Commenter sur YouTube</a>
        <a class="btn" href="/contact/">Proposer un sujet ou un invité</a>
      </div>
    </aside>

    ${summary}

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
    config, categories, nav, buildTime,
    title: video.title,
    description: excerpt(video.description, 300) || video.title,
    canonical: `/video/${video.id}/`,
    image: video.thumbnail || YT_THUMB(video.id),
    ogType: 'video.other',
    bodyClass: 'page-video',
    content,
    jsonLd: [breadcrumbLd(config, [
      { name: 'Accueil', path: '/' },
      ...(video.playlists?.[0]
        ? [{ name: video.playlists[0].title, path: `/emissions/${video.playlists[0].slug}/` }]
        : []),
      { name: video.title, path: `/video/${video.id}/` },
    ]), {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: video.title,
      description: excerpt(video.description, 900) || video.title,
      thumbnailUrl: [video.thumbnail || YT_THUMB(video.id)],
      uploadDate: video.publishedAt,
      duration: video.duration ? `PT${Math.floor(video.duration / 60)}M${video.duration % 60}S` : undefined,
      embedUrl: `https://www.youtube.com/embed/${video.id}`,
      url: `${config.siteUrl}/video/${video.id}/`,
      publisher: { '@type': 'Organization', name: config.siteName, url: config.siteUrl },
      inLanguage: config.lang,
      isFamilyFriendly: true,
      ...(video.views ? {
        interactionStatistic: {
          '@type': 'InteractionCounter',
          interactionType: { '@type': 'WatchAction' },
          userInteractionCount: video.views,
        },
      } : {}),
      // « Moments clés » : Google peut afficher les chapitres directement
      // sous le résultat de recherche, avec un lien vers chaque séquence.
      ...(chapters.length ? {
        hasPart: chapters.map((ch, i) => ({
          '@type': 'Clip',
          name: ch.label,
          startOffset: ch.seconds,
          ...(chapters[i + 1] ? { endOffset: chapters[i + 1].seconds }
            : (video.duration ? { endOffset: video.duration } : {})),
          url: `${config.siteUrl}/video/${video.id}/?t=${ch.seconds}`,
        })),
      } : {}),
    }],
  });
}

export function followPage({ config, categories, nav, buildTime }) {
  const socials = SOCIAL_ORDER
    .filter(([key]) => key !== 'youtube')
    .map(([key, label]) => [config.social?.[key], label, key])
    .filter(([href]) => href);

  const content = `
<div class="wrap narrow">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>Suivre</span></nav>

  <header class="page-head">
    <p class="kicker">Ne rien manquer</p>
    <h1>Suivre Tandem TV</h1>
    <p class="lede">Plusieurs façons de rester au courant de nos publications. Choisissez celle qui vous convient — elles fonctionnent toutes ensemble.</p>
  </header>

  ${config.newsletter?.formId ? `
  <section class="follow-card follow-card--first">
    ${newsletterForm(config, { compact: true })}
    <p class="muted small">Fonctionne partout, y compris sur iPhone · un envoi par nouvelle vidéo</p>
  </section>` : ''}

  <section class="follow-card">
    <h2>La chaîne YouTube</h2>
    <p>C'est là que tout est publié en premier. S'abonner à la chaîne vous place dans le fil d'accueil de YouTube et vous donne accès aux commentaires et aux directs.</p>
    <p class="muted small">Fonctionne partout · nécessite un compte Google</p>
    <a class="btn btn-yt" href="${escapeHtml(config.channelUrl)}" target="_blank" rel="noopener">S'abonner sur YouTube</a>
  </section>

  <section class="follow-card" id="alertes">
    <h2>Les alertes du navigateur</h2>
    <p>Une notification sur votre appareil dès la mise en ligne d'une vidéo, même quand vous n'êtes pas sur le site. Aucun compte, aucune adresse e-mail à donner, et vous pouvez vous désabonner d'un clic.</p>
    <p class="muted small">Fonctionne sur Android, Windows et Mac · sur iPhone, voir ci-dessous</p>

    <div id="push-zone">
      <button class="btn btn-primary" id="push-optin" type="button" hidden>Recevoir les alertes</button>
      <p class="push-status muted small" id="push-status" role="status"></p>

      <details class="push-ios" id="push-ios" hidden>
        <summary>Sur iPhone et iPad, une manipulation est nécessaire</summary>
        <p>Apple n'autorise pas les notifications depuis un onglet de navigateur. Il faut d'abord installer le site sur votre écran d'accueil — ce qui vous donne au passage une icône Tandem TV et une ouverture en plein écran, sans barre d'adresse :</p>
        <ol>
          <li>Touchez le bouton <strong>Partager</strong> en bas de l'écran (le carré avec une flèche vers le haut).</li>
          <li>Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong>.</li>
          <li>Ouvrez Tandem TV depuis cette nouvelle icône — pas depuis Safari.</li>
          <li>Revenez sur cette page et touchez « Recevoir les alertes ».</li>
        </ol>
      </details>
    </div>
  </section>

  <section class="follow-card">
    <h2>L'application</h2>
    <p>Tandem TV s'installe sur votre écran d'accueil sans passer par aucun magasin : une icône, l'ouverture en plein écran, et — sur iPhone — la seule façon de recevoir les alertes.</p>
    <a class="btn" href="/installer/">Comment l'installer</a>
  </section>

  <section class="follow-card">
    <h2>Le flux RSS</h2>
    <p>Pour ceux qui utilisent un lecteur de flux — Feedly, NetNewsWire, Thunderbird et les autres. Toutes les publications y arrivent automatiquement, sans intermédiaire et sans que personne ne sache ce que vous lisez.</p>
    <p class="muted small">Fonctionne partout · nécessite une application de lecture</p>
    <a class="btn" href="/rss.xml">Ouvrir le flux</a>
    <p class="muted small">Il existe aussi <strong>un flux par rubrique</strong> : le lien se trouve en haut de chaque page d'émission ou de thème. Pratique pour ne suivre qu'un rendez-vous précis.</p>
  </section>

  ${socials.length ? `
  <section class="follow-card">
    <h2>Les réseaux sociaux</h2>
    <p>Nos comptes officiels, où l'on relaie les publications et où l'on échange avec vous.</p>
    <ul class="social social-inline">
      ${socials.map(([href, label, key]) => `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${socialIcon(key)}<span>${escapeHtml(label)}</span></a></li>`).join('')}
    </ul>
  </section>` : ''}
</div>`;

  return layout({
    config, categories, nav, buildTime,
    title: 'Suivre Tandem TV',
    description: "Toutes les façons de suivre Tandem TV : chaîne YouTube, alertes du navigateur, flux RSS et réseaux sociaux.",
    canonical: '/suivre/',
    bodyClass: 'page-follow',
    content,
  });
}

/**
 * Page d'arrivée après inscription à la lettre. Kit affiche sinon sa propre
 * page, en anglais : autant accueillir le nouvel abonné chez nous, en français,
 * et lui proposer immédiatement quelque chose à regarder.
 */
export function thanksPage({ config, categories, nav, latest = [], buildTime }) {
  const content = `
<div class="wrap narrow">
  <header class="page-head center">
    <p class="kicker">Inscription enregistrée</p>
    <h1>Merci, vous êtes des nôtres</h1>
    <p class="lede">Vous recevrez un message à chaque nouvelle vidéo — rien d'autre. Pour vous désinscrire, un lien est présent au bas de chaque envoi.</p>
    <p><a class="btn btn-primary" href="/">Voir les dernières vidéos</a> <a class="btn" href="${escapeHtml(config.channelUrl)}" target="_blank" rel="noopener">S'abonner sur YouTube</a></p>
  </header>

  ${config.tv?.enabled && config.tv?.channelNumber ? `
  <p class="center muted">Retrouvez aussi Tandem TV à la télévision, sur le <strong>canal ${escapeHtml(config.tv.channelNumber)}${config.tv.operator ? ` du bouquet ${escapeHtml(config.tv.operator)}` : ''}</strong>.</p>` : ''}
</div>

${latest.length ? `<div class="wrap">
  <section class="row">
    <div class="row-head"><h2 class="row-title">En attendant, les dernières publications</h2></div>
    ${grid(latest)}
  </section>
</div>` : ''}`;

  return layout({
    config, categories, nav, buildTime,
    title: 'Merci',
    description: `Votre inscription à la lettre d'information de ${config.siteName} est enregistrée.`,
    canonical: '/merci/',
    robots: 'noindex, follow',
    bodyClass: 'page-merci',
    content,
  });
}

/**
 * Page « Installer l'application ». Le site est déjà une application installable
 * (manifeste + agent de service) ; il manquait seulement de le dire. Les trois
 * marches à suivre sont affichées côte à côte, et le script met en avant celle
 * qui correspond à l'appareil du visiteur.
 */
export function installPage({ config, categories, nav, buildTime }) {
  const content = `
<div class="wrap narrow">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>Installer</span></nav>

  <header class="page-head">
    <p class="kicker">Sur votre écran d'accueil</p>
    <h1>Installer Tandem TV</h1>
    <p class="lede">Tandem TV s'installe comme une application, sans passer par aucun magasin : une icône sur votre écran d'accueil, l'ouverture en plein écran, et rien à mettre à jour — c'est toujours la dernière version.</p>
    <p id="install-cta" hidden><button class="btn btn-primary" type="button" id="install-now">Installer maintenant</button></p>
    <p class="install-done" id="install-done" hidden>✓ Vous utilisez déjà Tandem TV en application. Rien à faire.</p>
  </header>

  <section class="follow-card" id="how-android">
    <h2>Sur Android</h2>
    <ol>
      <li>Ouvrez <strong>tandemtv.net</strong> dans Chrome.</li>
      <li>Touchez le menu <strong>⋮</strong> en haut à droite.</li>
      <li>Choisissez <strong>Ajouter à l'écran d'accueil</strong> (ou <strong>Installer l'application</strong>).</li>
    </ol>
    <p class="muted small">Les notifications de nouvelles vidéos fonctionnent ensuite comme dans n'importe quelle application.</p>
  </section>

  <section class="follow-card" id="how-ios">
    <h2>Sur iPhone et iPad</h2>
    <ol>
      <li>Ouvrez <strong>tandemtv.net</strong> dans <strong>Safari</strong> — cette manipulation n'existe pas dans Chrome sur iPhone.</li>
      <li>Touchez le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut, en bas de l'écran).</li>
      <li>Faites défiler et choisissez <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.</li>
    </ol>
    <p class="muted small">Sur iPhone, c'est aussi la <strong>seule façon</strong> de recevoir les alertes des nouvelles vidéos : Apple les interdit depuis un simple onglet. Une fois l'icône installée, ouvrez-la et rendez-vous sur <a href="/suivre/">Suivre Tandem TV</a> pour les activer.</p>
  </section>

  <section class="follow-card" id="how-desktop">
    <h2>Sur ordinateur</h2>
    <ol>
      <li>Ouvrez <strong>tandemtv.net</strong> dans Chrome ou Edge.</li>
      <li>Cliquez sur l'icône d'installation à droite de la barre d'adresse (un écran avec une flèche).</li>
      <li>Confirmez : Tandem TV s'ouvre alors dans sa propre fenêtre.</li>
    </ol>
    <p class="muted small">Sur Safari (Mac) : menu <strong>Fichier</strong> → <strong>Ajouter au Dock</strong>.</p>
  </section>

  <section class="follow-card">
    <h2>Faut-il installer quoi que ce soit ?</h2>
    <p>Non. Il n'y a rien à télécharger dans un magasin d'applications, aucun compte à créer, et l'espace occupé sur votre appareil est négligeable. Le site reste évidemment accessible normalement dans votre navigateur — l'installation ne fait qu'ajouter un raccourci et le plein écran.</p>
  </section>
</div>`;

  return layout({
    config, categories, nav, buildTime,
    title: "Installer l'application",
    description: `Installer ${config.siteName} sur l'écran d'accueil d'un iPhone, d'un téléphone Android ou d'un ordinateur, sans passer par un magasin d'applications.`,
    canonical: '/installer/',
    bodyClass: 'page-installer',
    content,
  });
}

export function sponsoringPage({ config, categories, nav, channel, buildTime, videoCount, showCount }) {
  // Les gros volumes s'abrègent (18 k abonnés), les inventaires se comptent
  // en toutes lettres : « 1 100 vidéos » inspire plus confiance que « 1,1 k ».
  const chiffre = (n, mot, abrege = false) => (n
    ? `<div class="figure"><strong>${abrege ? formatCount(n) : formatNumber(n)}</strong><span>${mot}</span></div>`
    : '');
  const mail = config.contactEmail;
  const objet = encodeURIComponent('Sponsoring — Tandem TV');
  const tv = config.tv;

  const content = `
<div class="wrap narrow">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>Sponsoring</span></nav>

  <header class="page-head">
    <p class="kicker">Annonceurs et partenaires</p>
    <h1>Associer votre marque à Tandem TV</h1>
    <p class="lede">Une chaîne de télévision francophone en Israël, une audience engagée, et des formats qui laissent le temps au message.</p>
  </header>

  <section class="figures">
    ${chiffre(channel?.subscribers, 'abonnés sur YouTube', true)}
    ${chiffre(channel?.totalViews, 'vues cumulées', true)}
    ${chiffre(videoCount, 'vidéos en ligne')}
    ${chiffre(showCount, 'émissions régulières')}
  </section>
  <p class="muted small center">Chiffres relevés automatiquement le ${formatDate(new Date(buildTime).toISOString())}.</p>

  <section class="follow-card">
    <h2>Qui nous regarde</h2>
    <p>Un public francophone d'Israël, de France et de la diaspora, qui vient chercher chez nous ce qu'il ne trouve pas ailleurs : des entretiens longs, des débats menés jusqu'au bout, des analyses qui acceptent la complexité.</p>
    <p>Ce n'est pas une audience de passage. Nos formats durent souvent plus d'une heure, et sont regardés jusqu'au bout.</p>
  </section>

  ${tv?.enabled && tv.channelNumber ? `
  <section class="follow-card">
    <h2>Deux écrans, une seule audience</h2>
    <p>Tandem TV n'est pas qu'une chaîne en ligne : nous sommes diffusés sur le <strong>canal ${escapeHtml(tv.channelNumber)}</strong>${tv.operator ? ` du bouquet <strong>${escapeHtml(tv.operator)}</strong>` : ''}${tv.schedule ? `, ${escapeHtml(tv.schedule)}` : ''}. Un partenariat touche donc à la fois le téléspectateur et l'internaute.</p>
  </section>` : ''}

  <section class="follow-card">
    <h2>Les formes de partenariat</h2>
    <p>Nous étudions chaque proposition au cas par cas, avec une règle constante : <strong>rien qui compromette l'indépendance éditoriale</strong>. Un annonceur n'a jamais son mot à dire sur le contenu d'une émission.</p>
    <ul>
      <li><strong>Parrainage d'émission</strong> — votre marque associée à un rendez-vous régulier.</li>
      <li><strong>Mention en ouverture ou en clôture</strong>, lue par le présentateur.</li>
      <li><strong>Habillage</strong> — présence dans le générique et les éléments graphiques.</li>
      <li><strong>Partenariat de rubrique</strong> sur le site, avec visibilité sur les pages concernées.</li>
      <li><strong>Opérations spéciales</strong> — événement, table ronde, série d'entretiens.</li>
    </ul>
  </section>

  <section class="follow-card">
    <h2>Nous écrire</h2>
    <p>Présentez-nous votre marque et ce que vous cherchez à obtenir. Nous répondons à toutes les demandes sérieuses, y compris pour dire non.</p>
    <a class="btn btn-primary" href="mailto:${escapeHtml(mail)}?subject=${objet}">Écrire à ${escapeHtml(mail)}</a>
  </section>
</div>`;

  return layout({
    config, categories, nav, buildTime,
    title: 'Sponsoring et partenariats',
    description: `Associer votre marque à Tandem TV : audience, formats de partenariat et contact. Chaîne francophone d'Israël${config.tv?.channelNumber ? `, canal ${config.tv.channelNumber}` : ''}.`,
    canonical: '/sponsoring/',
    bodyClass: 'page-sponsoring',
    content,
  });
}

export function contentPage({ config, categories, nav, title, description, canonical, html, buildTime }) {
  const content = `
<div class="wrap narrow">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>${escapeHtml(title)}</span></nav>
  <article class="prose page-prose">
    ${html}
  </article>
</div>`;
  return layout({
    config, categories, nav, buildTime, title, description, canonical,
    bodyClass: 'page-content', content,
  });
}

export function searchPage({ config, categories, nav, buildTime }) {
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
    config, categories, nav, buildTime,
    title: 'Recherche',
    description: `Rechercher parmi toutes les vidéos de ${config.siteName}.`,
    canonical: '/recherche/',
    bodyClass: 'page-search',
    content,
  });
}

export function notFoundPage({ config, categories, nav, buildTime }) {
  const content = `
<div class="wrap narrow">
  <header class="page-head center">
    <p class="kicker">Erreur 404</p>
    <h1>Cette page n'existe pas (ou plus)</h1>
    <p class="lede" id="e404-lede">La vidéo a peut-être été retirée, ou le lien est incorrect.</p>
    <p id="e404-actions"><a class="btn btn-primary" href="/">Retour à l'accueil</a> <a class="btn" href="/emissions/">Voir toutes les émissions</a></p>
  </header>

  <section id="e404-rescue" hidden>
    <h2 class="row-title" id="e404-rescue-title">Vous cherchiez peut-être</h2>
    <div class="grid" id="e404-results"></div>
  </section>
</div>`;
  return layout({
    config, categories, nav, buildTime,
    title: 'Page introuvable',
    description: 'Page introuvable.',
    canonical: '/404.html',
    bodyClass: 'page-404',
    content,
  });
}
