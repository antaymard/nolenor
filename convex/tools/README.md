# tools/ — ce que les agents peuvent faire sur le canvas

Remplace progressivement `ia/tools/`. Un tool y est découpé en **un noyau** et
**des adaptateurs**, pour qu'une même capacité serve plusieurs interfaces sans
être réécrite :

| Interface | Pour qui | Adaptateur |
|---|---|---|
| Tool JSON (AI SDK) | Nolë, worker, et le MCP qui le réexpose | `*.agent.ts` |
| CLI `nole …` (à venir) | le tool `bash` de Nolë, le MCP `nole_shell` | `*.cli.ts` |
| Tool scopé (à venir) | une étape d'automation guidée | même `*.agent.ts`, autre scope |

## Organisation

```
tools/
  scope.ts               qui peut lire / écrire quoi — appliqué par le noyau
  runtime.ts             le ctx d'un noyau, la taille des lots de lecture
  nodes/
    canvasGraph.ts       la structure d'un canvas (nodes, edges), sans contenu
    nodeContents.ts      les contenus (nodeData, template, titre), par lots
    listNodes.ts         noyau de list_nodes : filtrage, données typées
    listNodes.agent.ts   adaptateur : schéma zod, rendu XML, plafond à 20
    readNodes.ts         noyau de read_nodes : contenus, connexions, médias
    readNodes.agent.ts   adaptateur : arguments du modèle, plafonds, hints
    readNodes.xml.ts     rendu XML de read_nodes (fonctions pures)
    readNodes.md         spécification de la sortie de read_nodes
```

Un domaine par dossier (`nodes/`, puis `tables/`, `search/`…). Les
adaptateurs et leurs rendus portent un double suffixe (`.agent.ts`,
`.xml.ts`, plus tard `.cli.ts`) : Convex ignore les fichiers à plusieurs
points comme modules de fonctions, ils ne sont que bundlés par qui les
importe.

## Les règles

**Le noyau rend des données, jamais du texte.** Pas de XML, pas de plafond
d'affichage, pas de champ `explanation`, pas de message écrit pour un modèle.
Il rend des objets typés, et ses erreurs attendues sous la forme
`{ ok: false, error }` (ce que l'appelant peut corriger : un id introuvable) ;
le reste throw.

**Le noyau applique le scope, les adaptateurs jamais.** Chaque fonction du noyau
reçoit un `ToolScope`. Un node hors du scope de lecture est introuvable (ni
listé, ni lu, ni utilisable comme référence). La porte se ferme à un seul
endroit pour toutes les interfaces.

**Des transactions bornées.** Un noyau est une fonction appelée depuis
l'action qui exécute le tool (`ToolRunCtx`), et qui enchaîne des
transactions dont la taille ne dépend pas du canvas : la structure (nodes,
edges : petits documents) d'un bloc, les contenus par lots de 10 au plus
(un document pèse jusqu'à 1 Mio, une transaction en lit au plus 16), les
médias node par node. Jamais « tous les contenus du canvas » dans une même
requête.

**L'adaptateur ne fait que traduire.** Entrée de son interface → arguments du
noyau (y compris les manies du modèle : un filtre vide veut dire « pas de
filtre ») ; résultat du noyau → format de son interface. Le rendu est une
fonction pure, testable sans base.

**Migrer sans changer le comportement.** Un tool migré depuis `ia/tools/` rend
exactement la même sortie que l'ancien, vérifié en comparant les deux sur un
même canvas avant de supprimer l'ancien. Un écart n'est admis que s'il corrige
un bug, et il est nommé dans le commit.

Pour comparer un tool qui lit des blocknotes en test : enregistrer les
composants `prosemirrorSync` et `debouncer` (cf. `readNodes.test.ts`), et
rendre `require` disponible (`globalThis.require = createRequire(...)`) pour
que jsdom se charge — sans ça, les deux versions échouent pareil et la
comparaison ne prouve rien.

## Contrat avec la harness

Un adaptateur agent s'inscrit dans le registre `ia/tools/index.ts` comme
n'importe quel tool (`config` + `factory`), donc la harness n'a rien à savoir de
ce découpage. Ce qu'elle attend d'un tool :

- **`explanation` en première clé du schéma** (`EXPLANATION_FIELD`) : c'est
  l'intention affichée pendant et après l'appel, enregistrée par la harness
  avant l'exécution.
- **`replay`** : `safe` seulement sans effet de bord (une lecture). Sinon un
  appel interrompu rend « interrompu » au modèle plutôt que d'être rejoué.
- **Des tools purs vis-à-vis du run** : `Profile.tools(run)` doit rendre le même
  ensemble à chaque step. Le scope en fait partie — c'est pour ça qu'il est
  sérialisable (`vToolScope`) : un run pourra porter le sien.
- **`deferred`** pour un tool rare (chargé par `load_tools`).

## Où on va

- **Scope** : aujourd'hui Nolë a `canvasScope` (tout le canvas). Une étape
  d'automation recevra un scope réduit (`write: [nodeId]`), décidé par son
  profil et porté par le run ; le noyau des écritures vérifiera `canWriteNode`.
- **CLI** : des commandes `nole ls/read/table/edges/search` sur les mêmes
  noyaux, en lecture seule, dans un shell virtuel (just-bash).
- **Écritures** (plus tard) : préconditions de version (refuser d'écraser un
  node modifié depuis sa lecture), clé d'idempotence = id du tool call (ce qui
  rendrait des écritures `replay: safe`), attribution (qui a écrit, quel run).
- **Annotations MCP** (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
  déduites de la config plutôt qu'écrites à la main.
