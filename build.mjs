#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Générateur du site Tandem TV.
//
//   node build.mjs           → build réel (nécessite YOUTUBE_API_KEY)
//   node build.mjs --demo    → build avec les données de démonstration
//
// Le site produit est entièrement statique et se trouve dans ./dist
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yt from './src/youtube.mjs';
import { markdownToHtml } from './src/markdown.mjs';
import {
  slugify, escapeHtml, truncate, excerpt, paginate, cleanDescription, smartTitle,
} from './src/util.mjs';
import * as R from './src/render.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PER_PAGE = 24;

const DEMO = process.argv.includes('--demo') || process.env.DEMO === '1';
const buildTime = process.env.SOURCE_DATE || new Date().toISOString();

const log = (...a) => console.log('▸', ...a);
const warn = (...a) => console.warn('⚠', ...a);

// --- Petits helpers fichiers -------------------------------------------------

async function writeFile(relPath, contents) {
  const full = path.join(DIST, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, contents, 'utf8');
}

async function writePage(routePath, html) {
  const rel = routePath.endsWith('.html')
    ? routePath.replace(/^\//, '')
    : path.join(routePath.replace(/^\//, ''), 'index.html');
  await writeFile(rel, html);
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(src, dst);
    else await fs.copyFile(src, dst);
  }
}

async function readJson(p, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

// --- Récupération des données ------------------------------------------------

async function collectFromApi(config) {
  yt.setApiKey(process.env.YOUTUBE_API_KEY);

  log('Chaîne…');
  const channel = await yt.fetchChannel(config.channelId, config.channelHandle);
  log(`  ${channel.title} — ${channel.videoCount} vidéos, ${channel.subscribers} abonnés`);

  log('Playlists…');
  const playlists = await yt.fetchPlaylists(channel.id);
  log(`  ${playlists.length} playlist(s) trouvée(s)`);

  log('Contenu des playlists…');
  for (const p of playlists) {
    p.videoIds = await yt.fetchPlaylistVideoIds(p.id);
    log(`  ${p.title} → ${p.videoIds.length}`);
  }

  log('Toutes les vidéos de la chaîne…');
  const uploadIds = await yt.fetchPlaylistVideoIds(channel.uploadsPlaylistId);
  log(`  ${uploadIds.length} vidéo(s) publiée(s)`);

  const allIds = [...new Set([...uploadIds, ...playlists.flatMap((p) => p.videoIds)])];
  log(`Détail de ${allIds.length} vidéo(s)…`);
  const videos = await yt.fetchVideos(allIds);

  log(`Quota API consommé : ~${yt.getQuotaUsed()} unités (limite quotidienne : 10 000)`);
  return { channel, playlists, videos, fetchedAt: buildTime };
}

async function collectData(config) {
  const cachePath = path.join(ROOT, 'data', 'cache.json');

  if (!DEMO && !process.env.YOUTUBE_API_KEY) {
    throw new Error(
      "YOUTUBE_API_KEY absente. Sur GitHub : Settings → Secrets and variables → Actions → "
      + "New repository secret, nom « YOUTUBE_API_KEY ». En local : "
      + "YOUTUBE_API_KEY=votre_clé node build.mjs (ou node build.mjs --demo pour la démo).",
    );
  }

  if (DEMO) {
    const demo = await readJson(path.join(ROOT, 'data', 'demo.json'));
    if (!demo) throw new Error('data/demo.json introuvable.');
    log('Mode démonstration : données fictives.');
    return demo;
  }

  try {
    const data = await collectFromApi(config);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(data), 'utf8');
    return data;
  } catch (err) {
    warn(`Échec de l'appel API : ${err.message}`);
    const cached = await readJson(cachePath);
    if (cached) {
      warn('Utilisation du cache de la dernière synchronisation réussie.');
      return cached;
    }
    throw err;
  }
}

// --- Mise en forme des données -----------------------------------------------

/** Clé de comparaison insensible à la casse, aux accents et aux espaces. */
function normKey(str = '') {
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildModel(config, data) {
  const byId = new Map(data.videos.map((v) => [
    v.id,
    { ...v, description: cleanDescription(v.description, v.title), playlists: [] },
  ]));

  // 1. Playlists exclues par la configuration (titre ou identifiant).
  const excluded = new Set((config.playlists?.exclude || []).map(normKey));
  let playlists = data.playlists.filter((p) => !excluded.has(normKey(p.title)) && !excluded.has(p.id));
  if (playlists.length !== data.playlists.length) {
    log(`${data.playlists.length - playlists.length} playlist(s) exclue(s) par la configuration.`);
  }

  // 2. Fusion des playlists qui ne diffèrent que par la casse ou les accents.
  if (config.playlists?.mergeDuplicates !== false) {
    const merged = new Map();
    for (const p of playlists) {
      const key = normKey(p.title);
      const found = merged.get(key);
      if (!found) {
        merged.set(key, { ...p, videoIds: [...p.videoIds] });
      } else {
        found.videoIds.push(...p.videoIds);
        if ((p.description || '').length > (found.description || '').length) found.description = p.description;
        if (!found.thumbnail) found.thumbnail = p.thumbnail;
      }
    }
    const before = playlists.length;
    playlists = [...merged.values()].map((p) => ({ ...p, videoIds: [...new Set(p.videoIds)] }));
    if (before !== playlists.length) log(`${before - playlists.length} playlist(s) en doublon fusionnée(s).`);
  }

  // 3. Ordre : `order` d'abord, puis activité la plus récente.
  const order = config.playlists?.order || [];
  const rank = (p) => {
    const i = order.findIndex((o) => normKey(o) === normKey(p.title) || o === p.id);
    return i === -1 ? order.length + 1 : i;
  };

  const themeKeys = new Set((config.groups?.themes?.playlists || []).map(normKey));

  const categories = playlists
    .map((p) => {
      const videos = p.videoIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .sort((a2, b2) => new Date(b2.publishedAt) - new Date(a2.publishedAt));
      return {
        ...p,
        rawTitle: p.title,
        // L'affichage corrige les titres tout en majuscules ; les comparaisons
        // (thèmes, exclusions, ordre) continuent de porter sur le titre d'origine.
        title: config.display?.smartCase === false
          ? p.title
          : smartTitle(p.title, config.display?.properNouns || []),
        slug: slugify(p.title),
        group: themeKeys.has(normKey(p.title)) ? 'themes' : 'shows',
        videos,
      };
    })
    .filter((c) => c.videos.length >= (config.playlists?.minVideos ?? 1))
    .sort((a2, b2) => rank(a2) - rank(b2)
      || new Date(b2.videos[0]?.publishedAt || 0) - new Date(a2.videos[0]?.publishedAt || 0)
      || b2.videos.length - a2.videos.length);

  // 4. Slugs uniques
  const seen = new Map();
  for (const c of categories) {
    const n = (seen.get(c.slug) || 0) + 1;
    seen.set(c.slug, n);
    if (n > 1) c.slug = `${c.slug}-${n}`;
  }

  // 5. Rattachement des vidéos à leurs rubriques : une émission d'abord,
  //    pour que l'étiquette affichée sur une vignette soit le rendez-vous.
  const ordered = [...categories].sort((a2, b2) => (a2.group === 'shows' ? 0 : 1) - (b2.group === 'shows' ? 0 : 1));
  for (const c of ordered) {
    for (const v of c.videos) v.playlists.push({ id: c.id, title: c.title, slug: c.slug, group: c.group });
  }

  const allVideos = [...byId.values()]
    .filter((v) => !v.isShort || v.playlists.length)
    .sort((a2, b2) => new Date(b2.publishedAt) - new Date(a2.publishedAt));

  // Une rubrique sort des menus quand elle n'a rien publié depuis N mois.
  const maxAgeMonths = config.playlists?.menuMaxAgeMonths ?? 0;
  const cutoff = maxAgeMonths > 0
    ? new Date(new Date(buildTime).getTime() - maxAgeMonths * 30.44 * 86_400_000)
    : null;
  // Règle mixte : une rubrique reste au menu si elle a publié récemment
  // OU si son catalogue dépasse un certain volume.
  const menuMin = config.playlists?.menuMinVideos ?? 0;
  const inMenu = (c) => {
    const recent = !cutoff
      || (c.videos[0]?.publishedAt ? new Date(c.videos[0].publishedAt) >= cutoff : false);
    const substantial = menuMin > 0 && c.videos.length >= menuMin;
    return recent || substantial;
  };
  const shows = categories.filter((c) => c.group === 'shows');
  const themes = categories.filter((c) => c.group === 'themes');
  // Ordre des menus et des index : par activité récente (défaut) ou alphabétique.
  // `categories` est déjà trié par activité, un simple filtre conserve cet ordre.
  const alpha = (list) => [...list].sort((a2, b2) => a2.title.localeCompare(b2.title, 'fr', { sensitivity: 'base' }));
  const sortMode = config.playlists?.sort === 'alpha' ? alpha : ((list) => list);
  const nav = {
    shows,
    themes,
    showsIndex: sortMode(shows),
    themesIndex: sortMode(themes),
    menuShows: sortMode(shows.filter(inMenu)),
    menuThemes: sortMode(themes.filter(inMenu)),
  };
  if (cutoff || menuMin) {
    const shown = nav.menuShows.length + nav.menuThemes.length;
    log(`Menus : ${shown} rubrique(s) sur ${categories.length} `
      + `(actives depuis moins de ${maxAgeMonths} mois, ou ${menuMin}+ vidéos). `
      + 'Les autres restent dans le catalogue et la recherche.');
  }

  return { channel: data.channel, categories, allVideos, byId, nav };
}

// --- Fichiers annexes --------------------------------------------------------

function rssFeed(config, videos) {
  const items = videos.slice(0, 50).map((v) => `
  <item>
    <title>${escapeHtml(v.title)}</title>
    <link>${config.siteUrl}/video/${v.id}/</link>
    <guid isPermaLink="true">${config.siteUrl}/video/${v.id}/</guid>
    <pubDate>${new Date(v.publishedAt).toUTCString()}</pubDate>
    ${v.playlists?.[0] ? `<category>${escapeHtml(v.playlists[0].title)}</category>` : ''}
    <description>${escapeHtml(excerpt(v.description, 500) || v.title)}</description>
  </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeHtml(config.siteName)}</title>
  <link>${config.siteUrl}/</link>
  <atom:link href="${config.siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
  <description>${escapeHtml(config.description)}</description>
  <language>${config.lang}</language>
  <lastBuildDate>${new Date(buildTime).toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;
}

/** Rend une URL absolue (les miniatures YouTube le sont déjà). */
function absoluteUrl(config, url) {
  if (!url) return '';
  return /^https?:\/\//.test(url) ? url : `${config.siteUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Sitemap vidéo au format Google : une entrée par vidéo, avec le lecteur,
 * la miniature, la durée et la date. C'est le signal le plus explicite pour
 * l'indexation vidéo.
 */
function videoSitemap(config, videos) {
  const items = videos
    .filter((v) => v.duration > 0 && v.duration <= 28_800)
    .map((v) => `  <url>
    <loc>${config.siteUrl}/video/${v.id}/</loc>
    <video:video>
      <video:thumbnail_loc>${escapeHtml(absoluteUrl(config, v.thumbnail) || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}</video:thumbnail_loc>
      <video:title>${escapeHtml(truncate(v.title, 100))}</video:title>
      <video:description>${escapeHtml(excerpt(v.description, 2000) || v.title)}</video:description>
      <video:player_loc allow_embed="yes">https://www.youtube-nocookie.com/embed/${v.id}</video:player_loc>
      <video:duration>${v.duration}</video:duration>
      <video:publication_date>${new Date(v.publishedAt).toISOString()}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
      <video:live>no</video:live>
      <video:uploader info="${config.channelUrl}">${escapeHtml(config.siteName)}</video:uploader>
    </video:video>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${items}
</urlset>`;
}

function sitemapIndex(config, files) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files.map((f) => `  <sitemap><loc>${config.siteUrl}/${f}</loc><lastmod>${new Date(buildTime).toISOString().slice(0, 10)}</lastmod></sitemap>`).join('\n')}
</sitemapindex>`;
}

function sitemap(config, urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${config.siteUrl}${u.loc}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}<changefreq>${u.freq || 'weekly'}</changefreq><priority>${u.priority || '0.6'}</priority></url>`).join('\n')}
</urlset>`;
}

// --- Build -------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
  config.siteUrl = config.siteUrl.replace(/\/$/, '');

  const data = await collectData(config);
  const { categories, allVideos, nav } = buildModel(config, data);

  if (!allVideos.length) throw new Error('Aucune vidéo récupérée : build interrompu.');
  log(`${allVideos.length} vidéos, ${categories.length} rubriques (${nav.shows.length} émissions, ${nav.themes.length} thèmes).`);

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const ctx = { config, categories, nav, buildTime };
  const urls = [];

  // Accueil
  await writePage('/', R.homePage({ ...ctx, latest: allVideos }));
  urls.push({ loc: '/', freq: 'daily', priority: '1.0', lastmod: allVideos[0]?.publishedAt });

  // Catalogue complet (sous /emissions/), paginé
  const allPages = paginate(allVideos, PER_PAGE);
  for (const [i, pageVideos] of allPages.entries()) {
    const page = i + 1;
    const route = page === 1 ? '/emissions/' : `/emissions/page/${page}/`;
    await writePage(route, R.groupIndexPage({
      ...ctx, group: 'shows', items: nav.showsIndex, videos: pageVideos, page, totalPages: allPages.length,
    }));
    urls.push({ loc: route, freq: 'daily', priority: page === 1 ? '0.9' : '0.4' });
  }

  // Index des thèmes
  await writePage('/themes/', R.groupIndexPage({
    ...ctx, group: 'themes', items: nav.themesIndex, rows: nav.themes, videos: null, page: 1, totalPages: 1,
  }));
  urls.push({ loc: '/themes/', freq: 'weekly', priority: '0.8' });

  // Une page (paginée) par rubrique
  for (const category of categories) {
    const pages = paginate(category.videos, PER_PAGE);
    for (const [i, pageVideos] of pages.entries()) {
      const page = i + 1;
      const route = page === 1 ? `/emissions/${category.slug}/` : `/emissions/${category.slug}/page/${page}/`;
      await writePage(route, R.categoryPage({
        ...ctx, category, videos: pageVideos, page, totalPages: pages.length,
      }));
      urls.push({ loc: route, freq: 'weekly', priority: page === 1 ? '0.8' : '0.4', lastmod: category.videos[0]?.publishedAt });
    }
  }

  // Une page par vidéo
  for (const video of allVideos) {
    const cat = video.playlists?.[0];
    const pool = cat ? categories.find((c) => c.slug === cat.slug).videos : allVideos;
    const related = pool.filter((v) => v.id !== video.id).slice(0, 8);
    await writePage(`/video/${video.id}/`, R.videoPage({ ...ctx, video, related }));
    urls.push({ loc: `/video/${video.id}/`, freq: 'monthly', priority: '0.7', lastmod: video.publishedAt });
  }

  // Pages éditoriales (Markdown) — la liste est pilotée par site.config.json
  const contentDir = path.join(ROOT, 'content');
  for (const pg of config.pages || []) {
    let md;
    try {
      md = await fs.readFile(path.join(contentDir, `${pg.slug}.md`), 'utf8');
    } catch {
      warn(`Page « ${pg.title} » ignorée : content/${pg.slug}.md est introuvable.`);
      continue;
    }
    const analyticsNote = config.analytics?.cloudflareToken
      ? "La fréquentation du site est mesurée avec **Cloudflare Web Analytics**. Cet outil ne dépose aucun cookie, n'utilise pas d'empreinte numérique et ne permet pas de vous identifier ni de vous suivre d'un site à l'autre. Il compte les pages vues et les provenances, de façon agrégée."
      : "Aucun outil de mesure d'audience n'est actif à ce jour. Si nous en installons un, ce sera une solution respectueuse de la vie privée, sans cookie et sans identification individuelle, et cette page sera mise à jour en conséquence.";
    const html = markdownToHtml(md
      .replace(/\{\{email\}\}/g, config.contactEmail)
      .replace(/\{\{analytics\}\}/g, analyticsNote));
    await writePage(`/${pg.slug}/`, R.contentPage({
      ...ctx,
      title: pg.title,
      description: pg.description || `${pg.title} — ${config.siteName}.`,
      canonical: `/${pg.slug}/`,
      html,
    }));
    urls.push({ loc: `/${pg.slug}/`, freq: 'monthly', priority: '0.5' });
  }

  // Recherche (index JSON + page cliente)
  await writePage('/recherche/', R.searchPage(ctx));
  await writeFile('search.json', JSON.stringify(allVideos.map((v) => ({
    i: v.id,
    t: v.title,
    d: excerpt(v.description, 220),
    p: v.publishedAt,
    c: v.playlists?.[0]?.title || '',
    s: v.playlists?.[0]?.slug || '',
    u: v.duration,
    n: v.thumbnail,
  }))));
  urls.push({ loc: '/recherche/', freq: 'monthly', priority: '0.3' });

  // 404, flux, sitemap, robots, assets
  await writePage('/404.html', R.notFoundPage(ctx));
  await writeFile('rss.xml', rssFeed(config, allVideos));
  await writeFile('sitemap.xml', sitemap(config, urls));
  await writeFile('sitemap-video.xml', videoSitemap(config, allVideos));
  await writeFile('sitemap-index.xml', sitemapIndex(config, ['sitemap.xml', 'sitemap-video.xml']));
  await writeFile('robots.txt',
    `User-agent: *\nAllow: /\n\n`
    + `Sitemap: ${config.siteUrl}/sitemap-index.xml\n`
    + `Sitemap: ${config.siteUrl}/sitemap.xml\n`
    + `Sitemap: ${config.siteUrl}/sitemap-video.xml\n`);
  await writeFile('.nojekyll', '');

  const domain = config.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (domain && !domain.includes('github.io')) await writeFile('CNAME', `${domain}\n`);

  await copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  for (const f of ['favicon.png']) {
    try {
      await fs.copyFile(path.join(ROOT, 'assets', f), path.join(DIST, f));
    } catch { /* facultatif */ }
  }

  log(`✅ ${urls.length} pages générées dans dist/ en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('\n❌ Build échoué :', err.message);
  process.exit(1);
});
