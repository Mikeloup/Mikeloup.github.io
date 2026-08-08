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


def vignette(source, titre, sous_titre, logo, rubrique='', presentateur=''):
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
    # Le chroniqueur, sous le nom de l'emission. Jamais ecrit quand son nom est
    # deja dans celui de la rubrique : c'est le site qui filtre, pas ce script.
    if presentateur:
        d.text((62, y_titre - 8), presentateur, font=police(30, gras=False),
               fill=(232, 228, 248))
        y_titre += 44

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
DISQUE = 170                    # diametre du logo de chaque emission
COLONNE = 60 + DISQUE + 40      # ou commence le texte, a droite du logo


def _rond(image, taille):
    """Decoupe une image en disque, avec un bord net.

    Le masque est dessine quatre fois trop grand puis reduit : PIL ne lisse pas
    les ellipses, et un cercle trace a la taille finale a des escaliers visibles
    sur un fond sombre.
    """
    r = max(taille / image.width, taille / image.height)
    im = image.convert('RGB').resize(
        (max(1, int(image.width * r)), max(1, int(image.height * r))), Image.LANCZOS)
    gx, gy = (im.width - taille) // 2, (im.height - taille) // 2
    im = im.crop((gx, gy, gx + taille, gy + taille))

    masque = Image.new('L', (taille * 4, taille * 4), 0)
    ImageDraw.Draw(masque).ellipse([0, 0, taille * 4 - 1, taille * 4 - 1], fill=255)
    im.putalpha(masque.resize((taille, taille), Image.LANCZOS))
    return im


