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

## À faire — ensuite

- [x] **Application sur l'écran d'accueil** — page `/installer/` (Android, iPhone, ordinateur), bandeau proposé à partir de la troisième page consultée et jamais réaffiché s'il est écarté, raccourcis dans le manifeste, gestionnaire « fetch » dans l'agent de service (condition d'installabilité chez Chrome + message hors connexion).
- [ ] **Application dans les magasins (App Store / Play Store).** Décision différée à froid : 99 $/an chez Apple, 25 $ une fois chez Google. Une application n'apporte **pas** de nouveaux visiteurs — elle sert la fidélité. Seul gain net : les notifications sur iPhone. Risque : Apple refuse les simples emballages de site (règle 4.2). À rouvrir seulement si l'installation sur l'écran d'accueil rencontre son public.
- [ ] **Refonte graphique.** Michael n'est pas satisfait de la mise en page générale. Pistes : police de titre à caractère (auto-hébergée), grille éditoriale réellement hiérarchisée, bleu marine du logo utilisé ailleurs que dans les barres, mode sombre.
- [ ] **Transcriptions** — le plus gros levier de trafic. Une heure d'entretien = ~9 000 mots que Google ne voit pas aujourd'hui. Chantier lourd, à évaluer techniquement (récupération des sous-titres).
- [ ] **Pages « Invités »** — une fiche par personne reçue. Se positionne sur les noms propres.
- [ ] **Pages d'émission enrichies** — bandeau, présentateur, pitch, périodicité, pour les 10-15 principales.
- [ ] **Google Actualités / Discover.** Rappel : **l'inclusion est automatique depuis décembre 2019**, il n'y a rien à soumettre — le Publisher Center ne sert plus qu'à gérer l'apparence d'une publication déjà reprise. Ce qui compte, ce sont les signaux.
  - [x] Mentions légales, éditeur identifié, directeur de la publication.
  - [x] Sitemap Actualités (`sitemap-news.xml`), moins de 48 h, régénéré à chaque synchronisation.
  - [x] Dates de publication visibles et structurées.
  - [ ] **Signature des vidéos** par le présentateur (nécessite la correspondance émission → présentateur).
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
