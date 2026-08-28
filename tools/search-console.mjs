// -----------------------------------------------------------------------------
// Search Console : ce qui se passe AVANT la visite.
//
// Cloudflare compte les gens qui sont venus. Search Console compte ceux à qui
// Google vous a montré — et qui ne sont pas venus. Le 28 août 2026, la mesure
// disait : 3ᵉ position sur la meilleure requête du site, 5,2 % de clics. La
// même position, sur « tandem tv », en faisait 16,2 %. À classement égal, le
// titre valait trois fois le trafic. Aucun outil de mesure de site ne peut
// montrer ça : il ne voit que les 5 % qui sont entrés.
//
// AUTHENTIFICATION : un compte de service Google, en lecture seule sur la
// propriété. Sa clé arrive par la variable d'environnement
// GOOGLE_SEARCH_CONSOLE_KEY (secret GitHub) et ne touche jamais le dépôt.
// Le jeton est fabriqué à la main avec node:crypto plutôt qu'avec la
// bibliothèque googleapis : ce dépôt n'a aucune dépendance, et vingt lignes de
// signature ne valent pas d'en introduire une.
//
// TOUT EST NON BLOQUANT. Si la clé manque, si Google répond mal, si le format
// change : on renvoie une note qui le dit, et le rapport d'audience part quand
// même. Un rapport amputé vaut mieux qu'un rapport absent.
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

const ENDPOINT = 'https://searchconsole.googleapis.com/webmasters/v3';
const PORTEE = 'https://www.googleapis.com/auth/webmasters.readonly';

