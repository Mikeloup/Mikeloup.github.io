// -----------------------------------------------------------------------------
// La lettre : combien d'abonnés, et est-elle bien partie ?
//
// POURQUOI CETTE SECONDE QUESTION (28 août 2026) : « je n'ai pas reçu la
// newsletter aujourd'hui alors qu'on est vendredi ». Verification faite, la
// tache programmee du vendredi n'avait pas ete declenchee — pas d'erreur, pas
// de journal, rien. GitHub documente que les declenchements programmes sont
// « au mieux » : en periode de charge, ils peuvent etre retardes ou SUPPRIMES.
// Une lettre qui ne part pas ne produit donc aucun signal. C'est le silence,
// pas la panne, et le silence ne reveille personne.
//
// Le rapport quotidien devient ce reveil. Il pose a Kit la meme question que
// lettre-hebdo.mjs avant d'envoyer : quand la derniere lettre est-elle partie ?
// Meme source de verite, meme cle, aucun secret supplementaire. Au-dela de huit
// jours, il le dit en tete du rapport.
//
// Huit et non sept : la lettre part le vendredi, avec parfois quarante minutes
// de retard. Sept jours pile declencherait l'alerte un vendredi matin sur deux,
// et une alerte qui se declenche sur du normal apprend a ignorer les alertes.
// -----------------------------------------------------------------------------

const RACINE = 'https://api.kit.com/v4';
const JOURS_SANS_LETTRE_ALERTE = 8;

/** Rend la section markdown. Ne leve jamais. */
export async function sectionLettre() {
  const cle = process.env.KIT_API_KEY;
  if (!cle) return '\n**Lettre** — clé `KIT_API_KEY` absente, section non produite.\n';
  const enTete = { Accept: 'application/json', 'X-Kit-Api-Key': cle };

  const morceaux = [];

  // --- Abonnés -------------------------------------------------------------
  // On demande les statistiques de croissance sur trente jours : elles donnent
  // le nombre d'abonnés ET le mouvement, ce qu'un simple total ne dirait pas.
  try {
    const fin = new Date();
    const debut = new Date(fin.getTime() - 30 * 864e5);
    const url = `${RACINE}/account/growth_stats`
      + `?starting=${debut.toISOString().slice(0, 10)}`
      + `&ending=${fin.toISOString().slice(0, 10)}`;
    const r = await fetch(url, { headers: enTete });
    const d = await r.json().catch(() => null);
    const s = d?.stats || d?.growth_stats || d;
    if (r.ok && s && typeof s === 'object') {
      const total = s.subscribers ?? s.total_subscribers ?? null;
      const nouveaux = s.new_subscribers ?? null;
      const departs = s.cancellations ?? null;
      const net = s.net_new_subscribers
        ?? (nouveaux !== null && departs !== null ? nouveaux - departs : null);
      if (total !== null) {
        morceaux.push(`**${total} abonné${total > 1 ? 's' : ''} à la lettre**`
          + (net !== null ? ` — ${net >= 0 ? '+' : ''}${net} sur trente jours`
            + (nouveaux !== null && departs !== null
              ? ` (${nouveaux} inscription${nouveaux > 1 ? 's' : ''}, ${departs} désabonnement${departs > 1 ? 's' : ''})` : '')
            : ''));
      } else {
        // On ne devine pas : si la forme de la reponse a change, on le dit,
        // avec ce qu'on a recu, plutot que d'afficher un zero faux.
        morceaux.push('**Abonnés** — Kit a répondu, mais sans le champ attendu : '
          + `\`${Object.keys(s).slice(0, 8).join(', ')}\``);
      }
    } else {
      morceaux.push(`**Abonnés** — Kit n'a pas répondu (HTTP ${r.status}).`);
    }
  } catch (e) {
    morceaux.push(`**Abonnés** — lecture impossible : ${String(e.message).slice(0, 120)}`);
  }

  // --- La lettre est-elle partie ? -----------------------------------------
  try {
    const r = await fetch(`${RACINE}/broadcasts?per_page=25`, { headers: enTete });
    const d = await r.json().catch(() => null);
    const liste = Array.isArray(d?.broadcasts) ? d.broadcasts : null;
    if (!r.ok || !liste) {
      morceaux.push('**Dernière lettre** — impossible de le savoir aujourd\'hui. '
        + 'Ne pas savoir n\'est pas « tout va bien ».');
    } else {
      const envoyees = liste
        .map((b) => b?.published_at || b?.send_at || b?.created_at)
        .filter(Boolean)
        .map((x) => new Date(x))
        .filter((x) => !Number.isNaN(x.getTime()) && x <= new Date())
        .sort((a, b) => b - a);
      if (!envoyees.length) {
        morceaux.push('**Dernière lettre** — aucune lettre trouvée chez Kit.');
      } else {
        const derniere = envoyees[0];
        const jours = Math.floor((Date.now() - derniere.getTime()) / 864e5);
        const quand = derniere.toISOString().slice(0, 10);
        morceaux.push(jours >= JOURS_SANS_LETTRE_ALERTE
          ? `> ⚠️ **La lettre n'est pas partie depuis ${jours} jours** (dernière le ${quand}).\n`
            + '> Le déclenchement automatique de GitHub est « au mieux » : il lui arrive '
            + 'd\'être supprimé sans rien signaler. Pour l\'envoyer maintenant : '
            + 'Actions → *Lettre hebdomadaire* → **Run workflow** → `envoyer = oui`.'
          : `**Dernière lettre** envoyée le ${quand} (il y a ${jours} jour${jours > 1 ? 's' : ''}).`);
      }
    }
  } catch (e) {
    morceaux.push(`**Dernière lettre** — vérification impossible : ${String(e.message).slice(0, 120)}`);
  }

  return `\n${morceaux.join('\n\n')}\n`;
}
