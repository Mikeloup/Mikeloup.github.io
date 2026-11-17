// Mesure le RESULTAT du garde-fou anti-doublon, pas le geste.
//
// Rejoue le defaut du 17 novembre 2026 : trois plaquettes de la video de Paul
// Amar etaient en ligne, son titre a ete retouche a 7h40 pour le referencement,
// et une quatrieme est partie. Le garde-fou comparait le titre.
//
//   node tools/essai-doublon-instagram.mjs

import { readFile } from 'node:fs/promises';
import * as insta from '../src/instagram.mjs';

const config = JSON.parse(await readFile(new URL('../site.config.json', import.meta.url), 'utf8'));

let echecs = 0;
const verifie = (nom, obtenu, attendu) => {
  const ok = obtenu === attendu;
  if (!ok) echecs += 1;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${nom}` + (ok ? '' : `\n      attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`));
};

// --- 1. La legende porte-t-elle l'identifiant, et a la bonne place ? --------
const amar = { id: 'Kq7mZ2bX1aP', title: 'Paul Amar : « la dissolution de LFI »' };
const legende = insta.legende(amar, { config, emission: "L'invité de Tandem" });
console.log('--- legende fabriquee ---\n' + legende + '\n-------------------------');

verifie("la legende contient youtu.be/<id>", legende.includes(`youtu.be/${amar.id}`), true);
verifie("l'identifiant est sur la DERNIERE ligne non vide",
  legende.split('\n').map((l) => l.trim()).filter(Boolean).at(-1), `youtu.be/${amar.id}`);
verifie('la PREMIERE ligne non vide reste le titre (estDejaEnLigne en depend)',
  legende.split('\n').map((l) => l.trim()).filter(Boolean)[0], amar.title);

// --- 2. LE DEFAUT DU 17 NOVEMBRE, rejoue tel quel --------------------------
// Le fil porte l'ancien titre ET l'identifiant. La video a ete renommee.
const filAvecId = [{ texte: insta.legende(
  { id: amar.id, title: 'Paul Amar, grand journaliste français, sur Tandem TV' },
  { config, emission: "L'invité de Tandem" }), date: Date.now(), type: 'IMAGE' }];
verifie('titre retouche, identifiant present : RECONNUE (c\'etait le defaut)',
  insta.dejaPublieeSurLeFil(filAvecId, amar), true);

// --- 3. Filet de transition : fil ancien, sans identifiant -----------------
const filSansId = [{ texte: `${amar.title}\n\nA revoir sur Tandem TV.`, date: Date.now(), type: 'IMAGE' }];
verifie('fil ancien sans identifiant, titre inchange : RECONNUE',
  insta.dejaPublieeSurLeFil(filSansId, amar), true);
verifie('fil ancien sans identifiant, titre retouche : non reconnue (limite assumee)',
  insta.dejaPublieeSurLeFil(filSansId, { id: amar.id, title: 'Un titre tout autre et bien plus long' }), false);

// --- 4. Une vraie nouveaute doit pouvoir sortir -----------------------------
verifie('video jamais publiee : non reconnue, elle peut partir',
  insta.dejaPublieeSurLeFil(filAvecId, { id: 'ZZZ9yyy8xxx', title: 'Studio 420, premiere emission' }), false);

// --- 5. Fil illisible : on ne tranche pas -----------------------------------
verifie("fil illisible : null, l'appelant s'abstient", insta.dejaPublieeSurLeFil(null, amar), null);

// --- 6. Pas de faux positif sur un titre court ------------------------------
verifie('titre court, sans identifiant : aucune conclusion hative',
  insta.dejaPublieeSurLeFil([{ texte: 'Katava et autre chose', date: 0 }], { id: '', title: 'Katava' }), false);

// --- 7. L'autre forme d'entree (manifeste : .titre et non .title) -----------
verifie('entree du manifeste (champ .titre) traitee comme les autres',
  insta.dejaPublieeSurLeFil(filSansId, { id: '', titre: amar.title }), true);

console.log(echecs ? `\n${echecs} ECHEC(S)` : '\nTous les controles passent.');
process.exit(echecs ? 1 : 0);
