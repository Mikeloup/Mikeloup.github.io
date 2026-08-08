#!/usr/bin/env python3
"""
tools/vignette-insta.py

Fabrique les vignettes 4:5 destinees a Instagram, une par video recente.

POURQUOI CE FICHIER EXISTE
--------------------------
Une miniature YouTube est en 16/9. Instagram l'accepte, mais la rogne a
gauche et a droite dans la grille du profil : les titres ecrits sur les bords
disparaissent, et le compte prend un air neglige. Constate en vrai le 7 aout
2026 sur la premiere publication automatique — « ORTHODOXES : LE GRAND
MENSONGE » y apparaissait comme « ...ODOXES ...AND ...ONGE ».

La solution retenue (validee par Michael) : ne jamais recadrer la miniature.
On la pose entiere, en 1080 de large, sur un fond fabrique a partir d'elle-
meme — la meme image agrandie, floutee et assombrie. Aucune information
perdue, aucun aplat vide, et chaque publication porte les couleurs de sa
propre video. Le titre est reecrit dessous, dans la zone que la grille ne
rogne jamais.

ENTREE  : dist/insta/manifest.json, ecrit par build.mjs
          [{ "id": "...", "titre": "...", "image": "https://i.ytimg.com/..." }]
SORTIE  : dist/insta/<id>.jpg (1080x1350)

Ce script ne publie rien. Il ne fait que produire des fichiers, qui seront
mis en ligne avec le site. La publication, elle, se fait dans build.mjs et
n'utilise une vignette que lorsqu'elle est deja en ligne.

PREREQUIS : Pillow (pip install pillow).
"""

import json
import os
import sys
import textwrap
import urllib.request
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont, ImageFilter

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER = os.path.join(RACINE, 'dist', 'insta')
MANIFESTE = os.path.join(DOSSIER, 'manifest.json')

L, H = 1080, 1350
ROUGE = (200, 16, 46)          # filet editorial, meme rouge que le site
BLEU_PIED = (150, 190, 255)

POLICES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans{}.ttf',
    '/System/Library/Fonts/Supplemental/DejaVuSans{}.ttf',
]


def police(taille, gras=True):
    suffixe = '-Bold' if gras else ''
    for modele in POLICES:
        chemin = modele.format(suffixe)
        if os.path.exists(chemin):
            return ImageFont.truetype(chemin, taille)
    return ImageFont.load_default()


def telecharger(url):
    """La miniature « maxres » n'existe pas pour toutes les videos : YouTube
    rend alors une erreur 404, et il faut se rabattre sur la resolution
    inferieure. Silencieux : une vignette manquante n'est pas un incident."""
    candidats = [url]
    if 'maxresdefault' in url:
        candidats.append(url.replace('maxresdefault', 'hqdefault'))
    for u in candidats:
        try:
            with urllib.request.urlopen(u, timeout=20) as r:
                return Image.open(BytesIO(r.read())).convert('RGB')
        except Exception:
            continue
    return None


