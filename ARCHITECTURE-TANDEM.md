# Le système Tandem TV — la chaîne complète

*Ce document est un pont. Il décrit d'un seul tenant ce qui est réparti entre
plusieurs conversations : la production vidéo, la diffusion à l'antenne, le site
et la communication. Une session qui le lit doit pouvoir comprendre l'ensemble
sans rien demander.*

*Établi le 9 août 2026 par lecture directe du code et de la base, machine par
machine. Ce n'est pas une intention : c'est ce qui tourne.*

---

## 1. Quatre lieux, quatre rôles

| Lieu | Rôle | Ce qui y vit |
|---|---|---|
| **Mac de Michael** — `~/Desktop/TandemPipeline` | Le cerveau. Décide, fabrique, orchestre. | Base SQLite, scripts, 18 tâches `launchd`, panneau Premiere |
| **SSD externe** — `/Volumes/Extreme SSD/TandemStudio_Storage` | Les médias. Rien d'autre. | `local_source/`, `media/`, `exports/`, `ready_to_upload/` |
| **Machine Annatel** (Windows) | La régie. Joue ce qu'on lui donne. | OBS Studio, deux sources VLC, le contrôleur de diffusion |
| **GitHub** — `Mikeloup/Mikeloup.github.io` | Le site public et **tous les secrets**. | Site statique, 9 workflows, jetons YouTube et Instagram |

**Le SSD peut être débranché en cours de travail.** Le service le revérifie en
direct et refuse d'agir plutôt que d'écrire dans le vide.

---

## 2. Le fil d'une émission, du tournage à Instagram

### a. Production — sur le Mac

1. **Le panneau UXP dans Premiere Pro** (`premiere_uxp/`) reçoit des « jobs »
   déposés dans `production/premiere_jobs/`, applique un modèle de montage tiré
   du registre de gabarits, et rend la main. Un `watcher.js` surveille le
   dossier ; les jobs traités partent dans `premiere_jobs_processed/`.
2. **Le montage est exporté** par Media Encoder vers `exports/` sur le SSD.
3. **`tandem_service.py`** (service permanent, port HTTP local) est le poste de
   commande : il scanne les chaînes, normalise les médias, attribue un
   **identifiant interne** `TTVxxxxxxxx`, et tient la base à jour. La vidéo passe
   au statut `EXPORTED`.

### b. Vers l'antenne

4. **`trier_exports_vers_annatel.py`** — toutes les 10 minutes. Pour chaque
   fichier d'`exports/`, il vérifie que la **base** le confirme `EXPORTED` (la
   base fait autorité, jamais l'inverse), ignore les fichiers dont la taille
   bouge encore (encodage en cours), puis copie vers
   `ready_to_upload/annatel/<CHAINE>/`.
   *Au même passage*, pour cinq chaînes seulement — Rony Akrich, Stéphane
   Goldin, Rony Hayot, Jérôme Haas, William Zerbib — il **téléverse la vidéo sur
   YouTube en brouillon privé** (`youtube_uploader.py`, OAuth local). Michael la
   finalise et la rend publique quand il le décide.
5. **Syncthing** synchronise `ready_to_upload/annatel/` du Mac vers la machine
   Annatel, en continu, sans intervention.
6. **`annatel_scan_confirmations.py`** tourne côté Annatel et écrit un manifeste
   des fichiers réellement présents. Il revient par Syncthing, et
   **`ingerer_confirmations_annatel.py`** (toutes les 15 min) l'ingère dans la
   table `annatel_confirmations`.

> **Règle capitale :** la grille n'inclut une vidéo que si elle figure dans
> `annatel_confirmations`. Jamais sur la seule foi d'un statut `EXPORTED` côté
> Mac. Un fichier qui n'est pas arrivé ne peut pas être programmé.

### c. La grille

7. **`playlist_generator.py`** — toutes les 15 minutes. Il applique les règles
   éditoriales : rotation par temps cumulé, équilibre politique, prime time
   20 h / 22 h à ±30 s, fraîcheur, plafond de passages par chaîne, réservation
   de journée. Il écrit la table `grille` (≈ 21 000 lignes).
   **Zone verrouillée / zone glissante** : tout ce qui tombe dans les 48 heures
   à venir est figé et ne bougera plus ; au-delà, la grille peut encore évoluer.
