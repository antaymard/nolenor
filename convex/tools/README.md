# tools/ — ce que les agents peuvent faire sur le canvas

Remplace progressivement `ia/tools/`. Un tool y est découpé en **un noyau** et
**des adaptateurs**, pour qu'une même capacité serve plusieurs interfaces sans
être réécrite :

| Interface | Pour qui | Adaptateur |
|---|---|---|
| Tool JSON (AI SDK) | Nolë, worker, et le MCP qui le réexpose | `*.agent.ts` |
| CLI `nole …` | le tool `bash` (Nolë, worker, MCP) | `*.cli.ts` |
| Tool scopé (à venir) | une étape d'automation guidée | même `*.agent.ts`, autre scope |

Une capacité n'a pas forcément les deux. Lister et chercher n'existent plus
qu'en CLI (`list_nodes` et `search_canvas` ont été retirés : Nolë passait
déjà par le shell, et le MCP expose `bash`) ; lire garde `read_nodes`, dont
la sortie (images jointes, schémas d'écriture) sert aux écritures.

## Organisation

```
tools/
  scope.ts               qui peut lire / écrire quoi — appliqué par le noyau
  runtime.ts             le ctx d'un noyau, la taille des lots de lecture
  nodes/
    canvasGraph.ts       la structure d'un canvas (nodes, edges), sans contenu
    nodeContents.ts      les contenus (nodeData, template, titre), par lots
    listNodes.ts         noyau de `nole ls` : filtrage, données typées
    readNodes.ts         noyau de read_nodes : contenus, connexions, médias
    readNodes.agent.ts   adaptateur : arguments du modèle, plafonds, hints
    readNodes.xml.ts     rendu XML de read_nodes (fonctions pures)
    readNodes.md         spécification de la sortie de read_nodes
    listNodes.cli.ts     adaptateur CLI : `nole ls`
    readNodes.cli.ts     adaptateur CLI : `nole read` (même XML que read_nodes)
  search/
    searchCanvas.ts      noyau de `nole search` : extraits classés, regroupement
    searchCanvas.cli.ts  adaptateur CLI : `nole search`
  tables/
    readTable.ts         noyau : toutes les lignes d'une table, valeurs lisibles
    readTable.cli.ts     adaptateur CLI : `nole table`
  shell/
    cli.ts               le contrat d'une commande `nole …`, sans just-bash
    nole.ts              la commande `nole` et ses sous-commandes
    shell.ts             le shell virtuel (just-bash, chargé à l'exécution)
    bash.agent.ts        le tool `bash`
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

## Le shell (`shell/`)

Le tool `bash` exécute un script dans just-bash : un bash écrit en
TypeScript, interpréteur et système de fichiers en mémoire, sans processus
ni disque. S'y ajoute `nole`, dont chaque sous-commande est l'adaptateur CLI
d'un noyau (`nole ls` → `listNodes`, `nole read` → `readNodes`,
`nole search` → `searchCanvas`, `nole table` → `readTable`).

- **Lecture seule.** Le scope du tool n'a aucun droit d'écriture, et `nole`
  n'a aucune commande qui écrive.
- **Un shell neuf par appel.** Rien ne survit d'un appel à l'autre ; `/tmp`
  ne sert qu'à l'intérieur d'un script.
- **Ni réseau, ni Python, ni JavaScript.** Désactivés par défaut dans
  just-bash, et laissés ainsi. Profil de limites `hardened`, 2 min au plus.
- **Sortie coupée à 30 000 caractères**, avec un message qui dit de filtrer.
- **Jamais importé statiquement** : le registre des tools est aussi bundlé
  pour le runtime V8 (MCP). just-bash est chargé par `globalThis.require`
  dans l'action Node, déclaré dans `convex.json` et `ia/helpers/_externalDeps.ts`
  comme jsdom.
- **Une commande `nole` ne dépend pas de just-bash** (`shell/cli.ts`) : elle
  reçoit ses arguments et son stdin, rend stdout, stderr et un code. Le même
  code pourrait servir un vrai binaire `nole`, ou un tool MCP `nole_shell`.

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
- **CLI** : `nole ls`, `nole read`, `nole search` et `nole table` existent.
  À venir : le canvas monté en fichiers
  (`/canvas/<frame>/<titre>.md`) pour que `grep -r` suffise.
- **Écritures** (plus tard) : préconditions de version (refuser d'écraser un
  node modifié depuis sa lecture), clé d'idempotence = id du tool call (ce qui
  rendrait des écritures `replay: safe`), attribution (qui a écrit, quel run).
- **Annotations MCP** (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
  déduites de la config plutôt qu'écrites à la main.
