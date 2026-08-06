# Tandem TV — feuille de route

*Ce fichier vit dans le dépôt : il survit à tout. Il liste ce qui est fait, ce qui
reste, et ce qu'il manque pour avancer. À relire au début de chaque session.*

---

## Objectifs, dans l'ordre

1. **Plus de visiteurs** — c'est ce qui ne fonctionnait pas sur Wix.
2. **Plus de vues et d'abonnés YouTube** — une vidéo lue depuis le site compte dans le compteur YouTube.
3. **De l'interaction** — le site ne doit pas être « qu'une vitrine ».

*Mis de côté à la demande de Michael : la diffusion en direct de la chaîne sur le
site, en service payant.*

---

## Fait

- Site régénéré depuis YouTube, 12 synchronisations par jour, heure de dernière synchro affichée.
- Domaine `www.tandemtv.net` migré de Wix vers GitHub Pages, HTTPS forcé.
- `tandemtv.org` redirigé vers le nouveau site (dépôt `tandemtv-org`). Messagerie Google Workspace intacte.
- Google Search Console : propriété vérifiée, sitemaps soumis (1 033 vidéos).
- Mentions légales, politique de confidentialité, page « À propos » incarnée.
- Réseaux sociaux reliés au site + fiche `Organization` pour Google, logos officiels.
- Polices auto-hébergées (système) : conformité RGPD, plus aucune requête vers Google Fonts.
- Mesure d'audience Cloudflare Web Analytics (sans cookie, sans bandeau de consentement).
- Vidéo épinglable en une, hiérarchie éditoriale de la page d'accueil.
- Sommaire automatique des chapitres + données structurées `Clip` (moments clés Google).
- Notifications navigateur (OneSignal) + envoi automatique à chaque nouvelle vidéo.
- Page « Suivre Tandem TV », manifeste d'application (ajout à l'écran d'accueil iPhone).
- Reprise de lecture, badge « Nouveau », enchaînement automatique, partage à la minute.

---

## Horaires arrondis à l'affichage — v51 (2 août 2026)

Michael, pour pouvoir donner rendez-vous : arrondir les horaires de la grille au pas de
cinq minutes. Précision apportée aussitôt et qui commande tout : **« je ne parle que de
l'affichage, pas de la grille réelle lue par OBS »**.

`data/grille.json` n'est donc jamais modifié, et rien de ce que produit le site ne remonte
vers la régie. L'arrondi se fait à la lecture, dans `prepareGrille()`, et l'heure exacte
d'origine reste disponible dans le champ `heureExacte`.

**Toujours vers le bas**, jamais au plus proche — 9h04 devient 9h00, pas 9h05. Le sens
compte : un spectateur qui arrive à l'heure annoncée et attend deux minutes n'a rien perdu ;
celui qui arrive après le début a manqué l'ouverture. Décalage moyen mesuré sur l'export :
1,6 minute, 4 au maximum.

**Les rendez-vous à heure fixe ne sont jamais touchés** — ils sont exacts par nature, et
c'est leur exactitude qui structure la journée.

Réglable par `tv.arrondiMinutes` dans `site.config.json` ; `0` rétablit les horaires exacts.
Deux collisions sur 91 programmes (deux émissions tombant dans la même tranche de cinq
minutes) : laissées telles quelles, c'est la réalité à cinq minutes près, et inventer un
horaire pour les séparer aurait annoncé une diffusion en retard sur la vraie.

---

## Données structurées vidéo : l'alerte de Google — v50 (1er août 2026)

Search Console a signalé deux problèmes sur les données structurées vidéo :
**« Champ thumbnailUrl manquant »** (critique) et **« Vous devez indiquer contentUrl ou
embedUrl »**. Les pages vidéo n'y étaient pour rien — elles sont complètes.

**La cause : les fiches d'invités.** Chaque fiche `/invites/<nom>/` déclarait jusqu'à
**25 `VideoObject`** dans `subjectOf`, réduits à `name`, `url` et `uploadDate`. Ni vignette,
ni adresse de lecture : exactement les deux reproches. Multiplié par 82 fiches.

**Correction.** Ces `VideoObject` sont remplacés par un simple **`ItemList`** de `ListItem`.
Une vidéo n'a qu'une fiche technique légitime — celle de sa propre page, complète. En répéter
une version tronquée ailleurs n'apprenait rien à Google, brouillait la page canonique de la
vidéo, et déclenchait ces avertissements.

Audit passé sur l'ensemble du site après correction : **1 100 `VideoObject`, zéro incomplet.**

**Règle à retenir** : ne jamais déclarer un `VideoObject` ailleurs que sur la page de la
vidéo. Pour lier une personne, une rubrique ou une grille à des vidéos, un `ItemList` de
liens suffit.

---

## Grille des programmes — v49 (1er août 2026)

Michael a apporté un export de son planning de diffusion, produit dans une autre conversation
(rappel : je n'ai aucune mémoire d'un chat à l'autre — la feuille de route est la seule
mémoire du projet). Intégré au site, dans son propre langage graphique, pas celui de la
maquette d'origine.

- **`data/grille.json`** : l'export, remplacé tel quel à chaque mise à jour.
  **`data/grille-emissions.json`** : nom d'affichage de chaque programme et rubrique du site
  correspondante. Le build signale les identifiants inconnus.
- **Page `/grille/`**, entrée « Grille TV » dans le menu principal et dans le pied de page,
  et le bandeau télévision de l'accueil y renvoie désormais. Tout cela disparaît si le
  fichier d'export est retiré.
- **Rapprochement automatique grille ↔ catalogue** : quand le titre d'un programme
  correspond à une vidéo publiée, la ligne devient cliquable et porte la mention « Replay ».
  23 programmes sur 91 dans le premier export. C'est le lien avec la chaîne que Michael
  demandait depuis le début.
- **Encart « en ce moment à l'antenne »**, calculé dans le navigateur, rafraîchi chaque minute.
- **Fuseau horaire** : tout est en heure d'Israël, la page le dit, et le calcul passe par
  `Intl.DateTimeFormat` sur `Asia/Jerusalem` — un spectateur en France a une heure de moins.
- **Grille périmée** : si l'export ne couvre plus aucune journée à venir, la page affiche un
  avertissement daté au lieu d'une grille vide, et le build alerte.

