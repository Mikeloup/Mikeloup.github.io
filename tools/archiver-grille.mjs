// -----------------------------------------------------------------------------
// Archivage de la grille de diffusion.
//
// L'export de la régie ne garde que trois jours glissants. Chaque nuit, une
// journée de programmation disparaît définitivement — et avec elle la seule
// chose qu'une chaîne de télévision possède et qu'une chaîne YouTube n'aura
// jamais : un historique de diffusion.
//
// Ce script conserve, jour par jour, ce qui est passé à l'antenne. Il ne
// s'occupe QUE des journées révolues ou en cours : les journées à venir sont
// prévisionnelles et changeraient encore. La journée en cours est réécrite à
// chaque passage, pour finir sur la version la plus proche du réel.
//
// Il ne dépend d'aucun service extérieur et n'écrit que dans data/grille-archive/.
// -----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(ROOT, 'data', 'grille.json');
const DOSSIER = path.join(ROOT, 'data', 'grille-archive');
const FUSEAU = 'Asia/Jerusalem';

/** Date du jour dans le fuseau de la chaîne, au format AAAA-MM-JJ. */
function jourIsrael() {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function main() {
  let source;
  try {
    source = JSON.parse(await fs.readFile(SOURCE, 'utf8'));
  } catch {
    console.log('Aucun fichier data/grille.json lisible : rien à archiver.');
    return;
  }

  const lignes = Array.isArray(source?.rows) ? source.rows : [];
  if (!lignes.length) {
    console.log('Export vide : rien à archiver.');
    return;
  }

  const aujourdhui = jourIsrael();
  await fs.mkdir(DOSSIER, { recursive: true });

  const parJour = new Map();
  for (const l of lignes) {
    const j = l.date_diffusion;
    if (!j || j > aujourdhui) continue;          // les jours à venir bougent encore
    if (!parJour.has(j)) parJour.set(j, []);
    parJour.get(j).push(l);
  }

  if (!parJour.size) {
    console.log(`Export du ${source.exported_at || '?'} : aucune journée révolue (aujourd'hui ${aujourdhui}).`);
    return;
  }

  let ecrits = 0;
  for (const [jour, rows] of [...parJour].sort()) {
    const cible = path.join(DOSSIER, `${jour}.json`);
    const contenu = {
      date: jour,
      export_origine: source.exported_at || null,
      nb_lignes: rows.length,
      rows,
    };

    // On ne réécrit que si les programmes ont changé : sans cette comparaison,
    // le script produirait un commit par jour même quand rien ne bouge, et
    // déclencherait autant de reconstructions inutiles du site.
    let ancien = null;
    try { ancien = JSON.parse(await fs.readFile(cible, 'utf8')); } catch { /* absent */ }
    if (ancien && JSON.stringify(ancien.rows) === JSON.stringify(rows)) {
      console.log(`  ${jour} — inchangé (${rows.length} lignes)`);
      continue;
    }

    await fs.writeFile(cible, `${JSON.stringify(contenu, null, 2)}\n`);
    console.log(`  ${jour} — ${ancien ? 'mis à jour' : 'archivé'} (${rows.length} lignes)`);
    ecrits++;
  }

  const total = (await fs.readdir(DOSSIER)).filter((f) => f.endsWith('.json')).length;
  console.log(`\n${ecrits} journée(s) écrite(s). Archive complète : ${total} journée(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