const base64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Jeton d'accès OAuth 2 à partir de la clé du compte de service. */
async function jetonAcces(cle) {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const charge = base64url(JSON.stringify({
    iss: cle.client_email,
    scope: PORTEE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: maintenant,
    exp: maintenant + 3600,
  }));
  const signature = base64url(
    crypto.sign('RSA-SHA256', Buffer.from(`${entete}.${charge}`), cle.private_key));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${entete}.${charge}.${signature}`,
    }),
  });
  const corps = await res.json().catch(() => ({}));
  if (!res.ok || !corps.access_token) {
    throw new Error(`jeton refusé (HTTP ${res.status}) — ${JSON.stringify(corps).slice(0, 200)}`);
  }
  return corps.access_token;
}

async function interroger(jeton, site, corps) {
  const res = await fetch(
    `${ENDPOINT}/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${JSON.stringify(data).slice(0, 300)}`);
  return data.rows || [];
}

const jourISO = (d) => d.toISOString().slice(0, 10);
// Le rapport est en francais : 1,4 % et non 1.4 %.
const nb = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x))
  ? '—' : x.toFixed(d).replace('.', ',');
const somme = (rows, champ) => rows.reduce((n, r) => n + (r[champ] || 0), 0);

/** Moyenne pondérée par les impressions : une position se pondère, ne s'additionne pas. */
function positionMoyenne(rows) {
  const imp = somme(rows, 'impressions');
  if (!imp) return null;
  return rows.reduce((n, r) => n + r.position * r.impressions, 0) / imp;
}

function ecart(courant, avant, unite = '', decimales = 0, inverse = false) {
  if (courant === null || avant === null || avant === undefined) return '';
  const d = courant - avant;
  if (Math.abs(d) < (decimales ? 0.05 : 0.5)) return ' (stable)';
  const bon = inverse ? d < 0 : d > 0;
  const signe = d > 0 ? '+' : '−';
  return ` (${bon ? '▲' : '▼'} ${signe}${Math.abs(d).toFixed(decimales).replace('.', ',')}${unite})`;
}

/**
 * Rend la section markdown, ou une note expliquant pourquoi elle manque.
 * Ne lève jamais.
 */
export async function sectionSearchConsole(siteUrl) {
  const brut = process.env.GOOGLE_SEARCH_CONSOLE_KEY;
  if (!brut) {
    return '\n**Recherche Google** — clé absente (secret `GOOGLE_SEARCH_CONSOLE_KEY`), section non produite.\n';
  }
  try {
    const cle = JSON.parse(brut);
    const jeton = await jetonAcces(cle);
    const hote = new URL(siteUrl).hostname.replace(/^www\./, '');
    const site = `sc-domain:${hote}`;

    // Les données de Search Console arrivent avec deux à trois jours de retard.
    // On ne demande donc pas « hier » — on demande les seize derniers jours et
    // on prend les deux fenêtres de sept jours qui se terminent au dernier jour
    // REELLEMENT rempli. Demander une date trop récente ne renvoie pas une
    // erreur : elle renvoie zéro, ce qui se lirait comme un effondrement.
    const fin = new Date();
    const debut = new Date(fin.getTime() - 16 * 864e5);
    const parJour = await interroger(jeton, site, {
      startDate: jourISO(debut), endDate: jourISO(fin),
      dimensions: ['date'], rowLimit: 30,
    });
    if (!parJour.length) return '\n**Recherche Google** — aucune donnée sur les seize derniers jours.\n';

    const dates = parJour.map((r) => r.keys[0]).sort();
    const dernier = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
    const finA = jourISO(dernier);
    const debutA = jourISO(new Date(dernier.getTime() - 6 * 864e5));
    const finB = jourISO(new Date(dernier.getTime() - 7 * 864e5));
    const debutB = jourISO(new Date(dernier.getTime() - 13 * 864e5));

    const dans = (d, a, b) => d >= a && d <= b;
    const semA = parJour.filter((r) => dans(r.keys[0], debutA, finA));
    const semB = parJour.filter((r) => dans(r.keys[0], debutB, finB));

    const clics = somme(semA, 'clicks'); const clicsB = somme(semB, 'clicks');
    const imp = somme(semA, 'impressions'); const impB = somme(semB, 'impressions');
    const ctr = imp ? (100 * clics) / imp : 0;
    const ctrB = impB ? (100 * clicsB) / impB : 0;
    const pos = positionMoyenne(semA); const posB = positionMoyenne(semB);

    const requetes = await interroger(jeton, site, {
      startDate: debutA, endDate: finA, dimensions: ['query'], rowLimit: 200,
    });
    // Seulement celles qui rapportent VRAIMENT. Trier par clics decroissants
    // ne suffit pas : quand une seule requete a des clics, les suivantes sont
    // toutes a zero et remontent par ordre alphabetique. Le tableau du 28 aout
    // annoncait « requetes qui rapportent » et listait « affaire mortara,
    // 0 clic ». Un titre qui ment coute plus cher qu'un tableau vide.
    const parClics = [...requetes]
      .filter((r) => r.clicks > 0)
      .sort((x, y) => y.clicks - x.clicks).slice(0, 8);
    // Vues mais pas cliquées : classées, donc à portée, et pourtant sans visite.
    // C'est la liste qui dit où le titre ne répond pas à la question posée.
    const muettes = requetes
      .filter((r) => r.clicks === 0 && r.impressions >= 10)
      .sort((x, y) => y.impressions - x.impressions).slice(0, 8);

    const lignes = (rs) => rs.map((r) =>
      `| ${r.keys[0]} | ${r.clicks} | ${r.impressions} | `
      + `${nb(100 * r.ctr)} % | ${nb(r.position)} |`).join('\n');

    return `
### Recherche Google — 7 jours (${debutA} → ${finA})

| | 7 derniers jours | 7 jours précédents |
|---|---:|---:|
| Clics | **${clics}**${ecart(clics, clicsB)} | ${clicsB} |
| Impressions | **${imp}**${ecart(imp, impB)} | ${impB} |
| Taux de clic | **${nb(ctr)} %**${ecart(ctr, ctrB, ' pt', 1)} | ${nb(ctrB)} % |
| Position moyenne | **${nb(pos)}**${ecart(pos, posB, '', 1, true)} | ${nb(posB)} |

${parClics.length ? `**Requêtes qui rapportent**

| Requête | Clics | Impr. | CTR | Position |
|---|---:|---:|---:|---:|
${lignes(parClics)}
` : '**Aucune requête n\'a rapporté de clic cette semaine.**\n'}
${muettes.length ? `**Vues, jamais cliquées** — classées mais le titre ne répond pas

| Requête | Clics | Impr. | CTR | Position |
|---|---:|---:|---:|---:|
${lignes(muettes)}
` : ''}`;
  } catch (e) {
    return `\n**Recherche Google** — indisponible aujourd'hui : ${String(e.message).slice(0, 200)}\n`;
  }
}
