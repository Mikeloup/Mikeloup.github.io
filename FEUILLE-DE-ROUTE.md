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
| Soutien financier | Le lien PayPal.me (choix arrêté : PayPal) |
| Partenaires | Deux listes séparées : partenaires de la chaîne / chaînes et programmes diffusés |
| Télévision | Canal 14 Annatel : est-ce le seul ? horaires ? lien d'abonnement au bouquet ? |
| Sponsoring | Formats acceptés, adresse de contact à afficher |
| Telegram | Le lien public `t.me/...` (celui fourni était une adresse interne au client Telegram) |
| Éditeur | Si Tandem TV est une société immatriculée : dénomination exacte + numéro |
| À propos | Année de création, composition de l'équipe |

---

## À faire — prochain lot

Ne dépend de rien :

- [ ] **Appel à commenter sur YouTube** sous chaque vidéo (le commentaire nourrit l'algorithme là-bas, pas ici).
- [ ] **Mise en évidence de la télévision** : bandeau d'accueil + bloc de pied de page, canal 14 Annatel.
- [ ] **Page « Sponsoring »** alimentée automatiquement par les chiffres de la chaîne (abonnés, vues, nombre de vidéos).
- [ ] **Appel à proposer un sujet ou un invité**, remonté depuis la page Contact.
- [ ] **Lettre d'information** : Kit (ex-ConvertKit) — 10 000 abonnés, envois illimités, gratuit. Formulaire sur le site + envoi déclenché par le site à chaque nouvelle vidéo, comme les notifications.
- [x] **Rapport d'audience quotidien** — script `tools/rapport-audience.mjs` + workflow `.github/workflows/rapport.yml`. Interroge Cloudflare, publie un ticket GitHub assigné à Michael (qui déclenche l'e-mail). Nécessite le secret `CLOUDFLARE_API_TOKEN`.

Dépend des informations ci-dessus :

- [ ] **Page « Soutenir la chaîne »** (PayPal).
- [ ] **Page « Partenaires »** refondue en deux sections.
- [ ] **Module de vote / sondage** sous les vidéos de débat.

---

## À faire — ensuite

- [ ] **Refonte graphique.** Michael n'est pas satisfait de la mise en page générale. Pistes : police de titre à caractère (auto-hébergée), grille éditoriale réellement hiérarchisée, bleu marine du logo utilisé ailleurs que dans les barres, mode sombre.
- [ ] **Transcriptions** — le plus gros levier de trafic. Une heure d'entretien = ~9 000 mots que Google ne voit pas aujourd'hui. Chantier lourd, à évaluer techniquement (récupération des sous-titres).
- [ ] **Pages « Invités »** — une fiche par personne reçue. Se positionne sur les noms propres.
- [ ] **Pages d'émission enrichies** — bandeau, présentateur, pitch, périodicité, pour les 10-15 principales.
- [ ] **Google Actualités / Discover** — les mentions légales en étaient la condition d'entrée.
- [ ] **Flux RSS par émission.**
- [ ] **Miniatures hébergées sur le site** (aujourd'hui servies par YouTube).

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
- Clés et secrets : `YOUTUBE_API_KEY` et `ONESIGNAL_API_KEY` vivent dans les secrets GitHub. Aucune clé ne doit transiter en clair.
