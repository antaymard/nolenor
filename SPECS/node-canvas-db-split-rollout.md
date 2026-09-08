# Livraison A et M1 : audit et runbook

## 1. Statut et perimetre

Implementation de preparation, pas compte rendu de production. Aucun audit distant,
deploiement, backfill ou nettoyage n'a ete execute pour rediger ce document.
Les seuils ci-dessous sont des garde-fous configures, **pas des budgets valides par
des mesures de production**. Le runtime local et le codegen des composants ne sont
pas disponibles hors reseau dans cette session. La compilation finale, les tests
et la repetition restent des conditions de livraison.

Ce lot couvre les etapes 0/1/2 de `node-canvas-db-split.md` : audit en lecture seule,
integration de M1 a A, copie et certification. Les arrays restent autoritaires.
Il ne livre ni B, ni F, ni M2, ni un resserrage de schema, ni une purge de donnees.

## 2. Integration par main

Installer et verrouiller `@convex-dev/migrations` dans le package/lockfile principal.
Le montage `app.use(migrations)` est dans `convex/convex.config.ts`. Ne pas lancer
la migration automatiquement au deploiement.

Dans `convex/schema.ts`, importer les trois validateurs de
`./schemas/canvasGraphMigrationSchema`, puis integrer :

```typescript
canvasGraphMigrations: defineTable(canvasGraphMigrationsValidator)
  .index("by_canvasId", ["canvasId"])
  .index("by_status", ["status"]),
canvasGraphMigrationErrors: defineTable(canvasGraphMigrationErrorsValidator)
  .index("by_canvasId", ["canvasId"]),
canvasGraphMigrationControl: defineTable(canvasGraphMigrationControlValidator)
  .index("by_name", ["name"]),
```

Ces tables sont nouvelles. `by_canvasId` et `by_name` sont controles par `.unique()`
dans les transactions ; les index Convex n'imposent pas l'unicite eux-memes.

Les autres preconditions d'integration sont les tables `nodes`/`edges` et leurs
index exactement selon la spec, les quatre champs optionnels
`canvases.graphRevision`, `graphMigrated`, `nodeCount`, `deletedAt`, et les exports
communs de `models/canvasGraphModels.ts` et `config/canvasGraphConfig.ts`.
Le suivi d'erreurs ne contient ni arrays, ni values de contenu, ni snapshot de graphe.
Il garde les identifiants et un message borne a 1000 caracteres ; proteger ses exports.
`revision`/phase/offset/curseur de l'erreur designent le dernier checkpoint commite ;
`observedRevision` indique la revision du canvas lors de l'echec, notamment si le
lot avait recommence a zero avant son rollback.

Main integre le schema, les dependances et les references generees. Regenerer les
types avec le composant effectivement monte sur la cible isolee autorisee ; ne pas
contourner les erreurs de types par `any` ou par une edition manuelle de `_generated`.
Verifier l'API du composant installe contre la reference lue :
`.agents/skills/convex-migration-helper/references/migrations-component.md`.

## 3. Architecture M1

| Surface interne | Role |
| --- | --- |
| `migrations:seedCanvasGraphM1` | `Migrations.define`, pages de 1 canvas, creation idempotente des work items. Le composant suit curseur, erreurs et reprise de ce recensement. |
| `canvasGraphMigration:setEnabled` | Interrupteur durable M1, desactive si absent. Relu dans chaque transaction de travail et dans le callback de recensement. |
| `canvasGraphMigration:workOne` | Un seul canvas, un seul sous-lot, aucun scheduler. Capture durable des echecs apres rollback du sous-lot. |
| `canvasGraphMigration:processBatch` | Sous-transaction de `workOne`. Ne pas appeler directement en exploitation : cela contournerait son enveloppe de limites et de rapport d'erreurs. |
| `canvasGraphMigration:restartCanvas` | Repart de zero apres reparation approuvee ou pour une seconde passe. Invalide la certification et remet les compteurs du work item a zero, sans effacer le journal d'erreurs. |
| `canvasGraphMigration:listWork` / `listErrors` | Rapports internes pagines, sans ecriture. |
| `migrations:cancelM1Seed` | Annule le recensement du composant. N'annule pas retroactivement les lots deja commites. |

