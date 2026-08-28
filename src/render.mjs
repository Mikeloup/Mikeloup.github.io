// -----------------------------------------------------------------------------
// Gabarits HTML du site. Aucune dépendance réseau ici : on reçoit des données
// déjà normalisées et on renvoie des chaînes HTML.
// -----------------------------------------------------------------------------

import {
  escapeHtml, formatDate, formatDateTime, formatDuration, formatCount, formatNumber, truncate,
  excerpt, descriptionToHtml, extractChapters, removeChapterLines, slugify as slugifyNom,
  extraitPresentation,
} from './util.mjs';
import { mmss } from './transcriptions.mjs';

const YT_THUMB = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// --- Briques réutilisables ---------------------------------------------------

/** Une vidéo publiée depuis moins de `hours` heures mérite d'attirer l'œil. */
export function isFresh(video, hours = 48) {
  if (!video?.publishedAt) return false;
  return (Date.now() - new Date(video.publishedAt).getTime()) < hours * 3600 * 1000;
}

export function videoCard(video, { showCategory = true, eager = false, lead = false, accroche = false } = {}) {
  const cat = showCategory && video.playlists?.[0];
  // Accroche : la première phrase de la description. Sur les vignettes mises
  // en avant seulement — partout ailleurs, elle noierait la grille.
  const texte = accroche ? excerpt(video.description, 165) : '';
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
    ${texte ? `<p class="card-accroche">${escapeHtml(texte)}</p>` : ''}
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
    ...cardOpts, eager: i < 4,
    lead: lead && i === 0 && videos.length > 2,
    accroche: lead && i === 0 && videos.length > 2,
  })).join('')}</div>`;
}

function row(title, href, videos, opts = {}) {
  if (!videos.length) return '';
  const { dense = false, chapo = '', avant = '', desc = '' } = opts;
  return `
<section class="row${dense ? ' row--dense' : ''}">
  <div class="row-head">
    ${avant}
    <h2 class="row-title"><a href="${href}">${escapeHtml(title)}</a></h2>
    <a class="row-more" href="${href}">Tout voir <span aria-hidden="true">→</span></a>
  </div>
  ${chapo ? `<p class="row-chapo">${chapo}</p>` : ''}
  ${desc ? `<p class="row-desc">${escapeHtml(truncate(desc, 210))}</p>` : ''}
  ${grid(videos, { showCategory: false })}
</section>`;
}

/**
 * Rangée d'émission « incarnée » : le portrait et le nom du présentateur
 * en tête. Une émission n'est pas un thème — elle a un visage, et c'est ce
 * visage que le spectateur reconnaît.
 */
function rowEmission(cat, personne, videos) {
  if (!videos.length) return '';
  const href = `/emissions/${cat.slug}/`;
  const total = cat.videos?.length || videos.length;
  const avant = personne
    ? `<a class="row-avatar" href="/invites/${personne.slug}/" aria-label="${escapeHtml(personne.nom)}"><img src="${escapeHtml(photoDe(personne))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="270"></a>`
    : '';
  const chapo = personne
    ? `Présenté par <a href="/invites/${personne.slug}/">${escapeHtml(personne.nom)}</a> · ${total} épisode${total > 1 ? 's' : ''}`
    : `${total} épisode${total > 1 ? 's' : ''}`;
  return row(cat.title, href, videos, { avant, chapo, desc: cat.description || '' });
}

/** Un des deux sujets secondaires de la une. */
function uneSecondaire(video) {
  const cat = video.playlists?.[0];
  return `
<a class="une2" href="/video/${video.id}/">
  <span class="une2-thumb"><img src="${escapeHtml(video.thumbnail || YT_THUMB(video.id))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="270"></span>
  <span class="une2-body">
    ${cat ? `<span class="une2-cat">${escapeHtml(cat.title)}</span>` : ''}
    <span class="une2-title">${escapeHtml(video.title)}</span>
    ${(() => { const t = excerpt(video.description, 110); return t ? `<span class="une2-desc">${escapeHtml(t)}</span>` : ''; })()}
  </span>
</a>`;
}

/**
 * Bande de portraits : les chroniqueurs réellement à l'antenne en ce moment.
 *
 * Une liste triée sur l'ensemble du catalogue remonte des visages qui ont
 * quitté la chaîne depuis longtemps. On ne retient donc que les personnes qui
 * ont publié dans la fenêtre récente, et au moins deux fois — sans quoi un
 * invité de passage figurerait parmi les chroniqueurs.
 */
function bandeVisages(personnes, { maintenant, mois = 3, max = 10, afficher = true } = {}) {
  // Michael, 27 aout 2026 : « cache-moi en page d'accueil la ligne des
  // chroniqueurs ». La page /invites/ et les fiches restent en place -- c'est
  // uniquement la bande de portraits de l'accueil qui disparait. L'interrupteur
  // vit dans site.config.json, home.chroniqueurs : le remettre a true rallume
  // la bande sans toucher au code.
  if (!afficher) return '';
  const choisir = (m) => {
    const limite = maintenant - m * 30.44 * 864e5;
    return personnes
      .map((p) => {
        const recents = p.videos.filter((v) => new Date(v.publishedAt).getTime() >= limite);
        return { p, n: recents.length, dernier: new Date(p.videos[0]?.publishedAt || 0).getTime() };
      })
      .filter((x) => x.n >= (x.p.presente?.length ? 1 : 2))
      .sort((a, b) => (b.p.presente?.length ? 1 : 0) - (a.p.presente?.length ? 1 : 0)
        || b.n - a.n || b.dernier - a.dernier)
      .slice(0, max);
  };

  // Une chaîne peut traverser une période creuse : on élargit la fenêtre
  // plutôt que d'afficher une bande à trois portraits.
  let fenetre = mois;
  let gens = choisir(fenetre);
  for (const m of [mois * 2, mois * 4]) {
    if (gens.length >= 5) break;
    fenetre = m;
    gens = choisir(fenetre);
  }
  if (gens.length < 4) return '';

  const periode = fenetre >= 12 ? "de l'année écoulée" : `des ${Math.round(fenetre)} derniers mois`;
  return `
<section class="visages">
  <div class="row-head">
    <h2 class="row-title"><a href="/invites/">Les chroniqueurs</a></h2>
    <a class="row-more" href="/invites/">Tous les intervenants <span aria-hidden="true">→</span></a>
  </div>
  <p class="row-chapo">À l'antenne ${periode}.</p>
  <ul class="visages-liste">
    ${gens.map(({ p }) => `<li><a href="/invites/${p.slug}/">
      <span class="visage-photo"><img src="${escapeHtml(photoDe(p))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="270"></span>
      <span class="visage-nom">${escapeHtml(p.nom)}</span>
    </a></li>`).join('')}
  </ul>
</section>`;
}

/**
 * Bloc de présentation en fin de page. Le texte vient de content/accueil.md.
 * Placé là, il ne coupe pas le flux des vidéos tout en restant lu par Google.
 */
