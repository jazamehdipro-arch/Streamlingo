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
