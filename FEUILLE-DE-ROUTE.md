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