def vignette(source, titre, sous_titre, logo, rubrique=''):
    # Fond : la miniature elle-meme, agrandie, floutee, assombrie.
    r = max(L / source.width, H / source.height) * 1.15
    fond = source.resize((int(source.width * r), int(source.height * r)), Image.LANCZOS)
    fond = fond.filter(ImageFilter.GaussianBlur(38))
    gx, gy = (fond.width - L) // 2, (fond.height - H) // 2
    fond = fond.crop((gx, gy, gx + L, gy + H))
    fond = Image.blend(fond, Image.new('RGB', (L, H), (10, 4, 40)), 0.42)

    img = fond
    d = ImageDraw.Draw(img)

    # La miniature, entiere, jamais recadree. Posee haut : le bandeau superieur
    # n'est qu'une signature, pas un decor — un grand aplat flou au-dessus de
    # l'image faisait « vide » plutot que « respiration ».
    vh = int(L * source.height / source.width)
    vy = 215
    img.paste(source.resize((L, vh), Image.LANCZOS), (0, vy))
    d.rectangle([0, vy + vh, L, vy + vh + 7], fill=ROUGE)

    if logo is not None:
        lw = 250
        lg = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
        img.paste(lg, (60, 48), lg)

    # Nom de l'emission, en surtitre. Il n'est jamais ecrit sur la miniature —
    # c'est donc la seule information reellement ajoutee par cette vignette.
    y_titre = vy + vh + 60
    if rubrique:
        d.text((62, y_titre), rubrique.upper(), font=police(30), fill=BLEU_PIED)
        y_titre += 52

    # Titre : la police retrecit jusqu'a ce que le bloc tienne dans la place
    # disponible, plutot que de tronquer — un titre coupe au milieu d'un mot
    # fait amateur, et deborder sur le pied de page fait pire encore.
    haut = y_titre
    dispo = (H - 150) - haut
    lignes, f, interligne = [titre], police(62), 79
    for taille in (62, 56, 50, 44, 38):
        f = police(taille)
        interligne = int(taille * 1.28)
        essai = decouper(titre, f, d, L - 120)
        if len(essai) * interligne <= dispo:
            lignes = essai
            break
        lignes = essai[:max(1, dispo // interligne)]

    y = haut
    for ligne in lignes:
        d.text((60, y), ligne, font=f, fill=(255, 255, 255))
        y += interligne

    d.text((60, H - 95), sous_titre, font=police(30, gras=False), fill=BLEU_PIED)
    return img


def decouper(texte, fonte, dessin, largeur_max):
    """Retour a la ligne mesure sur la vraie police, et non sur un nombre de
    caracteres : « Israël » et « MM » n'occupent pas la meme largeur."""
    mots, lignes, courante = texte.split(), [], ''
    for mot in mots:
        essai = (courante + ' ' + mot).strip()
        if dessin.textlength(essai, font=fonte) <= largeur_max or not courante:
            courante = essai
        else:
            lignes.append(courante)
            courante = mot
    if courante:
        lignes.append(courante)
    return lignes



# --- La fiche « ce soir » -----------------------------------------------------

FICHE = os.path.join(DOSSIER, 'ce-soir.json')
BRAND = (24, 0, 88)


def dessiner_ce_soir(fiche, logo):
    """L'affiche du soir : ce qui passe a 20 h et a 22 h sur le canal 14.

    Volontairement sobre et sans image de programme : on annonce un horaire,
    on ne reprend le contenu de personne. C'est ce qui permet d'y faire figurer
    les emissions des partenaires sans leur demander quoi que ce soit.
    """
    img = Image.new('RGB', (L, H), BRAND)
    d = ImageDraw.Draw(img)

    if logo is not None:
        lw = 250
        lg = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
        img.paste(lg, (60, 55), lg)

    d.text((60, 205), 'CE SOIR · CANAL 14', font=police(46), fill=(255, 255, 255))
    jour = fiche.get('date_lisible') or fiche.get('date', '')
    d.text((62, 268), jour, font=police(30, gras=False), fill=BLEU_PIED)
    d.rectangle([60, 325, L - 60, 332], fill=ROUGE)

    y = 400
    for n, ligne in enumerate(fiche.get('lignes', [])[:3]):
        if n:
            d.rectangle([60, y - 40, L - 60, y - 38], fill=(70, 55, 130))
        d.text((60, y), ligne.get('heure', ''), font=police(66), fill=BLEU_PIED)
        d.text((250, y + 8), ligne.get('rubrique', ''), font=police(40), fill=(255, 255, 255))
        yy = y + 70
        titre = (ligne.get('titre') or '').strip()
        if titre:
            for texte in decouper(titre, police(32, gras=False), d, L - 310)[:3]:
                d.text((250, yy), texte, font=police(32, gras=False), fill=(226, 222, 240))
                yy += 44
        adresse = ligne.get('compte') and '@' + ligne['compte'] or ligne.get('url', '')
        if adresse:
            d.text((250, yy + 4), adresse, font=police(28), fill=BLEU_PIED)
            yy += 46
        y = yy + 90

    d.text((60, H - 115), 'Bouquet Annatel TV  ·  tandemtv.net',
           font=police(30, gras=False), fill=BLEU_PIED)
    return img


def fabriquer_ce_soir(logo):
    if not os.path.exists(FICHE):
        return
    with open(FICHE, encoding='utf-8') as f:
        fiche = json.load(f)
    if not fiche.get('lignes'):
        return
    dessiner_ce_soir(fiche, logo).save(
        os.path.join(DOSSIER, 'ce-soir.jpg'), quality=90, optimize=True)
    print("vignette-insta : fiche « ce soir » produite "
          f"({len(fiche['lignes'])} programme(s)).")


def main():
    logo_seul = None
    chemin = os.path.join(RACINE, 'assets', 'logo.png')
    if os.path.exists(chemin):
        logo_seul = Image.open(chemin).convert('RGBA')
    if not os.path.exists(MANIFESTE):
        print('vignette-insta : aucun manifeste.')
        fabriquer_ce_soir(logo_seul)
        return 0

    with open(MANIFESTE, encoding='utf-8') as f:
        entrees = json.load(f)

    logo = None
    chemin_logo = os.path.join(RACINE, 'assets', 'logo.png')
    if os.path.exists(chemin_logo):
        logo = Image.open(chemin_logo).convert('RGBA')

    faites, ratees = 0, 0
    for e in entrees:
        sortie = os.path.join(DOSSIER, f"{e['id']}.jpg")
        if os.path.exists(sortie):
            continue
        source = telecharger(e.get('image', ''))
        if source is None:
            ratees += 1
            print(f"vignette-insta : miniature introuvable pour {e['id']}")
            continue
        vignette(source, e.get('titre', ''), e.get('pied', ''), logo,
                 e.get('rubrique', '')).save(sortie, quality=88, optimize=True)
        faites += 1

    fabriquer_ce_soir(logo)

    print(f'vignette-insta : {faites} vignette(s) produite(s)'
          + (f', {ratees} miniature(s) introuvable(s)' if ratees else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