**`seedCanvasGraphM1` termine signifie uniquement "canvas recenses". Ce n'est jamais
"M1 certifiee".** Le composant n'execute pas tous les graphes dans `migrateOne` et
ne pilote pas les sous-lots de chaque canvas. Un operateur ou un harnais local
appelle explicitement `workOne` pour chaque lot. Aucun cron, action, continuation
ou scheduler ne fait progresser ces work items en arriere-plan.

Chaque work item conserve revision, phase, offset d'array, curseur de table,
nombres de lignes verifiees, reprises de revision, tentatives et compteurs de
creations/reconciliations. Les phases sont :

```text
nodes -> edges -> verifyNodes -> verifyEdges -> certify
```

Les deux premieres phases relisent les arrays actuels et normalisent/upsertent les
miroirs complets par sous-lots. Les deux suivantes paginent les tables dans le sens
inverse et comparent les champs normalises, les cles uniques et les comptes.
`M1_EXTRA_NODE` et `M1_EXTRA_EDGE` sont **bloquantes**, jamais des demandes de delete.
Les contenus, types, rattachements, templates et l'unicite globale par
`nodes.by_nodeDataId` sont verifies, en plus de la structure, des references
intra-array, des parents acycliques et des extremites d'edges du validateur commun.

A chaque sous-lot, tout changement de revision remet **toutes** les phases, offsets,
curseurs et comptes de verification a zero. Les compteurs inserts/reconciles restent
cumulatifs pour diagnostiquer le travail effectivement commite pendant ces reprises.
Un canvas tres actif peut ne pas converger : surveiller `revisionRestarts`, mettre
son traitement en attente et reiterer, sans le certifier sur un prefixe.

La derniere transaction relit arrays/revision, exige les deux comptes exacts, puis
ecrit `nodeCount` et `graphMigrated: true`. Cela suppose que **tous** les writers de
A preservent les invariants et incrementent la revision dans leur transaction.
Un writer hors contrat, notamment une edition manuelle des tables ou un changement
de rattachement/type non accompagne du graphe, invalide la preuve. Arreter M1 et
refaire l'audit/certification apres une telle intervention.

Un parent absent ou soft-deleted produit `gone` et n'est jamais recree. Les anciennes
lignes restantes sont detectees par l'audit global ; `gone` ne vaut pas certification
ni confirmation de purge. Le dernier work item certifie peut porter une revision
anterieure a la revision courante apres un dual-write correct de A : verifier aussi
le canvas actuel et les deux representations, pas uniquement le work item.

## 4. Etape 0 : inventaire en lecture seule

Choisir une cible isolee, un snapshot representatif et une heure de reference fixe.
Le champ `legacyInFlightSince` est le timestamp choisi par l'operateur pour le triage
des contenus recents non places. Il **ne prouve pas** qu'une creation legacy est
encore en cours. Ne jamais en deduire un TTL de suppression. Les candidats anciens
et recents sont conserves et leurs cas ambigus sont examines humainement.

`auditInventory` pagine chacune de ces tables independamment :

```text
canvases, nodes, edges, nodeDatas, searchableChunks, r2Objects, scheduledJobs
```

Les appels sont tous des `internalQuery`, sans ecriture, scheduler, reseau ou appel
R2. Un seul document est cible par page pour borner les hydratations de canvas et de
contenu, qui peuvent etre volumineuses. Fournir obligatoirement :

```json
{
  "table": "canvases",
  "paginationOpts": {
    "numItems": 1,
    "cursor": null,
    "maximumRowsRead": 1,
    "maximumBytesRead": 921600
  },
  "legacyInFlightSince": 0
}
```

Remplacer `legacyInFlightSince: 0` par la borne documentee, sans quoi tous les
contenus non places sont classes comme candidats recents. Reprendre chaque table
avec son `continueCursor` jusqu'a `isDone: true`, meme si une page est vide.
Conserver les metadonnees natives `pageStatus`/`splitCursor` si presentes ; elles ne
signifient pas fin de scan. Les options de pagination sont transmises intactes a
Convex et les limites de lignes/octets sont obligatoires.

Pour chaque canvas, parcourir **aussi** `auditGraphItem` sur `nodes`, puis `edges` :

```json
{"canvasId":"<id>","section":"nodes","offset":0,"expectedRevision":0}
```