8. **`annatel_obs_playout_controller.py`** tourne sur la machine Annatel. À
   chaque cycle, il recalcule *ce qui devrait être à l'écran maintenant, et à
   quelle position*, à partir de l'horloge et de `grille_export.json` — **jamais
   à partir de ce qu'OBS faisait avant**. C'est ce qui garantit le recalage
   automatique après n'importe quelle coupure.
   Il pilote OBS par `obs-websocket` v5, avec **deux sources VLC superposées**
   (« double-buffer ») qui alternent : cette architecture, posée le 19 juillet,
   supprime le noir de une à trois secondes entre deux vidéos.
9. **Les diffusions réellement constatées** sont écrites en JSON Lines par le
   contrôleur — uniquement lorsqu'un changement de vidéo est *observé* à
   l'antenne — reviennent par Syncthing, et **`ingerer_diffusions_confirmees.py`**
   (toutes les 15 min) les ingère dans `diffusions_confirmees` (≈ 10 000 lignes).

> **`grille` dit ce qui est PRÉVU. `diffusions_confirmees` dit ce qui a été
> DIFFUSÉ.** Tout rapport à un partenaire doit se fonder sur la seconde.

### d. Le site

10. Michael bascule la vidéo en **public** sur YouTube.
11. Le site se reconstruit toutes les deux heures (et à chaque envoi). Il lit la
    chaîne par l'API YouTube — **les vidéos privées sont écartées dès la
    lecture**, elles n'entrent jamais dans le catalogue. Cache : 45 minutes.
    Il produit 1 293 pages, la grille télé, les fiches d'invités, la recherche,
    les vignettes Instagram et la fiche du soir.
12. La grille du site vient d'un export de la régie déposé dans
    `site_repo/data/grille.json` et poussé par le pipeline.

### e. La communication

13. **Publication de la vidéo sur Instagram** : le site fabrique une vignette
    4:5 et écrit la légende dans `dist/insta/manifest.json` ; un workflow
    déclenché par la **réussite du déploiement** publie (l'image doit être en
    ligne avant que Meta aille la chercher).
14. **Affiche du soir** : tous les jours vers 16 h, heure d'Israël. Elle annonce
    les programmes à heure fixe de la soirée, avec le logo de chaque émission et
    le nom du chroniqueur. Annoncer un horaire n'est pas reprendre un contenu :
    c'est ce qui permet d'y faire figurer les partenaires sans leur accord.
15. **Reels** : `reels_pipeline.py`, toutes les heures. Transcription (Whisper
    `medium`), choix de l'extrait par un modèle parmi des candidats calculés,
    rendu vertical avec suivi du visage, hébergement en pièce jointe de version
    GitHub, publication par workflow. Une publication au plus par passage, trois
    heures entre deux, **et jamais avant que la vidéo soit publique sur YouTube**.
16. **Lettre hebdomadaire** : vendredi 10 h, heure d'Israël, par Kit.
17. **Teasers quotidiens** : chaque midi, un teaser vidéo de ~12 s pour le 20 h
    et le 22 h du jour — possible seulement parce que ces créneaux sont déjà
    verrouillés.

---

## 3. Les tâches programmées

Sur le Mac, dix-huit tâches `launchd`. Les principales :

| Tâche | Rythme | Ce qu'elle fait |
|---|---|---|
| `tandemservice` | permanent | Le poste de commande |
| `downloaderservice` | permanent | Téléchargements |
| `watchgrillelive` | permanent | Grille live reflétant OBS |
| `autoreload` | 60 s | Redémarre le service s'il tombe |
| `trierexports` | 600 s | Exports → Annatel + brouillon YouTube |
| `backfillfilehashes` | 600 s | Empreintes des fichiers |
| `retryhealthreport` | 600 s | Rapports de santé en échec |
| `playlistgenerator` | 900 s | Génère la grille, pousse sur GitHub |
| `ingererconfirmations` | 900 s | Fichiers confirmés présents sur Annatel |
| `ingererdiffusionsconfirmees` | 900 s | Diffusions réellement constatées |
| `refreshgrilledynamicslots` | 900 s | Créneaux dynamiques |
| `partnerdashboard` | 900 s | Tableau de bord partenaires |
| `reels` | 3600 s | Chaîne des Reels |
| `dailyteasers` | 12 h 00 | Teasers du soir |
| `dailyhealthreport` | 07 h 00 | Rapport de santé |
| `partnersummaryemail` | 07 h 10 | Résumé aux partenaires |
| `backupcheck` | 09 h 00 | Fraîcheur des sauvegardes |
| `backuplight` | 03 h 00 | Sauvegarde |

