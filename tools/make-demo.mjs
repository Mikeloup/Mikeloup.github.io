// Génère data/demo.json : un jeu de données fictif qui permet de prévisualiser
// le site sans clé API. Ces données ne servent qu'à la démonstration.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const PLAYLISTS = [
  {
    title: "L'invité de Jérôme Haas",
    description: "Le grand entretien de Tandem TV. Chaque semaine, Jérôme Haas reçoit une personnalité de la vie politique, intellectuelle ou associative pour un entretien sans concession.",
    titles: [
      "Iran : jusqu'où ira l'escalade ? Entretien avec un spécialiste du régime des mollahs",
      "Réforme judiciaire : où en est vraiment Israël ?",
      "« La diaspora française n'a jamais été aussi divisée »",
      "Économie israélienne : la high-tech peut-elle résister à la guerre ?",
      "Antisémitisme en France : le grand entretien",
      "Ce que les accords d'Abraham ont vraiment changé",
      "Éducation et société : le débat qui fracture Israël",
      "Médias et désinformation : comment lire la guerre de l'information",
      "Alya 2026 : les chiffres et les visages",
      "Justice internationale : Israël face aux tribunaux",
      "Le rôle du Congrès américain dans la relation Washington–Jérusalem",
      "Sécurité au nord : entretien avec un ancien officier supérieur",
    ],
  },
  {
    title: "L'invité de William Zerbib",
    description: "Analyse géopolitique et stratégique. William Zerbib décrypte les grands équilibres du Proche-Orient et leurs répercussions internationales.",
    titles: [
      "Washington–Jérusalem : la relation à l'épreuve",
      "Le Hezbollah après la guerre : que reste-t-il ?",
      "Turquie, Qatar, Égypte : le nouveau triangle régional",
      "Pourquoi la Chine s'intéresse au Proche-Orient",
      "Golfe persique : l'argent, l'énergie et la sécurité",
      "Europe : la fin du consensus sur Israël ?",
      "Russie et Iran : une alliance de circonstance",
      "Défense antimissile : ce que change le Dôme de fer",
      "Cybersécurité : la guerre invisible",
      "Syrie : recomposition d'un pays fracturé",
    ],
  },
  {
    title: "Tour d'Israël",
    description: "Reportages, découvertes et rencontres à travers le pays : villes, villages, paysages et savoir-faire.",
    titles: [
      "Jérusalem, le marché Mahané Yehuda comme vous ne l'avez jamais vu",
      "Le Néguev, laboratoire agricole du futur",
      "Tel-Aviv Bauhaus : la ville blanche racontée",
      "Sur les traces des vignobles de Galilée",
      "Haïfa, la ville des trois religions",
      "Massada au lever du soleil",
      "Eilat : entre corail et géopolitique",
      "Safed, capitale de la kabbale",
      "Le lac de Tibériade, réservoir stratégique",
    ],
  },
  {
    title: 'Histoires juives',
    description: "Récits, mémoire et patrimoine des communautés juives du monde entier.",
    titles: [
      "Les Juifs d'Alexandrie : grandeur et disparition d'une communauté",
      "Salonique, la « Jérusalem des Balkans »",
      "Les Justes parmi les nations : trois histoires oubliées",
      "L'âge d'or de l'Espagne juive",
      "Les Juifs d'Éthiopie : une odyssée moderne",
      "Vilnius, la Jérusalem du Nord",
      "Les judéo-espagnols et la langue ladino",
      "Bagdad 1941 : le Farhoud",
    ],
  },
  {
    title: 'Débats & décryptages',
    description: "Confrontation d'idées : deux invités, un sujet, trente minutes.",
    titles: [
      "Faut-il réformer le système électoral israélien ?",
      "Intelligence artificielle : opportunité ou menace pour l'emploi ?",
      "Religion et État : le débat permanent",
      "Presse israélienne : encore indépendante ?",
      "Service militaire : vers une conscription universelle ?",
      "Climat et désert : le pari israélien",
    ],
  },
];

const SUMMARY = (title, cat) =>
  `${title}\n\nDans cette édition de « ${cat} », Tandem TV reçoit son invité pour un échange approfondi. Analyse du contexte, mise en perspective historique et réponses aux questions que se posent nos téléspectateurs.\n\n00:00 Introduction\n02:15 Le contexte\n11:40 L'analyse\n24:05 Questions du public\n31:20 Conclusion\n\n👉 Abonnez-vous à la chaîne : https://www.youtube.com/@tandem_tv\n📺 Tandem TV — canal 14 du bouquet Annatel TV.\n\n#Israel #Actualite #TandemTV`;

const videos = [];
const playlists = [];
let n = 0;
const start = Date.UTC(2026, 6, 24, 18, 0, 0);

for (const [pi, p] of PLAYLISTS.entries()) {
  const ids = [];
  for (const title of p.titles) {
    const id = `demo${String(n).padStart(4, '0')}`;
    const publishedAt = new Date(start - n * 86_400_000 * 1.8 - pi * 3_600_000).toISOString();
    videos.push({
      id,
      title,
      description: SUMMARY(title, p.title),
      publishedAt,
      thumbnail: `/assets/demo/thumb-${n % 12}.svg`,
      tags: ['Israël', 'actualité'],
      duration: 600 + ((n * 137) % 2400),
      isShort: false,
      views: 1200 + ((n * 977) % 48_000),
      likes: 40 + ((n * 31) % 900),
      playlists: [],
    });
    ids.push(id);
    n += 1;
  }
  playlists.push({
    id: `PLdemo${pi}`,
    title: p.title,
    description: p.description,
    thumbnail: `/assets/demo/thumb-${pi}.svg`,
    itemCount: ids.length,
    publishedAt: new Date(start - pi * 86_400_000 * 30).toISOString(),
    videoIds: ids,
  });
}

const data = {
  channel: {
    id: 'UCSZhfRucXiwJ6jUt-L6oTUg',
    title: 'Tandem TV',
    description: "Interviews exclusives, débats enrichissants et analyses approfondies sur Israël et le monde juif.",
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
await fs.writeFile(path.join(ROOT, 'data', 'demo.json'), JSON.stringify(data, null, 0), 'utf8');
console.log(`data/demo.json écrit : ${videos.length} vidéos, ${playlists.length} playlists.`);
