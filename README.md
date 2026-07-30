# Tandem TV — site automatique

Ce dossier contient le nouveau site **tandemtv.net**. Il se fabrique tout seul à partir de la chaîne YouTube [@tandem_tv](https://www.youtube.com/@tandem_tv) :

- chaque **playlist YouTube** devient une **rubrique** du site, rangée soit dans **Émissions** (les rendez-vous) soit dans **Thèmes** (les sujets) ;
- chaque **vidéo** devient une **page d'article** (lecteur + titre + description + date) ;
- les rubriques les plus récemment alimentées remontent automatiquement en page d'accueil ;
- le site se met à jour **4 fois par jour**, sans aucune intervention ;
- l'hébergement est **gratuit** (GitHub Pages), sans serveur ni base de données.

Vous n'avez plus qu'une chose à faire : publier vos vidéos sur YouTube et les ranger dans la bonne playlist.

---

## 1. Créer la clé API YouTube (5 minutes, gratuit)

C'est ce qui permet au site de lire vos playlists.

1. Allez sur **https://console.cloud.google.com/** et connectez-vous avec le compte Google de la chaîne.
2. En haut, cliquez sur le sélecteur de projet → **Nouveau projet** → nommez-le `tandemtv` → **Créer**.
3. Dans la barre de recherche du haut, tapez **YouTube Data API v3**, ouvrez-la, cliquez **Activer**.
   *(Au moment de créer la clé, sélectionnez « YouTube Data API v3 » dans « Restrictions d'API » et laissez « Aucun » dans « Restrictions relatives aux applications ».)*
4. Menu de gauche → **API et services** → **Identifiants** → **+ Créer des identifiants** → **Clé API**.
5. Copiez la clé (elle ressemble à `AIzaSy...`). **Gardez-la de côté**, on s'en sert à l'étape 3.
6. *(Recommandé)* Cliquez sur **Modifier la clé API** → section **Restrictions relatives aux API** → **Restreindre la clé** → cochez **YouTube Data API v3** → **Enregistrer**.

> La consommation du site est d'environ **100 à 300 unités par mise à jour**, pour un quota gratuit de **10 000 unités par jour**. Aucun risque de facturation.

---

## 2. Mettre le site sur GitHub

1. Créez un compte gratuit sur **https://github.com** (si vous n'en avez pas).
2. Cliquez sur **+** en haut à droite → **New repository**.
   - Name : **`Mikeloup.github.io`** (exactement ce nom : votre identifiant GitHub suivi de `.github.io`). Ce nom précis publie le site **à la racine**, ce qui évite tout problème de liens.
   - Visibilité : **Public** (obligatoire pour que GitHub Pages soit gratuit)
   - Ne cochez rien d'autre → **Create repository**.
3. Sur la page qui s'affiche, cliquez sur **uploading an existing file**.
4. Glissez-déposez **tout le contenu de ce dossier** (y compris le dossier caché `.github`).
   *Sur Mac, faites `Cmd + Maj + .` dans le Finder pour voir les dossiers cachés.*
5. Cliquez **Commit changes**.

---

## 3. Enregistrer la clé API dans GitHub

1. Dans le dépôt : **Settings** → menu de gauche **Secrets and variables** → **Actions**.
2. Bouton **New repository secret**.
   - Name : `YOUTUBE_API_KEY`
   - Secret : collez la clé de l'étape 1.
3. **Add secret**.

La clé n'est jamais visible dans le site publié.

---

## 4. Activer la publication

1. **Settings** → **Pages**.
2. Dans **Source**, choisissez **GitHub Actions**.
3. Onglet **Actions** (en haut) → **Publier le site Tandem TV** → **Run workflow** → **Run workflow**.

Au bout d'une à deux minutes, le site est en ligne à l'adresse **https://mikeloup.github.io/**.

> `site.config.json` est déjà réglé sur `https://mikeloup.github.io` pour cette première mise en ligne. On le passera à `https://www.tandemtv.net` à l'étape 5, quand le domaine sera branché.

---

## 5. Brancher le domaine tandemtv.net

Le domaine reste le vôtre : on change simplement là où il pointe.

**Côté site** : dans `site.config.json`, remplacez `"siteUrl": "https://mikeloup.github.io"` par `"siteUrl": "https://www.tandemtv.net"` et enregistrez (le fichier `CNAME` sera généré tout seul).

**Côté GitHub** : **Settings** → **Pages** → **Custom domain** → tapez `www.tandemtv.net` → **Save**, puis cochez **Enforce HTTPS** (disponible après quelques minutes).

**Côté Wix** (ou chez votre registrar, là où le domaine est géré) : ouvrez la zone DNS et remplacez les enregistrements existants par :

| Type | Nom / Hôte | Valeur |
| --- | --- | --- |
| CNAME | `www` | `mikeloup.github.io` |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

La propagation prend de quelques minutes à quelques heures. Tant qu'elle n'est pas terminée, l'ancien site Wix peut encore s'afficher : c'est normal.

> **Ne résiliez Wix qu'une fois le nouveau site visible sur tandemtv.net.** Si le domaine a été acheté chez Wix, vérifiez d'abord qu'il reste actif après l'arrêt de l'abonnement Premium (le domaine et l'abonnement sont facturés séparément) — sinon, transférez-le d'abord chez un registrar comme OVH, Gandi ou Namecheap.

---

## 6. Au quotidien

### Ajouter une vidéo
Publiez-la sur YouTube et **ajoutez-la à la playlist** correspondante. Elle apparaîtra sur le site à la prochaine mise à jour (au plus tard 4 h). Pour la voir tout de suite : onglet **Actions** → **Run workflow**.

### Créer une nouvelle rubrique
Créez une nouvelle playlist publique sur YouTube. Elle devient automatiquement une rubrique du site.

### Émissions ou thème ?
Le menu du site a deux entrées : **Émissions** (un présentateur, un rendez-vous) et **Thèmes** (un sujet qui traverse les émissions).

Pour ne pas avoir à classer 76 playlists, **seuls les thèmes sont listés** dans `site.config.json` ; tout le reste est automatiquement rangé dans « Émissions » :

```json
"groups": {
  "themes": {
    "label": "Thèmes",
    "playlists": ["Actu Israël", "Iran", "Gaza", "…"]
  }
}
```

Déplacer une rubrique d'une famille à l'autre = ajouter ou retirer son titre de cette liste. La comparaison ignore la casse et les accents.

### Alléger les menus
```json
"playlists": {
  "exclude": ["Shorts"],
  "minVideos": 1,
  "menuMaxAgeMonths": 6,
  "menuMinVideos": 15,
  "mergeDuplicates": true
}
```

- `exclude` — playlists totalement absentes du site.
- `minVideos` — en dessous de ce nombre de vidéos, la rubrique n'existe pas sur le site.
- **Règle des menus déroulants** : une rubrique y figure si elle a publié **depuis moins de `menuMaxAgeMonths` mois** *ou* si elle compte **au moins `menuMinVideos` vidéos**. Les rendez-vous actifs remontent, les gros catalogues restent visibles, les rubriques abandonnées à deux ou trois vidéos disparaissent. Mettre l'un ou l'autre à `0` désactive ce critère. Les rubriques hors menus restent dans « Tout le catalogue » et dans la recherche, et **reviennent d'elles-mêmes dès la publication suivante**.
- `mergeDuplicates` — fusionne les playlists dont le titre ne diffère que par la casse ou les accents (utile pour les doublons créés par erreur sur YouTube).

### Corriger les titres écrits en majuscules
```json
"display": {
  "smartCase": true,
  "properNouns": ["Tandem", "Israël", "Rav", "Nathalie", "…"]
}
```
Les playlists écrites TOUT EN MAJUSCULES sont réaffichées en minuscules, avec une majuscule à la première lettre : `LES COURS DU RAV YOEL BENHARROUCHE` devient « Les cours du Rav Yoel Benharrouche ». Les titres déjà correctement écrits ne sont pas touchés.

Si un nom propre ressort en minuscules, ajoutez-le à `properNouns`. À l'inverse, si un mot est capitalisé à tort, retirez-le de la liste. Rien n'est modifié sur YouTube : c'est un habillage à l'affichage.

> Les **accents manquants** dans un titre YouTube ne peuvent pas être devinés (`PROCES` reste `proces`). Pour les corriger, renommez la playlist sur YouTube : le site suivra à la mise à jour suivante.

### Alléger la page d'accueil
```json
"home": { "latestCount": 8, "rowSize": 8, "themeRows": 3, "showRows": 3 }
```
`themeRows` et `showRows` limitent le nombre de rangées affichées en page d'accueil. Avec 74 rubriques, mieux vaut rester bas : le reste est à un clic dans les menus.

### L'ordre des rubriques
Sur la page d'accueil, les rubriques sont classées **par activité récente** : celle dont la dernière vidéo est la plus récente passe en tête. L'ordre évolue donc tout seul au fil de vos publications. Les menus déroulants et les pages d'index suivent le même classement. Pour passer les menus en ordre alphabétique, mettez `"sort": "alpha"` dans le bloc `playlists` de `site.config.json`.

Pour figer certaines rubriques en tête, listez-les dans `order` (`site.config.json`) :

```json
"playlists": {
  "order": ["L'invité de Jérôme Haas", "Tour d'Israël"],
  "exclude": ["Playlist à ne pas afficher"],
  "minVideos": 1
}
```

`order` = les rubriques citées passent en premier, dans cet ordre. `exclude` = rubriques masquées. `minVideos` = nombre minimum de vidéos pour qu'une playlist s'affiche.

### Modifier les textes des pages
Les quatre pages rédactionnelles sont dans le dossier `content/` :

| Fichier | Page |
| --- | --- |
| `content/a-propos.md` | À propos |
| `content/partenaires.md` | Partenaires |
| `content/contact.md` | Contact |

La liste des pages affichées est pilotée par le bloc `pages` de `site.config.json` : retirez une ligne et la page disparaît du site et de tous les menus ; ajoutez-en une (avec le fichier `content/<slug>.md` correspondant) et elle apparaît partout.

Modifiez-les directement sur GitHub (clic sur le fichier → icône crayon → **Commit changes**). Le site se régénère tout seul après chaque enregistrement. Le format est du Markdown : `#` pour un titre, `-` pour une puce, `[texte](lien)` pour un lien.

### Changer les couleurs ou le logo
Les couleurs sont toutes regroupées en haut de `assets/style.css`, dans le bloc `:root` : `--brand` est le bleu marine du logo, `--sky` le bleu ciel, `--accent` le bleu des liens, `--bg` le fond.

Le logo est le fichier `assets/logo.png` : remplacez-le par une autre image (fond transparent, format paysage) et tout le site suit. `assets/favicon.png` est l'icône affichée dans l'onglet du navigateur.

### Référencement Google
Le site est conçu pour que Google lise réellement le contenu, ce que ne permettait pas l'ancien site Wix :

- chaque page vidéo est un **fichier HTML déjà rempli** (titre, description, date en clair dans le code source) — aucun JavaScript n'est nécessaire pour la lire ;
- chaque page vidéo porte des **données structurées `VideoObject`** (titre, description, miniature, durée, date, lecteur, nombre de vues) ;
- un **`sitemap-video.xml`** au format vidéo de Google est généré à chaque mise à jour, en plus du `sitemap.xml` classique ; les deux sont déclarés dans `robots.txt` et regroupés dans `sitemap-index.xml` ;
- le lecteur YouTube ne se charge qu'au clic (rapidité, pas de cookie avant action du visiteur) mais une balise `<noscript>` contient le vrai lecteur, **détectable par les robots**.

**À garder en tête** : la vidéo reste hébergée par YouTube, qui garde l'antériorité et l'autorité. Le site se positionnera surtout sur les requêtes de marque et la longue traîne (nom d'un invité, sujet précis). Pour aller plus loin, la seule vraie marge est d'écrire quelques lignes d'introduction propres au site sur les vidéos importantes.

### Raccorder Google Search Console
1. Allez sur **https://search.google.com/search-console**, ajoutez une propriété de type **Préfixe d'URL** avec l'adresse du site.
2. Choisissez la méthode **Balise HTML**. Google affiche `<meta name="google-site-verification" content="XXXX">`.
3. Copiez **uniquement la valeur `XXXX`** dans `site.config.json` :
   ```json
   "googleSiteVerification": "XXXX"
   ```
4. Enregistrez, attendez la republication (1 à 2 minutes), puis cliquez sur **Vérifier** dans Search Console.
5. Une fois vérifié : menu **Sitemaps** → ajoutez `sitemap-index.xml` → **Envoyer**.

L'indexation complète d'un site de cette taille prend plusieurs semaines. Search Console vous montrera la progression réelle, page par page.

### Ajouter des statistiques de visite
Dans `site.config.json`, renseignez `analytics.plausibleDomain` ou `analytics.gaMeasurementId`. Laissez vide pour n'installer aucun traceur.

---

## 7. Travailler en local (facultatif)

Aucune dépendance à installer — Node.js 20+ suffit.

```bash
node build.mjs --demo   # génère le site avec des données de démonstration
node serve.mjs          # prévisualise sur http://localhost:8080

YOUTUBE_API_KEY=votre_clé node build.mjs   # génère le vrai site
```

---

## Ce que contient le dossier

```
build.mjs              le générateur (fetch YouTube → dist/)
serve.mjs              serveur de prévisualisation local
site.config.json       tous les réglages du site
src/youtube.mjs        appels à l'API YouTube
src/render.mjs         gabarits HTML des pages
src/markdown.mjs       conversion Markdown → HTML
src/util.mjs           formatage (dates, durées, slugs…)
assets/style.css       tout le design (couleurs en haut du fichier)
assets/logo.png        le logo affiché en en-tête et en pied de page
assets/app.js          menu, lecteur vidéo, recherche
content/*.md           les textes des pages rédactionnelles
data/demo.json         données de démonstration
.github/workflows/     la mise à jour automatique
```

## Sécurité et robustesse

- La clé API vit uniquement dans les secrets GitHub, jamais dans les pages publiées.
- Si YouTube est indisponible au moment d'une mise à jour, le build réutilise la dernière synchronisation réussie : le site ne casse pas.
- Aucune base de données, aucun formulaire côté serveur, aucun mot de passe à gérer : la surface d'attaque est nulle.

## Réglages ajoutés en version 8 et 9

### Épingler une vidéo en une

Par défaut, la page d'accueil met en avant la dernière vidéo publiée. Pour choisir vous-même :

```json
"home": { "featured": "dQw4w9WgXcQ" }
```

Collez l'identifiant de la vidéo — les 11 caractères qui suivent `watch?v=` dans son adresse YouTube.
Le bandeau affiche alors « À la une » au lieu de « Dernière publication », et la vidéo épinglée n'apparaît pas en double dans la grille.
Remettez `""` pour revenir au fonctionnement automatique.

Si l'identifiant ne correspond à aucune vidéo du catalogue, le site revient silencieusement à la dernière publication : une faute de frappe ne casse rien.

### Pages visibles seulement en pied de page

Ajoutez `"footerOnly": true` à une entrée de `pages` pour qu'elle disparaisse du menu principal tout en restant accessible par le pied de page. C'est le réglage utilisé pour les mentions légales et la politique de confidentialité.

### Réseaux sociaux

Les adresses renseignées dans `social` apparaissent en pied de page **et** alimentent la fiche `Organization` lue par Google (`sameAs`), qui relie officiellement le site à vos comptes. Une adresse laissée vide n'apparaît pas.

### Sommaire automatique des vidéos

Aucun réglage : quand une description contient au moins trois timecodes en ordre chronologique (`00:00 Introduction`, `Introduction 00:00`, `00:00 - Introduction`…), le site en tire un encadré « Au sommaire » cliquable, et retire ces lignes du corps de la description pour éviter le doublon.

Un clic sur un chapitre lance la lecture **sur le site**, au bon moment — la vue est donc comptabilisée par YouTube. Ces chapitres sont également déclarés à Google en données structurées `Clip` : ils peuvent apparaître comme « moments clés » sous le résultat de recherche.

Si un sommaire vous paraît mal découpé, la cause est toujours dans la description YouTube : corrigez-la là-bas, la prochaine synchronisation reprendra la correction.

## Notifications navigateur (version 13)

Le site peut prévenir ses visiteurs à chaque nouvelle vidéo, sans aucune intervention de votre part.

### Ce qui est nécessaire

1. Un compte OneSignal gratuit, avec une application **Web** configurée sur `https://www.tandemtv.net`.
2. L'App ID renseigné dans `site.config.json`, section `push`.
3. Un secret GitHub nommé **`ONESIGNAL_API_KEY`** contenant la REST API Key de OneSignal.

Si l'App ID est vide, aucun code n'est injecté dans les pages : la fonction disparaît entièrement.
Si le secret est absent, le site fonctionne normalement mais n'envoie rien.

### Comment l'envoi automatique fonctionne

À chaque synchronisation, le générateur télécharge le fichier `search.json` **actuellement publié** et le compare à la liste qu'il vient de récupérer sur YouTube. Toute vidéo absente de la version en ligne est considérée comme nouvelle.

Il n'y a donc aucun fichier d'état à maintenir : la référence, c'est le site lui-même.

Trois garde-fous protègent votre audience d'un envoi massif accidentel :

- **`maxPerRun`** (3 par défaut) — nombre maximal de notifications par synchronisation ;
- **`maxAgeHours`** (72 par défaut) — une vidéo publiée il y a plus longtemps n'est jamais annoncée, même si elle apparaît pour la première fois sur le site (cas d'une playlist réorganisée) ;
- **échec = silence** — si le `search.json` en ligne est illisible ou vide, rien n'est envoyé. Une notification manquée vaut mieux qu'un doublon envoyé à tout le monde.

### Modifier le texte des notifications

Dans `site.config.json` :

```json
"titleTemplate": "Nouvelle vidéo · {emission}",
"bodyTemplate": "{titre}"
```

Trois variables sont disponibles : `{emission}` (nom de la rubrique), `{titre}` (titre de la vidéo) et `{site}`.

Le texte du bandeau d'invitation à s'abonner, lui, se modifie **dans le tableau de bord OneSignal** (Settings → Push & In-App → Permission Prompt Setup), pas dans le code.

### Envoyer une notification exceptionnelle

Pour une alerte hors publication (direct, information de dernière minute), passez par OneSignal : **Messages → New Push**. Le site n'intervient pas.

### Vérifier que tout fonctionne

Après une synchronisation, l'onglet **Actions** de GitHub affiche l'une de ces lignes :

- `Notifications : aucune nouvelle vidéo à annoncer.` — cas normal la plupart du temps ;
- `Notification envoyée : <titre>` — c'est parti ;
- `Notifications : ... Aucun envoi.` — un garde-fou s'est déclenché, le message précise lequel.

### En cas de problème

Le fichier `OneSignalSDKWorker.js` est généré automatiquement à la racine du site. Si les notifications ne s'activent pas côté navigateur, remplacez-le par celui proposé au téléchargement dans le tableau de bord OneSignal : son contenu peut évoluer avec les versions du SDK.

---

## Lettre d'information (version 22)

Le canal universel : contrairement aux notifications, il fonctionne **partout, y
compris sur iPhone**, et la liste d'adresses vous appartient — vous la gardez
même si vous changez un jour de prestataire.

### Ce qui est nécessaire

1. Un compte **Kit** (kit.com, ex-ConvertKit) — gratuit jusqu'à 10 000 abonnés,
   envois illimités.
2. Un **formulaire** créé chez Kit. Son numéro (visible dans l'adresse quand
   vous l'éditez) se colle dans `site.config.json`, section `newsletter`, champ
   `formId`. Ce numéro n'est pas secret : le formulaire du site pointe dessus.
3. Un secret GitHub nommé **`KIT_API_KEY`** contenant la clé API v4 de Kit
   (Kit → Settings → Developer → API Keys).

Tant que `formId` est vide, le formulaire n'apparaît nulle part sur le site et
aucun envoi n'est tenté. Si le secret est absent, le formulaire reste actif et
recueille les inscriptions ; seul l'envoi automatique est suspendu.

### Où le formulaire apparaît

- en bas de la page d'accueil ;
- en tête de la page **« Suivre Tandem TV »**, avant les notifications.

Le formulaire est du HTML pur : il envoie l'adresse directement à Kit, sans
JavaScript et sans qu'aucune clé ne circule dans les pages.

### Comment l'envoi automatique fonctionne

Exactement comme les notifications, et à partir de la **même détection** : le
générateur compare le `search.json` publié à la liste récupérée sur YouTube.
Pour chaque nouveauté, il crée chez Kit une diffusion programmée **deux minutes
plus tard** — le temps que la page de la vidéo soit effectivement en ligne.

Mêmes garde-fous : `maxPerRun` (2 par défaut), `maxAgeHours` (72 par défaut), et
silence complet en cas de doute sur la liste publiée.

### Modifier le texte des envois

Dans `site.config.json` :

```json
"subjectTemplate": "{emission} — {titre}",
"introTemplate": "Une nouvelle vidéo vient d'être mise en ligne sur Tandem TV."
```

Mêmes variables que les notifications : `{emission}`, `{titre}`, `{site}`.

La mise en page du message (bandeau, miniature cliquable, bouton « Regarder la
vidéo », rappel de la diffusion télévisée) est produite par la fonction
`newsletterEmail` de `src/render.mjs`.

### Vérifier que tout fonctionne

Dans l'onglet **Actions** de GitHub, après une synchronisation :

- `Lettre d'information : aucune nouvelle vidéo à annoncer.` — cas normal ;
- `Lettre d'information programmée : <titre>` — c'est parti ;
- `Lettre d'information refusée ... HTTP 401` — la clé API est absente ou erronée.

Côté Kit, l'envoi apparaît dans **Broadcasts**, d'abord comme programmé puis
comme envoyé. Vous pouvez l'y modifier ou l'annuler pendant les deux minutes de
battement.

### Envoyer une lettre exceptionnelle

Passez par Kit → **Broadcasts → New broadcast**. Le site n'intervient pas.

---

## Rattrapage des anciennes adresses (version 24)

Le site a remplacé un blog Wix dont les adresses (`/post/mon-titre`, `/dons`)
restent dans l'index de Google, dans les partages Facebook et dans les
marque-pages des visiteurs. Ces visiteurs existent : le rapport d'audience du
29 juillet 2026 en comptait une dizaine en une seule journée.

La page d'erreur ne se contente donc plus de s'excuser. Elle :

1. lit l'adresse demandée et en extrait les mots significatifs ;
2. les compare aux titres des rubriques, puis à ceux des vidéos ;
3. **conduit directement** à la rubrique ou à la vidéo quand la correspondance
   est franche et sans rivale ;
4. **propose les quatre plus proches** quand le doute subsiste ;
5. propose une recherche sur ces mots quand rien ne ressort.

Aucun fichier de correspondances à maintenir : tout repose sur `search.json`,
régénéré à chaque synchronisation. Une vidéo renommée reste donc retrouvable.

Les seuils sont dans `assets/app.js` (section « Rattrapage des anciennes
adresses ») : correspondance d'au moins 80 % des mots, au moins trois mots en
commun, et vingt points d'avance sur la deuxième — trois conditions réunies
pour éviter d'envoyer quelqu'un vers la mauvaise vidéo.

---

## Améliorations de la version 25

**Page « Merci ».** `/merci/` accueille en français l'internaute qui vient de
s'inscrire à la lettre, avec les quatre dernières vidéos et un rappel de la
diffusion télévisée. Elle n'apparaît que si `newsletter.formId` est renseigné,
et porte `noindex` : elle n'a pas vocation à être trouvée par Google.
Pour que Kit y renvoie : formulaire → **Settings** → **General** → *Redirect to
an external page* → `https://www.tandemtv.net/merci/`.

**Un flux RSS par rubrique.** `/emissions/<slug>/rss.xml` pour chaque émission
et chaque thème, annoncé dans l'en-tête de la page correspondante et proposé
sous son titre. Permet de suivre un seul rendez-vous plutôt que toute la chaîne.

**Miniatures : moins de données transmises à Google.** Toutes les vignettes
portent désormais `referrerpolicy="no-referrer"`. Les serveurs de YouTube
continuent de voir l'adresse IP des visiteurs — c'est inhérent au chargement
d'une image distante — mais ne savent plus *quelle page* était consultée. Le
seul moyen de supprimer entièrement cette dépendance reste d'héberger les
miniatures sur le site ; c'est toujours au programme.

---

## L'application, sans magasin d'applications (version 26)

Le site est installable depuis la version 13 — manifeste, icône, plein écran —
mais rien ne le disait aux visiteurs. La version 26 corrige cela.

**Page `/installer/`.** Le mode d'emploi pour Android, iPhone/iPad et
ordinateur. Sur les navigateurs qui le permettent (Chrome, Edge), un bouton
« Installer maintenant » déclenche la vraie fenêtre du navigateur. Si le site
est déjà installé, la page le dit et masque les modes d'emploi.

**Bandeau discret.** Il n'apparaît qu'à partir de la **troisième page
consultée**, jamais sur la page `/installer/` elle-même, et plus jamais s'il a
été écarté une fois — le refus est mémorisé sur l'appareil du visiteur.
Proposer trop tôt, c'est se faire refuser définitivement.

**Agent de service.** Chrome n'accepte d'installer un site que s'il possède un
agent de service muni d'un gestionnaire `fetch`. Comme un seul agent peut
contrôler la racine du domaine et que celui de OneSignal y est déjà, le
gestionnaire a été ajouté **dans ce même fichier** (`OneSignalSDKWorker.js`,
généré à chaque build). Il ne met **rien** en cache — le site reste toujours à
jour — et se contente d'afficher une page « Pas de connexion » en français
lorsque le réseau est coupé.

**Raccourcis.** Le manifeste déclare trois raccourcis (dernières vidéos,
catalogue, recherche), accessibles par appui long sur l'icône.

### Et les magasins d'applications ?

Décision différée, volontairement. Rappel des ordres de grandeur : **99 $ par an**
chez Apple, **25 $ une fois** chez Google. Une application ne fait pas découvrir
une chaîne — elle fidélise ceux qui la connaissent déjà. Le seul gain net serait
les notifications sur iPhone. Et Apple rejette les applications qui ne sont
qu'un site web emballé (règle 4.2 « minimum functionality »). À rouvrir si, et
seulement si, l'installation sur l'écran d'accueil rencontre son public.

---

## Vague 1 de l'audit (version 27)

**Données structurées.** Chaque page vidéo et chaque page de rubrique porte
désormais un fil d'Ariane balisé (`BreadcrumbList`) : Google remplace l'adresse
brute par « Accueil › Émission › Titre » sous le résultat. Les pages de rubrique
déclarent en plus leur contenu comme une collection (`CollectionPage` +
`ItemList`). Le gabarit `layout` accepte maintenant **plusieurs fiches** par page :
passer un tableau à `jsonLd` suffit.

**Image de partage.** À défaut de visuel propre, une page utilise le logo
(`/assets/logo.png`). Plus aucune page partagée sur Facebook ou WhatsApp
n'apparaît sans image.

**Descriptions nettoyées.** `cleanDescription` retire désormais la queue
promotionnelle des descriptions YouTube — appels à l'abonnement, liens vers les
réseaux, chapelets de mots-dièse. Le nettoyage ne mord que sur la **fin** du
texte, pour ne jamais supprimer un lien cité au milieu d'un propos éditorial ; et
si la description est *entièrement* promotionnelle, le texte d'origine est
conservé plutôt que rien.

**Téléphone.** Mesures avant / après sur écran d'iPhone (390 × 844) :

| | v26 | v27 |
|---|---|---|
| Hauteur de l'en-tête | 114 px | **55 px** |
| Colonnes de vignettes | 1 | **2** |
| Vignettes visibles en deux écrans | 3 | **7** |
| Zones tactiles sous 24 px | 53 | **0** |

Le champ de recherche se replie derrière une loupe, la une est resserrée (son
résumé est retiré — il figure de toute façon sur la page de la vidéo), et le
bouton de partage utilise le **panneau natif du système** quand il existe
(`navigator.share`), la liste des cinq réseaux restant affichée sur ordinateur.

Rien n'a changé sur ordinateur : quatre colonnes, recherche visible, cinq
réseaux — vérifié.

---

## Transfert des anciennes adresses Wix (version 28)

Le site a remplacé un blog Wix. Trois mois après la migration, **l'essentiel du
trafic Google arrive encore sur les anciennes adresses** : environ 500 des
706 clics du trimestre. Elles renvoient une erreur 404, que la page d'erreur
rattrape pour les visiteurs — mais Google, lui, se contente de supprimer ces
pages de son index, et l'ancienneté accumulée est perdue.

`data/anciennes-adresses.json` contient les 228 adresses relevées dans Search
Console. À chaque génération, `transfererAnciennesAdresses()` :

1. écrit les destinations **imposées** (`manuel`) — sections du vieux site, et
   articles dont la vidéo a été renommée depuis ;
2. pour les autres (`auto`), tente d'abord un rapprochement avec une **rubrique**,
   puis avec une **vidéo** ;
3. n'écrit un transfert que si le rapprochement est certain : 80 % des mots
   retrouvés, au moins trois mots en commun, vingt points d'avance sur la
   deuxième candidate ;
4. laisse les autres en 404 — le rattrapage côté navigateur prend le relais — et
   les **liste dans le journal de build**, pour qu'on puisse les traiter à la main.

GitHub Pages ne sait pas produire de redirection 301. Chaque page de transfert
porte donc une **adresse canonique** (c'est elle que Google suit pour transmettre
l'ancienneté), un rafraîchissement immédiat, un `location.replace` et un lien
visible. Surtout **pas de `noindex`** : il empêcherait la consolidation
recherchée.

Ces pages ne figurent pas dans le plan du site : elles n'ont pas à être
découvertes, seulement à être retrouvées par Google là où il les connaît déjà.

### Pour mettre la liste à jour

Search Console → **Performances** → onglet **Pages** → 3 mois → relever les
adresses qui ne commencent pas par `/video/`, `/emissions/` ou `/themes/`.

---

## Fiches des invités et des présentateurs (version 29)

Search Console a montré que l'essentiel des recherches qui mènent à Tandem TV
sont des recherches de **noms de personnes** — « samuel madar wikipédia »,
« stephan zeev goldin biographie », « justine varin » — et qu'aucune page du
site n'y répondait. Ces fiches comblent ce manque à partir de ce que la chaîne
publie déjà.

**Ce qui est repéré automatiquement** (`src/personnes.mjs`) :

- le **présentateur**, déduit du nom de l'émission : « L'invité de William
  Zerbib » → William Zerbib, « Cafe Daat - Rony Akrich » → Rony Akrich ;
- les **invités**, déduits des titres de vidéos, selon trois motifs : après la
  dernière barre verticale, avant les deux-points, ou après « interview de » /
  « entretien avec ».

Un candidat n'est retenu que s'il ressemble à un nom : deux à quatre mots,
majuscules initiales, aucun chiffre, et aucun mot de lieu ou de thème — la liste
`PAS_UN_NOM` écarte « Judée-Samarie », « Proche Orient », « Actu Israël »…

**Ce qui se règle à la main** (`data/personnes.json`) :

| Champ | Rôle |
|---|---|
| `minVideos` | Nombre de passages à partir duquel une fiche est créée (2 par défaut) |
| `exclure` | Retire un faux nom : une marque, un partenaire, un segment |
| `alias` | Fusionne deux orthographes d'une même personne |
| `inclure` | Force une fiche pour quelqu'un qui n'a qu'un seul passage |
| `presentateurs` | Impose le présentateur d'une émission |
| `fiches` | Ajoute une **fonction** et un **texte de présentation** |

**Le site n'invente rien sur les personnes.** Une fiche n'affirme que ce qui se
déduit du catalogue : combien de passages, dans quelles émissions, sur quelle
période. La fonction et le texte de présentation ne s'affichent que s'ils ont
été écrits à la main dans `fiches`.

**Effet secondaire important :** chaque page vidéo porte désormais une
**signature d'auteur** (`author` dans les données structurées, « Présenté par… »
sous le titre). C'était le dernier point bloquant identifié pour Google
Actualités, et il ne demandait finalement aucune information supplémentaire —
le nom des émissions le contenait déjà.

---

## Fiches d'invités : mise en page et portraits (version 31)

La première version affichait une liste à deux colonnes où le nombre de vidéos
se retrouvait collé au nom suivant — illisible. Remplacée par une **grille de
cartes illustrées**, six colonnes sur ordinateur, deux sur téléphone.

**Les portraits** sont la miniature de la vidéo la plus récente de la personne :
sur cette chaîne, l'invité y figure presque toujours. Aucune photo à collecter,
aucun droit à négocier, et l'illustration se met à jour toute seule à chaque
nouveau passage. Pour imposer une autre image :

```json
"fiches": { "Stéphane Goldin": { "photo": "https://…", "role": "…" } }
```

Le **regroupement par lettre a été retiré** : utile pour des centaines de noms,
il gaspillait de la place pour quarante.

**Attention aux faux noms.** Le repérage automatique a produit trois erreurs sur
quarante-deux — « Beit Halochem » (une association), « Feel Good » et
« Underground Music » (des segments d'émission). Ils sont dans `exclure`. À
vérifier de temps en temps sur `/invites/` : tout ce qui n'est pas une personne
se retire en une ligne.

---

## Rattrapage des intervenants par les descriptions (version 32)

Les fiches ne lisaient que les titres et les noms d'émissions. Insuffisant :
« Benjamin Netanyahu bientôt en prison ? » est un épisode de Galith Benzimra, et
seule la description le dit. Résultat, sa fiche affichait 12 vidéos là où la
recherche du site en trouvait 66.

Une troisième passe de `collecterPersonnes()` lit donc les descriptions. Elle
n'est pas naïve pour autant :

1. **Aucun nom nouveau.** Elle ne cherche que les personnes déjà identifiées par
   un titre ou par un nom d'émission. Sans cette règle, toute personnalité citée
   en passant — un ministre, un auteur — deviendrait « intervenante de la chaîne ».
2. **Bornes de mot.** « Bruno Dray » ne correspond pas à « Bruno Draye ».
3. **Seuil de vraisemblance.** Un nom présent dans plus de la moitié du catalogue
   n'est pas un intervenant : c'est une mention de pied de description. Le seuil
   ne s'applique qu'au-delà de 40 vidéos, pour ne pas gêner une petite chaîne.

Comparaison insensible à la casse et aux accents, sur la description **nettoyée**
— donc après retrait de la queue promotionnelle, ce qui écarte au passage les
noms cités dans les crédits de fin.
