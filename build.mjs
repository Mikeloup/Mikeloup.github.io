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
import { slugify, escapeHtml, truncate, excerpt, paginate, cleanDescription } from './src/util.mjs';
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
  let playlists = await yt.fetchPlaylists(channel.id);
  const exclude = new Set((config.playlists?.exclude || []).map((x) => String(x).trim()));
  playlists = playlists.filter((p) => !exclude.has(p.id) && !exclude.has(p.title));
  log(`  ${playlists.length} playlist(s) retenue(s)`);

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

function buildModel(config, data) {
  const byId = new Map(data.videos.map((v) => [
    v.id,
    { ...v, description: cleanDescription(v.description, v.title), playlists: [] },
  ]));

  // Ordre des rubriques : celui de config.playlists.order d'abord, puis YouTube.
  const order = config.playlists?.order || [];
  const rank = (p) => {
    const i = order.findIndex((o) => o === p.id || o === p.title);
    return i === -1 ? order.length + 1 : i;
  };

  const categories = data.playlists
    .map((p) => {
      const videos = p.videoIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      return { ...p, slug: slugify(p.title), videos };
    })
    .filter((c) => c.videos.length >= (config.playlists?.minVideos ?? 1))
    // Rubriques les plus récemment alimentées en premier ; `order` reste prioritaire.
    .sort((a, b) => rank(a) - rank(b)
      || new Date(b.videos[0]?.publishedAt || 0) - new Date(a.videos[0]?.publishedAt || 0)
      || b.videos.length - a.videos.length);

  // Slugs uniques
  const seen = new Map();
  for (const c of categories) {
    const n = (seen.get(c.slug) || 0) + 1;
    seen.set(c.slug, n);
    if (n > 1) c.slug = `${c.slug}-${n}`;
  }

  // Rattache chaque vidéo à ses rubriques (ordre = ordre des rubriques).
  for (const c of categories) {
    for (const v of c.videos) v.playlists.push({ id: c.id, title: c.title, slug: c.slug });
  }

  const allVideos = [...byId.values()]
    .filter((v) => !v.isShort || v.playlists.length)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return { channel: data.channel, categories, allVideos, byId };
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
  const { categories, allVideos } = buildModel(config, data);

  if (!allVideos.length) throw new Error('Aucune vidéo récupérée : build interrompu.');
  log(`${allVideos.length} vidéos, ${categories.length} rubriques.`);

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const ctx = { config, categories, buildTime };
  const urls = [];

  // Accueil
  await writePage('/', R.homePage({ ...ctx, latest: allVideos }));
  urls.push({ loc: '/', freq: 'daily', priority: '1.0', lastmod: allVideos[0]?.publishedAt });

  // Catalogue complet, paginé
  const allPages = paginate(allVideos, PER_PAGE);
  for (const [i, pageVideos] of allPages.entries()) {
    const page = i + 1;
    const route = page === 1 ? '/emissions/' : `/emissions/page/${page}/`;
    await writePage(route, R.allCategoriesPage({
      ...ctx, videos: pageVideos, page, totalPages: allPages.length,
    }));
    urls.push({ loc: route, freq: 'daily', priority: page === 1 ? '0.9' : '0.4' });
  }

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
    const html = markdownToHtml(md.replace(/\{\{email\}\}/g, config.contactEmail));
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
  await writeFile('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
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
