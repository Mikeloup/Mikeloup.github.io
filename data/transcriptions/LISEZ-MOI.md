# Transcriptions

Déposez ici un fichier par vidéo, nommé avec l'identifiant YouTube de la vidéo —
les 11 caractères qui suivent `watch?v=` dans son adresse.

    data/transcriptions/auSdfke2w8k.srt
    data/transcriptions/zriHCRGsar0.txt

Trois formats sont acceptés : **.srt**, **.vtt** et **.txt**. Ce sont ceux que
produisent tous les outils Whisper. Les `.srt` et `.vtt` sont préférables : ils
contiennent les minutages, et la transcription affichée sur le site devient
alors cliquable — un clic sur un horodatage lance la vidéo à cet endroit.

Une vidéo sans fichier ici n'affiche simplement pas de transcription. Rien à
configurer, rien à déclarer ailleurs.

Les fautes de la reconnaissance vocale se corrigent dans
`data/lexique-transcription.json`, une fois pour toutes les vidéos.
