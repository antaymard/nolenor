# Evals Nolë (Braintrust)

Evals hors-ligne pour l'agent Nolë. Le script tourne contre le point d'entrée
réel de prod (`internal.ia.noleCompletion.streamResponse`, appelé par
`convex/ia/evalHarness.ts:runEvalTurn`) — pas une réimplémentation.

## Setup (une fois)

1. Créer le compte "eval bot" (Password provider) :
   ```
   npx convex run auth:signIn '{"provider":"password","params":{"email":"<email>","password":"<mdp>","flow":"signUp"}}'
   ```
   Relever son `users._id` via le data browser du dashboard Convex (table `users`).
2. Créer le canvas fixture pour ce compte :
   ```
   npx convex run ia/evalFixture:ensureFixtureCanvas '{"userId":"<id du bot>"}'
   ```
3. Sur ce canvas (connecté avec le compte eval bot), créer à la main un node
   document et un node tableau avec un contenu connu. Relever leurs `id`
   (panneau du node, ou en demandant à Nolë de lister les nodes).
4. Renseigner les variables d'environnement ci-dessous dans un `.env.local` à
   la racine du repo (chargé automatiquement par `braintrust eval`).

## Variables d'environnement (`.env.local`, jamais commité)

| Variable | Usage |
|---|---|
| `BRAINTRUST_API_KEY` | lu par le SDK Braintrust |
| `BRAINTRUST_PROJECT_ID` | optionnel, remplace l'id par défaut codé dans `nole.eval.ts` |
| `CONVEX_URL` | URL du déploiement Convex dev (pas `VITE_CONVEX_URL`) |
| `EVAL_USER_EMAIL` / `EVAL_USER_PASSWORD` | identifiants du compte eval bot |
| `EVAL_CANVAS_ID` | canvas fixture (retourné par `ensureFixtureCanvas`) |
| `EVAL_FIXTURE_DOCUMENT_NODE_ID` / `EVAL_FIXTURE_TABLE_NODE_ID` | ids des deux nodes seedés à l'étape 3 |
| `OPENROUTER_API_KEY` | utilisé directement par `relevanceJudge` (juge LLM), hors runtime Convex |

## Lancer les evals

```
yarn eval
```

## Limitation connue

Pas de remise à zéro automatique du canvas fixture entre les runs : les tools
de Nolë peuvent y accumuler des nodes au fil des évals successives. Un
mécanisme de reset + une création de canvas totalement scriptée/reproductible
sont prévus dans une itération future.

## Vérifier que ça marche

1. `npx convex dev` une fois (pour que la codegen référence `evalHarness`/`evalFixture`).
2. Un petit script jetable réutilisant `createEvalConvexClient()` puis appelant
   `client.action(api.ia.evalHarness.runEvalTurn, { canvasId, prompt: "hello" })`
   pour vérifier le harnais isolément avant de lancer le run complet.
3. `yarn eval` — un rapport doit s'afficher avec les scores par cas.
4. Vérifier dans le dashboard Braintrust (projet "Nolë") qu'une nouvelle
   expérience apparaît.
