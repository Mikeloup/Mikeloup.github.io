/**
 * Le rendez-vous quotidien : UNE definition, partagee par tous ceux qui en ont
 * besoin.
 *
 * Ecrit le 18 septembre 2026. Michael : « nous avons dit que sur le site
 * internet il n'y aurait pas de Flash Info ailleurs que dans sa rubrique (donc
 * pas en affichage de la derniere video) ni de short. Regarde l'image et en
 * plus il les reprend dans la newsletter ».
 *
 * CE QUI S'ETAIT PASSE. Les deux protections existaient et elles etaient
 * justes : l'accueil retirait de la une tout ce qui appartenait a la rubrique
 * du journal, et la lettre hebdomadaire n'en gardait qu'une edition. Mais
 * toutes deux reconnaissaient une edition A SON APPARTENANCE A LA PLAYLIST
 * YOUTUBE. Les editions des 16 et 17 septembre n'avaient ete ajoutees a aucune
 * playlist : leur champ rubrique valait "" partout, les deux filtres etaient
 * aveugles, et le Flash Info s'affichait en une, dans les dernieres videos et
 * dans la newsletter -- tout en etant ABSENT de sa propre rubrique.
 *
 * Un controle qui depend d'un geste manuel ne mesure pas la regle, il mesure
 * le geste. On reconnait donc une edition de DEUX facons, et l'une suffit :
 *
 *   1. elle est dans la playlist designee par data/accueil.json (jt.rubrique) ;
 *   2. son titre contient l'un des motifs declares dans data/accueil.json
 *      (jt.motifTitre) -- « | Flash Info Tandem TV » est une signature sure,
 *      contrairement aux mots « JT », « journal » ou « edition », qui
 *      apparaissent dans trop de titres de la chaine pour qu'on s'y fie.
 *
 * Les motifs sont des MORCEAUX DE TEXTE, pas des expressions regulieres : on
 * doit pouvoir en ajouter un sans savoir programmer, et sans risquer de casser
 * la construction avec un caractere mal place. La comparaison ignore la casse,
 * les accents et les espaces en trop.
 *
 * Ce module ne lit aucun fichier et n'ecrit nulle part : on lui passe le
 * contenu de data/accueil.json, il rend un petit objet de regles. C'est ce qui
 * permet de l'essayer sans reseau (voir tools/essai-rendez-vous-quotidien.mjs).
 */

/** Minuscules, sans accents, espaces normalises. */
function aplati(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Les regles, lues une fois, depuis le contenu de data/accueil.json.
 * Tolere un fichier absent, vide ou incomplet : dans ce cas rien n'est
 * reconnu, ce qui laisse le site se comporter comme avant plutot que de
 * masquer des videos par accident.
 */
export function reglesDuQuotidien(accueil) {
  const jt = accueil?.jt || {};
  const slugs = new Set([].concat(jt.rubrique || []).filter(Boolean).map((s) => String(s).trim()));
  const motifs = [].concat(jt.motifTitre || [])
    .map(aplati)
    .filter((m) => m.length >= 6);   // un motif trop court attraperait n'importe quoi
  return { slugs, motifs };
}

/** Les adresses de rubrique d'une video, quel que soit l'objet qui la porte. */
function slugsDe(v) {
  if (!v) return [];
  // Objet video du build : v.playlists = [{ slug, title }, ...]
  if (Array.isArray(v.playlists)) return v.playlists.map((p) => p?.slug).filter(Boolean);
  // Fiche de search.json : v.s = l'adresse de la premiere rubrique
  if (typeof v.s === 'string' && v.s) return [v.s];
  return [];
}

/** Le titre d'une video, quel que soit l'objet qui la porte. */
function titreDe(v) {
  return v?.title || v?.t || '';
}

/** Vrai si la video est rangee dans la playlist du rendez-vous quotidien. */
export function dansLaPlaylist(v, regles) {
  return slugsDe(v).some((s) => regles.slugs.has(s));
}

/** Vrai si le TITRE porte la signature du rendez-vous quotidien. */
export function reconnuAuTitre(v, regles) {
  if (!regles.motifs.length) return false;
  const titre = aplati(titreDe(v));
  return regles.motifs.some((m) => titre.includes(m));
}

/**
 * La question que tout le monde pose : cette video est-elle une edition du
 * rendez-vous quotidien ? L'accueil s'en sert pour la sortir de la une, la
 * lettre hebdomadaire pour n'en garder qu'une.
 */
export function estLeRendezVousQuotidien(v, regles) {
  return dansLaPlaylist(v, regles) || reconnuAuTitre(v, regles);
}

/**
 * Les identifiants qui composent VRAIMENT le rendez-vous quotidien : ceux que
 * la ou les playlists designees contiennent.
 *
 * On lit les playlists brutes (celles que YouTube renvoie), pas les videos :
 * au moment ou le build a besoin de cette reponse, les videos ne connaissent
 * pas encore leur rubrique. `slugDe` est la fonction d'adresse du site
 * (util.slugify), passee en argument pour que ce module n'ait a importer
 * personne.
 */
export function idsDuRendezVous(playlists, regles, slugDe) {
  const ids = new Set();
  for (const p of playlists || []) {
    if (regles.slugs.has(slugDe(p.title || ''))) {
      for (const id of p.videoIds || []) ids.add(id);
    }
  }
  return ids;
}

/**
 * LES REPRISES COURTES -- ce que Michael appelle « les shorts ».
 *
 * Constat du 18 septembre 2026, lu dans le search.json du site en ligne :
 * chaque jour d'edition, la chaine porte DEUX videos. L'edition complete, dans
 * la playlist (246 s le 14, 358 s le 16, 278 s le 17), et une reprise courte
 * pour les reseaux, dans AUCUNE playlist (100 s, 152 s, 166 s). La reprise
 * etant la plus recente des deux, c'est elle qui prenait la une.
 *
 * Aucune regle de duree ne les separe -- une edition complete peut durer
 * 191 s, une reprise 166 s. Aucune regle de titre non plus : le 16 septembre,
 * les deux portaient des titres differents (« le rapprochement qui inquiete
 * l'Iran » contre « l'alliance secrete contre les Houthis »). Le seul signal
 * qui les distingue a tous les coups est celui que Michael ecrit lui-meme :
 * IL RANGE L'EDITION COMPLETE DANS LA PLAYLIST, ET PAS LA REPRISE.
 *
 * D'ou la regle, qui est exactement la sienne : le Flash Info, c'est ce qui
 * est dans sa rubrique. Ce qui porte sa signature au titre mais n'y est pas
 * est une reprise, et n'entre pas sur le site.
 *
 * Le risque assume : une vraie edition oubliee de la playlist disparaitrait du
 * site. C'est pourquoi le build NOMME chaque video ecartee par cette regle --
 * une ligne suffit alors a la remettre, en l'ajoutant a la playlist.
 */
export function reprisesDuQuotidien(videos, regles, idsDuRendezVousSet) {
  return (videos || []).filter(
    (v) => reconnuAuTitre(v, regles) && !idsDuRendezVousSet.has(v.id));
}
