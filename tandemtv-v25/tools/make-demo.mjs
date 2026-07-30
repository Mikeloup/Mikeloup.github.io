// Génère data/demo.json : un jeu de données fictif calqué sur la structure réelle
// de la chaîne (mêmes noms de playlists, mêmes volumes) pour prévisualiser le site
// sans clé API. Ces données ne servent qu'à la démonstration.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// [titre, nombre de vidéos] — relevé sur la chaîne.
const PLAYLISTS = [
  ['Cafe Daat - Rony Akrich', 31], ['Actu Israël', 199], ['Iran', 47],
  ["L'analyse de Stéphane Goldin", 40], ['Antisémitisme', 107],
  ["L'invité de William Zerbib", 91], ["L'édito de Rony Hayot", 1],
  ['Géopolitique du Proche Orient', 76], ["L'édito de Myriam Danan", 1],
  ['Gaza', 134], ['Liban', 16], ["L'invité de Jérome Haas", 29],
  ["Histoires d'Israël", 118], ["Tour d'Israël", 41], ['Shorts', 93],
  ['Histoires juives', 11], ['Spiritualité juive', 60],
  ['Les rencontres du Rav Saadia Morali', 5], ['Les Rencontres du Rav Saadia Morali', 4],
  ['Mais quel peuple !', 6], ['Face a Face avec Sophie Bria', 21],
  ['Les cours du Rav Mendel Mimoun', 34], ['Rencontre avec Sylvie Zerbib', 2],
  ['Syrie', 14], ['Invités de Tandem TV', 31], ["L'invité de Dana", 1],
  ['Un Monde à "Panser"', 2], ['Politique israélienne', 33],
  ['Politiquement vôtre - Galith Benzimra', 12],
  ['Santé médecine - JJ Erbstein / Michael Wolf', 24], ['ART CONNEXION', 21],
  ['People', 65], ['LE GRAND DEBAT', 3], ['Société', 18],
  ['LES COURS DU RAV YOEL BENHARROUCHE', 8], ["DES AVENTURES DE L'HISTOIRE DES JUIFS", 8],
  ['HAOLAM HAMEDOUBAR', 20], ['26 Nuances 2 Vannes', 2], ['FEEL GOOD', 10],
  ["L'HISTOIRE EN PERSPECTIVE", 7], ["50 NUANCES D'ANTISÉMITISME TANDEM 2.0", 31],
  ['COUP DE COEUR LITTÉRAIRE TANDEM 2.0', 21], ['COTÉ CUISINE', 10],
  ['PROJET ADO', 5], ["L'INSTANT MUSIQUE DE NATHALIE", 4], ['A VOS CAS !', 1],
  ['OBJECTIF ENTREPRENDRE', 4], ['ENTRE NOUS SOIT DIT', 19], ['BARI FOOD', 6],
  ['PUISSANCE(S)', 1], ['PAUSE BEAUTE', 6], ['LE FABULEUX DESTIN DE ...', 23],
  ['SCALPEL', 2], ["LES GRANDS PROCES DE L'HISTOIRE D'ISRAEL", 18],
  ['SUCCES SERIE / MOVIE', 18], ['HASBARA EN TANDEM', 12], ['ATOUT COEUR', 9],
  ['AVEC VOUS', 3], ['JO HANNA HEALTHY', 22], ['SCALE UP NATION', 3],
  ['Petit deviendra grand', 7], ['JEWISH STORY', 6], ['ARCHIDESIGN', 9],
  ["LE JOURNAL DE L'ADO", 5], ['KNESSET ET MATCH', 3], ['Hanna Network', 2],
  ['5 SUR 5', 6], ['Jo Hanna Fitness', 4], ['SPORT TANDEM', 3],
  ['GUIDE EN TANDEM', 22], ['CULTURE EN TANDEM', 2], ['GEOPOLITIQUE TANDEM 2.0', 7],
  ['LA FRANCE EN TANDEM', 2], ['LIVE MUSICAL TANDEM', 16], ['TECH @ BREAK', 3],
  ["LE LABORATOIRE DE L'APRES", 4],
];

const SUJETS = [
  'Ce que révèle la dernière séquence diplomatique',
  'Trois questions à notre invité',
  'Décryptage : les chiffres derrière la polémique',
  "L'analyse que personne n'ose faire",
  'Retour sur une semaine décisive',
  'Entretien exclusif',
  'Ce qui se joue vraiment en coulisses',
  'Le grand débat',
  'Reportage : sur le terrain',
  'La mémoire et les archives',
  'Portrait',
  'Ce que dit le droit',
  'Regards croisés',
  'La séquence qui a tout changé',
  'Rencontre',
];

// Générateur pseudo-aléatoire déterministe (pour un fichier stable d'un run à l'autre).
let seed = 20260727;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const POOL = 1100;
const start = Date.UTC(2026, 6, 26, 18, 0, 0);
const videos = [];

for (let n = 0; n < POOL; n += 1) {
  const id = `demo${String(n).padStart(4, '0')}`;
  videos.push({
    id,
    title: `${SUJETS[n % SUJETS.length]} — épisode ${n + 1}`,
    description: `Un texte de présentation fictif pour la démonstration du site.\n\n00:00 Introduction\n03:20 Le sujet\n\n👉 Abonnez-vous : https://www.youtube.com/@tandem_tv\n\n#TandemTV`,
    publishedAt: new Date(start - n * 8 * 3_600_000).toISOString(),
    thumbnail: `/assets/demo/thumb-${n % 12}.svg`,
    tags: ['Israël'],
    duration: 300 + ((n * 137) % 3000),
    isShort: false,
    views: 400 + ((n * 977) % 60_000),
    likes: 10 + ((n * 31) % 900),
    playlists: [],
  });
}

const playlists = PLAYLISTS.map(([title, count], i) => {
  const ids = new Set();
  // Les playlists récentes piochent dans les vidéos récentes.
  const window = Math.min(POOL, Math.max(count * 3, 60));
  // Deux tiers des rubriques restent actives (vidéos récentes), un tiers dort :
  // cela permet de tester la règle « hors menus après 6 mois sans publication ».
  const dormant = i % 3 === 0;
  const offset = Math.floor(rnd() * (POOL - window) * (dormant ? 1 : 0.12));
  while (ids.size < Math.min(count, window)) {
    ids.add(videos[offset + Math.floor(rnd() * window)].id);
  }
  return {
    id: `PLdemo${i}`,
    title,
    description: `Rubrique « ${title} » de Tandem TV.`,
    thumbnail: `/assets/demo/thumb-${i % 12}.svg`,
    itemCount: ids.size,
    publishedAt: new Date(start - i * 86_400_000 * 10).toISOString(),
    videoIds: [...ids],
  };
});

const data = {
  channel: {
    id: 'UCdemo',
    title: 'Tandem TV',
    description: "Interviews exclusives, débats et analyses sur Israël et le monde juif.",
    customUrl: '@tandem_tv',
    avatar: '/assets/demo/thumb-0.svg',
    banner: null,
    uploadsPlaylistId: 'UUdemo',
    subscribers: 18_400,
    videoCount: videos.length,
  },
  playlists,
  videos,
  fetchedAt: new Date(start).toISOString(),
  demo: true,
};

await fs.mkdir(path.join(ROOT, 'data'), { recursive: true });
await fs.writeFile(path.join(ROOT, 'data', 'demo.json'), JSON.stringify(data), 'utf8');
console.log(`data/demo.json écrit : ${videos.length} vidéos, ${playlists.length} playlists.`);
