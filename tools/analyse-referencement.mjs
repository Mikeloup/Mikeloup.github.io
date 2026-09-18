// -----------------------------------------------------------------------------
// Analyse de référencement — la lecture profonde, à la demande.
//
// Écrit le 18 septembre 2026. Le rapport quotidien (rapport-audience.mjs) donne
// Search Console PAR REQUÊTE, SUR SEPT JOURS. C'est le bon format pour surveiller
// tous les matins, et le mauvais pour comprendre. Il manquait :
//
//   - les données PAR PAGE : quelle page se classe, et sur quoi ;
//   - les fenêtres longues, où une tendance se voit ;
//   - l'ÉTAT D'INDEXATION des pages de fond, la question ouverte du 13/09 ;
//   - la part des requêtes de marque, qui gonfle les totaux sans rien recruter.
//
// Ce script ne tourne pas tous les jours : on le déclenche à la main depuis
// l'onglet Actions (« Run workflow »). La clé de Search Console ne quitte jamais
// GitHub ; le rapport est publié en ticket du dépôt, lisible par l'API.
//
//   GOOGLE_SEARCH_CONSOLE_KEY   secret GitHub (compte de service, lecture seule)
//   GITHUB_TOKEN                fourni par GitHub Actions
//   JOURS=90                    fenêtre d'analyse (défaut 90)
//   BROUILLON=oui               affiche le rapport sans publier de ticket
//
// TOUT EST NON BLOQUANT SAUF L'ESSENTIEL. Si l'inspection d'URL échoue, le reste
// du rapport part quand même : une analyse amputée vaut mieux qu'une absente.
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jetonAcces, interroger } from './search-console.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JOURS = Math.max(7, Number(process.env.JOURS || 90));
const BROUILLON = /^(oui|yes|1|true)$/i.test(process.env.BROUILLON || '');

const jourISO = (d) => d.toISOString().slice(0, 10);
const nb = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x))
  ? '—' : Number(x).toFixed(d).replace('.', ',');
const somme = (rows, champ) => rows.reduce((n, r) => n + (r[champ] || 0), 0);
const pourcent = (a, b) => (b ? (100 * a) / b : 0);

/** Une position se pondère par les impressions, elle ne s'additionne pas. */
function positionMoyenne(rows) {
  const imp = somme(rows, 'impressions');
  if (!imp) return null;
  return rows.reduce((n, r) => n + r.position * r.impressions, 0) / imp;
}

// Search Console rend les pays en code à trois lettres (« fra », « isr ») et les
// appareils en majuscules anglaises. Un rapport qu'il faut décoder n'est pas lu.
// La liste couvre les pays réellement présents dans les relevés ; tout le reste
// ressort en majuscules, ce qui se cherche en dix secondes -- mieux vaut un code
// visible qu'un nom inventé.
const PAYS = {
  fra: 'France', isr: 'Israël', bel: 'Belgique', che: 'Suisse', can: 'Canada',
  usa: 'États-Unis', gbr: 'Royaume-Uni', deu: 'Allemagne', esp: 'Espagne',
  ita: 'Italie', mar: 'Maroc', tun: 'Tunisie', dza: 'Algérie', lux: 'Luxembourg',
  nld: 'Pays-Bas', prt: 'Portugal', chn: 'Chine', rus: 'Russie', bra: 'Brésil',
  civ: "Côte d'Ivoire", sen: 'Sénégal', aus: 'Australie', arg: 'Argentine',
  ukr: 'Ukraine', tur: 'Turquie', ind: 'Inde', jpn: 'Japon', zaf: 'Afrique du Sud',
};
const nomPays = (c) => PAYS[String(c).toLowerCase()] || String(c).toUpperCase();
const APPAREILS = { MOBILE: 'Mobile', DESKTOP: 'Ordinateur', TABLET: 'Tablette' };
const nomAppareil = (d) => APPAREILS[String(d).toUpperCase()] || String(d);

/** L'adresse, débarrassée du domaine, pour que le tableau reste lisible. */
const chemin = (u) => {
  try { return decodeURIComponent(new URL(u).pathname); } catch { return u; }
};

