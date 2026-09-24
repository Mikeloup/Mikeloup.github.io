// Essai du CHOIX de la personne presentee par le bloc « Qui est … ? ».
//
//   node tools/essai-qui-est-choix.mjs
//
// tools/essai-qui-est.mjs verifie la lecture du titre ; celui-ci verifie qui
// le bloc finit par presenter, ce qui n'est pas la meme chose.
//
// Le cas qui a motive ce fichier : le 18 septembre, la page « Je prends la
// parole parce que trop peu osent le faire » -- l'entretien de LUCAS MOULARD
// -- affichait « Qui est Sophie Bria ? », la presentatrice. Repondre a cote
// de la question est pire que se taire, parce que c'est cette question qui
// amene le visiteur.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = await import(path.join(ROOT, 'src', 'render.mjs'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

let ok = 0; let ko = 0;
const dire = (nom, vrai) => {
  if (vrai) { ok++; console.log(`  ok  ${nom}`); } else { ko++; console.log(`  KO  ${nom}`); }
};

const personne = (nom, role) => ({
  nom, slug: nom.toLowerCase().replace(/[^a-z]+/g, '-'),
  fiche: { role, texte: `${nom} est ${role}. Phrase de fiche ecrite a la main.` },
  identite: role, videos: [],
});

function rendu({ titre, rubrique, gens, presentateur = null }) {
  const cat = rubrique ? { title: rubrique, slug: 'r' } : null;
  return R.videoPage({
    config, categories: [], nav: [], related: [], buildTime: '',
    video: {
      id: 'zzz', title: titre, description: 'Description.', duration: 600,
      publishedAt: '2026-01-01T00:00:00Z', playlists: cat ? [cat] : [],
    },
    personnesParVideo: new Map([['zzz', gens]]),
    presentateurParRubrique: presentateur ? new Map([['r', presentateur]]) : new Map(),
  });
}
const presente = (html, nom) => html.includes('class="qui-est"') && html.includes(`Qui est ${nom}`);
const muet = (html) => !html.includes('class="qui-est"');

console.log('--- le chroniqueur dont la rubrique porte le nom ---');
const goldin = personne('Stéphane Goldin', 'analyste militaire');
const a = rendu({
  titre: "Israël : l'effet domino | Stéphane Goldin",
  rubrique: "L'édito de Stéphane Goldin", gens: [goldin],
});
dire('« … | Stéphane Goldin » dans sa propre rubrique le présente', presente(a, 'Stéphane Goldin'));

console.log('\n--- le nom au debut du titre ---');
const madar = personne('Samuel Madar', 'journaliste');
const b = rendu({
  titre: "Interview de Samuel Madar : Combattre l’antisémitisme chez les jeunes",
  rubrique: 'Antisémitisme', gens: [madar],
});
dire('« Interview de Samuel Madar : … » le présente', presente(b, 'Samuel Madar'));

console.log('\n--- la regression de Sophie Bria ne doit pas revenir ---');
const bria = personne('Sophie Bria', 'présentatrice');
const moulard = personne('Lucas Moulard', 'influenceur politique');
const c = rendu({
  titre: 'Je prends la parole parce que trop peu osent le faire — Lucas Moulard',
  rubrique: 'Face a Face avec Sophie Bria', gens: [bria], presentateur: 'Sophie Bria',
});
dire('invité inconnu du site : le bloc se tait au lieu de présenter la présentatrice', muet(c));

const d = rendu({
  titre: 'Je prends la parole parce que trop peu osent le faire — Lucas Moulard',
  rubrique: 'Face a Face avec Sophie Bria', gens: [bria, moulard], presentateur: 'Sophie Bria',
});
dire('invité connu : c’est lui qu’on présente', presente(d, 'Lucas Moulard'));
dire('… et pas la présentatrice', !presente(d, 'Sophie Bria'));

console.log('\n--- on ne présente personne que le titre ne nomme pas ---');
const e = rendu({
  titre: 'Israël : ce que révèle la semaine écoulée',
  rubrique: 'Face a Face avec Sophie Bria', gens: [bria], presentateur: 'Sophie Bria',
});
dire('titre sans nom : comportement inchangé (la présentatrice reste admise)',
  presente(e, 'Sophie Bria') || muet(e));

console.log('\n--- une enseigne n’est pas quelqu’un ---');
const f = rendu({ titre: 'Recette du jour | Côté Cuisine', rubrique: 'Côté Cuisine', gens: [] });
dire('aucune personne rattachée : pas de bloc', muet(f));

console.log('\n--- un résumé d’émission n’est pas une biographie ---');
// Le 19 septembre, le bloc reprenait la description d'une AUTRE vidéo de la
// personne des lors qu'elle l'y nommait. Sur « Qui est Rony Akrich ? », cela
// donnait le resume d'une emission en capitales. Cette source est retiree :
// seuls un texte ecrit a la main et la fonction ont le droit de s'afficher.
const akrich = {
  nom: 'Rony Akrich', slug: 'rony-akrich',
  fiche: { role: 'historiosophe de la Bible' }, identite: 'historiosophe de la Bible',
  videos: [
    { id: 'zzz', title: 'Ici', description: 'Description de la page courante.' },
    {
      id: 'aaa',
      title: 'ÉLECTIONS 2026 : QUATRE VISIONS D’ISRAËL, UN SEUL ÉTAT ?',
      description: 'ÉLECTIONS 2026 : QUATRE VISIONS D’ISRAËL, UN SEUL ÉTAT ?\n'
        + 'Dans cette troisième partie, Rony Akrich poursuit son analyse des forces politiques.',
    },
  ],
};
const g = rendu({
  titre: 'Israël : pluralisme ou domination ? | Rony Akrich',
  rubrique: 'Les Passions d’un Hébreu - Rony Akrich', gens: [akrich],
});
dire('le bloc s’affiche avec la seule fonction', presente(g, 'Rony Akrich'));
dire('la fonction est bien là', g.includes('historiosophe de la Bible'));
dire('le résumé de l’autre émission n’apparaît pas', !g.includes('poursuit son analyse'));
dire('… ni son titre en capitales', !g.includes('QUATRE VISIONS'));

console.log(`\n${ok} essai(s) réussi(s), ${ko} échoué(s).`);
process.exit(ko ? 1 : 0);
