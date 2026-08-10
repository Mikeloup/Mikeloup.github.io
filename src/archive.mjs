// -----------------------------------------------------------------------------
// Historique de diffusion.
//
// L'export de la régie ne garde qu'une fenêtre glissante de sept jours.
// Depuis le 2 août 2026, une
// tâche nocturne en conserve une copie datée dans data/grille-archive/ — une
// journée par fichier, définitivement.
//
// Ce module relit cette mémoire et répond à une question qu'aucune chaîne
// YouTube ne peut poser : « quand cette émission est-elle passée à l'antenne ? »
// C'est précisément ce qui distingue une chaîne de télévision d'un catalogue,
// et c'est un argument que les annonceurs comprennent.
//
// L'archive grandit d'un fichier par nuit. Le module ne lit que les dernières
// journées, pour que la construction ne s'alourdisse pas d'année en année.
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareGrille } from './grille.mjs';

const NOM_FICHIER = /^(\d{4}-\d{2}-\d{2})\.json$/;

/**
 * Relit l'archive et rend, pour chaque vidéo et chaque rubrique, la liste de
 * ses passages passés — du plus récent au plus ancien.
 *
 * Le rapprochement entre une ligne de grille et une vidéo du catalogue est
 * exactement celui de la grille du jour : on réutilise `prepareGrille` plutôt
 * que d'écrire une seconde logique qui divergerait de la première.
 */
export async function lireArchive(dossier, {
  emissions = {}, index = null, smartTitre = (x) => x, rubriques = [],
  joursMax = 120, parProgramme = 12,
} = {}) {
  let fichiers;
  try {
    fichiers = (await fs.readdir(dossier)).filter((f) => NOM_FICHIER.test(f));
  } catch {
    return { parVideo: new Map(), parRubrique: new Map(), jours: 0, premier: null, dernier: null };
  }
  if (!fichiers.length) {
    return { parVideo: new Map(), parRubrique: new Map(), jours: 0, premier: null, dernier: null };
  }

  fichiers.sort();
  const retenus = fichiers.slice(-joursMax);

  const parVideo = new Map();
  const parRubrique = new Map();

  for (const f of retenus) {
    let donnees;
    try {
      donnees = JSON.parse(await fs.readFile(path.join(dossier, f), 'utf8'));
    } catch {
      continue;                       // un fichier illisible ne doit pas casser le site
    }
    const jour = prepareGrille(donnees, {
      emissions, index, smartTitre, rubriques,
      // Pas d'arrondi : l'archive dit ce qui est passé, pas ce qu'on annonçait.
      arrondi: 0,
    })?.jours?.[0];
    if (!jour) continue;

    for (const p of jour.programmes) {
      if (p.type !== 'programme' || !p.heure) continue;
      if (p.videoId) {
        if (!parVideo.has(p.videoId)) parVideo.set(p.videoId, []);
        parVideo.get(p.videoId).push([jour.date, p.heure]);
      }
      if (p.rubrique) {
        parRubrique.set(p.rubrique, (parRubrique.get(p.rubrique) || 0) + 1);
      }
    }
  }

  // Du plus récent au plus ancien : c'est le dernier passage qui intéresse.
  for (const [id, liste] of parVideo) {
    liste.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? 1 : -1));
    parVideo.set(id, liste.slice(0, parProgramme));
  }

  return {
    parVideo,
    parRubrique,
    jours: retenus.length,
    premier: retenus[0].replace('.json', ''),
    dernier: retenus[retenus.length - 1].replace('.json', ''),
  };
}