**Deux pièges rencontrés, à ne pas refaire.**
`Intl.DateTimeFormat('fr-CA', {hour, minute})` renvoie **« 08 h 32 »**, pas « 08:32 » :
découper la chaîne donnait `NaN`. Lire `formatToParts` plutôt qu'une chaîne formatée.
Et le script de la grille avait été placé **dans le bloc du lecteur vidéo** (`if (player)`),
donc jamais exécuté sur `/grille/`. Vérifier la portée avant de conclure qu'un code ne
marche pas.

---

## Sponsoring remonté, rapport quotidien réparé — v48 (31 juillet 2026)

**Comparaison menu du haut / pied de page.** Cinq liens n'existaient qu'en bas : `Sponsoring`,
`Installer l'application`, `Flux RSS`, `Mentions légales`, `Politique de confidentialité`.
Les deux derniers sont à leur place ; le flux RSS ne concerne qu'une poignée d'initiés ;
`Installer l'application` fait déjà l'objet d'un bandeau automatique au bout de trois pages
vues. **`Sponsoring` remonte** dans la barre de service du haut (et dans le menu déroulant
sur téléphone) : c'est la seule page qui puisse rapporter de l'argent, et un annonceur devait
jusqu'ici dérouler toute la page d'accueil pour la trouver. Pas dans le menu principal, qui
reste éditorial.

**Régression réparée.** `rapport.yml` était revenu à `cron: '30 5 * * *'` alors que la feuille
de route note le passage à `'17 6'` — GitHub retarde ou annule les tâches programmées aux
heures rondes ou presque. Correction reposée, avec le commentaire qui explique pourquoi, pour
qu'elle ne se reperde pas. **À vérifier après chaque gros remaniement.**

---

## Transcriptions : la moitié qui dépend de moi — v47 (31 juillet 2026)

Michael : « occupe-toi des transcriptions ». Vérifié d'abord ce que je peux faire moi-même :
**rien du calcul**. Aucun paquet Whisper n'est disponible dans mon environnement
(`openai-whisper`, `faster-whisper`, `ctranslate2`, `torch`, `transformers`, `huggingface_hub`
— tous absents de l'index), et l'accès à GitHub y est refusé. Le calcul se fera sur son Mac,
pas ici. **Ne pas reproposer de transcrire côté serveur.**

Construit en revanche tout ce qui ne dépend pas du calcul :

- **`src/transcriptions.mjs`** : lecture de `.srt`, `.vtt` et `.txt`. Les sous-titres sont
  regroupés en paragraphes lisibles (Whisper découpe par respiration, une ligne toutes les
  trois secondes — publié tel quel, c'est illisible). Un paragraphe se ferme sur une fin de
  phrase, après 55 mots au moins.
- **Rapprochement fichier ↔ vidéo par l'identifiant *ou par le titre*.** Les outils de
  transcription nomment leurs sorties d'après le titre ; renommer mille fichiers à la main
  n'avait pas de sens.
- **Affichage** en bas de page vidéo : replié à 22 rem avec un dégradé, bouton pour déplier.
  Le texte reste **entièrement dans le HTML** — masquer la hauteur, jamais le contenu, sinon
  c'est du cloaking. Horodatages cliquables qui pilotent le lecteur (`data-seek`, mécanique
  déjà en place pour le sommaire).
- **`transcript` dans le `VideoObject`** : le champ prévu par schema.org pour le texte intégral.
- **`data/lexique-transcription.json`** : un fichier, deux usages. `amorce` = les mots soufflés
  à Whisper avant transcription (limité à ~220 mots, donc uniquement ceux qu'il écorche :
  Tsahal, Hezbollah, Houthis, les chroniqueurs — pas « Jérusalem », qu'il connaît).
  `corrections` = les réparations après coup, amorcées avec les fautes réellement observées.
- **`tools/transcrire.command`** : script macOS double-cliquable. Homebrew → `whisper-cpp` +
  `ffmpeg` → modèle `large-v3` → boucle sur un dossier, reprend où il s'était arrêté, sort des
  `.srt`. Gratuit, hors ligne, rien n'est envoyé sur Internet.

**Reste à trancher avec Michael** : d'où vient le son. Ses masters, ou MacWhisper Pro (59 €
une fois) qui transcrit directement depuis une adresse YouTube et évite tout téléchargement.
La version gratuite de MacWhisper ne sert à rien ici : modèles Tiny/Base seulement, pas de
traitement par lot, pas d'export SRT.

---

## Le vrai coupable : les lignes de chapitre — v46 (31 juillet 2026)

v45 déposée, publication à 20:30 — **les quatre lignes étaient toujours là**. Mon code
fonctionnait pourtant sur le texte exact recopié de la page. La différence tenait à ce que la
page ne montre pas : **l'ordre réel de la description YouTube.**

Le sommaire est affiché en haut de la page vidéo, mais dans la description d'origine les
lignes de chapitre (`00:00 Introduction`…) se trouvent **après** le bloc promotionnel. Le
repérage remontait donc depuis la fin, tombait immédiatement sur une ligne de chapitre —
ni promo, ni pictogramme — et s'arrêtait là. Tout le bloc survivait. Les lignes de chapitre
étaient ensuite retirées du corps au moment du rendu, ce qui laissait les appels à l'action
en dernière position sur la page : le symptôme masquait sa propre cause.

**Correction.** Une ligne de chapitre est désormais *traversée* lors du repérage du bloc de
fin, mais **jamais supprimée** — le sommaire et les données `Clip` de Google sont bâtis à
partir d'elle. Le bloc identifié est filtré : les lignes promotionnelles partent, les lignes
de chapitre restent.

Vérifié dans les deux ordres possibles (chapitres puis promo, promo puis chapitres) : dans les
deux cas la promo disparaît et les cinq chapitres sont conservés. Les quatre cas de garde
tiennent toujours.

**Trois tentatives pour une correction.** v44 allongeait une liste ; v45 changeait de méthode
mais testait sur un texte recopié de l'écran, pas sur la donnée réelle ; v46 corrige la cause.
**Leçon : ne jamais valider un nettoyage de description sur le texte affiché — l'affichage a
déjà réordonné et retiré des lignes. Reconstituer la source.**

---

## Appels à l'action : corriger la méthode, pas la liste — v45 (31 juillet 2026)

v44 était **insuffisante**, et l'erreur était de méthode. J'avais ajouté sept tournures à une
liste ; une autre vidéo en utilisait trois autres :

> 🔔 Abonnez-vous à la chaîne Tandem TV
> 👍 Likez la vidéo
> 📢 Diffusez cette émission autour de vous

« Likez » et « Diffusez » n'étaient pas dans la liste, la dernière ligne n'était donc pas
reconnue, et tout le bloc survivait — **exactement le même mécanisme d'échec qu'en v43.**
Une liste de formulations sera toujours en retard d'une formulation.

**Nouveau principe, structurel.** Les appels à l'action de fin de description ont tous le même
signe extérieur : ils s'ouvrent par un pictogramme. On remonte donc depuis la fin tant que les
lignes *pourraient* appartenir au bloc (formule reconnue **ou** ligne ouverte par un
pictogramme), et **on ne coupe que si ce bloc contient au moins une formule franchement
reconnue**. Un paragraphe éditorial commençant par 🇮🇱, seul en fin de texte, est donc préservé :
sans « Abonnez-vous » ou équivalent à côté de lui, rien n'est coupé.

Cinq cas vérifiés : les deux blocs réels de Michael sont retirés ; un paragraphe éditorial à
emoji en fin de texte est conservé ; idem au milieu ; et une promo sans emoji reste détectée.

---

## Nettoyage des appels à l'action — v44 (31 juillet 2026)

Repéré sur la page en ligne de l'édito du 30 juillet : la description se terminait par

> 👉 Abonnez-vous à Tandem TV pour retrouver nos analyses…
> 👍 Pensez à aimer la vidéo, à laisser votre analyse en commentaire et à partager cette émission…

**Pourquoi elles passaient.** `cleanDescription()` retire les lignes promotionnelles *par la
fin*, et s'arrête à la première ligne non reconnue. La toute dernière (« Pensez à aimer la
vidéo… ») ne correspondait à aucun motif : la boucle s'arrêtait aussitôt, et la ligne
« Abonnez-vous », pourtant reconnue, survivait juste au-dessus. Une seule formule manquante
suffisait à laisser passer tout le bloc.

