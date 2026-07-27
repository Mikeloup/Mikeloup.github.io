# Tandem TV — site automatique

Ce dossier contient le nouveau site **tandemtv.net**. Il se fabrique tout seul à partir de la chaîne YouTube [@tandem_tv](https://www.youtube.com/@tandem_tv) :

- chaque **playlist YouTube** devient une **rubrique** du site ;
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

### L'ordre des rubriques
Par défaut, les rubriques sont classées **par activité récente** : celle dont la dernière vidéo est la plus récente passe en tête de la page d'accueil. L'ordre évolue donc tout seul au fil de vos publications.

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
