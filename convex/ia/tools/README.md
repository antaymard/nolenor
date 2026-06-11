# IA Tools

Ce dossier contient les tools serveur utilisés par les agents IA.

## Briques principales

- `*.ts` : un fichier par tool métier (`listNodesTool`, `readNodesTool`, `tableUpdateRowsTool`, etc.).
- `toolHelpers.ts` : types communs et helpers transverses, notamment `ToolConfig`, `ToolAgentName`, `toolError` et la logique de compaction.
- `index.ts` : registre central des tools. C'est lui qui décide quels tools sont exposés à chaque agent.
- `_toolTemplate.ts` : base de départ si un nouveau tool doit être créé.

## Comment fonctionne `index.ts`

`index.ts` ne contient pas la logique métier des tools. Il assemble l'existant.

Il fait 3 choses :

1. Déclare le `toolRegistry` : liste des tools disponibles avec leur config et leur factory.
2. Filtre les tools selon `agentName` (`nolë`, `clone`, `supervisor`, etc.).
3. Instancie les tools avec le bon contexte, notamment `canvasId` pour les tools liés au canvas.

La fonction importante est `getToolsForAgent(...)`.
Elle retourne le `ToolSet` final injecté dans les agents dans `convex/ia/agents.ts`.

## Deux types de tools

- Tools canvas-scoped : ont besoin d'un `canvasId`. Ils sont branchés via `createCanvasScopedTool(...)`.
- Tools globaux : n'ont pas besoin de `canvasId` (`websearch`, `open_webpage`, etc.).

Si un tool canvas-scoped est demandé sans `canvasId`, il n'est pas exposé.

## Convention d'un tool

En pratique, un tool suit souvent ce schéma :

1. une config exportée `...ToolConfig` avec le nom exposé au LLM et les agents autorisés
2. une factory par défaut qui retourne `createTool(...)`
3. un handler qui lit ou modifie les données Convex

Exemple : `documentStringReplaceContentTool.ts` exporte :

- `documentStringReplaceContentToolConfig`
- `default function documentStringReplaceContentTool(...)`

## Ajouter un nouveau tool

1. Créer le fichier du tool dans ce dossier.
2. Exporter sa config si le tool a une config dédiée.
3. L'importer dans `index.ts`.
4. Ajouter une entrée dans `toolRegistry` avec :
   - `config`
   - `create`
5. Déclarer les agents autorisés dans `config.agents`.

Tant qu'un tool n'est pas enregistré dans `index.ts`, aucun agent ne peut l'utiliser.