function blocQuiSommesNous(introHtml) {
  if (!introHtml) return '';
  return `
<section class="apropos-bas">
  <div class="wrap apropos-inner">
    <h2>Qui sommes-nous ?</h2>
    <div class="apropos-texte">${introHtml}</div>
    <a class="apropos-lien" href="/a-propos/">En savoir plus sur Tandem TV <span aria-hidden="true">→</span></a>
  </div>
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
    <p class="kicker"><span class="live-dot" aria-hidden="true"></span>${pinned ? 'À la une' : 'Dernière publication'}${category ? ` <span class="kicker-cat">· <a href="/emissions/${category.slug}/">${escapeHtml(category.title)}</a></span>` : ''}</p>
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

/**
 * La une : un sujet principal et deux sujets secondaires, sur fond sombre.
 * C'est le premier palier de hiérarchie de la page — sans lui, toutes les
 * rangées avaient le même poids et l'œil n'avait aucun parcours.
 */
function uneZone(video, category, secondaires, { pinned = false, chiffres = '' } = {}) {
  if (!video) return '';
  return `
<div class="une-zone">
  ${hero(video, category, { pinned })}
  ${secondaires.length ? `
  <div class="une-plus">
    <h2 class="une-plus-titre">À suivre également</h2>
    <div class="une-plus-liste">${secondaires.map(uneSecondaire).join('')}</div>
  </div>` : ''}
  ${chiffres ? `<p class="une-chiffres">${chiffres}</p>` : ''}
</div>`;
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
  // Pas de sous-familles ici : classer une émission en « archives » serait un
  // jugement éditorial, et il appartient à Michael, pas au calcul. Le menu
  // raccourcit, il ne tranche pas — la liste exhaustive est à un clic.
  const corps = `<div class="menu-grid">${items
    .map((c) => `<a href="/emissions/${c.slug}/">${escapeHtml(c.title)} <span>${c.videos.length}</span></a>`)
    .join('')}</div>`;
  return `
      <div class="menu">
        <button class="menu-btn" type="button" aria-expanded="false" aria-controls="${id}">
          ${escapeHtml(label)} <span class="caret" aria-hidden="true"></span>
        </button>
        <div class="menu-panel" id="${id}" hidden>
          <div class="wrap menu-panel-inner">
            ${corps}
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
/**
 * Bandeau « chaîne de télévision », en tête de la page d'accueil.
 *
 * Il annonçait un fait permanent : Tandem TV est sur le canal 14. Vrai, mais
 * immobile — un visiteur qui l'a lu une fois n'a aucune raison d'y revenir.
 * Le même bandeau porte désormais ce qui passe à l'antenne à la seconde où on
 * le regarde. C'est la seule information du site qui change toutes les heures,
 * et c'est elle qui transforme une plaque en rendez-vous.
 *
 * La ligne est masquée tant que le navigateur n'a pas calculé : mieux vaut un
 * bandeau qui ne dit rien qu'un bandeau qui annonce une émission terminée.
 */
function tvBanner(config, { grille = false, direct = false } = {}) {
  const tv = config.tv;
  if (!tv?.enabled || !tv.channelNumber) return '';
  // La grille, quand elle existe, est la suite naturelle de cette phrase.
  const lien = grille
    ? ' <a href="/grille/">Voir la grille des programmes <span aria-hidden="true">→</span></a>'
    : (tv.url ? ` <a href="${escapeHtml(tv.url)}" target="_blank" rel="noopener">En savoir plus</a>` : '');
  // Le logo de l'opérateur, s'il a été fourni, remplace la pastille « TV » :
  // une marque connue vaut mieux qu'un mot générique.
  const marque = tv.operatorLogo
    ? `<img class="tv-logo" src="${escapeHtml(tv.operatorLogo)}" alt="${escapeHtml(tv.operator || '')}" height="24">`
    : '<span class="tv-badge" aria-hidden="true">TV</span>';
  return `
<aside class="tv-banner${direct ? ' tv-banner--direct' : ''}">
  ${marque}
  <div class="tv-corps">
    <p>
      <strong>Tandem TV est une chaîne de télévision</strong> — <span class="tv-canal">canal ${escapeHtml(tv.channelNumber)}</span>${tv.operator ? ` du bouquet <strong>${escapeHtml(tv.operator)}</strong>` : ''}${tv.schedule ? `, ${escapeHtml(tv.schedule)}` : ''}.${lien}
    </p>
    ${direct ? `<p class="tv-direct" id="tv-direct" hidden>
      <span class="live-dot" aria-hidden="true"></span>
      <span class="tv-direct-label">En ce moment</span>
      <span class="tv-direct-corps" id="tv-direct-corps"></span>
      <span class="tv-direct-suite" id="tv-direct-suite"></span>
    </p>` : ''}
  </div>
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
    <p>Un courriel par semaine, le vendredi : les vidéos des sept derniers jours, et une plus ancienne à redécouvrir. Rien d'autre, et vous pouvez vous désinscrire en un clic.</p>
  </div>
  <div class="newsletter-fields">
    <label class="visually-hidden" for="nl-email">Votre adresse e-mail</label>
    <input id="nl-email" type="email" name="email_address" required
           autocomplete="email" placeholder="votre@adresse.fr">
    <button class="btn btn-primary" type="submit">Je m'inscris</button>
  </div>
  <p class="newsletter-note muted small">Inscription immédiate, sans courriel de confirmation à valider. Votre adresse ne sert qu'à cet envoi et n'est transmise à personne d'autre que notre prestataire d'expédition ; un lien de désinscription figure dans chaque message.</p>
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
  content, jsonLd = null, buildTime, feed = null, robots = null, sansManifeste = false,
}) {
  const fullTitle = title === config.siteName ? `${config.siteName} — ${config.tagline}` : `${title} | ${config.siteName}`;
  const racine = config.siteUrl.replace(/\/$/, '');
  const url = racine + canonical;
  // Facebook, WhatsApp et LinkedIn exigent une adresse complète : une image
  // désignée par un chemin relatif est purement et simplement ignorée, et
  // l'aperçu se retrouve sans visuel.
  const partage = image
    ? (/^https?:\/\//.test(image) ? image : racine + (image.startsWith('/') ? '' : '/') + image)
    : `${racine}/assets/partage.png`;
  const pages = config.pages || [];
  const navPages = pages.filter((pg) => !pg.footerOnly);
  // Le libelle d'un lien n'est pas le titre de la page. Un titre ecrit pour
  // Google -- « Le shekel israelien : les symboles des pieces et des billets »
  // -- est illisible dans un menu ou un pied de page. « menuTitle » donne le
  // libelle court ; sans lui le titre sert, comme avant. La regle vit ici et
  // nulle part ailleurs : les trois listes de liens passent par cette fonction.
  const libelle = (pg) => pg.menuTitle || pg.title;
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
<meta property="og:image" content="${escapeHtml(partage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(config.siteName)} — ${escapeHtml(config.tagline)}">
<meta name="twitter:card" content="summary_large_image">
${robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : ''}
<link rel="preconnect" href="https://i.ytimg.com" crossorigin>
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.siteName)}" href="/rss.xml">
${feed ? `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(feed.title)}" href="${escapeHtml(feed.href)}">` : ''}
${sansManifeste ? '' : `<link rel="manifest" href="/manifest.webmanifest">`}
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${escapeHtml(sansManifeste ? 'Stories' : config.siteName)}">
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
      ${navPages.map((pg) => `<a href="/${pg.slug}/">${escapeHtml(libelle(pg))}</a>`).join('')}
      <!-- Sponsoring : seule page du site qui puisse rapporter de l'argent. Elle
           n'était atteignable qu'en déroulant toute la page jusqu'au pied. -->
      <a class="utility-fort" href="/sponsoring/">Sponsoring</a>
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
      ${menuPanel('menu-emissions', config.groups?.shows?.label || 'Émissions', menuShows, '/emissions/', 'Toutes les émissions, passées et présentes')}
      ${menuPanel('menu-themes', config.groups?.themes?.label || 'Thèmes', menuThemes, '/themes/', 'Tous les thèmes, passés et présents')}
      <a href="/invites/">Invités</a>
      ${nav.sujets ? '<a href="/sujets/">Sujets</a>' : ''}
      ${nav.grille ? '<a href="/grille/">Grille TV</a>' : ''}
      ${nav.partenaires ? '<a href="/autres-programmes/">Autres programmes</a>' : ''}
      ${nav.medias ? '<a href="/partenaires/">Partenaires</a>' : ''}
      ${nav.partenaires ? '' : '<a href="/emissions/">Tout le catalogue</a>'}
      <a class="nav-follow" href="/suivre/">
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm7-5.3V11a7 7 0 0 0-5.2-6.8V3.5a1.8 1.8 0 1 0-3.6 0v.7A7 7 0 0 0 5 11v5.7L3 18.7v.6h18v-.6l-2-2Z"/></svg>
        Suivre la chaîne
      </a>
      <span class="nav-only-mobile-sep" aria-hidden="true"></span>
      ${navPages.map((pg) => `<a class="nav-alt" href="/${pg.slug}/">${escapeHtml(libelle(pg))}</a>`).join('')}
      <a class="nav-alt" href="/sponsoring/">Sponsoring</a>
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
      ${config.tv?.enabled && config.tv.channelNumber ? `<p class="muted small tv-footer">${config.tv.operatorLogo
        ? `<img class="tv-logo" src="${escapeHtml(config.tv.operatorLogo)}" alt="${escapeHtml(config.tv.operator || '')}" height="18">`
        : '<span class="tv-badge" aria-hidden="true">TV</span>'} Chaîne de télévision — <span class="tv-canal">canal ${escapeHtml(config.tv.channelNumber)}</span>${config.tv.operator ? ` du bouquet ${escapeHtml(config.tv.operator)}` : ''}</p>` : ''}
      ${socialLinks.length ? `<ul class="social" aria-label="Tandem TV sur les réseaux sociaux">
        ${socialLinks.map(([href, label, key]) => `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${socialIcon(key)}<span>${escapeHtml(label)}</span></a></li>`).join('')}
      </ul>` : ''}
    </div>
    <div class="footer-col">
      <h4>Émissions</h4>
      <ul>${footerCats.map((c) => `<li><a href="/emissions/${c.slug}/">${escapeHtml(c.title)}</a></li>`).join('')}</ul>
    </div>
    <div class="footer-col">
      <h4>Découvrir</h4>
      <ul>
        <li><a href="/emissions/">Toutes les émissions</a></li>
        <li><a href="/themes/">${escapeHtml(config.groups?.themes?.label || 'Thèmes')}</a></li>
        <li><a href="/invites/">Invités et intervenants</a></li>
        ${nav.sujets ? '<li><a href="/sujets/">Sujets</a></li>' : ''}
        ${nav.grille ? '<li><a href="/grille/">Grille des programmes</a></li>' : ''}
        ${nav.partenaires ? '<li><a href="/autres-programmes/">Autres programmes de l\'antenne</a></li>' : ''}
        ${nav.medias ? '<li><a href="/partenaires/">Nos partenaires</a></li>' : ''}
        <li><a href="/recherche/">Rechercher une vidéo</a></li>
      </ul>
      <h4>Rester au courant</h4>
      <ul>
        <li><a href="/suivre/">Suivre Tandem TV</a></li>
        <li><a href="/installer/">Installer l'application</a></li>
        <li><a href="/rss.xml">Flux RSS</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Le site</h4>
      <ul>
        ${pages.filter((pg) => !pg.slug.startsWith('sujets/'))
          .map((pg) => `<li><a href="/${pg.slug}/">${escapeHtml(libelle(pg))}</a></li>`).join('')}
        <li><a href="/sponsoring/">Sponsoring</a></li>
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

export function homePage({
  config, categories, nav, latest, buildTime, grille = null,
  personnes = [], personneParRubrique = new Map(), introHtml = '',
}) {
  const pinnedId = String(config.home?.featured || '').trim();
  const pinned = pinnedId ? latest.find((v) => v.id === pinnedId) : null;
  const featured = pinned || latest[0];
  const featuredCat = featured?.playlists?.[0];

  // Deux sujets secondaires en une, retirés ensuite du flux pour ne pas
  // apparaître deux fois à quelques centimètres d'intervalle.
  const suite = latest.filter((v) => v.id !== featured?.id);
  const secondaires = suite.slice(0, 2);
  const dejaVus = new Set([featured?.id, ...secondaires.map((v) => v.id)]);
  const rest = suite.slice(2, 2 + (config.home?.latestCount ?? 8));
  const rowSize = config.home?.rowSize ?? 8;

  // Les plus regardées : le fonds de catalogue, invisible autrement. On écarte
  // ce qui est déjà en haut de page et on exige un compteur réel.
  // Les rangées secondaires tiennent sur une seule ligne de cinq : c'est ce
  // qui les distingue au premier coup d'œil des rangées d'émission.
  const DENSE = 5;
  const plusVues = [...latest]
    .filter((v) => Number(v.views) > 0 && !dejaVus.has(v.id))
    .sort((a, b) => Number(b.views) - Number(a.views))
    .slice(0, DENSE);

  const themes = nav.themes || [];
  const shows = nav.shows || [];
  const themeRows = themes.slice(0, config.home?.themeRows ?? 3);
  const showRows = shows.slice(0, config.home?.showRows ?? 3);

  // Chiffres de la chaîne : recalculés à chaque synchronisation, ils disent en
  // une ligne l'ampleur du fonds — ce qu'une grille de vignettes ne montre pas.
  const chiffres = [
    `${formatNumber(latest.length)} vidéos`,
    shows.length ? `${formatNumber(shows.length)} émissions` : '',
    personnes.length ? `${formatNumber(personnes.length)} intervenants` : '',
  ].filter(Boolean).join(' <span class="dot">·</span> ');

  const content = `
<div class="wrap">
  ${uneZone(featured, featuredCat, secondaires, { pinned: Boolean(pinned), chiffres })}

  ${tvBanner(config, { grille: Boolean(nav.grille), direct: Boolean(grille?.pourNavigateurCourt?.length) })}

  <section class="row">
    <div class="row-head">
      <h2 class="row-title"><a href="/emissions/">Dernières vidéos</a></h2>
      <a class="row-more" href="/emissions/">Tout le catalogue <span aria-hidden="true">→</span></a>
    </div>
    ${grid(rest, { lead: true })}
  </section>

  ${shows.length ? `
  <section class="cats">
    <div class="row-head">
      <h2 class="row-title"><a href="/emissions/">${escapeHtml(config.groups?.shows?.label || 'Émissions')}</a></h2>
      <a class="row-more" href="/emissions/">Toutes les émissions <span aria-hidden="true">→</span></a>
    </div>
    ${chips((nav.menuShows?.length ? nav.menuShows : shows).slice(0, 24))}
  </section>` : ''}

  ${showRows.map((c) => rowEmission(c, personneParRubrique.get(c.slug), c.videos.slice(0, rowSize))).join('')}

  ${bandeVisages(personnes, {
    maintenant: new Date(buildTime).getTime(),
    mois: config.home?.chroniqueursMois ?? 3,
    max: config.home?.chroniqueursMax ?? 10,
    afficher: config.home?.chroniqueurs !== false,
  })}

  ${newsletterForm(config)}

  ${themes.length ? `
  <section class="cats">
    <div class="row-head">
      <h2 class="row-title"><a href="/themes/">${escapeHtml(config.groups?.themes?.label || 'Thèmes')}</a></h2>
      <a class="row-more" href="/themes/">Tous les thèmes <span aria-hidden="true">→</span></a>
    </div>
    ${chips(nav.menuThemes?.length ? nav.menuThemes : themes)}
  </section>` : ''}

  ${themeRows.map((c) => row(c.title, `/emissions/${c.slug}/`, c.videos.slice(0, DENSE), {
    dense: true, desc: c.description || '',
  })).join('')}

  ${plusVues.length >= 4 ? row('Les plus regardées', '/emissions/', plusVues, { dense: true }) : ''}
</div>

${blocQuiSommesNous(introHtml)}
${grille?.pourNavigateurCourt?.length
    ? `<script id="g-donnees" type="application/json">${JSON.stringify(grille.pourNavigateurCourt)}</script>`
    : ''}`;

  return layout({
    config, categories, nav, buildTime,
    title: config.siteName,
    description: config.description,
    canonical: '/',
    // Partagée sur WhatsApp ou Facebook, la page d'accueil montrait la vignette
    // de la dernière vidéo : le lien changeait d'apparence chaque jour et ne
    // disait rien de la chaîne. Elle porte désormais une carte de marque fixe.
    image: `${config.siteUrl.replace(/\/$/, '')}/assets/partage.png`,
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

/** Grille des programmes du canal télévisé. */
export function grillePage({ config, categories, nav, grille, buildTime, externes = new Map() }) {
  const tv = config.tv || {};
  const jourFr = (d) => {
    const dt = new Date(`${d}T12:00:00Z`);
    const j = dt.toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' });
    const q = dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    return `${j.charAt(0).toUpperCase()}${j.slice(1)} ${q}`;
  };
  // Sept onglets au lieu de trois : sur téléphone, « Lundi 10 août » sept fois
  // repousse la grille sous quatre rangées de boutons. On garde donc les deux
  // libellés dans le bouton et c'est la feuille de style qui choisit — pas de
  // JavaScript, pas de dépendance à la largeur mesurée.
  const jourCourtFr = (d) => {
    const dt = new Date(`${d}T12:00:00Z`);
    const j = dt.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }).replace(/\.$/, '');
    const q = dt.toLocaleDateString('fr-FR', { day: 'numeric', timeZone: 'UTC' });
    return `${j.charAt(0).toUpperCase()}${j.slice(1)}. ${q}`;
  };

  const ligne = (p) => {
    if (p.type === 'clips') {
      // Chaque source de clips renvoie vers sa fiche : c'est le seul endroit du
      // site où ces comptes, très présents à l'antenne, deviennent cliquables.
      const vus = new Set();
      const sources = (p.ids || []).map((id, i) => {
        if (vus.has(id)) return '';
        vus.add(id);
        const f = externes.get(id);
        const nom = escapeHtml(p.sources[i] ?? f?.nom ?? '');
        if (!f) return `<span class="g-src">${nom}</span>`;
        const logo = f.avatar
          ? `<img class="g-logo" src="${escapeHtml(f.avatar)}" alt="" width="20" height="20" loading="lazy" referrerpolicy="no-referrer">`
          : '';
        return `<a class="g-src" href="/autres-programmes/#${escapeHtml(f.cle)}">${logo}${escapeHtml(f.nom)}</a>`;
      }).filter(Boolean).join(' ');
      return `<li class="g-clips"${p.heure ? ` data-heure="${escapeHtml(p.heure)}"` : ''}>
        <span class="g-heure g-approx">${escapeHtml(p.heure || '')}</span>
        <span class="g-corps"><span class="g-clips-titre">Clips et bandes-annonces</span>
        <span class="g-clips-src">${sources}</span></span>
      </li>`;
    }
    const titre = p.videoId
      ? `<a href="/video/${p.videoId}/">${escapeHtml(p.titre)}</a>`
      : escapeHtml(p.titre);
    // Un titre vide n'est pas une anomalie : certaines émissions n'ont pas de
    // sujet du jour dans l'export. La ligne se réduit alors à son nom.
    const corpsTitre = p.titre ? `<span class="g-titre">${titre}</span>` : '';
    const ext = p.rubrique ? null : externes.get(p.id);
    const emission = p.rubrique
      ? `<a href="/emissions/${p.rubrique}/">${escapeHtml(p.emission)}</a>`
      : (ext
        ? `<a href="/autres-programmes/#${escapeHtml(ext.cle)}">${escapeHtml(p.emission)}</a>`
        : escapeHtml(p.emission));
    const logo = ext?.avatar
      ? `<img class="g-logo" src="${escapeHtml(ext.avatar)}" alt="" width="20" height="20" loading="lazy" referrerpolicy="no-referrer">`
      : '';
    return `<li class="g-prog" data-heure="${escapeHtml(p.heure)}">
      <span class="g-heure${p.fixe ? ' g-fixe' : ' g-approx'}">${escapeHtml(p.heure)}</span>
      <span class="g-corps">
        <span class="g-emission">${logo}${emission}</span>
        ${corpsTitre}
      </span>
      ${p.videoId ? `<a class="g-replay" href="/video/${p.videoId}/"><span class="g-replay-mot">Replay</span><span class="g-replay-ico" aria-hidden="true">▶</span></a>` : ''}
      <span class="g-badge" hidden>À l'antenne</span>
    </li>`;
  };

  const content = `
<div class="wrap">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>Grille TV</span></nav>

  <header class="page-head">
    <p class="kicker"><span class="live-dot" aria-hidden="true"></span>Canal ${escapeHtml(tv.channelNumber || '14')}${tv.operator ? ` · ${escapeHtml(tv.operator)}` : ''}</p>
    <h1>Grille des programmes</h1>
    <p class="lede">Ce qui passe à l'antenne de ${escapeHtml(config.siteName)} sur le canal ${escapeHtml(tv.channelNumber || '14')}. Quand l'émission est disponible en ligne, un clic mène au replay.</p>
  </header>

  ${grille.perimee ? `<p class="g-avis">Cette grille date du ${escapeHtml(grille.exporteLe ? grille.exporteLe.slice(0, 10) : '')} et n'a pas été renouvelée depuis. Les horaires ci-dessous sont donc passés.</p>` : `
  <section class="g-direct" id="g-direct" hidden>
    <p class="g-direct-label"><span class="live-dot" aria-hidden="true"></span>En ce moment à l'antenne</p>
    <p class="g-direct-titre" id="g-direct-titre"></p>
    <p class="g-direct-sous" id="g-direct-sous"></p>
    <p class="g-direct-suite" id="g-direct-suite"></p>
  </section>`}

  <p class="g-legende muted small">
    Heures d'<strong>Israël</strong> — une heure de plus qu'en France métropolitaine.
    <span class="g-approx-ex">≈</span> horaire approximatif ; sans le signe, c'est un rendez-vous à heure fixe.
  </p>

  <div class="g-jours" role="tablist" aria-label="Journées">
    ${grille.jours.map((j, i) => `<button type="button" role="tab" class="g-jour${i === 0 ? ' actif' : ''}" aria-selected="${i === 0}" aria-controls="jour-${j.date}" data-jour="${j.date}"><span class="g-jour-long">${escapeHtml(jourFr(j.date))}</span><span class="g-jour-court">${escapeHtml(jourCourtFr(j.date))}</span></button>`).join('')}
  </div>

  ${grille.jours.map((j, i) => `
  <section class="g-panneau${i === 0 ? ' actif' : ''}" id="jour-${j.date}" role="tabpanel" aria-label="${escapeHtml(jourFr(j.date))}">
    <ul class="g-liste">${j.programmes.map(ligne).join('')}</ul>
    ${j.finEnClips && j.fin ? `<p class="g-fin muted small">
      Les rendez-vous de la journée s'achèvent à <strong>${escapeHtml(j.fin)}</strong>. L'antenne enchaîne ensuite
      clips et bandes-annonces${j.repriseLendemain ? `, jusqu'aux programmes du lendemain à partir de <strong>${escapeHtml(j.repriseLendemain)}</strong>` : ''}.
    </p>` : ''}
  </section>`).join('')}

  <p class="g-note muted small">
    Les horaires approximatifs sont arrondis aux 5 minutes et peuvent varier de quelques minutes
    selon la durée réelle des programmes. Le direct fait toujours foi.
    ${nav.partenaires ? 'Certains programmes ne sont pas produits par Tandem TV : <a href="/autres-programmes/">voir qui les réalise</a>.' : ''}
  </p>
</div>

<script id="g-donnees" type="application/json">${JSON.stringify(grille.pourNavigateur)}</script>`;

  return layout({
    config, categories, nav, buildTime,
    title: `Grille des programmes — canal ${tv.channelNumber || '14'}`,
    description: `Les programmes de ${config.siteName} sur le canal ${tv.channelNumber || '14'}${tv.operator ? ` du bouquet ${tv.operator}` : ''} : horaires des émissions, jour par jour, avec accès au replay.`,
    canonical: '/grille/',
    bodyClass: 'page-grille',
    content,
    jsonLd: breadcrumbLd(config, [
      { name: 'Accueil', path: '/' },
      { name: 'Grille des programmes', path: '/grille/' },
    ]),
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
      ? "Toutes les émissions de la chaîne, passées et présentes."
      : "Tous les thèmes suivis par Tandem TV, passés et présents, toutes émissions confondues."}</p>
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

/**
 * Annonce du prochain passage à l'antenne.
 *
 * Le créneau exact est choisi par le navigateur, pas ici : une page statique
 * reconstruite douze fois par jour annoncerait sinon des horaires déjà passés.
 * On lui transmet seulement les créneaux à venir que la grille connaît, et il
 * retient le premier encore devant nous, à l'heure de Jérusalem.
 *
 * Le bouton d'agenda n'apparaît que sur les rendez-vous à heure fixe : poser un
 * rappel sur un horaire approximatif ferait manquer le début de l'émission.
 */
function blocDiffusion(config, creneaux, titre) {
  if (!creneaux?.length) return '';
  const tv = config.tv || {};
  return `<p class="tv-diff" hidden
    data-diff="${escapeHtml(JSON.stringify(creneaux.map((c) => c.slice(0, 3))))}"
    data-titre="${escapeHtml(titre || '')}"
    data-canal="${escapeHtml(tv.channelNumber || '14')}"
    data-operateur="${escapeHtml(tv.operator || '')}">
    <span class="tv-diff-label"><span class="live-dot" aria-hidden="true"></span>À l'antenne</span>
    <span class="tv-diff-texte"></span>
    <button type="button" class="tv-diff-agenda" hidden>Ajouter à mon agenda</button>
  </p>`;
}

/** Date courte pour l'historique : « 3 août », sans l'année si c'est l'année en cours. */
function jourCourt(iso, anneeCourante) {
  const d = new Date(`${iso}T12:00:00Z`);
  const j = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return d.getUTCFullYear() === anneeCourante ? j : `${j} ${d.getUTCFullYear()}`;
}

/**
 * Ce qui est déjà passé à l'antenne.
 *
 * Une vidéo de catalogue ne peut rien dire d'elle-même au-delà de sa date de
 * publication ; une émission de télévision, si : elle a été diffusée, tel jour,
 * à telle heure. C'est une information qu'aucune chaîne YouTube ne possède, et
 * qui ne s'invente pas après coup — elle n'existe que parce que le site archive
 * sa grille chaque nuit.
 *
 * On n'affiche que le DERNIER passage, jamais leur nombre. Compter les
 * rediffusions se retourne contre la chaîne : là où un annonceur lirait de
 * l'exposition, un téléspectateur lit un catalogue trop court qui tourne en
 * boucle. Or c'est le téléspectateur qui est sur cette page. Le décompte reste
 * dans l'archive, disponible pour un usage interne.
 */
function blocHistorique(config, passages, buildTime) {
  if (!passages?.length) return '';
  const tv = config.tv || {};
  const [date, heure] = passages[0];
  return `<p class="tv-hist muted small">
    Diffusé sur le canal ${escapeHtml(tv.channelNumber || '14')} le ${escapeHtml(jourCourt(date, new Date(buildTime).getUTCFullYear()))} à ${escapeHtml(heure)}.
  </p>`;
}

export function categoryPage({
  config, categories, nav, category, videos, page, totalPages, buildTime,
  diffusionsRubrique = new Map(), archive = null,
}) {
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
    ${blocDiffusion(config, diffusionsRubrique.get(category.slug), category.title)}
  </header>
  ${grid(videos, { showCategory: false })}
  ${pagination(base, page, totalPages)}
  ${page === 1 ? newsletterForm(config, { compact: true }) : ''}
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

export function videoPage({
  config, categories, nav, video, related, buildTime,
  personnesParVideo = new Map(), presentateurParRubrique = new Map(),
  transcription = null, diffusionsVideo = new Map(), archive = null,
}) {
  const cat = video.playlists?.[0];
  // L'entrée rangée dans la vidéo ne porte que le titre et l'identifiant ; la
  // présentation de la rubrique vit dans l'objet complet, chargé au build.
  const rubrique = cat ? categories.find((c) => c.slug === cat.slug) : null;
  const gens = personnesParVideo.get(video.id) || [];
  const presentateur = cat ? presentateurParRubrique.get(cat.slug) : null;
  // Le présentateur figure déjà dans le nom de l'émission : sous la vidéo, on
  // met en avant les autres personnes citées, et le présentateur en dernier.
  const invites = gens.filter((p) => p.nom !== presentateur);
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
      ${gens.length ? `<p class="article-gens">${presentateur && gens.some((p) => p.nom === presentateur)
        ? `Présenté par <a href="/invites/${gens.find((p) => p.nom === presentateur).slug}/">${escapeHtml(presentateur)}</a>${invites.length ? ' · ' : ''}` : ''}${
        invites.length ? `Avec ${invites.map((p) => `<a href="/invites/${p.slug}/">${escapeHtml(p.nom)}</a>`).join(', ')}` : ''}</p>` : ''}
      ${blocDiffusion(config, diffusionsVideo.get(video.id), video.title)}
      ${blocHistorique(config, archive?.parVideo?.get(video.id), buildTime)}
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

  ${transcription ? `
  <section class="transcription" id="transcription">
    <div class="transcription-tete">
      <h2>Transcription de l'émission</h2>
      <p class="muted small">Transcription automatique de la bande son, non relue mot à mot.
        ${transcription.mots.toLocaleString('fr-FR')} mots${transcription.blocs[0]?.debut !== null ? ' — cliquez sur un horodatage pour lancer la vidéo à cet endroit' : ''}.</p>
    </div>
    <div class="transcription-corps" data-repliable>
      ${transcription.blocs.map((b) => `<p>${b.debut !== null
        ? `<a class="transcription-t" href="https://www.youtube.com/watch?v=${video.id}&amp;t=${Math.floor(b.debut)}s" data-seek="${Math.floor(b.debut)}">${escapeHtml(mmss(b.debut))}</a> ` : ''}${escapeHtml(b.texte)}</p>`).join('\n      ')}
    </div>
    <button class="btn transcription-plus" type="button" data-deplier>Afficher toute la transcription</button>
  </section>` : ''}

  ${rubrique?.description ? `
  <aside class="rubrique-note">
    <h2>À propos de « ${escapeHtml(cat.title)} »</h2>
    <p>${escapeHtml(truncate(rubrique.description, 320))}</p>
    <p><a href="/emissions/${cat.slug}/">Tous les épisodes de cette rubrique <span aria-hidden="true">→</span></a></p>
  </aside>` : ''}

  ${newsletterForm(config, { compact: true })}

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
      // Schema.org prévoit un champ pour le texte intégral d'une vidéo : c'est
      // ce qui permet à Google de savoir que la page contient la parole même.
      ...(transcription ? { transcript: transcription.blocs.map((b) => b.texte).join('\n\n') } : {}),
      ...(presentateur ? {
        author: {
          '@type': 'Person',
          name: presentateur,
          url: `${config.siteUrl.replace(/\/$/, '')}/invites/${slugifyNom(presentateur)}/`,
        },
      } : {}),
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
    <p class="muted small">Fonctionne partout, y compris sur iPhone · un envoi par semaine, le vendredi</p>
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

/**
 * Illustration d'une personne.
 *
 * Trois sources, dans cet ordre :
 *
 *   1. `vignette` — l'identifiant d'une vidéo choisie à la main. C'est le
 *      dernier mot : Michael a parfois une préférence que rien ne peut deviner
 *      (« la photo avec Hersh Goldberg », « le Rosh Hashana »).
 *   2. `photo` — un portrait déposé dans assets/visages/.
 *   3. À défaut, la vidéo la plus récente — mais JAMAIS un format court.
 *
 * Ce dernier point est la correction du 9 août 2026. Un Short dure moins de
 * deux minutes, il est filmé à la verticale, et sa miniature recadrée en 16/9
 * donne un visage coupé. Or les Shorts sont les publications les plus
 * récentes : ils gagnaient systématiquement. Une dizaine de fiches d'invités
 * en étaient défigurées — Torreton, Enthoven, Sophia Aram, Nora Bussigny…
 */
const DUREE_MINIMALE_VIGNETTE = 120;

function photoDe(personne) {
  const impose = personne.fiche?.vignette;
  if (impose) return YT_THUMB(impose);
  if (personne.fiche?.photo) return personne.fiche.photo;
  const v = personne.videos.find((x) => !x.isShort && (x.duration || 0) >= DUREE_MINIMALE_VIGNETTE)
    || personne.videos[0];
  return v ? (v.thumbnail || YT_THUMB(v.id)) : '/assets/logo.png';
}

/**
 * Fiche d'une personne : ce qu'elle a dit sur Tandem TV, et quand.
 *
 * Principe de prudence : la page n'affirme rien sur la personne qui ne soit
 * déductible du catalogue. Une fonction ou un texte de présentation ne
 * s'affichent que s'ils ont été écrits à la main dans data/personnes.json.
 */
export function personPage({ config, categories, nav, personne, buildTime }) {
  const n = personne.videos.length;
  const dates = personne.videos.map((v) => v.publishedAt).filter(Boolean).sort();
  const annee = (d) => (d ? new Date(d).getFullYear() : null);
  const de = annee(dates[0]);
  const a = annee(dates[dates.length - 1]);
  const periode = de && a ? (de === a ? `en ${de}` : `entre ${de} et ${a}`) : '';

  const resume = personne.presente.length
    ? `${escapeHtml(personne.nom)} présente ${personne.presente.length > 1 ? 'les émissions' : "l'émission"} ${personne.presente.map((t) => escapeHtml(t)).join(', ')} sur ${escapeHtml(config.siteName)}.`
    : `${escapeHtml(personne.nom)} est intervenu${n > 1 ? ' à ' + n + ' reprises' : ''} sur ${escapeHtml(config.siteName)}${periode ? ` ${periode}` : ''}.`;

  // « Qui est … ? » — la question que les gens posent réellement.
  //
  // Search Console, 18 août 2026 : les requêtes les plus fortes du site sont
  // biographiques. « stephan zeev goldin origine parents » pèse à elle seule
  // 897 impressions, « samuel madar wikipédia » 603, « maxime loth » 700. Les
  // gens cherchent QUI sont ces personnes. La fiche leur répondait par une
  // grille de vignettes, sans une ligne de texte : d'où une visibilité réelle
  // et un taux de clic de 1,6 %.
  //
  // Michael ne peut pas écrire cinquante biographies, et les inventer serait
  // une faute — ce sont des personnes réelles. Mais la matière existe déjà :
  // les descriptions que la chaîne rédige pour YouTube présentent l'invité,
  // son parcours et son propos. On les remonte ici, débarrassées de leur
  // habillage promotionnel par excerpt(), et chacune reste rattachée à la
  // vidéo dont elle provient. Rien n'est inventé, rien n'est emprunté à un
  // tiers : chaque phrase vient d'un programme de la chaîne, et le lecteur
  // peut aller le vérifier d'un clic.
  //
  // Le seuil de 120 signes écarte les descriptions vides ou réduites à un
  // titre : mieux vaut trois extraits qui disent quelque chose que six dont la
  // moitié ne dit rien.
  const propos = personne.videos
    .map((v) => ({ v, texte: extraitPresentation(v) }))
    .filter((x) => x.texte)
    .slice(0, 5);

  // Une seule fois chaque vidéo, et toujours cliquable.
  //
  // Michael, 19 août 2026 : « il y a de la redondance dans ces nouvelles
  // fiches, et il faut aérer avec les vignettes cliquables ». C'était exact :
  // les mêmes vidéos étaient racontées en texte dans « Qui est… », puis
  // reprises en vignettes dans « Ses passages » — deux fois la même chose, et
  // le texte n'était pas cliquable. Sur une fiche à deux vidéos, la page se
  // répétait entièrement.
  //
  // Les extraits portent donc leur vignette, le bloc entier est un lien, et la
  // grille du bas ne montre plus que ce qui n'a pas déjà été détaillé.
  const detaillees = new Set(propos.map(({ v }) => v.id));
  const reste = personne.videos.filter((v) => !detaillees.has(v.id));

  const blocPropos = propos.length ? `
  <section class="personne-propos">
    <h2>Qui est ${escapeHtml(personne.nom)} ?</h2>
    ${propos.map(({ v, texte }) => `
    <a class="propos" href="/video/${escapeHtml(v.id)}/">
      <span class="propos-vignette"><img src="${escapeHtml(v.thumbnail || '')}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="270">${v.duration ? `<span class="propos-duree">${formatDuration(v.duration)}</span>` : ''}</span>
      <span class="propos-corps">
        <span class="propos-titre">${escapeHtml(v.title)}</span>
        ${v.publishedAt ? `<span class="propos-date">${escapeHtml(formatDate(v.publishedAt))}</span>` : ''}
        <span class="propos-texte">${escapeHtml(texte)}</span>
      </span>
    </a>`).join('')}
  </section>` : '';

  const content = `
<div class="wrap">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <a href="/invites/">Invités et intervenants</a> <span>›</span> <span>${escapeHtml(personne.nom)}</span></nav>

  <header class="page-head personne-tete">
    <div class="personne-portrait">
      <img src="${escapeHtml(photoDe(personne))}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" width="480" height="270">
    </div>
    <div class="personne-intro">
    <p class="kicker">${personne.presente.length ? 'Présentateur' : 'Invité'}</p>
    <h1>${escapeHtml(personne.nom)}</h1>
    ${(personne.fiche?.role || personne.identite) ? `<p class="lede">${escapeHtml(personne.fiche?.role || personne.identite)}</p>` : ''}
    <p class="muted">${resume}</p>
    ${personne.fiche?.texte ? `<div class="personne-texte">${descriptionToHtml(personne.fiche.texte)}</div>` : ''}
    ${personne.rubriques.length ? `<p class="muted small">Rubriques : ${personne.rubriques.map((t) => escapeHtml(t)).join(' · ')}</p>` : ''}
    </div>
  </header>

  ${blocPropos}

  ${reste.length ? `<section class="row">
    <div class="row-head"><h2 class="row-title">${propos.length
      ? `Ses ${reste.length} autre${reste.length > 1 ? 's' : ''} passage${reste.length > 1 ? 's' : ''}`
      : (n > 1 ? `Ses ${n} passages` : 'Son passage')} sur ${escapeHtml(config.siteName)}</h2></div>
    ${grid(reste)}
  </section>` : ''}
</div>`;

  return layout({
    config, categories, nav, buildTime,
    title: personne.nom,
    description: `${personne.nom}${personne.fiche?.role || personne.identite ? ` — ${personne.fiche?.role || personne.identite}` : ''}. ${n} vidéo${n > 1 ? 's' : ''} sur ${config.siteName}${periode ? `, ${periode}` : ''}.`.trim(),
    canonical: `/invites/${personne.slug}/`,
    image: personne.videos[0]?.thumbnail,
    bodyClass: 'page-personne',
    content,
    jsonLd: [
      breadcrumbLd(config, [
        { name: 'Accueil', path: '/' },
        { name: 'Invités et intervenants', path: '/invites/' },
        { name: personne.nom, path: `/invites/${personne.slug}/` },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        mainEntity: {
          '@type': 'Person',
          name: personne.nom,
          url: `${config.siteUrl.replace(/\/$/, '')}/invites/${personne.slug}/`,
          ...((personne.fiche?.role || personne.identite) ? { jobTitle: personne.fiche?.role || personne.identite } : {}),
          ...(personne.presente.length
            ? { worksFor: { '@type': 'Organization', name: config.siteName, url: config.siteUrl } }
            : {}),
        },
      },
      // Liste des passages, en simples entrées de liste et non en « VideoObject ».
      // Une vidéo n'a qu'une fiche technique légitime : celle de sa propre page,
      // complète (vignette, lecteur, durée). En répéter une version tronquée ici
      // faisait remonter deux avertissements de Google — vignette manquante,
      // adresse de lecture manquante — sans rien lui apprendre de plus.
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `Passages de ${personne.nom} sur ${config.siteName}`,
        numberOfItems: personne.videos.length,
        itemListElement: personne.videos.slice(0, 50).map((v, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${config.siteUrl.replace(/\/$/, '')}/video/${v.id}/`,
          name: v.title,
        })),
      },
    ],
  });
}

