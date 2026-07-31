// -----------------------------------------------------------------------------
// Lecture des transcriptions produites hors du site.
//
// Le fichier attendu s'appelle data/transcriptions/<identifiant vidéo>.<ext>,
// où l'identifiant est celui de l'adresse YouTube (les 11 caractères après
// « watch?v= »). Trois formats sont acceptés, ce sont ceux que produisent tous
// les outils Whisper : .srt, .vtt et .txt.
//
// Rien n'est deviné ni fabriqué ici : s'il n'y a pas de fichier, la vidéo n'a
// pas de transcription, et la page reste telle quelle.
// -----------------------------------------------------------------------------

const TEMPS = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})|(\d{1,2}):(\d{2})[,.](\d{1,3})/;

function secondes(ligne) {
  const m = TEMPS.exec(ligne);
  if (!m) return null;
  if (m[1] !== undefined) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  return (+m[5]) * 60 + (+m[6]);
}

/** Découpe un fichier de sous-titres en segments { debut, texte }. */
function segmentsDeSousTitres(contenu) {
  const out = [];
  const blocs = contenu.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const bloc of blocs) {
    const lignes = bloc.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lignes.length) continue;
    const iTemps = lignes.findIndex((l) => l.includes('-->'));
    if (iTemps === -1) continue;
    const debut = secondes(lignes[iTemps].split('-->')[0]);
    const texte = lignes.slice(iTemps + 1)
      .filter((l) => !/^WEBVTT/i.test(l))
      .join(' ')
      // Balises de style et de position que produisent certains outils.
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]*\}/g, '')
      .trim();
    if (texte) out.push({ debut: debut ?? 0, texte });
  }
  return out;
}

/**
 * Regroupe les segments en paragraphes lisibles.
 *
 * Whisper découpe par respiration : une ligne toutes les trois secondes. Publié
 * tel quel, cela donne un mur de fragments illisible. On agrège jusqu'à ce
 * qu'une phrase se termine et qu'on ait atteint une longueur raisonnable.
 */
function paragraphes(segments, { motsMin = 55 } = {}) {
  const out = [];
  let courant = null;
  for (const s of segments) {
    if (!courant) courant = { debut: s.debut, texte: s.texte };
    else courant.texte += ` ${s.texte}`;
    const mots = courant.texte.split(/\s+/).length;
    const finDePhrase = /[.!?…]["»]?\s*$/.test(courant.texte);
    if (mots >= motsMin && finDePhrase) { out.push(courant); courant = null; }
  }
  if (courant) out.push(courant);
  return out.map((p) => ({ ...p, texte: p.texte.replace(/\s{2,}/g, ' ').trim() }));
}

/** Applique le lexique de corrections, mot entier, insensible à la casse. */
function corriger(texte, corrections) {
  let t = texte;
  for (const [faux, bon] of Object.entries(corrections || {})) {
    if (!faux) continue;
    const echappe = faux.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`(^|[^\\p{L}])${echappe}(?=$|[^\\p{L}])`, 'giu'), (m, pre) => `${pre}${bon}`);
  }
  return t;
}

export function mmss(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Transforme le contenu brut d'un fichier en transcription prête à afficher.
 * Renvoie null si le fichier ne contient rien d'exploitable.
 */
export function lireTranscription(contenu, { corrections = {}, extension = '' } = {}) {
  const brut = String(contenu || '').trim();
  if (!brut) return null;

  let blocs;
  if (/-->/.test(brut)) {
    blocs = paragraphes(segmentsDeSousTitres(brut));
  } else {
    // Texte simple : on respecte les paragraphes de l'auteur s'il y en a,
    // sinon on découpe par phrases pour éviter un bloc unique de 3 000 mots.
    const morceaux = brut.split(/\n{2,}/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    blocs = (morceaux.length > 1 ? morceaux : decouperEnParagraphes(morceaux[0] || ''))
      .map((texte) => ({ debut: null, texte }));
  }

  blocs = blocs
    .map((b) => ({ ...b, texte: corriger(b.texte, corrections) }))
    .filter((b) => b.texte);
  if (!blocs.length) return null;

  const mots = blocs.reduce((n, b) => n + b.texte.split(/\s+/).length, 0);
  return { blocs, mots, minutes: Math.round(mots / 150), extension };
}

/** Découpe un long texte sans retour à la ligne en paragraphes de ~90 mots. */
function decouperEnParagraphes(texte, { motsMin = 90 } = {}) {
  const phrases = texte.split(/(?<=[.!?…])\s+/);
  const out = [];
  let courant = '';
  for (const p of phrases) {
    courant = courant ? `${courant} ${p}` : p;
    if (courant.split(/\s+/).length >= motsMin) { out.push(courant); courant = ''; }
  }
  if (courant.trim()) out.push(courant.trim());
  return out;
}
