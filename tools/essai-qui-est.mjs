/**
 * Essai du bloc « Qui est … ? » — sur les VRAIS titres du site.
 *
 * Ecrit le 18 septembre 2026. Les deux premieres versions du bloc ont ete
 * mesurees en ligne, pas essayees : la premiere presentait l'intervieweuse a
 * la place de l'invite, la seconde faisait tomber la couverture de 45 % a 5 %.
 * Chaque aller-retour coutait une reconstruction du site et cinq minutes.
 *
 * Les vingt titres ci-dessous sont ceux d'un tirage reel du catalogue, releve
 * le 18/09. Ils permettent d'essayer la regle SANS reconstruire ni publier.
 *
 *   node tools/essai-qui-est.mjs
 */
import { nomEnFinDeTitre } from '../src/render.mjs';

let echecs = 0;
function verifier(titre, attendu, rubrique = '') {
  const obtenu = nomEnFinDeTitre(titre, { siteName: 'Tandem TV', rubrique });
  const ok = obtenu === attendu;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${obtenu === null ? '(aucune signature)' : `« ${obtenu} »`}`
    + `  <-  ${titre.slice(0, 62)}`
    + (ok ? '' : `\n         attendu ${attendu === null ? '(aucune)' : `« ${attendu} »`}`));
}

console.log('\n--- LE TITRE SIGNE UN INVITE : ON NE PARLE QUE DE LUI ---');
verifier('Je prends la parole parce que trop peu osent le faire  – Lucas Moulard',
  'Lucas Moulard', 'Face a Face avec Sophie Bria');
verifier('Et si les Juifs devaient quitter la Terre ? | Polo Labraise',
  'Polo Labraise', "L'interview de William Zerbib");

console.log('\n--- PAS DE SIGNATURE : LA PERSONNE QUE LE SITE CONNAIT EST LA BONNE ---');
verifier("Le moment venu pour Israël d'attaquer l'Iran ?", null, 'Géopolitique du Proche Orient');
verifier('Ne sois pas comme Noé : sauve les autres, pas seulement ta famille', null,
  'Les cours du Rav Mendel Mimoun');
verifier('Israël, souvenir solennel : hommage aux soldats tombés', null,
  "Les Passions d'un Hébreu - Rony Akrich");
verifier("Le procès Moshe Katsav : Les grands procès de l'histoire d'Israël", null,
  "Les grands procès de l'histoire d'Israël");
verifier('GUIDE EN TANDEM : RAMAT HANADIV', null, 'Guide en Tandem');
verifier('CESAREE : GUIDE EN TANDEM', null, 'Guide en Tandem');
verifier('Un Syrien en Israël', null, "L'interview de Jérôme Haas");
verifier('Le mouvement Tsav 9 : un blocus citoyen contre le Hamas', null, 'Actu Israël');
verifier('Pause Beaute : la beaute des ongles', null, 'Pause beaute');

console.log('\n--- CE QUI RESSEMBLE A UN NOM SANS EN ETRE UN ---');
verifier('« NAZA » enflamme Israël, sécurité avant les fêtes | Flash Info Tandem TV – 14 sept. 2026',
  null, 'Flash Info Tandem TV');
verifier('Arie Levy : Sauveteurs Sans Frontières - J47 de Guerre Israël-Hamas', null, 'Actu Israël');
verifier('Geek High Tech Gaming : La consommation numérique (27.03.19)', null, '');
verifier("L'antisionisme est la forme moderne de l'antisémitisme - 2eme partie", null, '');
verifier('HALLELUJAH PAR SAADYA SUR TANDEM 2.0', null, 'Live musical Tandem');
verifier('CUISINE INDIENNE SUR TANDEM 2.0', null, 'Coté cuisine');
verifier('YANN JAMET SUR TANDEM 2.0', null, 'People');
verifier('La liste arabe, Naphtali Bennett, Yomtob Kalfon : Entre nous soit dit avec Fernand Cohen Tannoudji',
  null, 'Entre nous soit dit');

console.log('\n--- PIEGES DE COUPURE ---');
verifier('J26 Guerre Israël-Hamas : Le massacre du 7 octobre -sentiments et ressentiments', null, '');
verifier('Un entretien avec Jean-Pierre Elkabbach', null, '');
verifier('La rubrique | Tandem TV', null, '');

console.log(`\n${echecs ? `${echecs} CAS EN ECHEC` : 'Tous les cas passent.'}\n`);
process.exit(echecs ? 1 : 0);