Utiliser la revision observee dans l'inventaire, reprendre `nextOffset` jusqu'a
`isDone`, puis faire l'autre section. `restartRequired: true` invalide les resultats
de ce canvas : repartir des deux sections a zero avec la nouvelle revision.
Les lignes de nodes renvoient `nodeDataId` pour constituer le manifeste global des
placements legacy. Grouper hors transaction par nodeDataId et refuser les groupes
avec plusieurs couples `(canvasId, nodeId)` ; ne pas deduire l'unicite globale de
la seule table miroir encore partielle. Les references etrangeres sont egalement
signalees par les controles du contenu.

Le rapport combine les elements suivants :

| Donnees | Ce qui est mesure ou signale |
| --- | --- |
| Canvas | Nombre/tailles des arrays, doublons d'IDs, references colonne/data/les deux et conflits, structure/parents/edges invalides, certification, revision, compteur et champs presents. |
| Items legacy | Existence/type/rattachement/template du contenu, unicite globale des miroirs, champ normalise manquant/divergent ; manifeste des references globales. |
| Tables nodes/edges | Comparaison inverse, lignes en trop, cles dupliquees, parents canvas absents/supprimes, extremites absentes ou dupliquees. |
| NodeDatas | Nombre/octet des documents et values, placements legacy/miroirs, orphelins et candidats de creation en cours, templates, presence effective de `removedFromCanvasAt`, nombre de cles R2 declarees. |
| Chunks | Nombre/octet documents et texte, contenus/canvas/placements absents, rattachements/types/templates incoherents. |
| R2 | Nombre/octet des references persistees et cles, references sans contenu ou absentes des values courantes. |
| scheduledJobs | Documents effectivement presents, reference de contenu manquante, presence et etat de la fonction planifiee correspondante. |

Les octets sont ceux de `graphValueBytes`, pas une mesure de facturation Convex ou
des octets du blob R2. L'inventaire R2 ne fait pas de HEAD/LIST distant, ne prouve pas
l'existence des blobs et ne mesure pas leur taille. Les cles deduites des values
dependent des templates disponibles et de la configuration d'URL R2 ; conserver
ces limites dans le rapport. Une reference absente des values courantes peut relever
d'une retention/version ou d'un nettoyage en cours : pas de reparation implicite.

Agreger les compteurs additifs par table et enregistrer les maxima de tailles.
`mirrorPlacementsAtLeast` est volontairement sature a 2 : ne pas le sommer comme un
nombre exact de placements ; le scan de `nodes` fournit le nombre exact de lignes.
Ne pas sommer revisions/timestamps comme des compteurs. Dedupliquer par `_id` en
cas de reprise de page, et conserver dates de debut/fin, curseurs, cible et commit.
Un scan multi-requetes sous trafic n'est pas un snapshot global. Refaire les graphes
dont la revision a evolue et repeter la passe finale sur un jeu stable/isole ;
les lignes nodes/edges/contenus/chunks indiquent la revision du canvas observee.
Une difference avec la revision du manifeste exige une nouvelle passe de ce canvas ;
documenter chaque evolution sous trafic plutot que d'annoncer une egalite globale
atomique. Les anomalies dans les arrays bloquent M1 ; les miroirs manquants/divergents
avant M1 sont le travail attendu, mais deviennent bloquants dans l'audit final.

## 5. Budgets et repetition

| Limite partagee | Valeur initiale |
| --- | --- |
| mutationItems | 128 |
| graphNodes / graphEdges | 8192 / 8192 |
| graphBytes | 900 * 1024 |
| mutationBytes | 4 * 1024 * 1024 |
| mutationDocuments | 2048 |
| migrationBatch | 32 |

M1 autorise `batchSize` entre 1 et 32. Commencer a 1 sur le jeu representatif, puis
mesurer avant d'augmenter. Le recensement du composant reste a 1 canvas par callback
de page ; ne pas lui passer un `batchSize` plus grand en exploitation.
Le worker impose a la sous-transaction des plafonds en documents et octets inferieurs
aux budgets globaux, et zero fonction planifiee. Il reserve 1 MiB + 64 KiB de lectures
au parent pour enregistrer un echec et 64 KiB d'ecritures pour l'etat/erreur.
Un depassement du sous-lot annule tous ses changements et devient une erreur durable.
Un crash ou une interruption avant tout commit laisse simplement le precedent etat
reprenable ; les erreurs d'infrastructure qui empechent le commit lui-meme restent
a examiner dans les logs du runtime, pas a presenter comme deja journalisees.

