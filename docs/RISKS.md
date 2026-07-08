# Points de risque (à valider en priorité)

Ce document détaille les deux briques qui conditionnent tout le reste (spec §5),
et l'approche retenue pour ce scaffold initial.

## 1. Source de transcription

Trois options, aucune n'est activée par défaut — le choix dépend d'un arbitrage
légal/coût que le produit doit trancher avant le lancement :

| Option | Avantage | Risque |
|---|---|---|
| Sous-titres déjà présents dans la page YouTube (`timedtext`) | Gratuit, déjà là | Zone grise CGU YouTube pour un usage commercial ; qualité variable (auto-générés) ; absent sur beaucoup de vidéos |
| STT maison (Whisper self-hosted / API) | Contrôle total, marche sur tout contenu audio | Coût de calcul, latence, pas de garantie de citation/horodatage mot-à-mot fiable sans alignement forcé |
| Fournisseur tiers commercial (ex. AssemblyAI, Deepgram) | Usage commercial autorisé contractuellement, mots horodatés | Coût récurrent par minute transcrite |

**Ce que fait ce scaffold** : `apps/web/src/lib/transcription/provider.ts` définit une
interface `TranscriptionProvider` unique, avec une implémentation `youtubeCaptions`
(extension, best-effort, à ne pas considérer comme validée commercialement) et un
stub `manualTranscript` (l'utilisateur colle sa transcription — utilisé pour la démo
web app podcast). Brancher un vrai fournisseur STT = implémenter l'interface, sans
toucher au reste du produit.

## 2. Synchronisation mot-clé / audio

Les sous-titres YouTube (et la plupart des STT) donnent un horodatage **par cue**
(bloc de plusieurs mots), pas par mot. Afficher le mot juste "au moment où il est
prononcé" demande soit :
- un alignement forcé (forced alignment, ex. modèle type Montreal Forced Aligner /
  whisper avec `word_timestamps`) qui donne un timestamp par mot,
- soit une distribution approximative du temps de la cue sur ses mots (ce que fait
  ce scaffold en MVP : `estimateWordTimings` répartit linéairement le temps d'une
  cue entre ses mots — imprécis mais raisonnable pour un débit de parole régulier).

**Ce que fait ce scaffold** : le contrat `KeywordCue.startSeconds` est déjà présent
dans le schéma et le type partagé, avec une implémentation approximative
(interpolation linéaire dans la cue). C'est le premier point à remplacer par un
vrai alignement mot-à-mot avant un lancement public — sinon l'overlay "bluffant"
promis par la spec risque d'être "en retard/en avance" et frustrant.

## Recommandation

Avant d'investir dans les fonctionnalités avancées (sous-titres à trous, réécoute
active), valider sur 5-10 vidéos réelles :
1. Le taux de vidéos avec sous-titres YouTube exploitables (langue cible, non
   auto-générés si possible).
2. La précision perçue de l'overlay avec l'interpolation linéaire actuelle —
   si elle est jugée insuffisante, budgétiser un forced-aligner avant la suite.
