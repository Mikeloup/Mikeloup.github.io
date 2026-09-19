// Essai du sommaire de repli « Les questions posées ».
//
// Ce bloc affiche, sur les pages vidéo dont la description YouTube n'a PAS de
// chapitres, les questions du présentateur relevées dans la transcription puis
// relues une par une (data/questions-transcriptions.json).
//
//   node tools/essai-questions.mjs
//
// Ce que l'essai vérifie, et pourquoi :
//   - le bloc n'apparaît que s'il y a des questions ;
//   - les chapitres écrits à la main passent TOUJOURS devant, sans doublon ;
//   - chaque question est horodatée et cliquable ;
//   - le texte est échappé, dans le HTML ET dans les données structurées.
//     Ce dernier point n'est pas décoratif : un texte contenant la séquence de
//     fermeture d'une balise script referme le bloc JSON-LD et fait passer la
//     moitié de la page en clair. Les titres de chapitres viennent de YouTube,
//     les questions d'une transcription automatique : ni l'un ni l'autre n'est
//     écrit par nous.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = await import(path.join(ROOT, 'src', 'render.mjs'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const questions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions-transcriptions.json'), 'utf8'));
delete questions._comment;

let ok = 0; let ko = 0;
const dire = (nom, vrai) => {
  if (vrai) { ok++; console.log(`  ok  ${nom}`); } else { ko++; console.log(`  KO  ${nom}`); }
};

const id = Object.keys(questions)[0];
const base = {
  config, categories: [], nav: [], related: [], buildTime: new Date().toISOString(),
  video: {
    id, title: 'Essai', description: 'Une description sans chapitres.',
    duration: 3600, publishedAt: '2026-01-01T00:00:00Z', playlists: [],
  },
};

const avec = R.videoPage({ ...base, questions: questions[id] });
dire('le bloc apparaît quand il y a des questions', avec.includes('chapters-questions'));
dire('la première question est affichée', avec.includes(questions[id][0].q.slice(0, 30)));
dire('le lien est horodaté', avec.includes(`&amp;t=${questions[id][0].t}s`));
dire('les données structurées portent un Clip', avec.includes('"Clip"'));
dire('autant de lignes que de questions',
  (avec.match(/chapters-time/g) || []).length === questions[id].length);

const sans = R.videoPage({ ...base, questions: null });
dire('sans questions, pas de bloc', !sans.includes('chapters-questions'));

const chap = R.videoPage({
  ...base,
  video: { ...base.video, description: '00:00 Introduction\n05:00 Le sujet\n12:30 Conclusion' },
  questions: questions[id],
});
dire('les chapitres écrits à la main passent devant',
  chap.includes('Au sommaire') && !chap.includes('chapters-questions'));
dire('les questions ne doublonnent pas les chapitres',
  !chap.includes(questions[id][0].q.slice(0, 30)));

const piege = '</' + 'script><b>oups</b>';
const echap = R.videoPage({ ...base, questions: [{ q: `Et ${piege} alors ?`, t: 10 }] });
dire('le HTML est échappé', !echap.includes('<b>oups</b>'));
const blocs = [...echap.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
let jsonOk = blocs.length > 0;
for (const b of blocs) { try { JSON.parse(b[1]); } catch { jsonOk = false; } }
dire('les données structurées restent du JSON valide', jsonOk);
dire('la balise script n\'est pas refermée par le texte',
  blocs.some((b) => b[1].includes('\\u003c')));

let rendues = 0;
for (const [vid, liste] of Object.entries(questions)) {
  const h = R.videoPage({ ...base, video: { ...base.video, id: vid }, questions: liste });
  if (h.includes('chapters-questions')) rendues++;
}
dire(`les ${Object.keys(questions).length} vidéos du fichier rendent toutes le bloc`,
  rendues === Object.keys(questions).length);

const total = Object.values(questions).reduce((a, l) => a + l.length, 0);
dire('toutes les questions sont horodatées',
  Object.values(questions).every((l) => l.every((q) => Number.isInteger(q.t) && q.t >= 0)));
dire('aucune question vide', Object.values(questions).every((l) => l.every((q) => q.q && q.q.trim().endsWith('?'))));

console.log(`\n${Object.keys(questions).length} vidéos, ${total} questions relues.`);
console.log(`${ok} essai(s) réussi(s), ${ko} échoué(s).`);
process.exit(ko ? 1 : 0);