Un seul contenu peut epuiser le budget d'une transaction par ses lectures ou sa
normalisation. Reduire `batchSize` n'est pas une preuve que toute donnee passera.
Si le lot de 1 echoue encore, arreter ce canvas et traiter explicitement l'exception
apres mesure. Ne pas augmenter les constantes sans repetition et marge documentee.

Avant livraison, main et l'agent tests doivent verifier au minimum :

1. Normalisation des deux domiciles, conflit bloque, toutes les props conservees.
2. Miroir absent/divergent, doublons d'IDs et nodeData, parent cyclique, edge orphelin,
   contenu absent/etranger/mauvais type et copie de template incoherente.
3. Plusieurs sous-lots, interruption/reprise, reset de revision entre chaque phase
   et juste avant certification, updates/deletes/moves/clones concurrents.
4. Canvas vide, nouvel utilisateur tardif, suppression physique/soft-delete du
   parent entre lots : aucune resurrection, restes detectes par audit inverse.
5. Ligne en trop bloquante conservee, rollback du sous-lot complet apres un echec
   tardif, journal d'erreurs durable, reprise apres reparation et journal conserve.
6. Dry run de recensement et de worker : aucun miroir, work item, compte/flag,
   erreur ou tache planifiee ne persiste ; dry run au stade de certification aussi.
7. Pauses, restart d'un canvas certifie, seconde passe stable sans insert/reconcile,
   droits internes, pagination jusqu'a epuisement et limites reelles du runtime.

Executer `yarn typecheck`, `yarn typecheck:convex` et la suite `convex-test` integree
par l'agent tests. Les mocks ne prouvent ni OCC reseau, ni pagination/limites runtime,
ni rollback des composants deployes : repeter sur un backend isole avec deux clients.

## 6. Etape 1 : gate avant execution M1

1. Identifier explicitement nom, type et URL du deploiement cible. Aucune commande
   ne doit se rabattre implicitement sur `.env.local` ou sur un deploy key herite.
2. Avant toute production, demander une autorisation explicite recente, prendre
   un snapshot identifie, verifier sa restauration sur une cible jetable, et
   consigner les ecritures qui seraient perdues en cas de restauration ulterieure.
3. Verifier A deploye : lecteurs arrays securises, tous les writers dual-write,
   incrementation atomique de revision, nouvelles creations avec compteur et
   certification, aucun writer interne direct non inventorie. Pas de soft-delete
   active tant que toutes les gardes ne sont pas pretes.
4. Archiver l'audit initial, les reparations approuvees, les budgets mesures et le
   resultat des tests. Conserver M1 desactive tant qu'une condition manque.

## 7. Etape 2 : commandes locales et orchestration

Les commandes ci-dessous sont des exemples **non executes**, reserves a un backend
local deja initialise et peuple du jeu de repetition. `M1_LOCAL_URL` doit etre une
URL loopback verifiee et `M1_LOCAL_ADMIN_KEY` sa cle locale, jamais une cle de prod.
Ne pas afficher/archiver la cle. Aucun `--push`, aucun deploiement implicite ici.
Sans runtime disponible, s'arreter au typecheck/tests, pas tenter une cible distante.

```powershell
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" canvasGraphMigration:setEnabled '{"enabled":true}'
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" migrations:seedCanvasGraphM1 '{"dryRun":true}'
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" canvasGraphMigration:workOne '{"canvasId":"<id>","batchSize":1,"dryRun":true}'
```

Le dry run du composant execute et annule **une page de recensement**, pas la
migration complete ni la certification d'un graphe. Il ne planifie aucun worker
applicatif. Le dry run de `workOne` execute reellement les ecritures d'un sous-lot,
puis leve une `ConvexError` dans la sous-transaction : le parent recupere le rapport
`dryRun: true`, sans persister d'etat, de miroir, de flag, d'erreur ou de scheduler.
Il peut simuler le premier lot d'un canvas sans work item preexistant. Repeter un
dry run ne progresse pas, precisement parce que les offsets sont annules.
Simuler les phases ulterieures sur le jeu isole prepare a ces phases par les tests.
L'activation explicite qui precede est une ecriture de controle, hors dry run.

Apres examen des rapports de simulation, recenser reellement :