/** Index alphabétique des personnes reçues ou présentes à l'antenne. */
export function personIndexPage({ config, categories, nav, personnes, buildTime }) {
  const tries = [...personnes].sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));

  const content = `
<div class="wrap">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>Invités et intervenants</span></nav>

  <header class="page-head">
    <p class="kicker">Les visages de la chaîne</p>
    <h1>Invités et intervenants</h1>
    <p class="lede">Les ${personnes.length} personnes que l'on retrouve le plus souvent à l'antenne de ${escapeHtml(config.siteName)} — présentateurs et invités. Chaque fiche rassemble leurs passages.</p>
  </header>

  <ul class="personnes-liste">
    ${tries.map((p) => `<li><a class="personne-carte" href="/invites/${p.slug}/">
      <span class="personne-photo"><img src="${escapeHtml(photoDe(p))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="270"></span>
      <span class="personne-nom">${escapeHtml(p.nom)}</span>
      ${(p.fiche?.role || p.identite) ? `<span class="personne-role">${escapeHtml(p.fiche?.role || p.identite)}</span>` : ''}
      <span class="muted small">${p.videos.length} vidéo${p.videos.length > 1 ? 's' : ''}</span>
    </a></li>`).join('')}
  </ul>
</div>`;

  return layout({
    config, categories, nav, buildTime,
    title: 'Invités et intervenants',
    description: `Toutes les personnes reçues ou présentes à l'antenne de ${config.siteName} : présentateurs, invités, spécialistes. Une fiche par personne, avec l'ensemble de ses passages.`,
    canonical: '/invites/',
    bodyClass: 'page-invites',
    content,
    jsonLd: [
      breadcrumbLd(config, [
        { name: 'Accueil', path: '/' },
        { name: 'Invités et intervenants', path: '/invites/' },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        url: `${config.siteUrl.replace(/\/$/, '')}/invites/`,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: tries.length,
          itemListElement: tries.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${config.siteUrl.replace(/\/$/, '')}/invites/${p.slug}/`,
            name: p.nom,
          })),
        },
      },
    ],
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

export function contentPage({ config, categories, nav, title, description, canonical, html, buildTime, libelle, image }) {
  // Le fil d'Ariane porte le libelle court, pas le titre ecrit pour Google.
  const fil = libelle || title;
  const content = `
<div class="wrap narrow">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>${escapeHtml(fil)}</span></nav>
  <article class="prose page-prose">
    ${html}
  </article>
</div>`;
  return layout({
    config, categories, nav, buildTime, title, description, canonical, image,
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

/**
 * Les programmes que Tandem TV diffuse sans les produire.
 *
 * Une chaîne de télévision n'est pas seulement un catalogue de productions
 * maison : c'est aussi une grille où d'autres voix trouvent une antenne. Ces
 * programmes-là étaient jusqu'ici invisibles sur le site — présents plusieurs
 * fois par jour au canal 14, absents de toutes les pages, faute d'une vidéo
 * Tandem TV à laquelle les rattacher.
 *
 * La page les regroupe par SOURCE et non par programme : l'ECUJE fournit deux
 * émissions, Radio Shalom aussi. Un visiteur qui découvre « Du côté de chez
 * Szwarc » a intérêt à savoir que « Mémoire et vigilance » vient de la même
 * maison, et surtout où retrouver le reste de leur travail.
 */
export function partenairesPage({ config, categories, nav, partenaires = [], grille, buildTime }) {
  const tv = config.tv || {};
  const canal = escapeHtml(tv.channelNumber || '14');

  const reseauNom = { youtube: 'YouTube', instagram: 'Instagram', web: 'Site' };

  const carte = (p) => {
    // Le monogramme évite l'image cassée quand aucune vignette n'est fournie —
    // le cas de tous les comptes Instagram, qui n'ont aucun accès automatique.
    const vignette = p.avatar
      ? `<img class="pa-vignette" src="${escapeHtml(p.avatar)}" alt="" width="72" height="72" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="pa-vignette pa-mono" aria-hidden="true">${escapeHtml((p.nom || '?').trim().charAt(0).toUpperCase())}</span>`;

    const emissions = p.programmes.map((e) => escapeHtml(e.nom)).join(' <span class="dot">·</span> ');

    // Rythme : la grille sait combien de fois par jour le programme passe.
    // Pour les formats courts, c'est plus parlant qu'une heure précise.

    const prochains = p.prochains?.length
      ? ` data-prochains="${escapeHtml(JSON.stringify(p.prochains))}"`
      : '';

    return `
<article class="pa-carte" id="${escapeHtml(p.cle)}"${prochains}>
  ${vignette}
  <div class="pa-corps">
    <h2 class="pa-nom">${p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.nom)}</a>` : escapeHtml(p.nom)}</h2>
    <p class="pa-meta">
      ${p.url ? `<span class="pa-reseau pa-reseau--${escapeHtml(p.reseau)}">${escapeHtml(reseauNom[p.reseau] || 'Lien')}</span>` : ''}
    </p>
    ${p.description ? `<p class="pa-desc">${escapeHtml(p.description).replace(/\n+/g, '<br>')}</p>` : ''}
    <p class="pa-emissions"><span class="pa-etiquette">Sur Tandem TV</span> ${emissions}</p>
    ${p.source ? `<p class="pa-source muted small">Une production ${escapeHtml(p.source)}</p>` : ''}
    <p class="pa-prochain" hidden></p>
  </div>
</article>`;
  };

  const content = `
<div class="wrap">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>Autres programmes</span></nav>

  <header class="page-head">
    <p class="kicker">Canal ${canal}${tv.operator ? ` · ${escapeHtml(tv.operator)}` : ''}</p>
    <h1>Les autres programmes de l'antenne</h1>
    <p class="lede">Tandem TV ne diffuse pas que ses propres productions. Chaînes, radios, magazines et
    créateurs trouvent aussi une place sur le canal ${canal}. Voici où les retrouver, et quand ils passent.</p>
  </header>

  ${partenaires.length ? `<div class="pa-liste">${partenaires.map(carte).join('')}</div>` : `
  <p class="g-avis">Aucun programme extérieur n'est encore renseigné.</p>`}

  <p class="g-note muted small">
    Les horaires annoncés sont ceux de la grille du canal ${canal}, en <strong>heures d'Israël</strong>.
    ${nav.grille ? '<a href="/grille/">Voir la grille complète</a>.' : ''}
  </p>
</div>
${grille?.pourNavigateur?.length
    ? `<script id="g-donnees" type="application/json">${JSON.stringify(grille.pourNavigateur)}</script>`
    : ''}`;

  return layout({
    config,
    categories,
    nav,
    buildTime,
    title: 'Les autres programmes de l\'antenne',
    description: `Les chaînes, radios et créateurs dont ${config.siteName} diffuse les programmes sur le canal ${tv.channelNumber || '14'}${tv.operator ? ` du bouquet ${tv.operator}` : ''} : où les retrouver et quand ils passent à l'antenne.`,
    canonical: '/autres-programmes/',
    bodyClass: 'page-partenaires',
    content,
    jsonLd: breadcrumbLd(config, [
      { name: 'Accueil', path: '/' },
      { name: 'Les autres programmes de l\'antenne', path: '/autres-programmes/' },
    ]),
  });
}


