from PIL import Image, ImageFilter
U='/root/.claude/uploads/72f39b20-d8f1-5d27-a77f-986f1c83528b/'
W,H=960,540
OEIL, TETE = 0.45, 0.62        # normes de la serie

def composer(sujet, largeur, y0, fond=None, plume=90):
    h=round(sujet.height*largeur/sujet.width)
    s=sujet.resize((largeur,h), Image.LANCZOS)
    alpha = s.getchannel('A') if s.mode == 'RGBA' else None
    s = s.convert('RGB')
    if fond is None:
        f=sujet.resize((W, round(sujet.height*W/sujet.width)), Image.LANCZOS)
        haut=max(0,(f.height-H)//3)
        fond=f.crop((0,haut,W,haut+H)).filter(ImageFilter.GaussianBlur(40))
    fond=fond.copy()
    m = alpha.copy() if alpha is not None else Image.new('L', s.size, 255)
    px=m.load()
    pl=min(plume, largeur//2)
    for x in range(pl):
        v=round(255*x/pl)
        for y in range(s.height): px[x,y]=v; px[largeur-1-x,y]=v
    fond.paste(s, ((W-largeur)//2, y0), m)
    return fond

def cadrer(sujet, oeil_src, tete_src, menton_src, fond=None, plume=90):
    """Place le sujet pour que les yeux tombent a 45 % et que la tete mesure
    58 % de la hauteur. oeil/tete/menton sont donnes dans les coordonnees du
    sujet fourni."""
    k = (TETE*H) / (menton_src - tete_src)
    largeur = round(sujet.width * k)
    y0 = round(OEIL*H - oeil_src*k)
    return composer(sujet, largeur, y0, fond, plume)

gris = Image.new('RGB',(W,H)); px=gris.load()
for y in range(H):
    v=round(136+(120-136)*(y/(H-1)))
    for x in range(W): px[x,y]=(v,v,v)

# --- Sujets, avec les reperes releves sur chaque source ---------------------
src=Image.open(U+'e4cf5b54-William_photo_teaserdetouree.png').convert('RGBA')
w=src.crop(src.getchannel('A').getbbox())          # 392 x 554
navy=Image.new('RGB',(W,H),(24,0,88))
cadrer(w, oeil_src=118, tete_src=35, menton_src=210, fond=navy, plume=0)\
  .save('assets/visages/william-zerbib.jpg', quality=88, optimize=True)

src=Image.open(U+'dcb47597-pq_goldin.png').convert('RGB')
cadrer(src.crop((0,18,470,700)), oeil_src=222, tete_src=20, menton_src=316)\
  .save('assets/visages/stephane-goldin.jpg', quality=88, optimize=True)

src=Image.open(U+'7089a05b-WhatsApp_Image_20260611_at_19.27.52.jpeg').convert('RGB')
cadrer(src.crop((393,228,971,900)), oeil_src=128, tete_src=7, menton_src=277)\
  .save('assets/visages/rony-akrich.jpg', quality=88, optimize=True)

src=Image.open(U+'702f4c2e-photo_de_Jerome.jpg').convert('RGB')
img=cadrer(src.crop((1360,8,1870,700)), oeil_src=236, tete_src=90, menton_src=330, fond=gris, plume=110)
p=img.load()
for y in range(H):
    v=round(136+(120-136)*(y/(H-1)))
    for x in range(W):
        r,g,b=p[x,y]
        if r>g+45 and b>g+25 and r>110: p[x,y]=(v,v,v)
img.save('assets/visages/jerome-haas.jpg', quality=88, optimize=True)

# Rony Hayot : son fond est un mur uni. On le prolonge par un aplat de la meme
# couleur plutot que par un flou etire, qui rendait la peripherie moutonneuse.
src=Image.open(U+'a387d2ff-rony_hayot.jpeg').convert('RGB')
coin = src.crop((0,0,60,200)).resize((1,1), Image.LANCZOS).getpixel((0,0))
cadrer(src, oeil_src=215, tete_src=25, menton_src=395,
       fond=Image.new('RGB',(W,H),coin))\
  .save('assets/visages/rony-hayot.jpg', quality=88, optimize=True)

src=Image.open(U+'1a3de936-MD_vignette.jpg').convert('RGB')
cadrer(src.crop((330,150,1500,900)), oeil_src=318, tete_src=78, menton_src=470)\
  .save('assets/visages/myriam-danan.jpg', quality=88, optimize=True)

src=Image.open(U+'cbe31bec-RICHARDDARMONReport2.jpg').convert('RGB')
cadrer(src.crop((0,0,600,760)), oeil_src=232, tete_src=60, menton_src=372)\
  .save('assets/visages/richard-darmon.jpg', quality=88, optimize=True)
print('sept visages recadres')