```powershell
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" migrations:seedCanvasGraphM1 '{}'
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" --component migrations lib:getStatus '{}'
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" canvasGraphMigration:listWork '{"status":"pending","paginationOpts":{"numItems":32,"cursor":null,"maximumRowsRead":32,"maximumBytesRead":921600}}'
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" canvasGraphMigration:workOne '{"canvasId":"<id>","batchSize":1}'
```

Orchestration de confiance (CLI interne ou appels `t.query`/`t.mutation` dans un
harnais `convex-test`, jamais exposee par une action publique) :

1. Terminer le recensement, puis archiver les IDs de `listWork` pour `pending` et
   `running` par pages. Une page vide non finale doit etre poursuivie.
2. Pour un canvas, appeler **une fois** `workOne`, inspecter/archiver le resultat.
   Continuer si `running`, s'arreter si `certified`, `blocked`, `gone` ou `paused`.
   Un nouvel appel lit toujours la base, jamais des arrays exportes par le client.
3. Fixer avant le run un nombre maximal d'appels/restarts et une fenetre de temps
   par canvas. En cas de trafic empechant la convergence, passer au suivant puis
   revenir sur ce canvas. Ne pas creer une boucle autonome sans borne.
4. Reprendre apres interruption avec les work items existants. Pour une erreur,
   lire `listErrors` avec `canvasId` et les memes options de page bornees, traiter
   la cause par une reparation approuvee, appeler `restartCanvas`, puis `workOne`.
   Un simple rappel sur un work item `blocked` ne le debloque pas.
5. Refaire le recensement avec `{"reset":true}` pour inclure les canvas tardifs ;
   il n'efface ni ne redemarre les work items existants. Auditer aussi toutes les
   creations tardives, normalement certifiees des leur creation par A.

`restartCanvas` est la seule remise a zero applicative, distincte du reset du
curseur global du composant. Elle est requise pour la deuxieme passe d'un canvas
deja certifie. Archiver ses compteurs avant reset, puis exiger sur un jeu stable
`inserts: 0` et `reconciles: 0` lors de sa recertification.

## 8. Rapport de sortie et arret

Ne pas faire de B dans ce run. Avant de declarer l'etape 2 terminee :

1. Tous les canvas actifs sont certifies, aucun pending/running/blocked inexplique,
   compte exact meme pour les canvas vides/tardifs. Les `gone` sont rapproches des
   suppressions ; aucun reste de graphe sans parent ne passe silencieusement.
2. Refaire l'inventaire des sept tables et les deux sections d'items de chaque
   canvas. Comparer cles ET champs, confirmer l'unicite globale et rapprocher les
   orphelins de contenu/chunks/R2/jobs du rapport initial.
3. Reussir la deuxieme passe stable, sans insert/reconcile, et archiver snapshots,
   commit A, version du composant, rapports d'erreurs/reparations et resultats
   des tests/interleavings/mesures. Sous trafic, expliquer les differences.
4. Desactiver M1 et annuler le recensement. Les workers n'ont aucune continuation
   planifiee a drainer ; confirmer l'arret du composant et des orchestrateurs locaux.

```powershell
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" canvasGraphMigration:setEnabled '{"enabled":false}'
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" migrations:cancelM1Seed '{}'
npx --no-install convex run --url "$env:M1_LOCAL_URL" --admin-key "$env:M1_LOCAL_ADMIN_KEY" --component migrations lib:getStatus '{}'
```

La future livraison B devra rendre les entrees M1 definitivement inoperantes dans
le code, pas seulement laisser l'interrupteur a false. Ne jamais reautoriser la copie
des arrays apres la premiere ecriture tables-only. Cette protection de B et le
nettoyage M2 sont des lots separes, pas des commandes de ce runbook.

## 9. Retour arriere pendant A

Arreter M1 et son recensement suffit pour suspendre le backfill. Conserver A et ses
arrays autoritaires ; les lots deja commites peuvent rester dans les miroirs.
Ne pas supprimer les miroirs ou les contenus pour "annuler" la migration.
Une restauration de snapshot n'est jamais automatique : accord distinct, cible
verifiee, drill de restauration et decision explicite sur les ecritures posterieures.

Si retour au backend arrays uniquement, revenir exclusivement a une version
securisee, jamais au code anterieur aux gardes de rattachement. Avant toute future
bascule, redelivrer un A complet puis refaire audit, backfill et certification de
tous les canvas : les anciens flags/work items ne sont plus une preuve valide.
