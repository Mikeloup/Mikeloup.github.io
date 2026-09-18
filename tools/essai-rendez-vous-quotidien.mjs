/**
 * Essai de la regle « rendez-vous quotidien ».
 *
 * Ecrit le 18 septembre 2026, apres que le Flash Info du 17 se soit affiche en
 * une de la page d'accueil. N'interroge ni YouTube ni le reseau : tout est
 * fabrique ici. A lancer a chaque fois qu'on touche a la regle :
 *
 *   node tools/essai-rendez-vous-quotidien.mjs
 *
 * Sortie : une ligne par cas, puis un verdict. Code de sortie 1 si un cas
 * echoue -- de quoi le brancher un jour sur la construction.
 */
import * as R from '../src/render.mjs';
import {
  reglesDuQuotidien, estLeRendezVousQuotidien, dansLaPlaylist,
  reconnuAuTitre, editionsHorsPlaylist,
} from '../src/rendez-vous-quotidien.mjs';

let echecs = 0;
function verifier(nom, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}`
    + (ok ? '' : `\n         attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`));
}

// Les reglages reels du site, recopies ici pour que l'essai ne depende pas du
// fichier : si quelqu'un vide data/accueil.json, l'essai doit encore dire ce
// que la REGLE fait.
const ACCUEIL = {
  jt: {
    rubrique: ['le-flash-info-de-tandem-tv', 'flash-info-tandem-tv', 'le-jt-de-tandem-tv'],
    motifTitre: ['| Flash Info Tandem TV', '| Le Flash Info de Tandem TV', '| Le JT de Tandem TV'],
    editions: 5,
  },
};
const regles = reglesDuQuotidien(ACCUEIL);

const playlistJT = { slug: 'le-flash-info-de-tandem-tv', title: 'Le Flash Info de Tandem TV' };
const playlistZerbib = { slug: 'l-invite-de-william-zerbib', title: "L'interview de William Zerbib" };

// --- 1. Les deux chemins de reconnaissance -----------------------------------
console.log('\n--- UNE EDITION EST RECONNUE PAR SA PLAYLIST OU PAR SON TITRE ---');

const rangee = { id: 'aaa', title: 'Sommaire du jour | Flash Info Tandem TV — 12/09', playlists: [playlistJT] };
const orpheline = {
  id: 'bbb',
  title: 'Commandants du Hamas neutralisés à Rafah et Gaza | Flash Info Tandem TV — 17/09',
  playlists: [],
};
const autre = {
  id: 'ccc',
  title: 'Israël 2026 : Netanyahou peut-il encore surprendre tout le monde ? | Jonathan Serero',
  playlists: [playlistZerbib],
};

verifier('rangee dans la playlist', estLeRendezVousQuotidien(rangee, regles), true);
verifier('hors playlist, mais le titre la signe (le cas du 17/09)',
  estLeRendezVousQuotidien(orpheline, regles), true);
verifier('une interview ordinaire n\'est pas le rendez-vous quotidien',
  estLeRendezVousQuotidien(autre, regles), false);

// --- 2. Les pieges de titre --------------------------------------------------
console.log('\n--- LES MOTS ORDINAIRES N\'ATTRAPENT RIEN ---');

const pieges = [
  'Le journal de l\'ado — épisode 4',
  'Édition spéciale : la Knesset vote',
  'JT ou pas JT, la question du service public',
  'Les grands procès de l\'histoire d\'Israël',
];
for (const t of pieges) {
  verifier(`« ${t} »`, estLeRendezVousQuotidien({ id: 'x', title: t, playlists: [] }, regles), false);
}

// --- 3. Casse, accents, espaces ----------------------------------------------
console.log('\n--- LA COMPARAISON IGNORE CASSE, ACCENTS ET ESPACES EN TROP ---');
verifier('tout en minuscules',
  reconnuAuTitre({ title: 'gaza |  flash  info tandem tv — 16/09' }, regles), true);
verifier('tout en majuscules',
  reconnuAuTitre({ title: 'GAZA | FLASH INFO TANDEM TV — 16/09' }, regles), true);

// --- 4. Les fiches de search.json (la lettre hebdomadaire) -------------------
console.log('\n--- LA LETTRE LIT search.json, ET OBTIENT LA MEME REPONSE ---');
const ficheRangee = { i: 'aaa', t: rangee.title, s: 'le-flash-info-de-tandem-tv' };
const ficheOrpheline = { i: 'bbb', t: orpheline.title, s: '' };
const ficheAutre = { i: 'ccc', t: autre.title, s: 'l-invite-de-william-zerbib' };
verifier('fiche rangee', estLeRendezVousQuotidien(ficheRangee, regles), true);
verifier('fiche orpheline (rubrique vide, titre signe)',
  estLeRendezVousQuotidien(ficheOrpheline, regles), true);
verifier('fiche d\'une autre emission', estLeRendezVousQuotidien(ficheAutre, regles), false);

// --- 5. Reglages incomplets : on ne masque jamais par accident ---------------
console.log('\n--- SANS MOTIF DECLARE, ON RETOMBE SUR LE COMPORTEMENT D\'AVANT ---');
const sansMotif = reglesDuQuotidien({ jt: { rubrique: ['le-flash-info-de-tandem-tv'] } });
verifier('hors playlist et sans motif : non reconnue',
  estLeRendezVousQuotidien(orpheline, sansMotif), false);
verifier('dans la playlist : toujours reconnue', estLeRendezVousQuotidien(rangee, sansMotif), true);

const vide = reglesDuQuotidien(null);
verifier('aucun reglage du tout : rien n\'est reconnu',
  estLeRendezVousQuotidien(orpheline, vide), false);

const motifCourt = reglesDuQuotidien({ jt: { rubrique: [], motifTitre: ['jt'] } });
verifier('un motif de moins de six caracteres est ignore',
  estLeRendezVousQuotidien({ title: 'Le JT du soir', playlists: [] }, motifCourt), false);

// --- 6. L'alerte de construction ---------------------------------------------
console.log('\n--- LE BUILD NOMME CE QUI MANQUE A LA PLAYLIST ---');
const manquantes = editionsHorsPlaylist([rangee, orpheline, autre], regles);
verifier('une seule edition orpheline', manquantes.map((v) => v.id), ['bbb']);
verifier('celle qui est rangee n\'est pas signalee', dansLaPlaylist(rangee, regles), true);

// --- 7. LA PREUVE : la page d'accueil ----------------------------------------
console.log('\n--- LA UNE NE PREND PLUS L\'EDITION HORS PLAYLIST ---');

const config = {
  siteName: 'Tandem TV', siteUrl: 'https://tandemtv.org', channelHandle: 'tandem_tv',
  home: { latestCount: 8, rowSize: 8, themeRows: 0, showRows: 0, chroniqueurs: false, featured: '' },
  groups: { shows: { label: 'Émissions' } }, social: {}, newsletter: {},
};
const catJT = { ...playlistJT, videos: [rangee], description: '' };
const catZ = { ...playlistZerbib, videos: [autre], description: '' };
// L'ordre de `latest` est celui du site : la plus recente d'abord.
const latest = [orpheline, autre, rangee];
const nav = { shows: [catJT, catZ], themes: [], menuShows: [], showsIndex: [], themesIndex: [] };

const html = R.homePage({
  config, categories: [catJT, catZ], nav, latest, buildTime: new Date().toISOString(),
  personnes: [], personneParRubrique: new Map(), introHtml: '',
  jt: catJT, jtEditions: 5, reglesJT: regles,
});

// La « une », c'est le bloc qui va de <div class="une-zone"> a la ligne de
// chiffres qui le clot. On le decoupe plutot que de compter des caracteres :
// un decompte se decale au premier changement de gabarit, et l'essai se
// mettrait alors a passer pour une mauvaise raison.
function uneDe(page) {
  const debut = page.indexOf('une-zone');
  const fin = page.indexOf('une-chiffres');
  if (debut < 0 || fin < 0) throw new Error("La une est introuvable dans la page produite.");
  return page.slice(debut, fin);
}
const une = uneDe(html);
verifier('le Flash Info du 17/09 n\'est PAS dans la une', une.includes('Commandants du Hamas'), false);
verifier('c\'est l\'interview qui prend la une', une.includes('Netanyahou peut-il encore surprendre'), true);
verifier('le Flash Info reste visible sur la page (son bandeau)',
  html.includes('Commandants du Hamas'), true);

// Et sans les regles (ce que faisait le site avant le correctif), il remonte.
const avant = R.homePage({
  config, categories: [catJT, catZ], nav, latest, buildTime: new Date().toISOString(),
  personnes: [], personneParRubrique: new Map(), introHtml: '',
  jt: catJT, jtEditions: 5, reglesJT: null,
});
verifier('sans la regle, il reprenait bien la une (le defaut reproduit)',
  uneDe(avant).includes('Commandants du Hamas'), true);

console.log(`\n${echecs ? `${echecs} CAS EN ECHEC` : 'Tous les cas passent.'}\n`);
process.exit(echecs ? 1 : 0);
