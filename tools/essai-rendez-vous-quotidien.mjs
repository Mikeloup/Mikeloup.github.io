/**
 * Essai de la regle « rendez-vous quotidien » et des reprises courtes.
 *
 * Ecrit le 18 septembre 2026, apres que le Flash Info du 17 se soit affiche en
 * une de la page d'accueil, puis complete le meme jour quand Michael a vu que
 * les deux vignettes en question etaient des SHORTS.
 *
 * Les cas ne sont pas inventes : ce sont les vraies lignes du search.json du
 * site en ligne, relevees le 18/09. N'interroge ni YouTube ni le reseau.
 *
 *   node tools/essai-rendez-vous-quotidien.mjs
 *
 * Code de sortie 1 si un cas echoue -- de quoi le brancher sur la construction.
 */
import * as R from '../src/render.mjs';
import * as yt from '../src/youtube.mjs';
import { slugify } from '../src/util.mjs';
import {
  reglesDuQuotidien, estLeRendezVousQuotidien, dansLaPlaylist,
  reconnuAuTitre, idsDuRendezVous, reprisesDuQuotidien,
} from '../src/rendez-vous-quotidien.mjs';

let echecs = 0;
function verifier(nom, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}`
    + (ok ? '' : `\n         attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`));
}

const ACCUEIL = {
  jt: {
    rubrique: ['le-flash-info-de-tandem-tv', 'flash-info-tandem-tv', 'le-jt-de-tandem-tv'],
    motifTitre: ['| Flash Info Tandem TV', '| Le Flash Info de Tandem TV',
      '| Le JT de Tandem TV', '| JT TandemTV'],
    editions: 5,
  },
};
const regles = reglesDuQuotidien(ACCUEIL);

// --- Le catalogue reel, releve le 18/09 dans search.json ---------------------
// Chaque jour d'edition : une edition complete DANS la playlist, une reprise
// courte HORS de toute playlist.
const V = {
  // 17 septembre -- titres IDENTIQUES, seule la duree differe.
  edition17: { id: 'e17', duration: 278, publishedAt: '2026-09-17T18:00:00Z',
    title: 'Commandants du Hamas neutralisés à Rafah et Gaza | Flash Info Tandem TV — 17/09' },
  reprise17: { id: 'r17', duration: 166, publishedAt: '2026-09-17T18:30:00Z',
    title: 'Commandants du Hamas neutralisés à Rafah et Gaza | Flash Info Tandem TV — 17/09' },
  // 16 septembre -- titres DIFFERENTS : aucune comparaison de titres ne les relie.
  edition16: { id: 'e16', duration: 358, publishedAt: '2026-09-16T18:00:00Z',
    title: "Israël–Arabie Saoudite : l'alliance secrète contre les Houthis | Flash Info Tandem TV" },
  reprise16: { id: 'r16', duration: 152, publishedAt: '2026-09-16T18:30:00Z',
    title: "Israël & Arabie Saoudite : le rapprochement qui inquiète l'Iran | Flash Info Tandem TV" },
  // 14 septembre.
  edition14: { id: 'e14', duration: 246, publishedAt: '2026-09-14T18:00:00Z',
    title: '« NAZA » enflamme Israël, sécurité avant les fêtes | Flash Info Tandem TV' },
  reprise14: { id: 'r14', duration: 100, publishedAt: '2026-09-14T18:30:00Z',
    title: 'Sécurité avant les fêtes, élections sous menace | Flash Info Tandem TV' },
  // 7 septembre -- ancienne appellation, et 191 s : plus COURTE que la reprise
  // du 17 (166 s) ne l'est de beaucoup. La duree ne separe rien.
  edition07: { id: 'e07', duration: 191, publishedAt: '2026-09-07T18:00:00Z',
    title: 'Israël–Iran : la tension monte | JT TandemTV du 7 septembre 2026' },
  // Une emission ordinaire.
  interview: { id: 'itw', duration: 2228, publishedAt: '2026-09-16T12:00:00Z',
    title: 'Israël 2026 : Netanyahou peut-il encore surprendre tout le monde ? | Jonathan Serero' },
};
const CATALOGUE = Object.values(V);

const PLAYLISTS = [
  { id: 'PLjt', title: 'Le Flash Info de Tandem TV',
    videoIds: ['e17', 'e16', 'e14', 'e07'] },
  { id: 'PLzerbib', title: "L'interview de William Zerbib", videoIds: ['itw'] },
];

// --- 1. Qui compose vraiment le rendez-vous quotidien ? ----------------------
console.log('\n--- LA PLAYLIST DIT QUI EST UNE EDITION ---');
const idsJT = idsDuRendezVous(PLAYLISTS, regles, slugify);
verifier('la playlist est retrouvee par son adresse', [...idsJT].sort(),
  ['e07', 'e14', 'e16', 'e17']);
verifier('une playlist qui ne figure pas dans les reglages ne compte pas',
  idsJT.has('itw'), false);

// --- 2. Les reprises courtes -------------------------------------------------
console.log('\n--- CE QUI PORTE LA SIGNATURE MAIS N\'EST PAS DANS LA PLAYLIST EST UNE REPRISE ---');
const reprises = reprisesDuQuotidien(CATALOGUE, regles, idsJT);
verifier('les trois reprises, et elles seules', reprises.map((v) => v.id).sort(),
  ['r14', 'r16', 'r17']);
verifier("l'interview n'est pas concernee", reprises.some((v) => v.id === 'itw'), false);
verifier("l'edition du 7, ancienne appellation, reste une edition",
  reprises.some((v) => v.id === 'e07'), false);

console.log('\n--- POURQUOI NI LA DUREE NI LE TITRE NE POUVAIENT SUFFIRE ---');
// Si l'on avait trie par duree, l'edition du 7 (191 s) serait tombee avec les
// reprises des que le seuil aurait depasse 191 -- et la reprise du 17 (166 s)
// serait restee des qu'il serait descendu sous 166. La fenetre est de 25 s.
verifier('la plus courte des editions dure a peine plus que la plus longue reprise',
  V.edition07.duration - V.reprise17.duration, 25);
// Et le 16 septembre, les deux titres n'ont presque rien en commun.
const mots = (t) => new Set(t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((m) => m.length >= 4));
// Le pipeline reconnait « la meme video » a 80 % de mots significatifs communs
// (scripts/youtube_uploader.py, _meme_video). Applique aux deux titres du
// 16 septembre, le compte reste tres en dessous -- et une bonne part de ce
// qu'ils partagent est la signature « Flash Info Tandem TV » elle-meme, qui ne
// distingue rien puisque TOUTES les editions la portent.
const attendus = mots(V.edition16.title);
const communs = [...attendus].filter((m) => mots(V.reprise16.title).has(m));
const part = Math.round((communs.length / attendus.size) * 100) / 100;
verifier(`le 16 septembre, les titres ne se ressemblent qu'a ${Math.round(part * 100)} % `
  + '(seuil du pipeline : 80 %)', part < 0.8, true);

