// -----------------------------------------------------------------------------
// Couche d'accès à l'API YouTube Data v3.
// Tout ce qui touche au réseau est ici. Le reste du build ne manipule que des
// objets simples ({ videos, playlists, channel }).
// -----------------------------------------------------------------------------

const API = 'https://www.googleapis.com/youtube/v3';

let apiKey = null;
let quotaUsed = 0;

export function setApiKey(key) {
  apiKey = key;
}

export function getQuotaUsed() {
  return quotaUsed;
}

async function api(endpoint, params, { cost = 1 } = {}) {
  if (!apiKey) throw new Error('YOUTUBE_API_KEY manquante.');
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  url.searchParams.set('key', apiKey);

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { referer: 'https://www.tandemtv.net' } });
      quotaUsed += cost;
      if (res.ok) return await res.json();

      const body = await res.text();
      // 403 = quota dépassé ou clé invalide : inutile de réessayer.
      if (res.status === 403 || res.status === 400) {
        throw new Error(`YouTube API ${res.status} sur ${endpoint} : ${body.slice(0, 400)}`);
      }
      lastError = new Error(`YouTube API ${res.status} sur ${endpoint} : ${body.slice(0, 200)}`);
    } catch (err) {
      if (String(err.message).includes('403') || String(err.message).includes('400')) throw err;
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw lastError;
}

/** Parcourt toutes les pages d'un endpoint paginé. */
async function apiAll(endpoint, params, { cost = 1, max = Infinity } = {}) {
  const items = [];
  let pageToken;
  do {
    const data = await api(endpoint, { ...params, pageToken, maxResults: 50 }, { cost });
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken && items.length < max);
  return items;
}

// --- Normalisation -----------------------------------------------------------

const PRIVATE_TITLES = new Set(['Private video', 'Deleted video', 'Vidéo privée', 'Vidéo supprimée']);

function bestThumb(thumbnails = {}) {
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null
  );
}

/** Convertit une durée ISO 8601 (PT1H2M3S) en secondes. */
export function parseDuration(iso) {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

function normalizeVideo(v) {
  const sn = v.snippet || {};
  const duration = parseDuration(v.contentDetails?.duration);
  return {
    id: v.id,
    title: sn.title || '',
    description: sn.description || '',
    publishedAt: sn.publishedAt || v.contentDetails?.videoPublishedAt || null,
    thumbnail: bestThumb(sn.thumbnails),
    tags: sn.tags || [],
    duration,
    isShort: duration > 0 && duration <= 60,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    playlists: [],
  };
}

// --- API publique du module --------------------------------------------------

export async function fetchChannel(channelId, handle) {
  // On tente d'abord l'ID ; si aucun ID n'est fourni (ou s'il est invalide),
  // on retrouve la chaîne via son identifiant @handle.
  let data = null;
  if (channelId) {
    data = await api('channels', {
      part: 'snippet,contentDetails,statistics,brandingSettings',
      id: channelId,
    });
  }
  if (!data?.items?.length && handle) {
    data = await api('channels', {
      part: 'snippet,contentDetails,statistics,brandingSettings',
      forHandle: String(handle).replace(/^@/, ''),
    });
  }
  const c = data?.items?.[0];
  if (!c) throw new Error(`Chaîne introuvable (id: ${channelId || '—'}, handle: ${handle || '—'})`);
  return {
    id: c.id,
    title: c.snippet.title,
    description: c.snippet.description,
    customUrl: c.snippet.customUrl,
    avatar: bestThumb(c.snippet.thumbnails),
    banner: c.brandingSettings?.image?.bannerExternalUrl || null,
    uploadsPlaylistId: c.contentDetails.relatedPlaylists.uploads,
    subscribers: Number(c.statistics?.subscriberCount || 0),
    videoCount: Number(c.statistics?.videoCount || 0),
  };
}

export async function fetchPlaylists(channelId) {
  const items = await apiAll('playlists', { part: 'snippet,contentDetails', channelId });
  return items.map((p) => ({
    id: p.id,
    title: p.snippet.title,
    description: p.snippet.description || '',
    thumbnail: bestThumb(p.snippet.thumbnails),
    itemCount: p.contentDetails?.itemCount || 0,
    publishedAt: p.snippet.publishedAt,
    videoIds: [],
  }));
}

/** Renvoie les IDs de vidéos d'une playlist, dans l'ordre de la playlist. */
export async function fetchPlaylistVideoIds(playlistId) {
  const items = await apiAll('playlistItems', { part: 'snippet,contentDetails', playlistId });
  return items
    .filter((it) => !PRIVATE_TITLES.has(it.snippet?.title))
    .filter((it) => it.snippet?.resourceId?.kind === 'youtube#video')
    .map((it) => it.contentDetails?.videoId || it.snippet.resourceId.videoId)
    .filter(Boolean);
}

/** Détail complet des vidéos, par lots de 50 (1 unité de quota par lot). */
export async function fetchVideos(ids) {
  const unique = [...new Set(ids)];
  const out = [];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const data = await api('videos', {
      part: 'snippet,contentDetails,statistics,status',
      id: batch.join(','),
    });
    for (const v of data.items || []) {
      if (v.status && v.status.privacyStatus === 'private') continue;
      out.push(normalizeVideo(v));
    }
  }
  return out;
}
