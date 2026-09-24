(function () {
  var f = document.getElementById('demande-form');
  if (!f) return;
  var vide = document.getElementById('recap-vide');
  var lignes = document.getElementById('recap-lignes');
  var totaux = document.getElementById('recap-totaux');
  var note = document.getElementById('recap-note');
  var erreur = document.getElementById('erreur');

  // Les tarifs affiches ici sont exactement ceux du chapitre « Nos offres ».
  // Un seul endroit a changer si un prix bouge : ce tableau et la carte.
  var PRIX_PARRAINAGE = 2400;
  var PRIX_REPORTAGE = 4500;
  var PRIX_FORMULE = {
    'Découverte — 100 diffusions/mois': 1440,
    'Régulier — 200 diffusions/mois': 2800,
    'Intensif — 300 diffusions/mois': 4000
  };
  var PRIX_VIDEO = {
    "J'ai déjà ma vidéo": 0,
    'Réalisation à partir de mes éléments': 900,
    'Tournage chez moi': 2500
  };

  function lus(nom) {
    return Array.prototype.slice.call(f.querySelectorAll('[name="' + nom + '"]:checked, [name="' + nom + '[]"]:checked'))
      .map(function (e) { return e.value; });
  }
  function nombre(n) { return n.toLocaleString('fr-FR').replace(/ | /g, ' '); }
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Une ligne du recapitulatif : un libelle, une precision facultative, un prix.
  // prix === null : le visiteur n'a pas encore choisi, on le dit au lieu
  // d'afficher un chiffre qui ne serait pas le sien.
  function ligne(libelle, precision, prix, periode, attente) {
    return { libelle: libelle, precision: precision, prix: prix, periode: periode, attente: attente };
  }

  function construire() {
    var offres = lus('offre');
    var L = [];

    if (offres.indexOf('Parrainer une émission') > -1) {
      var em = lus('emission')[0];
      L.push(ligne('Parrainage d’une émission', em || null,
        PRIX_PARRAINAGE, 'mois', em ? null : 'choisissez l’émission ci-dessus'));
    }
    if (offres.indexOf('Un spot publicitaire') > -1) {
      var fo = lus('formule')[0];
      var prixF = fo && PRIX_FORMULE.hasOwnProperty(fo) ? PRIX_FORMULE[fo] : null;
      L.push(ligne('Spot publicitaire', fo ? fo.replace(' — ', ' · ') : null,
        prixF, 'mois', prixF === null ? 'choisissez une formule ci-dessus' : null));

      var vi = lus('video')[0];
      if (vi && PRIX_VIDEO.hasOwnProperty(vi)) {
        if (PRIX_VIDEO[vi] > 0) {
          L.push(ligne('Réalisation de votre vidéo', vi, PRIX_VIDEO[vi], 'unique', null));
        } else {
          L.push(ligne('Réalisation de votre vidéo', 'vous fournissez la vidéo', 0, 'unique', null));
        }
      } else {
        L.push(ligne('Réalisation de votre vidéo', null, null, 'unique',
          'dites-nous si vous avez déjà la vidéo'));
      }
    }
    if (offres.indexOf('Un reportage') > -1) {
      L.push(ligne('Reportage sur votre activité', 'deux à trois minutes, tourné chez vous',
        PRIX_REPORTAGE, 'unique', null));
    }
    if (offres.indexOf('Je ne sais pas encore') > -1) {
      L.push(ligne('Vous souhaitez notre avis', 'nous vous proposerons la formule adaptée',
        null, null, 'nous en parlons au téléphone'));
    }
    return L;
  }

  function afficher() {
    var offres = lus('offre');
    // Les blocs conditionnels n'apparaissent que si l'offre est choisie.
    Array.prototype.forEach.call(f.querySelectorAll('[data-si]'), function (bloc) {
      var ouvert = offres.indexOf(bloc.getAttribute('data-si')) > -1;
      bloc.hidden = !ouvert;
      if (!ouvert) {
        Array.prototype.forEach.call(bloc.querySelectorAll('input:checked'), function (i) { i.checked = false; });
      }
    });

    var L = construire();
    vide.hidden = L.length > 0;
    if (!L.length) {
      lignes.innerHTML = '';
      totaux.innerHTML = '';
      note.textContent = '';
      return;
    }

    lignes.innerHTML = L.map(function (l) {
      var droite = l.prix === null
        ? '<span class="t att">' + esc(l.attente || 'à préciser') + '</span>'
        : '<span class="t">' + (l.prix === 0 ? 'aucun frais'
            : nombre(l.prix) + ' NIS' + (l.periode === 'mois' ? ' / mois' : '')) + '</span>';
      return '<li><span class="q">' + esc(l.libelle)
        + (l.precision ? '<em>' + esc(l.precision) + '</em>' : '')
        + '</span>' + droite + '</li>';
    }).join('');

    var mois = 0, unique = 0, incomplet = false;
    L.forEach(function (l) {
      if (l.prix === null) { if (l.periode) incomplet = true; return; }
      if (l.periode === 'mois') mois += l.prix; else if (l.periode === 'unique') unique += l.prix;
    });

    var t = [];
    if (mois) t.push('<div><span>Total chaque mois</span>' + nombre(mois) + ' NIS</div>');
    if (unique) t.push('<div><span>À régler une seule fois</span>' + nombre(unique) + ' NIS</div>');
    totaux.innerHTML = t.join('');

    var textes = [];
    if (incomplet) textes.push('Le total se complétera dès que vous aurez fait tous vos choix.');
    textes.push('Tarifs fermes.');
    if (mois) textes.push('Les formules mensuelles engagent sur trois mois.');
    note.textContent = textes.join(' ');
  }

  // Le meme detail, en texte, pour le courriel que nous recevons.
  function resumeTexte() {
    var L = construire(), out = [], mois = 0, unique = 0;
    L.forEach(function (l) {
      var d = l.libelle + (l.precision ? ' (' + l.precision + ')' : '') + ' : ';
      if (l.prix === null) { d += l.attente || 'à préciser'; }
      else if (l.prix === 0) { d += 'aucun frais'; }
      else {
        d += nombre(l.prix) + ' NIS' + (l.periode === 'mois' ? ' par mois' : ' une seule fois');
        if (l.periode === 'mois') mois += l.prix; else unique += l.prix;
      }
      out.push(d);
    });
    var tot = [];
    if (mois) tot.push(nombre(mois) + ' NIS par mois');
    if (unique) tot.push(nombre(unique) + ' NIS une seule fois');
    if (tot.length) out.push('TOTAL : ' + tot.join(' + '));
    return out.join(' | ');
  }

  f.addEventListener('change', afficher);
  afficher();

  f.addEventListener('submit', function (ev) {
    erreur.hidden = true;
    if (!lus('offre').length) {
      ev.preventDefault();
      erreur.textContent = 'Dites-nous d’abord ce qui vous intéresse.';
      erreur.hidden = false;
      return;
    }
    if (!f.checkValidity()) {
      ev.preventDefault();
      f.classList.add('demande-verifie');
      erreur.textContent = 'Il manque votre nom, votre téléphone ou votre e-mail.';
      erreur.hidden = false;
      var premier = f.querySelector(':invalid');
      if (premier) premier.focus();
      return;
    }
    // Le detail part avec la demande : c'est ce qu'on lit en premier dans le
    // courriel, avant meme d'ouvrir le reste.
    document.getElementById('champ-resume').value = resumeTexte();
    var bouton = f.querySelector('button[type=submit]');
    bouton.disabled = true;
    bouton.textContent = 'Envoi en cours…';
    // On laisse le navigateur envoyer le formulaire normalement.
  });
})();

(function () {
  // Au retour de l'envoi, l'adresse porte « ?envoye=1 » : on remercie et on
  // remonte à la bonne section plutôt que de laisser le visiteur perplexe.
  if (location.search.indexOf('envoye=1') === -1) return;
  var f = document.getElementById('demande-form');
  if (!f) return;
  f.outerHTML = '<div class="merci"><h3>Merci, votre demande est bien arrivée.</h3>'
    + '<p>Nous vous rappelons sous 24&nbsp;heures, au moment que vous avez indiqué. '
    + 'Une question d’ici là&nbsp;? <a href="mailto:contact@tandemtv.org" style="color:#fff">contact@tandemtv.org</a></p></div>';
  document.getElementById('demande').scrollIntoView();
})();