// --- 3. Le verdict arrive jusqu'a la porte du site --------------------------
console.log('\n--- « entreDansLeSite » REFUSE LA REPRISE ET ACCEPTE L\'EDITION ---');
yt.declarerVideosExclues({});
yt.declarerReprisesDuQuotidien(reprises.map((v) => v.id));
verifier('la reprise du 17 est refusee', yt.entreDansLeSite(V.reprise17), false);
verifier('la reprise du 16 est refusee', yt.entreDansLeSite(V.reprise16), false);
verifier("l'edition du 17 est acceptee", yt.entreDansLeSite(V.edition17), true);
verifier("l'edition du 7 est acceptee", yt.entreDansLeSite(V.edition07), true);
verifier("l'interview est acceptee", yt.entreDansLeSite(V.interview), true);
yt.declarerReprisesDuQuotidien([]);
verifier('sans declaration, la reprise repasserait (le defaut reproduit)',
  yt.entreDansLeSite(V.reprise17), true);

// --- 4. Le risque assume, ecrit noir sur blanc ------------------------------
console.log('\n--- UNE VRAIE EDITION OUBLIEE DE LA PLAYLIST SERAIT ECARTEE ---');
const sansLe17 = idsDuRendezVous(
  [{ ...PLAYLISTS[0], videoIds: ['e16', 'e14', 'e07'] }, PLAYLISTS[1]], regles, slugify);
verifier("oubliee de la playlist, l'edition du 17 passe pour une reprise",
  reprisesDuQuotidien([V.edition17], regles, sansLe17).map((v) => v.id), ['e17']);
console.log("         (c'est pourquoi le build NOMME chaque video ecartee)");

// --- 5. Les pieges de titre --------------------------------------------------
console.log('\n--- LES MOTS ORDINAIRES N\'ATTRAPENT RIEN ---');
for (const t of [
  "Le journal de l'ado — épisode 4",
  'Édition spéciale : la Knesset vote',
  'JT ou pas JT, la question du service public',
  "Les grands procès de l'histoire d'Israël",
]) {
  verifier(`« ${t} »`, reconnuAuTitre({ title: t }, regles), false);
}