function tableau(entetes, lignes) {
  if (!lignes.length) return '_Aucune donnée._\n';
  const aligne = entetes.map((_, i) => (i === 0 ? '---' : '---:'));
  return `| ${entetes.join(' | ')} |\n| ${aligne.join(' | ')} |\n`
    + lignes.map((l) => `| ${l.join(' | ')} |`).join('\n') + '\n';
}

const ligneMetrique = (cle, r) => [
  cle, r.clicks, r.impressions, `${nb(pourcent(r.clicks, r.impressions))} %`, nb(r.position),
];

/**
 * Les requêtes de marque : celles où l'on cherche Tandem TV, pas un sujet.
 *
 * Elles se comportent à l'inverse des autres -- CTR très haut, position très
 * basse -- et les mélanger aux autres rend toute moyenne illisible. C'est la
 * lecture du 18/09 : « tandem tv » rapportait 8 clics sur 16 à lui seul.
 */
const EST_MARQUE = (q) => /tandem\s*tv|tandemtv/i.test(q);

async function main() {
  const brut = process.env.GOOGLE_SEARCH_CONSOLE_KEY;
  if (!brut) throw new Error('GOOGLE_SEARCH_CONSOLE_KEY absente.');
  const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
  const hote = new URL(config.siteUrl).hostname.replace(/^www\./, '');
  const site = `sc-domain:${hote}`;
  const jeton = await jetonAcces(JSON.parse(brut));

  // Search Console publie avec deux à trois jours de retard. On demande large,
  // puis on cale les fenêtres sur le dernier jour REELLEMENT rempli : demander
  // une date trop récente ne renvoie pas d'erreur, elle renvoie zéro -- ce qui
  // se lirait comme un effondrement.
  const aujourdhui = new Date();
  const parJour = await interroger(jeton, site, {
    startDate: jourISO(new Date(aujourdhui.getTime() - (JOURS + 5) * 864e5)),
    endDate: jourISO(aujourdhui),
    dimensions: ['date'],
    rowLimit: JOURS + 10,
  });
  if (!parJour.length) throw new Error(`aucune donnée sur les ${JOURS + 5} derniers jours.`);

  const dates = parJour.map((r) => r.keys[0]).sort();
  const dernier = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  const fin = jourISO(dernier);
  const debut = jourISO(new Date(dernier.getTime() - (JOURS - 1) * 864e5));
  // Fenêtre précédente de même longueur, pour que la comparaison ait un sens.
  const finAvant = jourISO(new Date(dernier.getTime() - JOURS * 864e5));
  const debutAvant = jourISO(new Date(dernier.getTime() - (2 * JOURS - 1) * 864e5));

  const dans = (d, a, b) => d >= a && d <= b;
  const A = parJour.filter((r) => dans(r.keys[0], debut, fin));
  const B = parJour.filter((r) => dans(r.keys[0], debutAvant, finAvant));

  const bloc = (rows) => ({
    clics: somme(rows, 'clicks'),
    imp: somme(rows, 'impressions'),
    ctr: pourcent(somme(rows, 'clicks'), somme(rows, 'impressions')),
    pos: positionMoyenne(rows),
  });
  const a = bloc(A); const b = bloc(B);

  const [requetes, pages, pays, appareils] = await Promise.all([
    interroger(jeton, site, { startDate: debut, endDate: fin, dimensions: ['query'], rowLimit: 500 }),
    interroger(jeton, site, { startDate: debut, endDate: fin, dimensions: ['page'], rowLimit: 500 }),
    interroger(jeton, site, { startDate: debut, endDate: fin, dimensions: ['country'], rowLimit: 20 }),
    interroger(jeton, site, { startDate: debut, endDate: fin, dimensions: ['device'], rowLimit: 10 }),
  ]);

  const marque = requetes.filter((r) => EST_MARQUE(r.keys[0]));
  const horsMarque = requetes.filter((r) => !EST_MARQUE(r.keys[0]));
  const mq = bloc(marque); const hm = bloc(horsMarque);

  // Les requêtes qui rapportent, hors marque : c'est là que se joue le
  // recrutement de gens qui ne connaissent pas encore la chaîne.
  const gagnantes = [...horsMarque].filter((r) => r.clicks > 0)
    .sort((x, y) => y.clicks - x.clicks).slice(0, 15);

  // À PORTÉE DE MAIN : classées en première ou deuxième page, vues, jamais
  // cliquées. Ce n'est pas un problème de position, c'est un problème de titre.
  // C'est la seule liste de ce rapport qui dise QUOI RÉÉCRIRE.
  const aPortee = horsMarque
    .filter((r) => r.clicks === 0 && r.impressions >= 20 && r.position <= 20)
    .sort((x, y) => y.impressions - x.impressions).slice(0, 15);

  // Vues très souvent, jamais cliquées, mal classées : les parasites. Elles
  // gonflent les impressions et écrasent le CTR moyen sans rien rapporter.
  // Et JAMAIS une requête dans les deux listes à la fois : « année 5787 »,
  // position 6,4 et zéro clic, remplissait les deux au premier essai -- une
  // fois « réécrivez le titre », une fois « laissez tomber ». Deux conseils
  // opposés sur la même ligne, c'est un rapport qu'on cesse de croire.
  // « À portée » l'emporte : c'est celle qui dit quoi faire.
  const aPorteeSet = new Set(aPortee.map((r) => r.keys[0]));
  const parasites = horsMarque
    .filter((r) => !aPorteeSet.has(r.keys[0]))
    .filter((r) => r.impressions >= 100 && pourcent(r.clicks, r.impressions) < 1)
    .sort((x, y) => y.impressions - x.impressions).slice(0, 10);

  const pagesTop = [...pages].sort((x, y) => y.clicks - x.clicks || y.impressions - x.impressions)
    .slice(0, 20);
  // Les pages de fond, celles qu'on écrit pour être trouvées.
  const sujets = pages.filter((r) => /\/sujets\//.test(r.keys[0]))
    .sort((x, y) => y.impressions - x.impressions);

  // --- Indexation des pages de fond ------------------------------------------
  // La question laissée ouverte le 13 septembre : les demandes d'indexation
  // ont-elles abouti ? Aucune statistique ne le dit -- il faut interroger
  // l'inspection d'URL, une adresse à la fois.
  const slugsSujets = (config.pages || [])
    .map((pg) => pg.slug).filter((s) => s && s.startsWith('sujets/'));
  let indexation = '';
  try {
    const lignes = [];
    for (const slug of slugsSujets.slice(0, 30)) {
      const url = `${config.siteUrl.replace(/\/$/, '')}/${slug}/`;
      const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: site }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${JSON.stringify(d).slice(0, 200)}`);
      const i = d.inspectionResult?.indexStatusResult || {};
      lignes.push([
        `/${slug}/`,
        i.coverageState || '—',
        i.lastCrawlTime ? i.lastCrawlTime.slice(0, 10) : 'jamais',
        i.sitemap?.length ? 'oui' : 'non',
      ]);
    }
    const indexees = lignes.filter((l) => /index/i.test(l[1]) && !/not indexed|non index/i.test(l[1]));
    indexation = `**${indexees.length} page(s) indexée(s) sur ${lignes.length}.**\n\n`
      + tableau(['Page', 'État Google', 'Dernière exploration', 'Vue via sitemap'], lignes);
  } catch (e) {
    indexation = `_Inspection d'URL indisponible : ${String(e.message).slice(0, 200)}_\n\n`
      + "_(Elle exige que le compte de service soit PROPRIÉTAIRE de la propriété "
      + 'Search Console, pas seulement lecteur. Le reste du rapport est complet.)_\n';
  }

  // Un ecart de zero doit se lire « stable », pas « (+0) » : le second se lit
  // comme une mesure ratee.
  const ecart = (x, y, d = 0, unite = '') => {
    if (x === null || y === null || y === undefined || !y) return '';
    const v = x - y;
    if (Math.abs(v) < (d ? 0.05 : 0.5)) return ' (stable)';
    return ` (${v > 0 ? '+' : '−'}${nb(Math.abs(v), d)}${unite})`;
  };

  const titre = `Référencement — ${JOURS} jours au ${fin}`;
  const corps = `## ${titre}

Fenêtre analysée : **${debut} → ${fin}**. Comparée à **${debutAvant} → ${finAvant}**.
Source : Google Search Console, propriété \`${site}\`.

### Vue d'ensemble

| | ${JOURS} derniers jours | ${JOURS} jours précédents |
|---|---:|---:|
| Clics | **${a.clics}**${ecart(a.clics, b.clics)} | ${b.clics} |
| Impressions | **${a.imp}**${ecart(a.imp, b.imp)} | ${b.imp} |
| Taux de clic | **${nb(a.ctr)} %**${ecart(a.ctr, b.ctr, 1, ' pt')} | ${nb(b.ctr)} % |
| Position moyenne | **${nb(a.pos)}**${ecart(a.pos, b.pos, 1)} | ${nb(b.pos)} |

### Marque contre reste du monde

Un site trouvé par son seul nom ne recrute personne : il sert ceux qui le
connaissent déjà. Cette coupure est le chiffre à surveiller dans la durée.

| | Clics | Impressions | CTR | Position |
|---|---:|---:|---:|---:|
| Requêtes de marque (« tandem tv »…) | **${mq.clics}** | ${mq.imp} | ${nb(mq.ctr)} % | ${nb(mq.pos)} |
| Tout le reste | **${hm.clics}** | ${hm.imp} | ${nb(hm.ctr)} % | ${nb(hm.pos)} |

**${nb(pourcent(mq.clics, a.clics))} % des clics viennent du nom de la chaîne.**

### Ce qui rapporte, hors marque

${tableau(['Requête', 'Clics', 'Impr.', 'CTR', 'Position'], gagnantes.map((r) => ligneMetrique(r.keys[0], r)))}
### À portée de main — classées, vues, jamais cliquées

Position 20 ou mieux, au moins 20 affichages, zéro clic. Google vous propose,
et les gens passent : **le titre ne répond pas à la question posée.** C'est la
seule liste de ce rapport qui dise quoi réécrire.

${tableau(['Requête', 'Clics', 'Impr.', 'CTR', 'Position'], aPortee.map((r) => ligneMetrique(r.keys[0], r)))}
### Les parasites

Cent affichages ou plus, moins de 1 % de clics. Elles gonflent les impressions,
écrasent le CTR moyen et ne rapportent rien.

${tableau(['Requête', 'Clics', 'Impr.', 'CTR', 'Position'], parasites.map((r) => ligneMetrique(r.keys[0], r)))}
### Les pages qui travaillent

${tableau(['Page', 'Clics', 'Impr.', 'CTR', 'Position'], pagesTop.map((r) => ligneMetrique(chemin(r.keys[0]), r)))}
### Les pages de fond (/sujets/)

${sujets.length
    ? tableau(['Page', 'Clics', 'Impr.', 'CTR', 'Position'], sujets.map((r) => ligneMetrique(chemin(r.keys[0]), r)))
    : `**Aucune page /sujets/ n'a reçu le moindre affichage sur ${JOURS} jours.**\n`}
### Sont-elles indexées ?

${indexation}
### Pays

${tableau(['Pays', 'Clics', 'Impr.', 'CTR', 'Position'], pays.slice(0, 10).map((r) => ligneMetrique(nomPays(r.keys[0]), r)))}
### Appareils

${tableau(['Appareil', 'Clics', 'Impr.', 'CTR', 'Position'], appareils.map((r) => ligneMetrique(nomAppareil(r.keys[0]), r)))}
---

*Analyse déclenchée à la main — \`tools/analyse-referencement.mjs\`.*
*Search Console publie ses données avec deux à trois jours de retard : la fenêtre
se termine au dernier jour réellement rempli, pas à hier.*
`;

  if (BROUILLON) { console.log(corps); return; }

  const repo = process.env.GITHUB_REPOSITORY;
  const ghToken = process.env.GITHUB_TOKEN;
  if (!repo || !ghToken) throw new Error('GITHUB_REPOSITORY ou GITHUB_TOKEN absent.');
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: titre, body: corps,
      assignees: [repo.split('/')[0]], labels: ['referencement'],
    }),
  });
  if (!res.ok) {
    throw new Error(`Publication du ticket impossible : HTTP ${res.status} `
      + `${(await res.text()).slice(0, 300)}`);
  }
  console.log(`Analyse publiée : ${titre}`);
}

main().catch((err) => {
  console.error(`\n❌ Analyse de référencement : ${err.message}`);
  process.exit(1);
});