Sept motifs ajoutés (pensez à aimer/liker, aimer la vidéo, laissez un commentaire, partagez
cette vidéo, activez la cloche, n'hésitez pas à…, pouce bleu). Vérifié sans faux positif sur
des phrases éditoriales voisines : « commentaire de texte biblique », « le partage des terres
en Judée-Samarie », « la vidéo surveillance » sont conservées.

**Leçon de méthode, à retenir.** Mon outil de lecture de pages m'a servi pendant vingt minutes
une copie en cache datant de 17:11, ce qui m'a fait croire que v43 n'était pas publiée alors
qu'elle l'était. Le paramètre d'URL ne suffit pas toujours à contourner ce cache.
**En cas de doute sur une mise en ligne : demander une capture au navigateur de Michael,
c'est le seul juge fiable.**

---

## Transcriptions : verdict mesuré, et ce qu'on fait à la place — v43 (31 juillet 2026)

**Test réel, pas une opinion.** Michael a téléchargé la transcription automatique YouTube
d'un édito de Stéphane Goldin (2 min 31). J'ai écrit un nettoyeur — retrait des « euh »,
des bégaiements, dictionnaire de corrections, rapprochement flou avec un lexique — et je l'ai
mesuré sur ce texte.

*Corrigé* : Teran → Téhéran, golf → Golfe, minucies → minuties, à l'ord du jour, elle tise.
*Non corrigé* : **« activités de sal »** (Tsahal), **« caches du Hbola »**, **« le resbola »**,
**« la question du trbola »** (Hezbollah, trois orthographes différentes dans un même texte),
« suprémessie », « frontalié », « elle éta parler ».
*Introduit par le correcteur* : « l'ÉÉgypte ».

**Conclusion : inexploitable.** Les mots que la reconnaissance vocale massacre sont exactement
le vocabulaire central de la chaîne. Un dictionnaire ne suit pas des orthographes
imprévisibles, et plus on force le correcteur, plus il fabrique ses propres fautes.
Whisper, avec un amorçage de vocabulaire, ferait nettement mieux — mais il faut les fichiers
audio, plusieurs jours de calcul sur une machine à Michael, et une relecture malgré tout.
Chantier à part entière, pas une case à cocher. **À ne pas relancer sans ces trois conditions.**

**Ce qu'on a fait à la place.** Vérification faite : les descriptions YouTube de Michael sont
excellentes — rédigées, denses, noms propres corrects (« Recep Tayyip Erdogan », « pays du
Golfe », « F-35 ») — et la page vidéo les affiche **en entier**, sans troncature ni
« voir plus ». Rien n'était perdu de ce côté.

Ajout v43 : un bloc **« À propos de "<rubrique>" »** en bas de chaque page vidéo, alimenté par
`data/rubriques.json`. Une quarantaine de mots justes, écrits à la main, sur ~1 000 pages qui
n'avaient que le titre et la description — et un lien de plus vers la rubrique.

---

## Le rapport de transferts, premier usage — v42 (31 juillet 2026)

Le fichier `rapport-transferts.json` publié en v40 a livré les vrais chiffres de production :
**145 redirections actives** (18 imposées, 127 vers une vidéo) et **121 anciennes adresses
encore en erreur**. Sur ces 121 :

- **36 récupérées à la main.** Vingt anciennes pages de catégorie Wix
  (`/blog/categories/…`, `/les-emissions-de-television/…`) mènent désormais à la rubrique
  correspondante ; neuf articles nommément consacrés à une personne mènent à sa fiche
  (Céline Pina, Gilles-William Goldnadel, Philippe Torreton, Florence Bergeaud-Blackler,
  Pierre Martinet, Dov Maimon, Bruno Dray, Rony Akrich) ; sept articles dont le sujet
  correspond sans ambiguïté à une rubrique (Barbie, Chaplin, Rothschild → « Le fabuleux
  destin de… » ; Rose Pizem, Vanunu → « Les grands procès »).
- **85 laissées en 404 volontairement.** Aucune correspondance certaine : mieux vaut une
  erreur, rattrapée côté navigateur, qu'un renvoi vers la mauvaise page. Elles restent
  listées dans le rapport à chaque synchronisation.

**Garde-fou ajouté** : le build vérifie que chaque redirection imposée pointe vers une page
qui existe réellement, et le signale sinon. Désactivé en mode démonstration, où les
destinations de production n'existent pas.

**Fiches d'invités : six fausses fiches et deux doublons.** En relisant `/invites/` :
« Duo de Doc », « Pause Beaute », « Plateau Santé », « Sciences Po » ne sont pas des
personnes ; « Rosh Hashana » et « Yom HaZikaron » sont des fêtes. « Dr Elie Botbol » et
« Elie Botbol », « Dr Eric Setton » et « Eric Setton » faisaient chacun deux fiches.
Corrigé par `exclure` et `alias` dans `data/personnes.json`.
**Benjamin Netanyahu et Donald Trump** ont aussi été retirés : ils n'ont jamais été à
l'antenne de Tandem TV, la page annonce « les personnes que l'on retrouve le plus souvent
à l'antenne ». Si Michael préfère les garder pour capter les recherches sur leur nom, il
suffit de retirer leur ligne de `exclure` — mais la page perdrait en exactitude.

---

## Ce que Google voit encore — v41 (31 juillet 2026)

Michael : « non on y est pas » (Google Actualités). En cherchant pourquoi, découverte plus
importante que la question posée : **l'index de Google contient encore l'ancien site Wix**.
Les résultats qui remontent pour tandemtv.net sont `ISRAEL | Tandem TV la chaine de
télévision`, `LES EMISSIONS DE TELEVISION`, `QUI SOMMES-NOUS`, `NOS INVITES`, `/tandem2-0` —
titres et adresses Wix. Aucune page du nouveau site (`/video/`, `/invites/`, `/emissions/`)
n'apparaît. Cela explique à la fois l'absence de Google Actualités et la faiblesse du trafic.

Cinq adresses Wix qui **ranquent encore** n'étaient pas dans notre liste de transferts —
elles renvoyaient une erreur :

| Ancienne adresse | Destination |
|---|---|
| `/tandem2-0` | `/emissions/` |
| `/les-emissions-de-television` | `/emissions/` |
| `/les-emissions-de-television/guerre-israel-hamas` | `/emissions/gaza/` |
| `/nos-invtes` (faute d'origine sur Wix) | `/invites/` |
| `/nos-invites` | `/invites/` |

**Limite structurelle à garder en tête** : GitHub Pages ne sait pas émettre de redirection
301. Nos pages de transfert (canonique + rafraîchissement + `location.replace`) fonctionnent
pour les visiteurs, mais Google les traite plus lentement et moins fermement qu'un vrai 301.
La réindexation prendra des semaines. Si elle traîne, la seule solution radicale serait de
placer le site derrière un service capable d'émettre des 301 (Cloudflare Pages, Netlify) —
tous deux gratuits, mais cela change l'hébergement.

**Google Actualités** : plus rien à soumettre depuis mars 2025, l'admission est automatique.
Tant que Google sert l'ancien site, la question ne se pose même pas. À reprendre une fois la
réindexation faite.

---

## Récupérer le trafic perdu — v40 (31 juillet 2026)

**L'adresse Wix la plus lue.** `/post/le-7-octobre-vécu-par-stephan-zeev-goldin` — 83 clics et
5 846 impressions dans Search Console — n'avait aucune vidéo correspondante et restait en 404.
Elle est désormais **imposée** dans `data/anciennes-adresses.json` vers `/invites/stephane-goldin/`,
et cette fiche a reçu un texte : rôle, sujets traités, et la mention explicite que l'entretien
d'origine n'est plus en ligne. Le visiteur qui cherche « stephan zeev goldin » trouve donc une
page qui parle de lui et rassemble ses 53 vidéos, au lieu d'une erreur.
Alias ajoutés : « Stephan Zeev Goldin » et « Stephane Goldin » → « Stéphane Goldin ».

**Titres illisibles par Google.** `titreLisible()` dans `src/util.mjs` ramène en lettres
ordinaires les titres écrits en faux gras mathématique (𝗚𝗮𝘇𝗮), en pleine chasse ou en lettres
entourées — pour Google, « 𝗚𝗮𝘇𝗮 » et « Gaza » sont deux chaînes sans rapport. La normalisation
NFKC n'est appliquée qu'aux titres concernés, et le build les journalise (avant → après).
Vérification faite le 31 juillet sur les vidéos récentes : aucune n'était touchée. Le journal
de la prochaine synchronisation dira ce qu'il en est sur l'ensemble du catalogue.

**Mesure des transferts.** Le build publie `rapport-transferts.json` à la racine du site :
nombre de transferts écrits et **liste des anciennes adresses encore sans correspondance**.
Il devient possible de contrôler l'état des redirections depuis l'extérieur, sans ouvrir le
journal des Actions GitHub (interdit aux robots). À relire à chaque passage.

**Fausse alerte à ne pas refaire.** En vérifiant l'ancienne adresse, l'outil de lecture de
pages a renvoyé le contenu Wix d'origine, avec `Wix.com Website Builder` dans le code : de
quoi croire que l'ancien site était encore servi sur le domaine. Vérifications faites — DNS
(quatre adresses GitHub Pages, rien d'autre), page rechargée avec un paramètre différent
(404 franc) — **c'était un cache de l'outil, pas le site**. Toujours refaire le test avec un
paramètre d'URL différent avant de conclure.

**Google Actualités.** Le nécessaire technique existe déjà : `sitemap-news.xml` (48 dernières
heures, format `news:`), fiche `Organization`, dates de publication, auteurs, pages
éditoriales. Le reste est manuel et n'appartient qu'à Michael — inscription du site dans
Publisher Center. Marche à suivre transmise le 31 juillet.

---

## Du texte réel dans le site — v39 (31 juillet 2026)

Michael : « as-tu d'autres idées pour ajouter du contenu texte dans la page d'accueil ». Le
vrai trou n'était pas seulement l'accueil : **les pages de rubrique n'avaient aucun texte
non plus**. Le gabarit prévoit une phrase de présentation, mais il va la chercher dans la
description de la playlist YouTube — vide pour une quarantaine de rubriques sur soixante et une.

- **`data/rubriques.json`** : une à deux phrases par rubrique, écrites à partir des vidéos
  réellement publiées (relevé fait sur le site en ligne, rien d'inventé). Un texte écrit ici
  l'emporte sur celui de YouTube ; une rubrique absente du fichier garde le sien. 38 entrées
  au départ. Le texte s'affiche **sous le titre de la rangée sur l'accueil**, **en tête de la
  page de la rubrique**, et alimente la **balise description** de cette page — qui était
  jusque-là identique pour toutes.
- Le build **journalise les rubriques encore sans texte** (`⚠ Rubriques sans présentation :
  …`) : la liste se réduit à mesure que Michael complète le fichier.
- **Accroche sous les vidéos mises en avant** : première phrase de la description sous la
  grande vignette des « Dernières vidéos » et sous les deux sujets secondaires de la une.
  Automatique, différent chaque jour, rien à rédiger.
- **Chiffres de la chaîne** en bas de la une : nombre de vidéos, d'émissions et
  d'intervenants, recalculés à chaque synchronisation.

Michael a écarté le bloc « Questions fréquentes » (balisage FAQPage, résultats enrichis
Google) — à reproposer plus tard si le référencement stagne.

---

## Accueil — texte et hiérarchie, v37/v38 (31 juillet 2026)

**Corrections demandées par Michael après la première version (v38).**

- La bande des visages coupait la page entre la une et les dernières vidéos : elle est
  descendue **après les rangées d'émissions**.
- Elle affichait des chroniqueurs partis depuis longtemps. Elle est désormais **dynamique** :
  seules les personnes ayant publié dans les trois derniers mois, et au moins deux fois
  (une seule suffit pour un présentateur — sinon un invité de passage figurerait parmi les
  chroniqueurs). Si la chaîne traverse une période creuse, la fenêtre s'élargit d'elle-même
  à 6 puis 12 mois ; sous quatre personnes, la bande disparaît. Réglable par
  `home.chroniqueursMois` et `home.chroniqueursMax`.
- Le texte de présentation tombait « comme un cheveu dans la soupe » sous la une : il forme
  maintenant le bloc **« Qui sommes-nous ? »** en fin de page, bande pleine largeur collée
  au pied de page. Texte fourni par Michael, dans `content/accueil.md`.
- Au passage : la mention « un message de confirmation vous sera envoyé » sous le formulaire
  d'inscription était **fausse depuis le passage en inscription immédiate**. Corrigée.

## Accueil — texte et hiérarchie, première version, v37 (31 juillet 2026)

Deux manques identifiés avec Michael le 31 juillet : **aucune phrase rédigée** sur la page
d'accueil (muette pour un visiteur venu de Google, quasi vide pour Google lui-même), et
**aucune hiérarchie** — six rangées strictement identiques après la une.

Quatre paliers désormais, du plus fort au plus discret :

1. **La une élargie** : un sujet principal + deux sujets secondaires (« À suivre également »),
   le tout sur le fond marine. Les deux secondaires sont retirés du flux qui suit pour ne pas
   apparaître deux fois à quelques centimètres d'intervalle.
2. **Chapeau éditorial** : `content/accueil.md`. C'est un fichier texte ordinaire, Michael peut
   le modifier directement sur GitHub. Le supprimer fait simplement disparaître le bloc.
3. **Bande des visages** : dix portraits ronds vers les fiches `/invites/`. Maillage interne
   pour le référencement, et entrée directe pour le spectateur qui cherche une personne.
4. **Rangées à trois niveaux** :
   - *Dernières vidéos* — grande vignette de tête (`grid-lead`) ;
   - *Émissions* — quatre colonnes, en-tête incarné (portrait du présentateur, « Présenté
     par X · N épisodes ») ;
   - *Thèmes* et *Les plus regardées* — cinq colonnes sur une seule ligne, titres réduits.

Le bloc d'inscription à la lettre d'information est remonté en milieu de page (il n'était
visible qu'en pied de page).

**Points techniques.** `.row-title { margin-right: auto }` : sans cela, le `space-between`
du `.row-head` séparait le portrait de son titre d'un bout à l'autre de la page. Le
rapprochement présentateur ↔ fiche se fait sans accents : le nom d'affichage retenu
(« Jérôme Haas ») n'est pas toujours celui lu dans le titre de la rubrique.

---

## Habillage — v35 (31 juillet 2026)

- **Bandeau télévision** : l'aplat rouge pleine largeur criait « BREAKING NEWS » alors qu'il
  annonce une information permanente. Remplacé par un bandeau crème à filet rouge à gauche
  (le même filet que les titres de rangée), rouge réservé au seul « canal 14 ».
- **La une sur fond marine**, reprise de la direction B « chaîne d'information » : le fond
  déborde jusqu'aux bords de l'écran (`box-shadow: 0 0 0 100vmax` + `clip-path: inset(0 -100vmax)`,
  et non `100vw`, qui provoquerait une barre de défilement horizontale). Titre, chapeau et
  méta en blanc ; bouton « Regarder » inversé en blanc sur marine ; pastille de la une en rouge.
- **Logo Annatel** : le fichier envoyé le 31 juillet n'est jamais arrivé dans l'espace de
  travail — `tv.operatorLogo` reste vide et la pastille « TV » s'affiche à la place. Dès que
  le fichier est déposé dans `assets/annatel.png`, renseigner `/assets/annatel.png` dans
  `site.config.json` : le bandeau et le pied de page le prennent automatiquement.

---

## En attente d'informations de Michael

| Sujet | Ce qu'il faut |
|---|---|
| Soutien financier | Le lien PayPal.me (choix arrêté : PayPal). **Urgent : `/dons` est encore demandé par des visiteurs.** |
| Partenaires | Deux listes séparées : partenaires de la chaîne / chaînes et programmes diffusés |
| Télévision | Canal 14 Annatel : est-ce le seul ? horaires ? lien d'abonnement au bouquet ? |
| Sponsoring | Formats acceptés, adresse de contact à afficher |
| Telegram | Le lien public `t.me/...` (celui fourni était une adresse interne au client Telegram) |
| Éditeur | Si Tandem TV est une société immatriculée : dénomination exacte + numéro |
| À propos | Année de création, composition de l'équipe |

---

## À faire — prochain lot

Ne dépend de rien :

- [x] **Appel à commenter sur YouTube** — bloc « Réagir » sous chaque vidéo, avec aussi « Proposer un sujet ou un invité ».
- [x] **Mise en évidence de la télévision** — bandeau sur l'accueil + mention en pied de page. Réglé par le bloc `tv` de la configuration (horaires et lien encore vides).
- [x] **Page « Sponsoring »** — `/sponsoring/`, chiffres relevés à chaque synchronisation.
- [x] **Appel à proposer un sujet ou un invité** — dans le bloc « Réagir » de chaque page vidéo.
- [x] **Lettre d'information** : Kit (ex-ConvertKit) — 10 000 abonnés, envois illimités, gratuit. Formulaire en HTML pur (accueil + page « Suivre »), envoi automatique à chaque nouvelle vidéo via l'API v4, mêmes garde-fous que les notifications. **Reste à faire côté Michael** : créer le compte Kit, créer un formulaire, coller son numéro dans `newsletter.formId`, déposer la clé API dans le secret GitHub `KIT_API_KEY`.
- [x] **Rattrapage des anciennes adresses Wix** — la page 404 lit l'adresse demandée, la compare aux titres du catalogue et conduit à la vidéo (ou propose les plus proches). Découvert grâce au rapport d'audience : `/post/...` et `/dons` reçoivent encore des visites réelles.
- [x] **Rapport d'audience quotidien** — script `tools/rapport-audience.mjs` + workflow `.github/workflows/rapport.yml`. Interroge Cloudflare, publie un ticket GitHub assigné à Michael (qui déclenche l'e-mail). Nécessite le secret `CLOUDFLARE_API_TOKEN`.

Dépend des informations ci-dessus :

- [ ] **Page « Soutenir la chaîne »** (PayPal).
- [ ] **Page « Partenaires »** refondue en deux sections.
- [ ] **Module de vote / sondage** sous les vidéos de débat. Point dur : sans serveur, il faut un service tiers pour stocker les votes. À arbitrer avant de construire.

---

## Vague 1 de l'audit du 30 juillet 2026

- [x] **Fil d'Ariane balisé** (`BreadcrumbList`) sur les pages vidéo et rubrique.
- [x] **Listes balisées** (`CollectionPage` + `ItemList`) sur les pages de rubrique.
- [x] **Image de partage par défaut** (le logo) sur toutes les pages : plus aucune page partagée sans visuel.
- [x] **Nettoyage des descriptions YouTube** : la queue promotionnelle (abonnement, liens réseaux, mots-dièse) est retirée. Sécurité : si tout est promotionnel, on garde le texte d'origine.
- [x] **Mobile** : grille à deux colonnes, recherche repliée derrière une loupe, une du haut resserrée, zones tactiles ≥ 24 px (53 → 0), partage natif du système.
- [x] **Transfert des anciennes adresses Wix** — 228 adresses relevées dans Search Console, `data/anciennes-adresses.json`. Le générateur écrit une page de transfert (canonique + rafraîchissement) quand le rapprochement est certain ; sinon il laisse la 404 et le rattrapage du navigateur prend le relais.

## Ce que Search Console a révélé le 30 juillet 2026 — à ne pas oublier

*Sur trois mois : 706 clics, 28 000 impressions, position moyenne 8,1.*

**Environ 500 des 706 clics arrivent encore sur des adresses Wix mortes.** Les trois
premières pages du site sont des `/post/...` qui n'existent plus :

| Ancienne adresse | Clics | Impressions |
|---|---|---|
| `/post/qui-est-le-nouveau-chef-d-état-major-de-tsahal-stéphane-goldin` | 148 | 5 508 |
| `/post/interview-de-samuel-madar-combattre-l-antisémitisme-chez-les-jeunes` | 104 | 4 095 |
| `/post/le-7-octobre-vécu-par-stephan-zeev-goldin` | 83 | 5 846 |

**Les requêtes sont massivement identitaires.** Les gens ne cherchent pas des sujets,
ils cherchent *des personnes* :

`samuel madar wikipédia` (1 281 impressions) · `stephan zeev goldin origine parents`
(2 568) · `stephan zeev goldin biographie` (1 034) · `stephan zeev goldin tsahal âge`
(1 620) · `stephan zeev goldin date de naissance` (1 255) · `stephan zeev goldin
nationalité` (1 102) · `justine varin` (250)

**Environ 8 300 impressions en trois mois portent sur l'identité d'une seule
personne**, et aucune page du site n'y répond. C'est la démonstration chiffrée que
les **pages « Invités » sont la priorité éditoriale numéro un**, avant même les
transcriptions.

**Point noir à traiter :** aucune vidéo du catalogue ne correspond à
`le-7-octobre-vécu-par-stephan-zeev-goldin` (83 clics, 5 846 impressions). L'article
Wix n'a pas d'équivalent en vidéo. Seule une page éditoriale — une fiche « invité » —
peut récupérer cette audience.

## Navigation revue le 30 juillet 2026

- [x] **« Invités » remonte dans la barre de navigation** — c'est du contenu, et les données de recherche en font le plus demandé.
- [x] **« Suivre la chaîne » devient un bouton blanc** (pastille + cloche) au lieu d'un lien noyé dans la barre. Attention à la spécificité CSS : `.nav a` bat `.nav-follow`, il faut écrire `.nav a.nav-follow`.
- [x] **« À propos » et « Contact » ne disparaissent plus à 1 180 px** — une règle les masquait sur la plupart des portables. La recherche rétrécit à la place.
- [x] **Pied de page réorganisé** en quatre colonnes : identité, émissions, « Découvrir » + « Rester au courant », « Le site ». Les mentions légales restent en bas : c'est leur place.

## Fiches d'invités — corrections du 30 juillet 2026 (v31)

- [x] **Mise en page refaite** : grille de cartes illustrées au lieu d'une liste à deux colonnes, où le nombre de vidéos se collait au nom suivant. Plus de regroupement par lettre : avec 42 fiches, une grille dense se parcourt mieux.
- [x] **Illustration automatique** : chaque personne est illustrée par la miniature de sa vidéo la plus récente. `fiches.<nom>.photo` permet d'imposer une autre image.
- [x] **Trois faux noms écartés** : Beit Halochem (association), Feel Good et Underground Music (segments d'émission). À surveiller à chaque nouvelle salve de vidéos.

## Fiches d'invités — rattrapage par les descriptions (v32)

Michael a repéré que la recherche du site trouvait **66 vidéos** pour Galith Benzimra
quand sa fiche n'en affichait que **12**. Cause : les fiches ne lisaient que les
titres et les noms d'émissions. Or « Benjamin Netanyahu bientôt en prison ? » est un
de ses épisodes, et seule la description le dit.

Une troisième passe lit donc les descriptions, avec trois garde-fous :

- elle ne cherche **que des personnes déjà identifiées** par un titre ou par le nom
  d'une émission — jamais un nom nouveau, sinon toute personnalité citée en passant
  deviendrait une intervenante de la chaîne ;
- **bornes de mot** : « Bruno Dray » ne correspond pas à « Bruno Draye » ;
- **seuil de vraisemblance** : un nom présent dans plus de la moitié d'un catalogue
  de plus de 40 vidéos est une mention de pied de description, pas un intervenant.

## État réel au 31 juillet 2026 (relevé sur le site en ligne)

- **79 fiches** d'invités et de présentateurs, 812 participations recensées.
- **Galith Benzimra : 12 → 75 vidéos** après le rattrapage par les descriptions. Correction validée.
- **Transferts Wix opérationnels** : `/post/qui-est-le-nouveau-chef-d-état-major…` → `/video/_GkDLFNOJ-A/`, `/post/interview-de-samuel-madar…` → `/video/3yLVJ1HIqLg/`, `/qui-sommes-nous` → `/a-propos/`.
- **Reste en 404** : `/post/le-7-octobre-vécu-par-stephan-zeev-goldin` — aucune vidéo correspondante. Seule une fiche rédigée à la main récupérera ces 83 clics.
- **Corrigé en v33** : six personnes avaient deux fiches, une par orthographe (« Jérôme Haas » 108 / « Jérome Haas » 100, Céline Pina, Haïm Musicant, Hervé Ghannad, Guy Millière, Pierre Lurçat). Le regroupement se fait désormais sans accents ni casse, et l'orthographe affichée est la plus fréquente — à égalité, celle qui porte les accents.

## À faire — ensuite

- [x] **Application sur l'écran d'accueil** — page `/installer/` (Android, iPhone, ordinateur), bandeau proposé à partir de la troisième page consultée et jamais réaffiché s'il est écarté, raccourcis dans le manifeste, gestionnaire « fetch » dans l'agent de service (condition d'installabilité chez Chrome + message hors connexion).
- [ ] **Application dans les magasins (App Store / Play Store).** Décision différée à froid : 99 $/an chez Apple, 25 $ une fois chez Google. Une application n'apporte **pas** de nouveaux visiteurs — elle sert la fidélité. Seul gain net : les notifications sur iPhone. Risque : Apple refuse les simples emballages de site (règle 4.2). À rouvrir seulement si l'installation sur l'écran d'accueil rencontre son public.
- [x] **Refonte graphique — direction « Magazine » (v34).** Choisie par Michael sur maquettes, avec le bandeau télévision de la direction « chaîne d'information ». Titres à empattements pris sur l'appareil du visiteur (aucune requête tierce), fond crème, filet rouge `--rouge: #c8102e` devant les titres de rangée, angles quasi droits, surtitres en rouge. Le bleu marine reste la couleur d'action.
- [ ] **Mode sombre** (direction C, gardée en option activable par le visiteur).
- [ ] **Logo Annatel dans le bandeau télévision** : `tv.operatorLogo` attend le fichier — à déposer dans `assets/` puis renseigner `/assets/annatel.png`.
- [ ] **Transcriptions** — le plus gros levier de trafic. Une heure d'entretien = ~9 000 mots que Google ne voit pas aujourd'hui. Chantier lourd, à évaluer techniquement (récupération des sous-titres).
- [x] **Pages « Invités »** — `/invites/` + une fiche par personne (`src/personnes.mjs`). Les noms sont repérés dans les titres de vidéos et dans les noms d'émissions ; `data/personnes.json` corrige (exclusions, alias, inclusions forcées, fonction et texte écrits à la main). Signature d'auteur (`author`) posée sur les pages vidéo au passage — le point qui bloquait Google Actualités.
- [ ] **Pages d'émission enrichies** — bandeau, présentateur, pitch, périodicité, pour les 10-15 principales.
- [ ] **Google Actualités / Discover.** Rappel : **l'inclusion est automatique depuis décembre 2019**, il n'y a rien à soumettre — le Publisher Center ne sert plus qu'à gérer l'apparence d'une publication déjà reprise. Ce qui compte, ce sont les signaux.
  - [x] Mentions légales, éditeur identifié, directeur de la publication.
  - [x] Sitemap Actualités (`sitemap-news.xml`), moins de 48 h, régénéré à chaque synchronisation.
  - [x] Dates de publication visibles et structurées.
  - [x] **Signature des vidéos** par le présentateur — déduite automatiquement du nom de l'émission (« L'invité de William Zerbib » → William Zerbib), avec `author` dans les données structurées.
  - [ ] **Du vrai texte sur les pages** : c'est le point bloquant. Une page qui n'affiche qu'une vidéo et trois lignes de description ne ressemble pas à un article. Les transcriptions sont la condition véritable.
- [x] **Flux RSS par émission et par thème** — `/emissions/<slug>/rss.xml`, lien en haut de chaque page de rubrique.
- [ ] **Miniatures hébergées sur le site** (aujourd'hui servies par YouTube). Mesure d'attente en v25 : `referrerpolicy="no-referrer"` sur toutes les miniatures — Google reçoit toujours l'adresse IP du visiteur, mais plus la page consultée.

---

## Chantier Instagram (6 août 2026)

Publication automatique d'une image par nouvelle vidéo, avec invitation à
collaborer. Objectif de Michael : vues et abonnés, via les collaborations.

- [x] `src/instagram.mjs` — création du conteneur puis publication, champ `collaborators`, garde-fous.
- [x] `data/instagram-collaborateurs.json` — carnet des comptes à inviter, par personne et par rubrique.
- [x] Bloc `instagram` dans `site.config.json`, **désactivé par défaut**.
- [x] `INSTAGRAM_TOKEN` transmis par `deploy.yml`.
- [ ] **Michael : compte Instagram professionnel relié à une page Facebook.**
- [ ] **Michael : application Meta, jeton longue durée → secret GitHub `INSTAGRAM_TOKEN`.** Ne doit jamais transiter par la conversation.
- [ ] **Michael : renseigner `instagram.userId` et passer `enabled` à true.**
- [ ] Renouvellement du jeton : il expire au bout de 60 jours. Prévoir une tâche planifiée qui le rafraîchit, sinon la publication s'arrête sans bruit au bout de deux mois.
- [ ] Carnet des collaborateurs à remplir (comptes des chroniqueurs et des invités récurrents).

**Faits vérifiés le 6 août 2026 :** compte professionnel + page Facebook obligatoires ; permissions `instagram_business_basic` et `instagram_business_content_publish` soumises à revue de Meta pour la production (2 à 4 semaines), contournables en gardant l'application en mode développement ; jusqu'à 3 collaborateurs par publication, images et Reels seulement ; **le collaborateur doit accepter l'invitation** ; l'image doit être à une adresse publique, rapport entre 4:5 et 1,91:1 (une miniature YouTube en 16/9 convient) ; jeton longue durée valable 60 jours.

---

## Demandes de Michael en attente (2 août 2026)

Notées ici pour survivre à la fin d'une conversation : l'espace de travail de
l'assistant est effacé, ce fichier non.

- [ ] **Erreurs dans « Émissions » et « Thèmes ».** Michael signale des rubriques mal classées ou mal nommées dans les deux menus. En attente de captures d'écran de sa part pour savoir précisément lesquelles.
- [ ] **Portraits des chroniqueurs mal cadrés.** Les fiches d'invités et de présentateurs utilisent la miniature d'une de leurs vidéos comme portrait (`.personne-photo`, `.personne-portrait`, format 16/9 sans recadrage). Or une miniature YouTube est composée pour vendre une vidéo, pas pour montrer un visage : titre incrusté, personne décentrée ou minuscule. Michael juge le résultat incompréhensible et fournira des photos fixes. **À faire :** ajouter un champ `photo` par personne dans `data/personnes.json`, qui l'emporte sur la miniature automatique, et un dossier `assets/visages/`.
- [ ] **Les « visages » de la chaîne.** Erreurs signalées sur les fiches d'intervenants. Un défaut est déjà visible dans le journal de construction : les fiches écrivent **« Jérome Haas »** sans accent circonflexe alors que la rubrique écrit « Jérôme Haas ». À corriger dans `data/personnes.json`, et à vérifier pour les autres noms.
- [ ] **18 rubriques sans aucun texte de présentation** — `rencontre-avec-sylvie-zerbib`, `l-invite-de-dana`, `le-grand-debat`, `26-nuances-2-vannes`, `l-instant-musique-de-nathalie`, `objectif-entreprendre`, `puissance-s`, `scalpel`, `avec-vous`, `scale-up-nation`, `knesset-et-match`, `hanna-network`, `jo-hanna-fitness`, `sport-tandem`, `culture-en-tandem`, `la-france-en-tandem`, `tech-break`, `le-laboratoire-de-l-apres`.
- [ ] **52 anciennes adresses Wix** sans destination certaine, laissées en 404 (liste complète dans le journal de construction).
- [ ] **Lignes de clips de la grille** : elles affichent des noms internes (« Betsarfatit · Dover Tsahal · Solal Israel »), du bruit pour un visiteur. Décision de Michael en attente : les garder ou ne laisser que « Clips et bandes-annonces ».
- [ ] **Avertissement Node.js 20 déprécié** sur les trois automatismes GitHub. Sans effet aujourd'hui, à corriger quand ça n'interrompra rien.
- [ ] **La soirée n'est pas programmée dans l'export de grille** : les journées à venir s'arrêtent vers 18 h 20 alors que le relevé du 1er août allait jusqu'à 19 h 57. À voir avec la régie — la soirée est-elle réellement vide, ou l'export ne la décrit-il pas ?
- [ ] **Texte de présentation de « Tel Aviv - New York »** — Michael doit l'envoyer, sa chaîne YouTube n'en a pas. Champ `description` de la source `tel-aviv-new-york` dans `data/partenaires.json`.
- [ ] **Logo de « Léon le média »** — compte Instagram, donc aucune récupération automatique possible. En attendant, la fiche affiche un monogramme.
- [ ] **Informations attendues de Michael** : lien PayPal.me pour la page dons, lien Telegram public, mentions légales (société, année de création, équipe).
- [ ] **Transcriptions** — chantier en pause. Michael avait choisi « ses fichiers + le script gratuit », « les nouvelles vidéos seulement », « guidé ligne par ligne ». Le script `tools/transcrire.command` est prêt ; il manque la sortie de `which brew ffmpeg whisper-cpp`.

---

## Intendance à ne pas oublier

- [ ] **Résilier le forfait Premium Wix — le plan seul.** Les domaines et la boîte `contact@tandemtv.org` sont des abonnements séparés et doivent être conservés. Plus rien ne dépend du forfait : le site est entièrement hébergé chez GitHub.
- [ ] Nettoyer les enregistrements DNS résiduels de tandemtv.net : `en.`, `fr.`, `sitemap2.`
- [ ] Supprimer de Search Console les anciens sitemaps Wix (`pages-sitemap.xml`, `blog-posts-sitemap.xml`, `blog-categories-sitemap.xml`).

---

## Points techniques à retenir

- **Le dépôt fait foi.** L'espace de travail de l'assistant a déjà été réinitialisé une fois : en cas de doute, repartir du dépôt GitHub (bouton Code → Download ZIP).
- **Chrome ignore silencieusement le dossier `.github`** lors d'un dépôt par glisser-déposer. Toute modification du fichier `deploy.yml` doit être faite à la main dans l'éditeur GitHub.
- **OneSignal refuse d'enregistrer sa configuration Web si le champ « Default Icon URL » est vide**, sans afficher la moindre erreur. Trois heures perdues sur ce point.
- **Les notifications ne fonctionnent pas sur iPhone** depuis un onglet : Apple exige l'ajout à l'écran d'accueil. C'est une limite d'Apple, pas du site.
- Clés et secrets : `YOUTUBE_API_KEY`, `ONESIGNAL_API_KEY`, `CLOUDFLARE_API_TOKEN` et `KIT_API_KEY` vivent dans les secrets GitHub. Aucune clé ne doit transiter en clair, ni par la conversation.
- **Kit n'a pas d'envoi immédiat par l'API** : une diffusion sans `send_at` reste un brouillon. Le site programme donc l'envoi deux minutes plus tard.
- **Kit : l'adresse d'inscription est `https://app.kit.com/forms/<id>/subscriptions`**, relevée dans leur propre code d'intégration. L'ancienne adresse `app.convertkit.com` fonctionne encore par redirection, mais une redirection sur un envoi de formulaire perd les données saisies. Formulaire : `9743928`, uid `ebd0a7a53d`. Inscription à double confirmation (l'abonné doit valider un courriel).
- **Le fichier `deploy.yml` ne transmettait que `YOUTUBE_API_KEY`** : pendant plusieurs jours, les notifications automatiques n'ont jamais pu partir, sans autre trace qu'une ligne dans le journal. Corrigé le 30 juillet 2026. À vérifier après tout ajout d'un nouveau secret.
- **Les tâches planifiées de GitHub aux heures rondes (`:00`, `:30`) sont retardées ou ignorées.** Le premier rapport ne s'est jamais déclenché à 5 h 30 UTC. Horaire déplacé à `17 6 * * *`.
- **Cloudflare : le « site tag » n'est PAS le jeton de la balise.** Le jeton (`85d2424b…`) sert à la mesure sur les pages ; le site tag (`f63e35fc…`, visible dans l'adresse du tableau de bord) sert aux requêtes GraphQL. Les confondre renvoie zéro, sans aucune erreur.
