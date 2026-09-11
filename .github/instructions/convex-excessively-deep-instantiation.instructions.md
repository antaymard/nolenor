# Convex excessively deep instantiation (focused)

Objectif: limiter la complexité de types et éviter les cycles d'import.

## Couches

- `schemas/`: contrats + validateurs + types, sans import `_generated/api`.
- `model/`: logique métier pure, peut utiliser `ctx`/`ctx.db`, sans `api/internal/components`.
- `convex/*.ts` (wrappers): auth + validation + orchestration légère.
- `convex/ia/tools/*`: closures paramétrées par refs passées depuis l'assemblage, pas d'import direct `_generated/api`.

## Règles

- Dépendances unidirectionnelles, pas de cycles.
- Éviter `anyApi`.
- Vérifier avec `yarn convex codegen` après changements structurels.
