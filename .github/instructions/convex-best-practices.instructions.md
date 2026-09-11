# Convex best practices (delta)

Ce fichier ne contient que des rappels pratiques non redondants avec `convex.instructions.md`.

- Toujours `await` les appels `ctx.db`, `ctx.scheduler`, `ctx.run*` (`no-floating-promises`).
- Vérifier les index redondants: un index préfixe peut rendre un autre inutile.
- Pour les gros traitements, batcher (`take`/pagination + relance scheduler) plutôt qu'un traitement monolithique.
- Préférer des fonctions publiques granulaires pour simplifier l'autorisation.
- Dans les actions, éviter des séquences longues de `runQuery`/`runMutation` si une logique locale/helper suffit.
