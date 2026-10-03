# Composant `debouncer`

Debounce/throttle côté serveur : regroupe les appels rapprochés sur une même
`(namespace, key)` en une seule exécution d'une mutation ou action de l'app.
Inspiré de [convex-debouncer](https://github.com/ikhrustalev/convex-debouncer),
réécrit pour les perfs, la robustesse et une API typée.

Client : `convex/lib/debouncer.ts`.

```ts
import { components, internal } from "../_generated/api";
import { Debouncer } from "../lib/debouncer";

const reindex = new Debouncer(
  components.debouncer,
  internal.monModule.recalculer, // cible : args typés
  { delay: 10_000, maxWait: 120_000 }, // mode "sliding" par défaut
);

// dans une mutation ou une action
await reindex.schedule(ctx, nodeDataId, { nodeDataId });
await reindex.flush(ctx, nodeDataId); // exécuter maintenant
await reindex.cancel(ctx, nodeDataId); // abandonner
await reindex.status(ctx, nodeDataId); // aussi depuis une query
```

## Modes

| mode | exécution | args |
| --- | --- | --- |
| `sliding` | `delay` après le dernier appel (au plus `maxWait` après le premier) | derniers |
| `fixed` | `delay` après le premier appel | derniers |
| `eager` | immédiate, puis au plus une fois par `delay` (traînante si appels pendant le cooldown) | derniers |

Le mode d'une fenêtre est figé par l'appel qui l'ouvre. Le `namespace` vaut par
défaut le nom de la fonction cible : deux `Debouncer` sur la même fonction
partagent leurs fenêtres, sauf `namespace` explicite.

## Écarts avec l'original

- **Perf (sliding)** : plus de `scheduler.cancel` + `runAfter` à chaque appel.
  Un appel ne fait que patcher `runAt` ; le timer, s'il se réveille trop tôt,
  se réarme sur la nouvelle échéance. Un burst de N appels = N petits patches.
- **Bug corrigé** : le handle de la fonction est remplacé avec les args (l'original
  exécutait l'ancienne fonction avec les nouveaux args).
- **Eager = vrai throttle** : l'exécution traînante ouvre un nouveau cooldown,
  au lieu de laisser un appel suivant ré-exécuter immédiatement.
- **Robustesse** : chaque timer porte une `generation` ; seul le dernier armé
  peut agir (timers en retard/doublons inoffensifs). Un handle devenu invalide
  ferme la fenêtre au lieu de faire échouer le timer ; une fenêtre dont le timer
  a disparu est réarmée au prochain appel au lieu de bloquer la clé.
- **API** : une instance par fonction cible (args typés via `FunctionArgs`),
  pas de hack sur le symbole interne `functionName` (`getFunctionName`), handle
  mis en cache, `maxWait`, `flush`, validation des durées, contextes minimaux
  (utilisable depuis une action).

La cible est toujours lancée via `scheduler.runAfter(0)` : elle tourne dans sa
propre transaction (son échec n'annule pas l'état du debouncer) et mutations
comme actions sont supportées.

## `_generated`

Les fichiers de `_generated/` suivent exactement le format de `npx convex dev`
et seront régénérés par lui ; à mettre à jour si l'API de `lib.ts` change.