console.log('\n--- LA COMPARAISON IGNORE CASSE, ACCENTS ET ESPACES EN TROP ---');
verifier('tout en minuscules',
  reconnuAuTitre({ title: 'gaza |  flash  info tandem tv — 16/09' }, regles), true);
verifier('tout en majuscules',
  reconnuAuTitre({ title: 'GAZA | FLASH INFO TANDEM TV — 16/09' }, regles), true);

// --- 6. Les fiches de search.json (la lettre hebdomadaire) ------------------
console.log('\n--- LA LETTRE LIT search.json, ET OBTIENT LA MEME REPONSE ---');
verifier('fiche rangee',
  estLeRendezVousQuotidien({ t: V.edition17.title, s: 'le-flash-info-de-tandem-tv' }, regles), true);
verifier("fiche d'une autre emission",
  estLeRendezVousQuotidien({ t: V.interview.title, s: 'l-invite-de-william-zerbib' }, regles), false);
verifier('une edition reste reconnue meme si sa rubrique manque',
  estLeRendezVousQuotidien({ t: V.edition17.title, s: '' }, regles), true);

// --- 7. Reglages incomplets : on ne masque jamais par accident ---------------
console.log('\n--- SANS MOTIF DECLARE, ON RETOMBE SUR LE COMPORTEMENT D\'AVANT ---');
const sansMotif = reglesDuQuotidien({ jt: { rubrique: ['le-flash-info-de-tandem-tv'] } });
verifier('aucune reprise n\'est reconnue', reprisesDuQuotidien(CATALOGUE, sansMotif, idsJT).length, 0);
verifier('dans la playlist : toujours reconnue', dansLaPlaylist(
  { playlists: [{ slug: 'le-flash-info-de-tandem-tv' }] }, sansMotif), true);
verifier('aucun reglage du tout : rien n\'est reconnu',
  reprisesDuQuotidien(CATALOGUE, reglesDuQuotidien(null), new Set()).length, 0);
verifier('un motif de moins de six caracteres est ignore',
  reconnuAuTitre({ title: 'Le JT du soir' }, reglesDuQuotidien({ jt: { motifTitre: ['jt'] } })), false);

// --- 8. LA PREUVE : la page d'accueil ---------------------------------------
console.log('\n--- LA UNE NE PREND PLUS LE FLASH INFO ---');
const config = {
  siteName: 'Tandem TV', siteUrl: 'https://www.tandemtv.net', channelHandle: 'tandem_tv',
  home: { latestCount: 8, rowSize: 8, themeRows: 0, showRows: 0, chroniqueurs: false, featured: '' },
  groups: { shows: { label: 'Émissions' } }, social: {}, newsletter: {},
};
const plJT = { id: 'PLjt', title: 'Flash Info Tandem TV', slug: 'le-flash-info-de-tandem-tv' };
const plZ = { id: 'PLzerbib', title: "L'interview de William Zerbib", slug: 'l-invite-de-william-zerbib' };
// Le modele tel qu'il arrive a la page : les reprises ont deja ete ecartees.
const edition17 = { ...V.edition17, playlists: [plJT] };
const edition16 = { ...V.edition16, playlists: [plJT] };
const interview = { ...V.interview, playlists: [plZ] };
const catJT = { ...plJT, videos: [edition17, edition16], description: '' };
const catZ = { ...plZ, videos: [interview], description: '' };
const latest = [edition17, edition16, interview];

function uneDe(page) {
  const debut = page.indexOf('une-zone');
  const fin = page.indexOf('une-chiffres');
  if (debut < 0 || fin < 0) throw new Error('La une est introuvable dans la page produite.');
  return page.slice(debut, fin);
}
const html = R.homePage({
  config, categories: [catJT, catZ], nav: { shows: [catJT, catZ], themes: [] }, latest,
  buildTime: new Date().toISOString(), personnes: [], personneParRubrique: new Map(),
  introHtml: '', jt: catJT, jtEditions: 5, reglesJT: regles,
});
const une = uneDe(html);
verifier('aucun Flash Info dans la une', /Flash Info Tandem TV/.test(une), false);
verifier("c'est l'interview qui prend la une", une.includes('Netanyahou peut-il encore surprendre'), true);
verifier('les editions restent visibles dans leur bandeau',
  html.includes('Commandants du Hamas') && html.includes('les Houthis'), true);

console.log(`\n${echecs ? `${echecs} CAS EN ECHEC` : 'Tous les cas passent.'}\n`);
process.exit(echecs ? 1 : 0);