/**
 * Lettre hebdomadaire.
 *
 * Un e-mail par vidéo était le réglage initial. Michael a objecté, à juste
 * titre, le 7 août 2026 : sur une liste qui n'a jamais rien reçu, quatre
 * messages par semaine récoltent des désabonnements et des signalements avant
 * de récolter des lecteurs. Le risque d'indésirable ne tient pas au nombre
 * d'envois mais à l'engagement : moins d'envois, mieux ouverts, valent mieux
 * qu'un flux régulier qu'on n'ouvre plus.
 *
 * D'où trois blocs, et le troisième est celui qui justifie l'abonnement :
 *   - la vidéo de tête, en grand ;
 *   - les autres de la semaine, en lignes compactes ;
 *   - « À revoir », des vidéos plus anciennes parmi les plus vues, qu'un
 *     abonné récent n'a jamais croisées. Sans ce bloc, la lettre n'est qu'une
 *     liste de nouveautés — quelque chose qu'un flux RSS fait mieux.
 */
export function lettreHebdo(config, {
  une, autres = [], aRevoir = [], intro = '', date = '',
} = {}) {
  const base = String(config.siteUrl || '').replace(/\/$/, '');
  const lien = (v) => `${base}/video/${v.i}/`;
  const P = 'margin:0 0 16px;font-size:16px;line-height:1.55;color:#1a1a1a;';
  const MARINE = '#180058';

  const ligne = (v) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px;">
    <tr>
      <td width="180" valign="top" style="padding-right:14px;">
        <a href="${escapeHtml(lien(v))}"><img src="${escapeHtml(v.n || '')}" alt="" width="180"
           style="width:180px;height:auto;display:block;border:0;border-radius:4px;"></a>
      </td>
      <td valign="top">
        ${v.c ? `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6a6455;">${escapeHtml(v.c)}</p>` : ''}
        <p style="margin:0;font-size:16px;line-height:1.35;">
          <a href="${escapeHtml(lien(v))}" style="color:${MARINE};text-decoration:none;font-weight:bold;">${escapeHtml(v.t || '')}</a>
        </p>
      </td>
    </tr>
  </table>`;

  const bloc = (titre, liste) => (liste.length ? `
  <p style="margin:32px 0 14px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${MARINE};border-top:1px solid #e4dfd3;padding-top:18px;">${escapeHtml(titre)}</p>
  ${liste.map(ligne).join('')}` : '');

  const tete = une ? `
  ${une.c ? `<p style="margin:0 0 10px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${MARINE};">${escapeHtml(une.c)}</p>` : ''}
  <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:${MARINE};">
    <a href="${escapeHtml(lien(une))}" style="color:${MARINE};text-decoration:none;">${escapeHtml(une.t || '')}</a>
  </h1>
  <p style="margin:0 0 20px;">
    <a href="${escapeHtml(lien(une))}"><img src="${escapeHtml(une.n || '')}" alt="" width="568"
       style="width:100%;max-width:568px;height:auto;display:block;border:0;border-radius:6px;"></a>
  </p>
  ${une.d ? `<p style="${P}">${escapeHtml(phrasesEntieres(une.d))}</p>` : ''}
  <p style="margin:0 0 8px;">
    <a href="${escapeHtml(lien(une))}" style="display:inline-block;padding:13px 26px;background:${MARINE};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-family:Helvetica,Arial,sans-serif;">Regarder la vidéo</a>
  </p>` : '';

  return `<div style="max-width:600px;margin:0 auto;padding:8px 16px;font-family:Georgia,'Times New Roman',serif;">
  ${date ? `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6a6455;">${escapeHtml(date)}</p>` : ''}
  ${intro ? `<p style="${P}">${escapeHtml(intro)}</p>` : ''}
  ${tete}
  ${bloc('Aussi cette semaine', autres)}
  ${bloc('À revoir', aRevoir)}
  <p style="margin:32px 0 8px;font-size:14px;line-height:1.5;color:#555;border-top:1px solid #e4dfd3;padding-top:18px;">
    Vous recevez cette lettre parce que vous vous êtes inscrit sur ${escapeHtml(config.siteName)}.
    ${config.tv?.channelNumber ? `Retrouvez-nous aussi à la télévision, canal ${escapeHtml(config.tv.channelNumber)} du bouquet ${escapeHtml(config.tv.operator || 'Annatel TV')}.` : ''}
  </p>
  <p style="margin:0;font-size:14px;color:#555;">
    <a href="${escapeHtml(base)}" style="color:${MARINE};">${escapeHtml(base.replace(/^https?:\/\//, ''))}</a>
  </p>
</div>`;
}


/**
 * Coupe un resume a la fin de sa derniere phrase complete.
 *
 * « … Rony Hayot deconstruit les… » : une phrase tranchee au milieu d'un mot
 * signale une machine. Si aucune ponctuation forte n'apparait dans les deux
 * premiers tiers, on garde le texte tel quel — mieux vaut un extrait long
 * qu'un extrait vide.
 */
function phrasesEntieres(texte) {
  const t = String(texte || '').trim();
  const fin = Math.max(t.lastIndexOf('. '), t.lastIndexOf('? '), t.lastIndexOf('! '),
    t.endsWith('.') || t.endsWith('?') || t.endsWith('!') ? t.length - 1 : -1);
  return fin > t.length * 0.35 ? t.slice(0, fin + 1).trim() : t;
}


/**
 * Page « Nos partenaires » : les MÉDIAS amis.
 *
 * A ne pas confondre avec /autres-programmes/, qui presente les producteurs
 * dont la chaine diffuse les emissions. Ici, aucun echange de programmes :
 * une radio, un groupe Telegram, des medias avec lesquels Tandem TV avance.
 * La distinction n'est pas administrative — un visiteur qui cherche « qui
 * produit cette emission ? » et un visiteur qui cherche « qui sont vos amis ? »
 * ne cherchent pas la meme chose, et melanger les deux les egare tous les deux.
 */
export function partenairesMediasPage({ config, categories, nav, medias = {}, buildTime }) {
  const liste = medias.partenaires || [];
  const titre = medias.titre || 'Nos partenaires';

  const carte = (p) => `
<article class="pm-carte" id="${escapeHtml(p.cle || '')}">
  <div class="pm-tete">
    ${p.logo ? `<img class="pm-logo" src="${escapeHtml(p.logo)}" alt="${escapeHtml(p.nom || '')}" width="120" height="120" loading="lazy">` : ''}
    <div>
      <h2 class="pm-nom">${escapeHtml(p.nom || '')}</h2>
      ${p.baseline ? `<p class="pm-baseline muted small">${escapeHtml(p.baseline)}</p>` : ''}
    </div>
  </div>
  ${p.description ? `<p class="pm-desc">${escapeHtml(p.description)}</p>` : ''}
  ${(p.liens || []).length ? `<ul class="pm-liens">${(p.liens || []).map((l) => `
    <li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.libelle)}</a></li>`).join('')}</ul>` : ''}
  ${p.visuel ? `<figure class="pm-visuel"><img src="${escapeHtml(p.visuel)}" alt="${escapeHtml(p.visuelAlt || p.nom || '')}" loading="lazy"></figure>` : ''}
</article>`;

  const content = `
<div class="wrap">
  <nav class="breadcrumb"><a href="/">Accueil</a> <span>›</span> <span>${escapeHtml(titre)}</span></nav>

  <header class="page-head">
    <p class="kicker">Médias amis</p>
    <h1>${escapeHtml(titre)}</h1>
    ${medias.chapeau ? `<p class="lede">${escapeHtml(medias.chapeau)}</p>` : ''}
  </header>

  ${liste.length
    ? `<div class="pm-liste">${liste.map(carte).join('')}</div>`
    : '<p class="g-avis">Aucun partenaire n\'est encore renseigné.</p>'}

  ${nav.partenaires ? `<p class="g-note muted small">
    Vous cherchez plutôt les producteurs dont Tandem TV diffuse les émissions ?
    <a href="/autres-programmes/">Voir les autres programmes de l'antenne</a>.
  </p>` : ''}
</div>`;

  return layout({
    config,
    categories,
    nav,
    buildTime,
    title: titre,
    description: `Les médias avec lesquels ${config.siteName} collabore : ${liste.map((p) => p.nom).join(', ')}.`,
    canonical: '/partenaires/',
    bodyClass: 'page-medias',
    content,
    jsonLd: breadcrumbLd(config, [
      { name: 'Accueil', path: '/' },
      { name: titre, path: '/partenaires/' },
    ]),
  });
}


/**
 * Page « Stories du jour » : les images 9:16 prêtes à publier.
 *
 * Pourquoi cette page existe : Meta n'autorise AUCUN sticker sur une story
 * déposée par l'API — ni lien, ni sondage, ni mention. Une story publiée
 * automatiquement serait donc muette, sans rien à toucher. Michael a tranché le
 * 9 août 2026 : le site fabrique l'image, lui la publie depuis l'application et
 * y pose le lien vers YouTube.
 *
 * Cette page est donc un outil, pas une page de site : elle s'ouvre sur un
 * téléphone, on y enregistre l'image d'un appui long, on copie l'adresse, et
 * l'on passe dans Instagram. Elle n'est ni dans les menus, ni dans le plan du
 * site, ni indexable — c'est une page de coulisses.
 */
export function storiesPage({ config, categories, nav, stories = [], buildTime }) {
  const carte = (e) => `
<article class="st-carte" data-id="${escapeHtml(e.id)}">
  <img class="st-image" src="/insta/story-${escapeHtml(e.id)}.jpg" alt="" loading="lazy" width="1080" height="1920">
  <div class="st-corps">
    <p class="st-rubrique">${escapeHtml(e.rubrique || '')}</p>
    <h2 class="st-titre">${escapeHtml(e.titre || '')}</h2>
    <p class="st-actions">
      <button class="st-partager" type="button" hidden
        data-image="/insta/story-${escapeHtml(e.id)}.jpg"
        data-titre="${escapeHtml(e.titre || '')}">Partager vers Instagram</button>
      <a class="st-telecharger" href="/insta/story-${escapeHtml(e.id)}.jpg" download="story-${escapeHtml(e.id)}.jpg">Enregistrer l'image</a>
      <button class="st-masquer" type="button">Masquer</button>
    </p>
    <p class="st-lien">
      <input class="st-champ" type="text" readonly value="${escapeHtml(e.youtube || '')}" aria-label="Adresse YouTube">
      <button class="st-copier" type="button" data-lien="${escapeHtml(e.youtube || '')}">Copier</button>
    </p>
  </div>
</article>`;

  const content = `
<div class="wrap">
  <header class="page-head">
    <p class="kicker">Coulisses</p>
    <h1>Stories prêtes à publier</h1>
    <p class="lede">Sur téléphone, <strong>Partager vers Instagram</strong> envoie l'image
    directement dans l'application. Copiez l'adresse YouTube avant, puis posez le sticker
    <strong>Lien</strong> sur la story et collez-la. Meta interdit aux outils extérieurs de
    poser ce sticker : c'est le seul geste qui ne peut pas être automatisé.</p>
    <p class="lede small muted">Le bouton de partage n'apparaît que sur les appareils qui le
    permettent ; ailleurs, « Enregistrer l'image » fait le même travail en deux temps.
    <strong>Masquer</strong> écarte une proposition que vous ne publierez pas — sur cet
    appareil seulement, et sans rien envoyer nulle part.</p>
  </header>

  <p id="st-retablir" class="st-retablir muted small" hidden>
    Des propositions sont masquées. <button id="st-tout-remontrer" type="button" class="st-lien-bouton">Tout réafficher</button>
  </p>

  ${stories.length
    ? `<div class="st-liste">${stories.map(carte).join('')}</div>`
    : '<p class="g-avis">Aucune story disponible pour le moment.</p>'}

  <p id="st-vide" class="g-avis" hidden>Toutes les propositions sont masquées.</p>
</div>
<script>
(function () {
  var CLE = 'tandem-stories-masquees';

  function masquees() {
    try { return JSON.parse(localStorage.getItem(CLE) || '[]'); } catch (e) { return []; }
  }
  function enregistrer(liste) {
    try { localStorage.setItem(CLE, JSON.stringify(liste.slice(-60))); } catch (e) { /* mode privé */ }
  }

  // Les propositions ecartees restent ecartees, sur CET appareil seulement.
  // Rien n'est envoye nulle part : le site est fabrique d'avance et ne sait
  // pas ce que Michael a choisi de publier.
  function appliquer() {
    var cachees = masquees(), reste = 0;
    document.querySelectorAll('.st-carte').forEach(function (c) {
      var off = cachees.indexOf(c.dataset.id) !== -1;
      c.hidden = off;
      if (!off) reste++;
    });
    var barre = document.getElementById('st-retablir');
    if (barre) barre.hidden = cachees.length === 0;
    var vide = document.getElementById('st-vide');
    if (vide) vide.hidden = reste !== 0;
  }

  // Le partage natif accepte-t-il un fichier ? Sur iPhone oui, et la feuille de
  // partage propose Instagram directement — c'est le chemin le plus court :
  // un appui, et l'image arrive dans les stories sans passer par les Photos.
  var partageFichiers = !!(navigator.canShare && navigator.share);
  if (partageFichiers) {
    document.querySelectorAll('.st-partager').forEach(function (b) { b.hidden = false; });
  }

  document.addEventListener('click', function (ev) {
    var copier = ev.target.closest('.st-copier');
    if (copier) {
      navigator.clipboard.writeText(copier.dataset.lien).then(function () {
        var avant = copier.textContent;
        copier.textContent = 'Copié'; copier.classList.add('ok');
        setTimeout(function () { copier.textContent = avant; copier.classList.remove('ok'); }, 1600);
      });
      return;
    }

    var cacher = ev.target.closest('.st-masquer');
    if (cacher) {
      var carte = cacher.closest('.st-carte');
      var liste = masquees();
      if (liste.indexOf(carte.dataset.id) === -1) liste.push(carte.dataset.id);
      enregistrer(liste); appliquer();
      return;
    }

    if (ev.target.id === 'st-tout-remontrer') {
      enregistrer([]); appliquer();
      return;
    }

    var part = ev.target.closest('.st-partager');
    if (part) {
      var avant = part.textContent;
      part.textContent = 'Préparation…'; part.disabled = true;
      fetch(part.dataset.image).then(function (r) { return r.blob(); }).then(function (blob) {
        var f = new File([blob], 'story.jpg', { type: 'image/jpeg' });
        if (navigator.canShare && !navigator.canShare({ files: [f] })) throw new Error('fichier refusé');
        return navigator.share({ files: [f], title: part.dataset.titre });
      }).catch(function () {
        // Partage refuse ou annule : on ne dit rien, l'utilisateur a toujours
        // le bouton « Enregistrer l'image » juste a cote.
      }).then(function () {
        part.textContent = avant; part.disabled = false;
      });
    }
  });

  appliquer();
})();
</script>`;

  return layout({
    config,
    categories,
    nav,
    buildTime,
    title: 'Stories prêtes à publier',
    description: 'Page de coulisses.',
    canonical: '/story/',
    bodyClass: 'page-stories',
    robots: 'noindex, nofollow',
    // Sans le manifeste de l'application. Sinon « Ajouter a l'ecran d'accueil »
    // sur iPhone suit le `start_url` du manifeste — la racine du site — et le
    // raccourci retombe sur l'accueil au lieu de cette page. Constate par
    // Michael le 9 aout 2026.
    sansManifeste: true,
    content,
  });
}
