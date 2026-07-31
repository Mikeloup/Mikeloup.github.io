#!/bin/bash
# -----------------------------------------------------------------------------
# Transcription des émissions Tandem TV, sur votre Mac, sans rien payer.
#
#   1. Déposez vos fichiers audio ou vidéo dans un dossier.
#   2. Double-cliquez sur ce fichier.
#   3. Glissez le dossier dans la fenêtre du Terminal quand il vous le demande.
#
# Les transcriptions sortent en .srt à côté des fichiers d'origine. Il ne reste
# qu'à les déposer dans data/transcriptions/ du site.
#
# Ce script n'envoie rien sur Internet : tout est calculé sur votre machine.
# -----------------------------------------------------------------------------

set -u
cd "$(dirname "$0")"

MODELE="${MODELE:-large-v3}"
LANGUE="fr"

echo
echo "──────────────────────────────────────────────────────────"
echo "  Transcription Tandem TV"
echo "──────────────────────────────────────────────────────────"
echo

# --- 1. Homebrew -------------------------------------------------------------
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew n'est pas installé. C'est le gestionnaire de logiciels de macOS,"
  echo "gratuit et très répandu. Sans lui, ce script ne peut pas continuer."
  echo
  echo "Pour l'installer, copiez cette ligne dans le Terminal et validez :"
  echo
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  echo
  echo "Puis relancez ce script."
  read -r -p "Appuyez sur Entrée pour fermer."
  exit 1
fi

# --- 2. whisper-cpp et ffmpeg ------------------------------------------------
for outil in whisper-cpp ffmpeg; do
  if ! command -v "$outil" >/dev/null 2>&1; then
    echo "Installation de $outil (une seule fois)…"
    brew install "$outil" || { echo "Échec de l'installation de $outil."; read -r -p "Entrée pour fermer."; exit 1; }
  fi
done

# --- 3. Le modèle ------------------------------------------------------------
DOSSIER_MODELES="$HOME/.cache/whisper-tandem"
mkdir -p "$DOSSIER_MODELES"
FICHIER_MODELE="$DOSSIER_MODELES/ggml-$MODELE.bin"
if [ ! -f "$FICHIER_MODELE" ]; then
  echo "Téléchargement du modèle $MODELE (environ 3 Go, une seule fois)…"
  curl -L --fail -o "$FICHIER_MODELE" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODELE.bin" \
    || { echo "Téléchargement impossible."; rm -f "$FICHIER_MODELE"; read -r -p "Entrée pour fermer."; exit 1; }
fi

# --- 4. Le vocabulaire de la chaîne -----------------------------------------
# On souffle à Whisper les noms propres qu'il ne peut pas deviner : Tsahal,
# Hezbollah, Téhéran, et ceux de vos chroniqueurs. C'est ce qui fait la
# différence entre « le resbola » et « le Hezbollah ».
LEXIQUE="../data/lexique-transcription.json"
AMORCE=""
if [ -f "$LEXIQUE" ]; then
  AMORCE=$(python3 -c "import json; print(json.load(open('$LEXIQUE')).get('amorce',''))" 2>/dev/null || echo "")
fi
[ -n "$AMORCE" ] && echo "Vocabulaire de la chaîne chargé (${#AMORCE} caractères)."

# --- 5. Le dossier à traiter -------------------------------------------------
echo
echo "Glissez ici le dossier contenant vos fichiers, puis appuyez sur Entrée :"
read -r DOSSIER
DOSSIER="${DOSSIER%\"}"; DOSSIER="${DOSSIER#\"}"
DOSSIER="${DOSSIER%\'}"; DOSSIER="${DOSSIER#\'}"
DOSSIER="$(echo "$DOSSIER" | sed 's/[[:space:]]*$//')"
if [ ! -d "$DOSSIER" ]; then
  echo "Dossier introuvable : $DOSSIER"
  read -r -p "Entrée pour fermer."; exit 1
fi

# --- 6. Transcription --------------------------------------------------------
total=0; faits=0; debut=$(date +%s)
while IFS= read -r -d '' f; do total=$((total+1)); done < <(
  find "$DOSSIER" -maxdepth 1 -type f \
    \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.m4v' -o -iname '*.mkv' \
       -o -iname '*.mp3' -o -iname '*.m4a' -o -iname '*.wav' -o -iname '*.aac' \) -print0)

echo
echo "$total fichier(s) à traiter. Comptez à peu près la durée de la vidéo elle-même."
echo "Vous pouvez laisser tourner et fermer l'écran : le Mac continue."
echo

while IFS= read -r -d '' f; do
  base="${f%.*}"
  if [ -f "$base.srt" ]; then
    echo "· déjà fait : $(basename "$base")"
    faits=$((faits+1)); continue
  fi
  echo "▸ $(basename "$f")"
  # Whisper veut du 16 kHz mono : ffmpeg s'en charge, sans réencoder la vidéo.
  ffmpeg -nostdin -loglevel error -y -i "$f" -vn -ac 1 -ar 16000 -f wav "/tmp/tandem-audio.wav" \
    || { echo "  son illisible, ignoré."; continue; }
  whisper-cpp -m "$FICHIER_MODELE" -f "/tmp/tandem-audio.wav" \
    -l "$LANGUE" --output-srt --output-file "$base" \
    ${AMORCE:+--prompt "$AMORCE"} \
    --print-progress 2>&1 | grep -Ei "progress|error" | tail -3
  faits=$((faits+1))
  echo "  → $(basename "$base").srt"
done < <(
  find "$DOSSIER" -maxdepth 1 -type f \
    \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.m4v' -o -iname '*.mkv' \
       -o -iname '*.mp3' -o -iname '*.m4a' -o -iname '*.wav' -o -iname '*.aac' \) -print0)

rm -f /tmp/tandem-audio.wav
duree=$(( $(date +%s) - debut ))
echo
echo "──────────────────────────────────────────────────────────"
echo "  $faits fichier(s) traité(s) en $((duree/60)) minutes."
echo "  Les .srt sont à côté de vos fichiers, dans $DOSSIER"
echo "  Déposez-les dans data/transcriptions/ du site."
echo "──────────────────────────────────────────────────────────"
read -r -p "Appuyez sur Entrée pour fermer."