Sur GitHub, neuf workflows : déploiement du site (toutes les 2 h), affiche du
soir (16 h Israël), lettre (vendredi 10 h), Reel, publication de vidéo après
déploiement, archivage de la grille, rapport d'audience, essais.

---

## 4. La base

`database/sqlite/tandemstudio.db` — 15 Mo.

| Table | Lignes | Contenu |
|---|---|---|
| `videos` | 844 | Le catalogue de production |
| `grille` | 20 958 | Ce qui est prévu |
| `diffusions_confirmees` | 10 148 | Ce qui a été diffusé |
| `files` | 571 | Fichiers, empreintes, dimensions |
| `annatel_confirmations` | 556 | Fichiers présents sur Annatel |
| `workflow_events` | 4 702 | Journal des opérations |
| `partners` | 4 | Partenaires |

Deux vues : `videos_complet` (844) et **`videos_diffusables`** (559) — c'est
cette dernière que lit la chaîne des Reels.

**Piège connu :** la colonne `title` contient le **nom du fichier de tournage**
(« 20260808 Inv WZ Sabrina Medjebeur »). Le vrai titre, celui qui part sur
YouTube, est dans **`title_override`**. Toute comparaison avec le monde
extérieur doit utiliser `title_override`.

---

## 5. Les règles inviolables

Elles ne sont pas des préférences. Chacune vient d'un incident réel.

1. **Aucun jeton ne descend jamais sur le Mac.** Les secrets YouTube et
   Instagram vivent dans GitHub. Le Mac déclenche un workflow, il ne publie pas.
2. **Jamais d'écriture directe dans la base réelle.** Le motif est constant :
   sauvegarde horodatée → copie sandbox → vérification (`integrity_check`,
   comptages) → bascule atomique → re-vérification → journal. Toujours un
   `--dry-run` disponible.
3. **La base fait autorité, jamais le disque.** Un fichier sans confirmation en
   base ne part pas vers Annatel.
4. **Rien n'est programmé sans confirmation de présence sur Annatel.**
5. **Rien n'est publié avant que la vidéo soit publique sur YouTube.** En cas de
   doute, ou si le site est injoignable : non.
6. **La mémoire des publications, c'est la plateforme elle-même** — on demande à
   Instagram ce qu'il a publié, on ne tient pas de fichier qui dériverait.
   Corollaire appris le 9 août : ne jamais inscrire « publié » au déclenchement,
   seulement à la réussite.
7. **Jamais le logo Tandem TV sur l'émission d'un tiers.**
8. **Aucun Reel tiré d'un programme partenaire** sans accord écrit. Le mécanisme
   est prêt (`PARTENAIRES_AUTORISES`), il est vide.
9. **`tandem_tv_2` est le compte Instagram principal. Il ne doit jamais être
   bloqué.** Meta freine un compte après des erreurs répétées, même légitimes.
10. **Jamais d'heure ronde dans les crons GitHub** — ils y sont retardés ou
    annulés. Et deux déclenchements pour l'heure d'été d'Israël, avec un contrôle
    de l'heure locale dans le script, sur une **fenêtre** et non une égalité.
11. **`cancel-in-progress: false`** sur le workflow Pages.

---

## 6. Points de fragilité

- **Syncthing** est le seul lien Mac ↔ Annatel. S'il s'arrête, plus rien ne
  passe, et le seul signe est une grille qui cesse de se renouveler.
- **Le SSD** est débranché régulièrement. Le service le gère, mais tout s'arrête.
- **La régie n'exporte que trois jours** de grille vers le site.
- **Onze diffusions** de la grille ne trouvent pas leur vidéo sur le site.
- **Quatre actions GitHub** tournent encore sur Node 20, supprimé à l'automne.
- **Le rapprochement par titre** entre la base et le site est solide mais reste
  du texte : un titre retouché dans YouTube Studio peut le rompre.
- **Les collaborations Instagram** exigent un compte professionnel chez
  l'invité ; sinon Meta refuse la publication entière.

---

## 7. Ce que le système ne fait pas

- **Publier dans un groupe Facebook** : impossible depuis le 22 avril 2024, Meta
  a supprimé l'API des groupes. Une **page** reste publiable.
- **Poser un lien sur une story Instagram** : aucun sticker n'est autorisé par
  l'API. Le site fabrique l'image, un humain la publie.
- **Diffuser la chaîne en direct sur le site** : écarté par Michael.
- **Inventer un texte sur une personne ou une émission.** Le site n'affirme rien
  qui ne soit déductible du catalogue ou écrit à la main.
