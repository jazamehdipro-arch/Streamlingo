# StreamLingo

Transforme n'importe quelle vidéo YouTube ou podcast en session d'apprentissage
de langue, sans jamais casser l'immersion. Voir la spec complète du produit
dans l'historique de conversation / issue liée ; ce dépôt contient le scaffold
technique initial.

## Structure

- `apps/web` — web app Next.js : onboarding, apprentissage podcast, banque de
  vocabulaire, flashcards (répétition espacée), et **toutes les routes API**
  (utilisées aussi par l'extension).
- `extension` — extension navigateur MV3 (Chrome/Firefox) : overlay de
  traduction sur YouTube, quiz, sous-titres à trous.
- `packages/shared` — types partagés, algorithme SM-2, filtrage par niveau CECR.
- `supabase/migrations` — schéma Postgres (profils, sources, segments,
  vocabulaire, répétition espacée, RLS).
- `docs/` — `ARCHITECTURE.md` (comment tout s'articule), `API.md` (contrat des
  routes backend), `RISKS.md` (les deux points de risque à valider en premier :
  source de transcription, synchronisation mot/audio).

## Démarrer

```bash
npm install
cp apps/web/.env.example apps/web/.env.local  # renseigner Supabase + Anthropic
npm run dev:web
```

Pour l'extension : voir `extension/README.md`.

## État actuel

Scaffold fonctionnel de bout en bout sur le chemin heureux (transcription
collée manuellement pour la web app, sous-titres YouTube pour l'extension —
voir `docs/RISKS.md` pour les limites connues). Pas encore production-ready :
pas de vrai fournisseur STT branché, alignement mot/audio approximatif,
pairing extension à durcir.

Testé en conditions réelles dans ce dépôt (Chromium local, sans clés
Supabase/Anthropic réelles) :
- L'extension se charge sans erreur (service worker, popup, options) —
  YouTube lui-même n'a pas pu être testé, bloqué par la politique réseau de
  l'environnement de build, pas par un bug du code.
- La web app démarre et sert toutes les pages ; un bug réel a été trouvé et
  corrigé (`/learn` restait bloqué sur "Loading…" au lieu d'afficher l'erreur
  quand `/api/profile` échoue).
- CI GitHub Actions (`.github/workflows/ci.yml`) build les deux workspaces à
  chaque push/PR pour éviter les régressions silencieuses.

Reste à faire avant un vrai lancement : provisionner un projet Supabase réel
et une clé Anthropic (aucun outil ne peut le faire à ma place — ce sont des
comptes/paiements qui appartiennent à l'utilisateur), puis tester
l'extension sur une vraie page YouTube.