def _logo_maison(logo, taille):
    """Le logo de la chaine, pose sur un disque blanc.

    Sur fond blanc plutot que sur le bleu de l'affiche : le mot « TANDEM » est
    ecrit en bleu nuit dans le logo, il disparaitrait sur un disque sombre.
    """
    fond = Image.new('RGB', (taille, taille), (255, 255, 255))
    if logo is not None:
        w = int(taille * 0.80)
        petit = logo.resize((w, max(1, int(logo.height * w / logo.width))), Image.LANCZOS)
        fond.paste(petit, ((taille - w) // 2, (taille - petit.height) // 2), petit)
    return _rond(fond, taille)


# Les logos distants ne changent pas d'une execution a l'autre : on ne les
# telecharge qu'une fois par construction.
_cache_logos = {}


def _initiales(nom, taille):
    """Pastille de repli pour un programme dont on n'a aucun logo.

    Surtout pas le logo Tandem TV : poser notre marque sur l'emission d'un
    partenaire reviendrait a nous l'attribuer. Deux lettres neutres disent la
    meme chose sans rien affirmer de faux.
    """
    mots = [m for m in str(nom or '').replace('-', ' ').split() if len(m) > 2]
    texte = ''.join(m[0] for m in mots[:2]).upper() or '·'
    fond = Image.new('RGB', (taille, taille), (58, 34, 130))
    d = ImageDraw.Draw(fond)
    f = police(int(taille * 0.42))
    b = d.textbbox((0, 0), texte, font=f)
    d.text(((taille - b[2] + b[0]) / 2 - b[0], (taille - b[3] + b[1]) / 2 - b[1]),
           texte, font=f, fill=(190, 200, 240))
    return _rond(fond, taille)


def logo_emission(adresse, logo, taille=DISQUE, maison=True, nom=''):
    """Le logo d'un programme : avatar YouTube, image du site, ou repli."""
    adresse = (adresse or '').strip()
    if not adresse:
        return _logo_maison(logo, taille) if maison else _initiales(nom, taille)
    if adresse in _cache_logos:
        source = _cache_logos[adresse]
    elif adresse.startswith('http'):
        source = telecharger(adresse)
        _cache_logos[adresse] = source
    else:
        chemin = os.path.join(RACINE, adresse.lstrip('/'))
        source = Image.open(chemin).convert('RGB') if os.path.exists(chemin) else None
        _cache_logos[adresse] = source
    if source is None:
        return _logo_maison(logo, taille) if maison else _initiales(nom, taille)
    return _rond(source, taille)


def dessiner_ce_soir(fiche, logo):
    """L'affiche du soir : ce qui passe a 20 h et a 22 h sur le canal 14.

    Aucune image du programme lui-meme : on annonce un horaire, on ne reprend
    le contenu de personne. C'est ce qui permet d'y faire figurer les emissions
    des partenaires sans leur demander quoi que ce soit. En revanche chaque
    ligne porte le LOGO de l'emission — l'avatar public de la chaine, ou le
    portrait de celui qui la tient : c'est une identification, pas une reprise,
    et c'est ce qui rend l'affiche lisible d'un coup d'oeil dans un fil.
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

    lignes = fiche.get('lignes', [])[:3]
    haut, bas = 400, H - 150
    largeur = L - COLONNE - 60

    # Deux passes : on mesure d'abord la hauteur de chaque bloc, puis on repartit
    # l'espace restant entre eux. Un titre long ne doit pas pousser la derniere
    # emission hors de l'image — c'est arrive avec l'ancienne mise en page, qui
    # empilait a l'aveugle.
    f_heure, f_rubrique = police(50), police(42)
    f_par = police(32, gras=False)
    f_titre, f_adresse = police(28, gras=False), police(28)
    blocs, total = [], 0
    for essai in (2, 1, 0):
        blocs, total = [], 0
        for ligne in lignes:
            noms = decouper(ligne.get('rubrique', ''), f_rubrique, d, largeur)[:2]
            # Le chroniqueur, sous le nom de l'emission : c'est lui que le
            # public suit, et le nommer est la moindre des choses.
            par = decouper((ligne.get('presentateur') or '').strip(), f_par, d, largeur)[:2] \
                if (ligne.get('presentateur') or '').strip() else []
            titre = (ligne.get('titre') or '').strip()
            morceaux = decouper(titre, f_titre, d, largeur)[:essai] if (titre and essai) else []
            adresse = ('@' + ligne['compte']) if ligne.get('compte') else ligne.get('url', '')
            hauteur = max(DISQUE,
                          58 + len(noms) * 50 + len(par) * 42
                          + len(morceaux) * 38 + (44 if adresse else 0))
            blocs.append((ligne, noms, par, morceaux, adresse, hauteur))
            total += hauteur
        if total + 70 * max(0, len(blocs) - 1) <= bas - haut:
            break

    # Un soir a deux programmes laisserait sans cela un tiers d'image vide en
    # bas : on aere les blocs, puis on centre l'ensemble dans la zone libre.
    reste = (bas - haut) - total
    ecart = int(max(60, min(160, reste / (len(blocs) - 1)))) if len(blocs) > 1 else 0
    hauteur_totale = total + ecart * max(0, len(blocs) - 1)
    y = haut + max(0, (bas - haut - hauteur_totale)) // 2
    for n, (ligne, noms, par, morceaux, adresse, hauteur) in enumerate(blocs):
        if n:
            d.rectangle([60, y - ecart // 2, L - 60, y - ecart // 2 + 2], fill=(70, 55, 130))

        rond = logo_emission(ligne.get('image', ''), logo,
                             maison=bool(ligne.get('maison', True)),
                             nom=ligne.get('rubrique', ''))
        img.paste(rond, (60, y), rond)

        d.text((COLONNE, y - 4), ligne.get('heure', ''), font=f_heure, fill=BLEU_PIED)
        yy = y + 58
        for texte in noms:
            d.text((COLONNE, yy), texte, font=f_rubrique, fill=(255, 255, 255))
            yy += 50
        for texte in par:
            d.text((COLONNE, yy), texte, font=f_par, fill=(232, 228, 248))
            yy += 42
        for texte in morceaux:
            d.text((COLONNE, yy), texte, font=f_titre, fill=(168, 163, 205))
            yy += 38
        if adresse:
            d.text((COLONNE, yy + 4), adresse, font=f_adresse, fill=BLEU_PIED)
        y += hauteur + ecart

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
                 e.get('rubrique', ''), e.get('presentateur', '')
                 ).save(sortie, quality=88, optimize=True)
        faites += 1

    fabriquer_ce_soir(logo)

    print(f'vignette-insta : {faites} vignette(s) produite(s)'
          + (f', {ratees} miniature(s) introuvable(s)' if ratees else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
