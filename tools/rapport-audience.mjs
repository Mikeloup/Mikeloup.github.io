// -----------------------------------------------------------------------------
// Rapport d'audience quotidien.
//
// Interroge Cloudflare Web Analytics (API GraphQL) pour la journée écoulée,
// compare à la même journée de la semaine précédente, et publie le résultat
// sous forme de ticket GitHub — ce qui déclenche un e-mail vers le propriétaire.
//
// Variables d'environnement attendues :
//   CLOUDFLARE_API_TOKEN   secret GitHub, permission « Account Analytics: Read »
//   GITHUB_TOKEN           fourni automatiquement par GitHub Actions
//   GITHUB_REPOSITORY      fourni automatiquement (ex. Mikeloup/Mikeloup.github.io)
//
// Le compte et le site sont lus dans site.config.json.
// Lancement local sans publication : node tools/rapport-audience.mjs --essai
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes('--essai');
const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const jour = (d) => `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const iso = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');

/** Variation en pourcentage, présentée en français. */
function evolution(now, before) {
  if (!before) return now ? '(première mesure)' : '';
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return '(stable)';
  return pct > 0 ? `(+${pct} % sur une semaine)` : `(${pct} % sur une semaine)`;
}

const GROUPS = (alias, dim, limit = 8) => `
      ${alias}: rumPageloadEventsAdaptiveGroups(
        limit: ${limit}
        orderBy: [count_DESC]
        filter: { siteTag: $siteTag, datetime_geq: $start, datetime_lt: $end }
      ) { count dimensions { ${dim} } }`;

const QUERY = `
query ($accountTag: String!, $siteTag: String!, $start: Time!, $end: Time!, $prevStart: Time!, $prevEnd: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      jour: rumPageloadEventsAdaptiveGroups(
        limit: 1
        filter: { siteTag: $siteTag, datetime_geq: $start, datetime_lt: $end }
      ) { count sum { visits } }

      precedent: rumPageloadEventsAdaptiveGroups(
        limit: 1
        filter: { siteTag: $siteTag, datetime_geq: $prevStart, datetime_lt: $prevEnd }
      ) { count sum { visits } }
${GROUPS('pages', 'requestPath', 10)}
${GROUPS('sources', 'refererHost')}
${GROUPS('pays', 'countryName')}
${GROUPS('appareils', 'deviceType', 5)}
    }
  }
}`;

async function interroger(token, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${JSON.stringify(body).slice(0, 500)}`);
  if (body?.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join(' | ').slice(0, 800));
  }
  const compte = body?.data?.viewer?.accounts?.[0];
  if (!compte) throw new Error("Aucun compte renvoyé : vérifiez l'identifiant de compte et les droits du jeton.");
  return compte;
}

/** Un tableau Markdown, ou une ligne d'excuse s'il n'y a rien à montrer. */
function tableau(titre, colonne, lignes, transforme = (x) => x) {
  if (!lignes?.length) return `**${titre}** — aucune donnée.\n`;
  const corps = lignes
    .map((l) => `| ${transforme(Object.values(l.dimensions)[0]) || '(inconnu)'} | ${l.count} |`)
    .join('\n');
  return `**${titre}**\n\n| ${colonne} | Pages vues |\n|---|---:|\n${corps}\n`;
}

const jolieSource = (h) => {
  if (!h || h === '' || h === 'none') return 'Accès direct';
  return h
    .replace(/^www\./, '')
    .replace(/^com\.google\.android\.googlequicksearchbox$/, 'Google (application Android)');
};

async function main() {
  const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
  const accountTag = config.analytics?.cloudflareAccountId;
  const siteTag = config.analytics?.cloudflareToken;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountTag || !siteTag) throw new Error('cloudflareAccountId ou cloudflareToken manquant dans site.config.json.');
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN absent.');

  // Journée écoulée, en UTC : de minuit à minuit.
  const now = new Date();
  const fin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const debut = new Date(fin.getTime() - 24 * 3600 * 1000);
  const finPrec = new Date(fin.getTime() - 7 * 24 * 3600 * 1000);
  const debutPrec = new Date(debut.getTime() - 7 * 24 * 3600 * 1000);

  const data = await interroger(token, {
    accountTag,
    siteTag,
    start: iso(debut),
    end: iso(fin),
    prevStart: iso(debutPrec),
    prevEnd: iso(finPrec),
  });

  const vues = data.jour?.[0]?.count ?? 0;
  const visites = data.jour?.[0]?.sum?.visits ?? 0;
  const vuesPrec = data.precedent?.[0]?.count ?? 0;
  const visitesPrec = data.precedent?.[0]?.sum?.visits ?? 0;

  const titre = `Audience du ${jour(debut)}`;
  const corps = `## ${titre}

**${visites} visite${visites > 1 ? 's' : ''}** ${evolution(visites, visitesPrec)}
**${vues} page${vues > 1 ? 's' : ''} vue${vues > 1 ? 's' : ''}** ${evolution(vues, vuesPrec)}

${tableau('Pages les plus consultées', 'Page', data.pages)}
${tableau("D'où viennent les visiteurs", 'Source', data.sources, jolieSource)}
${tableau('Pays', 'Pays', data.pays)}
${tableau('Appareils', 'Type', data.appareils)}
---

*Rapport automatique — source : Cloudflare Web Analytics. Journée du ${jour(debut)}, heure UTC.*
`;

  if (DRY) { console.log(corps); return; }

  const repo = process.env.GITHUB_REPOSITORY;
  const ghToken = process.env.GITHUB_TOKEN;
  if (!repo || !ghToken) throw new Error('GITHUB_REPOSITORY ou GITHUB_TOKEN absent.');

  const owner = repo.split('/')[0];
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: titre, body: corps, assignees: [owner], labels: ['audience'] }),
  });
  if (!res.ok) throw new Error(`Publication du ticket impossible : HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  console.log(`Rapport publié : ${titre}`);
}

main().catch((err) => {
  console.error(`\n❌ Rapport d'audience : ${err.message}`);
  process.exit(1);
});
