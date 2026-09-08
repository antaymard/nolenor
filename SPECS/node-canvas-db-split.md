# Séparer le graphe du document canvas

> Spec de phase 1, réécrite après revue du code sur `104700a`.
> Statut : à implémenter. Aucun déploiement ni aucune migration exécutés par ce document.
> Lire `convex/_generated/ai/guidelines.md` avant toute implémentation backend.

## 1. Objectif et périmètre

Sortir les tableaux `canvases.nodes` et `canvases.edges` dans deux tables dédiées.
Un déplacement ou redimensionnement doit écrire les placements concernés, pas le
document canvas partagé par tous les éditeurs et lecteurs de contenu.

Les bénéfices recherchés sont la réduction des écritures, des invalidations
collatérales et de la contention entre géométrie et contenu. Ce chantier ne promet
ni des canvas de taille illimitée, ni une synchronisation réseau par document :
une query qui liste tous les nodes reste invalidée lorsqu'un de ces nodes change.

### 1.1 Décisions de phase 1

| Sujet | Décision |
| --- | --- |
| Contenu | `nodeDatas.canvasId` reste la source de vérité du rattachement et des droits. |
| Géométrie | Un document `nodes` par placement ; accès par le canvas et le `nodeId`. |
| Connexions | Un document `edges` par connexion ; extrémités validées dans la mutation d'écriture. |
| Identifiants | Conserver les chaînes `llmId` existantes, pas les remplacer par les `_id` Convex. |
| Cardinalité | Au plus un placement par nodeData, tous canvas confondus. |
| Création | Une mutation atomique pour contenu, placement et éventuelles connexions initiales. |
| Déplacement inter-canvas | Atomique et explicitement borné ; pas de déplacement multi-transaction en phase 1. |
| Onboarding | Clonage atomique borné de starters dont la taille est contrôlée. |
| Suppression de canvas | Soft-delete immédiat, puis purge physique bornée et reprenable. |
| Migration | Élargissement, dual-write, backfill vérifié, bascule compatible, nettoyage, resserrage. |
| Anciens clients | Adaptateurs conservés tant que leur retrait sûr n'est pas démontré. |

Hors périmètre : retrait de `nodeDatas.canvasId`, ajout d'un propriétaire autonome
au contenu, partage de nodeData, multi-placement et verrouillage d'édition par
nodeData. Ces évolutions ont leur propre phase, décrite en fin de document.

### 1.2 Invariants à garantir

- `(canvasId, nodeId)` et `(canvasId, edgeId)` sont uniques. Un index Convex ne rend
  pas cette unicité automatique : lecture et contrôle dans la transaction.
- Tout placement portant un `nodeDataId` référence un document existant, du type
  attendu et dont `canvasId` est identique à celui du placement.
- Un nodeData ne peut pas être placé deux fois, même via une mutation interne,
  un lot de créations, un clonage ou une migration.
- Les créations modernes produisent exactement un contenu et son placement.
  Les orphelins historiques et le court intervalle entre les deux appels d'une
  création legacy restent des exceptions identifiées, pas du multi-placement.
- Chaque edge relie deux nodes existants dans son canvas. Les contraintes sur
  `parentId` sont également vérifiées ; aucun parent inter-canvas implicite.
- `data.nodeDataId` n'est plus persisté dans les nouvelles tables. Le converter
  React Flow le produit depuis la colonne. Les champs de rattachement ne sont
  jamais modifiables par un patch libre de `data`.
- `nodeCount` est le nombre de placements du canvas. Il évolue dans la même
  transaction que leur création, suppression ou déplacement.
- Un canvas soft-deleted n'autorise plus de nouvelle lecture ou écriture métier.
  Seuls les traitements internes de purge peuvent encore le parcourir.
- Une lecture annoncée comme exhaustive renvoie tout ou une erreur explicite.
  Un résultat partiel doit être annoncé comme tel et ne sert pas à valider une référence.

## 2. Ordre des livraisons

**La migration principale est l'étape 2. Elle ne bascule pas les lecteurs.**
La bascule serveur, le nouveau frontend et le nettoyage sont des étapes suivantes,
avec leurs propres critères de passage.

| Étape | Livraison | Source de vérité du graphe | Condition de sortie |
| --- | --- | --- | --- |
| 0 | Sécurité, inventaire et répétition locale | Arrays | Failles fermées, anomalies et budgets connus. |
| 1 | Backend A : schéma élargi et dual-write complet | Arrays | Tous les écrivains maintiennent leur miroir. |
| **2** | **Migration M1 : backfill et certification** | **Arrays** | **Chaque canvas est certifié ; aucun écart bloquant.** |
| 3 | Backend B : tables et API compatibles | Tables | Ancien frontend et nouveaux endpoints fonctionnent. |
| 4 | Frontend F : abonnements séparés et création fusionnée | Tables | Parcours desktop/mobile validés. |
| 5 | Stabilisation et mesures | Tables | Intégrité, compatibilité et gains vérifiés. |
| **6** | **Migration M2 : nettoyage du stockage legacy** | **Tables** | **Arrays et champs obsolètes réellement retirés des documents.** |
| 7 | Backend C : resserrage du schéma | Tables | Schéma final validé, aucun lecteur des arrays persistés. |
| 8 | Retrait conditionnel des anciennes API | Tables | Politique de versions et reprise des anciens clients éprouvées. |

Cela représente au minimum trois livraisons backend A/B/C, hors correctif de
sécurité, frontend et éventuelle activation d'un index staged. Ne pas regrouper
backfill, bascule et retrait des champs dans un seul déploiement.

Le maintien en service repose sur des contrats compatibles, pas sur l'hypothèse
que tous les onglets se rechargent au moment du déploiement.

## 3. Modèle cible

Les noms des nouvelles fonctions ci-dessous sont les contrats proposés. Les noms
publics déjà livrés restent disponibles via les adaptateurs de l'étape 3.

```text
canvases
  creatorId, name, description?, isPublic?, isSystem?
  background?                         # objet borné, reste inline
  nodeCount: number
  deletedAt?: number
  updatedAt: number

nodes
  canvasId: Id<"canvases">
  nodeId: string                      # llmId, unique dans ce canvas
  nodeDataId?: Id<"nodeDatas">
  type, position, width, height
  zIndex?, locked?, hidden?, color?, variant?
  parentId?, extent?, extendParent?, data?
  index by_canvasId                  [canvasId]
  index by_canvasId_and_nodeId       [canvasId, nodeId]
  index by_nodeDataId                [nodeDataId]
  index by_canvasId_and_parentId     [canvasId, parentId]

edges
  canvasId: Id<"canvases">
  edgeId: string                     # llmId, unique dans ce canvas
  source: string, target: string     # nodeId, pas _id Convex
  sourceHandle?, targetHandle?, markerEnd?, data?
  index by_canvasId                  [canvasId]
  index by_canvasId_and_edgeId       [canvasId, edgeId]
  index by_canvasId_and_source       [canvasId, source]
  index by_canvasId_and_target       [canvasId, target]

nodeDatas
  canvasId conservé
  type, values, templateId?, updatedAt, imageGeneration?
  index by_canvasId conservé
  index by_canvasId_and_updatedAt    [canvasId, updatedAt]
  autres index existants conservés

shares
  modèle canvas-only conservé
```

`by_nodeDataId` suffit pour résoudre l'unique placement, puis vérifier son canvas.
Ne pas ajouter un index composé `canvasId/nodeDataId` sans besoin mesuré distinct.
L'index de récence, lui, est nécessaire : `by_canvasId` ordonne par création,
pas par `updatedAt`. L'index sur `parentId` permet de vérifier les enfants qui
resteraient hors sélection lors d'un déplacement ou d'une suppression de parent.

Les identifiants llmId sont conservés pour les edges, chunks, messages, tools,
mentions, fenêtres et deep links. Les collisions d'un identifiant fourni par le
client sont refusées explicitement, sans le remplacer silencieusement. Un ID
généré côté serveur peut être régénéré avec un nombre borné d'essais.

Champs transitoires de A/M1, absents du modèle final : `graphRevision?` et
`graphMigrated?` sur le canvas. Ils servent à vérifier le backfill en plusieurs
transactions malgré les modifications concurrentes, pas à synchroniser le front.
Le suivi global des migrations relève de `@convex-dev/migrations`.

## 4. Étape 0 : sécuriser et préparer

### 4.1 Corriger la faille actuelle sans attendre la bascule

Aujourd'hui, `canvasNodes.add` accepte un `nodeDataId` arbitraire après avoir
vérifié uniquement le canvas de destination. `nodeDatas.listByCanvasId` charge
ensuite les nodeDatas référencés sans revérifier leur rattachement. La suppression
du placement peut également déclencher la suppression du contenu tiers.

Ce n'est pas un risque réservé à une future phase 2.

- Vérifier existence, type et égalité du `canvasId` avant tout rattachement legacy.
- Vérifier la correspondance à la lecture, y compris récents et wrappers internes,
  et avant une cascade ou un déplacement provenant d'un placement historique.
- Refuser les doublons de placement et les modifications des références réservées
  via `updateCanvasNodes.data` ou tout autre patch générique.
- Tant que les tables ne sont pas complètes, vérifier les doublons dans les arrays
  autoritaires du canvas ; après certification, ajouter le contrôle indexé global.
- En cas de référence étrangère déjà stockée, ne jamais cascader sur le contenu
  d'origine. Isoler le placement incohérent et traiter sa réparation séparément.

Les adaptateurs futurs réutilisent ces contrôles. Être une fonction interne n'est
pas une dispense d'intégrité ; un job en retard ne doit pas recréer des enfants
d'un canvas ou d'un nodeData supprimé.

### 4.2 Auditer les données existantes

Produire un rapport paginé, sans modifier les données, portant au minimum sur :

- Nombre de nodes, edges, nodeDatas, chunks et références R2 ; tailles en octets.
- Doublons de `nodeId` ou `edgeId` dans un canvas et placements multiples d'un nodeData.
- Références absentes, étrangères, types incompatibles et edges/parents orphelins.
- `nodeDataId` en colonne, dans `data`, ou présent aux deux endroits avec des valeurs différentes.
- Cohérence de `templateId` entre le contenu et les éventuelles copies historiques.
- NodeDatas sans placement, en distinguant historique et créations legacy en cours.
- Présence réelle de `removedFromCanvasAt` et de documents `scheduledJobs`.

Ne pas conclure qu'un champ est vide en production parce qu'il n'a plus d'écrivain
dans le code. Ne pas supprimer des orphelins ou régénérer des IDs ambigus pendant
le backfill : établir une réparation approuvée, traçable et conservant les données
utiles. Les anomalies qui empêchent de respecter les invariants bloquent M1.

### 4.3 Fixer les budgets de phase 1

Le split retire le plafond accidentel du document canvas, pas les limites des
transactions, des retours Convex ou de React Flow.

Avant A, définir des constantes et des erreurs métier pour les tailles de lots,
les lectures complètes, le nombre de connexions initiales et le travail maximal
d'un déplacement, d'une suppression ou d'un clone. Les seuils sont déterminés par
la version Convex installée, les données auditées et les tests, avec une réserve.
Ils doivent couvrir les canvas existants sains ; une exception doit être traitée
avant la bascule, pas découverte par un utilisateur après B.

- Budgéter documents, octets, plages d'index et fonctions planifiées, pas seulement
  le nombre de nodes. Un seul node peut porter un gros fan-out de chunks ou d'edges.
- Une mutation atomique trop grosse est refusée entièrement avec un message clair.
  Ne pas écrire les premiers éléments puis annoncer un succès partiel implicite.
- Une query de graphe complet est bornée en lignes et en octets ; dépasser son
  budget produit une erreur explicite, jamais un canvas silencieusement tronqué.
- Tant que les lecteurs complets sont conservés, contrôler aussi l'admission des
  écritures qui feraient dépasser la capacité de lecture d'un canvas. La stratégie
  de contrôle et ses coûts font partie des tests ; pas de croissance illimitée
  promise derrière un simple `.take(N)`.
- Les listings utilisateur et exports peuvent paginer. Le support de très grands
  canvas interactifs avec chargement partiel est une évolution distincte.

### 4.4 Préparer la répétition

Ajouter les tests backend avec `convex-test`, Vitest et l'environnement edge-runtime.
Prévoir `@convex-dev/migrations` pour M1/M2 : suivi, reprise et exécution à blanc.
Ces dépendances seront installées lors de l'implémentation, pas par cette spec.

Répéter A, M1, B puis M2/C sur un environnement isolé alimenté par un jeu représentatif.
Avant toute opération réelle : identifier explicitement le déploiement cible,
obtenir l'accord de production requis et disposer d'un snapshot et d'un runbook de
restauration vérifiés. Une restauration n'est jamais le rollback automatique.

**Sortie de l'étape 0 :** tests de sécurité verts, rapport d'anomalies traité,
budgets documentés et répétition de migration préparée.

## 5. Étape 1 : backend A, élargissement et dual-write

### 5.1 Schéma compatible

Créer `nodes` et `edges`, leurs validateurs et index. Conserver les arrays actuels
en `v.optional`, introduire `nodeCount` et `deletedAt` en optionnel, ainsi que les
deux champs temporaires de certification. Ajouter l'index de récence des nodeDatas.
Si sa construction doit être staged, attendre puis l'activer dans un déploiement
distinct avant tout lecteur qui l'utilise.

Les lecteurs de graphe restent sur les arrays, avec les correctifs de sécurité.
Ne pas exposer de lecteur métier fondé sur une table encore partielle.
Ne pas activer le soft-delete avant que tous ses lecteurs et gardes soient prêts.

### 5.2 Tous les écrivains doivent participer

| Chemin | Obligation pendant A |
| --- | --- |
| Création de canvas | `nodeCount: 0`, arrays vides, `graphRevision: 0`, `graphMigrated: true`. |
| Ajout, props, position, dimensions | Appliquer le changement dans l'array et upserter le document complet normalisé. |
| Suppression de node | Retirer le placement et ses edges des deux représentations ; cascade seulement après validation du rattachement. |
| Ajout/update/suppression d'edge | Miroir transactionnel, unicité et validation des extrémités. |
| Déplacement inter-canvas | Miroir sur source et cible, compteurs et références cohérents ; pas de ligne oubliée dans le source. |
| Clonage d'onboarding | Passer aussi l'écriture directe actuelle des edges par le modèle commun. |
| Suppression de canvas | Purger aussi les nouvelles tables ; une continuation doit fonctionner même si le parent a déjà été supprimé. |
| Wrappers IA, imports et scripts internes | Aucun patch direct des arrays hors du chemin commun inventorié. |

Le traitement des edges internes lors d'un déplacement est défini à l'étape 3 et
doit être identique dans les deux représentations dès sa correction.

### 5.3 Normalisation et atomicité

- Partager un normaliseur entre dual-write et backfill. Remonter `data.nodeDataId`
  seulement si la colonne est absente ; un désaccord entre les deux est une erreur.
- Conserver tous les champs de géométrie et d'edge utiles. Retirer uniquement la
  copie de `nodeDataId` dans le `data` des nouvelles tables.
- Un update peut arriver avant le backfill : faire un upsert complet depuis l'état
  autoritaire après modification, pas un patch d'une ligne supposée exister.
- Une suppression miroir tolère une ligne encore absente, mais ne court-circuite
  pas la suppression historique ou les contrôles précédant la cascade.
- Arrays et miroir sont écrits dans la même mutation. Aucun miroir via scheduler.
- Pendant A, recalculer `nodeCount` depuis l'array autoritaire lors d'un changement
  de cardinalité est acceptable. Ne jamais incrémenter un compteur absent comme
  s'il valait nécessairement zéro sur un canvas existant.
- Chaque changement d'array incrémente `graphRevision` dans la même transaction.
  Un canvas déjà certifié conserve sa certification uniquement parce que tous
  ses écrivains préservent l'égalité complète.

**Sortie de l'étape 1 :** tests sur éléments non migrés, ajout/suppression pendant
backfill, inscription et suppression de canvas. Aucun écrivain hors dual-write.

**Retour arrière :** on peut revenir à un backend arrays sécurisé tant que les
arrays sont autoritaires, mais il faut alors refaire la certification avant B.
Ne pas revenir au code antérieur au correctif de sécurité.

## 6. Étape 2 : migration M1, backfill et certification

**Cette étape migre les données. L'application continue de lire les arrays.**

### 6.1 Exécution bornée et reprenable

1. Exécuter à blanc sur la cible prévue et examiner erreurs, tailles et budgets.
2. Parcourir les canvas par pages. Pour chaque canvas non certifié, relever sa
   `graphRevision` et traiter nodes puis edges par sous-lots bornés.
3. Chaque sous-lot relit le canvas courant et écrit son miroir dans la même
   mutation. Ne pas réinjecter un snapshot d'array transmis par une action ancienne.
4. Pour chaque clé, comparer le document normalisé : insérer s'il manque,
   réconcilier s'il diffère. « Sauter l'existant » n'est pas une vérification.
5. Vérifier aussi le sens tables vers arrays afin de détecter les lignes en trop.
   Toute suppression de réparation doit correspondre à une règle approuvée.
6. Si la révision change entre deux sous-lots, recommencer la certification sur
   l'état courant. Un offset dans un array mutable n'est pas un curseur stable.
7. Après comparaison complète dans les deux sens à révision stable, écrire
   `nodeCount` depuis la source et `graphMigrated: true` dans une mutation qui
   revérifie la révision. Les nouveaux changements passent ensuite par le dual-write.

Les curseurs, erreurs et reprises sont suivis durablement. Un canvas très actif
peut retarder sa certification : le signaler et réessayer, jamais le marquer réussi
sur un contrôle incomplet. La répétition doit démontrer la progression sans freeze.

### 6.2 Audit bloquant avant B

- Tous les canvas existants sont certifiés ; ceux créés pendant A le sont dès leur création.
- Clés et champs normalisés identiques, pas seulement nombres de lignes identiques.
- Unicité des IDs, au plus un placement par nodeData, rattachements et types valides.
- Aucun edge ni parent orphelin ; aucun document de graphe sans canvas parent.
- `nodeCount` exact, y compris canvas vides créés après le début du backfill.
- Les orphelins de contenu conservés sont recensés ; ils ne sont pas confondus avec
  une perte de placement introduite par la migration.
- Deuxième passe sur un jeu stable : aucune création ni réparation nécessaire.
  En présence de trafic, toute évolution observée doit être expliquée par ce trafic.
- Les tests d'interleaving couvrent update, delete, move, clone et suppression du
  parent pendant la migration. Reprendre un lot ne recrée pas un élément supprimé.

Archiver le rapport de certification et l'identifiant du snapshot de référence.
Ne pas basculer sur la seule base d'un compteur global « migration terminée ».

### 6.3 Arrêt et protection

Avant B, arrêter les runs M1 et vider ou annuler leurs continuations. Dans le code
de B, rendre les anciennes entrées M1 explicitement inopérantes : même un job
retardé ne doit pas recopier les arrays devenus périmés vers les tables.

**Sortie de l'étape 2 :** rapport de certification validé et M1 arrêtée.
**Retour arrière :** arrêter M1 suffit ; les arrays restent la vérité et le code A
continue de maintenir les deux représentations.

## 7. Étape 3 : backend B, bascule compatible

Tous les modèles et lecteurs serveur passent sur les tables. Le dual-write cesse
dans cette livraison ; les arrays persistés deviennent des vestiges, jamais un
fallback de lecture ou une source de réparation.

### 7.1 Droits et canvas supprimés

`requireNodeAccess` vérifie les droits sur le canvas et l'existence du `nodeId`
dans ce canvas. Les mutations par lots valident toute la sélection avant de
confirmer leur succès. Les writes métier internes contrôlent aussi l'état courant
des parents, notamment après une longue action IA.

Le garde `deletedAt` doit couvrir **`getCanvasAccess` et `requireCanvasAccess`**.
Les listings qui interrogent directement les canvas filtrent explicitement cet
état : listes propres/partagées, dernier modifié, export, recherche de canvas et
tools. `getLastModifiedForUser` cherche le premier canvas actif, pas le premier
document suivi d'un rejet qui masquerait les suivants.

`uploads.canUserDownloadKey` doit hériter de ce refus via `getCanvasAccess`.
Cela empêche de délivrer de nouvelles URL ; cela ne révoque pas une URL déjà
signée jusqu'à son expiration, ni une éventuelle URL publique R2 déjà distribuée.

### 7.2 Anciennes API maintenues

Le PWA conserve l'ancien build jusqu'à acceptation du rechargement
(`src/lib/appUpdate.ts`). Déployer F ne suffit donc pas à retirer ses contrats.

| API legacy | Comportement sous B |
| --- | --- |
| `canvases.readCanvas` | Reconstruire la forme historique complète depuis les tables, avec permission et champs attendus. |
| `canvasNodes.*`, `canvasEdges.*` | Conserver noms, arguments et retours ; déléguer aux modèles tables-only. |
| `nodeDatas.create` | Rester publique temporairement, protégée par les droits du canvas. |
| `canvasNodes.add` | N'accepter un contenu existant que s'il appartient au même canvas et n'a aucun autre placement. |
| Lectures legacy de contenu/export | Préserver leur forme livrée ou fournir un adaptateur explicite. |

Un ajout répété avec la même identité et le même contenu attendu peut être un
no-op idempotent ; il ne doit pas incrémenter deux fois `nodeCount`. Une collision
avec un autre placement n'est pas un succès idempotent.

Le chemin legacy reste en deux appels et peut encore laisser un contenu sans
placement. Ne pas annoncer son atomicité, ni supprimer ces contenus sur un TTL
court qui casserait un client reconnecté tardivement.

Les retours legacy doivent être des DTO indépendants du schéma physique : leur
reconstruction doit continuer à fonctionner après retrait des arrays du schéma.
Le nouveau front utilise `canvases.read`, réservé aux métadonnées, et ne s'abonne
plus à ce DTO historique volumineux.

### 7.3 Création atomique et géométrie

```text
nodes.create({
  canvasId, nodeId, type, values, templateId?,
  position, width, height, zIndex?, locked?, hidden?, color?, variant?,
  parentId?, extent?, extendParent?, data?, sourceNodes?
}) -> { nodeId, nodeDataId }

nodes.createMany({ canvasId, nodes: [...] }) -> [{ nodeId, nodeDataId }, ...]
```

- Aucun `nodeDataId` préexistant sur cette nouvelle surface publique.
- Vérifier tout le lot, y compris doublons intra-lot, IDs fournis, parents, templates
  accessibles et extrémités des connexions initiales.
- Insérer contenu, placement, références R2 et edges initiaux dans la même mutation.
  Appliquer les defaults et incrémenter `nodeCount` une seule fois pour le lot.
- Préserver le tracing `trackAgentTouch`, le versioning et la planification de
  l'indexation, sans réintroduire une création partiellement atomique par wrapper.
- `applyNodeDataTitle` reste dans l'action s'il utilise le LLM ; le calcul pur des
  handles et les contrôles des sources sont faits dans la mutation finale.
- Le primitif interne acceptant un nodeData existant reste réservé aux besoins
  internes et adaptateurs protégés ; il applique les mêmes invariants.
- Position, dimensions et props patchent les seuls documents `nodes` concernés.
  Fusionner variant et dimensions en une mutation pour le nouveau front.

### 7.4 Edges et déplacement vers un autre canvas

Chaque ajout d'edge, public ou interne, vérifie ses deux extrémités dans la
transaction d'insertion. Une vérification dans une query précédente d'une action
ne couvre pas une suppression concurrente. Les mises à jour d'extrémités, si
autorisées, font les mêmes contrôles.

`moveToCanvas` reste **une transaction bornée** :

1. Vérifier accès editor et état actif des deux canvas, puis toute la sélection.
2. Vérifier les collisions de `nodeId` et `edgeId` dans la cible. Les clones
   conservent leurs IDs, donc les collisions ne sont pas seulement probabilistes.
3. Refuser une sélection qui laisserait un `parentId` inter-canvas, en contrôlant
   aussi les enfants non sélectionnés des parents déplacés. L'UI peut compléter
   la sélection avant l'appel, mais le serveur ne devine pas l'intention.
4. Déplacer les placements et leurs nodeDatas ensemble. Déplacer les edges dont
   les deux extrémités suivent ; supprimer ceux qui traversent la sélection.
5. Mettre à jour le rattachement des chunks et les deux compteurs dans cette
   transaction, puis les dates de récence des deux canvas.

Une collision est refusée avant validation de la transaction. Pas de remapping
silencieux : il faudrait aussi réécrire edges, chunks, parents et autres références.
Un dépassement de budget annule tout et invite à réduire l'opération. Un protocole
de déplacement multi-lots est explicitement reporté.

### 7.5 Suppression et purge

**Suppression d'une sélection de nodes :** transaction bornée supprimant les
placements, leurs edges incidents et les nodeDatas associés, après validation des
rattachements et de l'unicité. Refuser la sélection si un enfant hors sélection
référence un parent supprimé ; proposer de compléter la sélection, sans détacher
ou supprimer implicitement les enfants. Créer le checkpoint final et le tracing
une seule fois, mettre à jour le compteur, puis programmer le nettoyage des
dépendances par `nodeDataId`. Le contenu courant ne doit plus être lisible pendant
ce nettoyage.

La suppression logique du nodeData et la conservation de son checkpoint ne
dépendent donc pas d'un job ultérieur non borné. Les workers nettoient memories,
chunks et références R2 par sous-lots et fonctionnent si le nodeData n'existe plus.
Les nouvelles écritures sur ses enfants exigent un parent encore vivant.

Si la sélection ou le degré d'un node empêche cette suppression atomique, refuser
clairement et proposer de réduire la sélection ou de retirer des connexions.
La suppression du canvas entier reste disponible via le chemin ci-dessous.

**Suppression d'un canvas :** poser `deletedAt` et planifier la purge dans la même
mutation. Tous les lecteurs métier le cachent immédiatement. La purge parcourt
les placements et les nodeDatas par leurs deux index, pour couvrir aussi les
orphelins, puis les edges et shares. Supprimer physiquement le parent seulement
après vidage vérifié de ces enfants ; suivre séparément les nettoyages R2 en attente.

Chaque continuation a un état de progression borné et durable, est idempotente
et peut être relancée après échec. Ne pas transporter un tableau géant de tous
les IDs dans les arguments du scheduler. Les budgets incluent le fan-out d'un seul
nodeData. Une seconde exécution ne recrée pas de checkpoint et ne décrémente pas
de nouveau un compteur déjà mis à jour.

Les effets métier de `deleteNodeDataWithCascade` sont conservés, **pas son corps
inchangé**. Respecter les références R2 des autres nodeDatas et le fallback des
versions. La conservation des snapshots n'ajoute pas, à elle seule, une garantie
de rétention des blobs déjà absente du modèle actuel.

### 7.6 Récence et compteurs

| Opération | `canvases.updatedAt` |
| --- | --- |
| Création/suppression/déplacement inter-canvas de nodes | Oui, une fois par transaction et canvas. |
| Édition réelle du contenu, restauration, images ajoutées | Oui, hors no-op. |
| Renommage, description, background | Oui. |
| Ajout/suppression de connexions | Oui, changement structurel. |
| Drag, resize, z-index, couleur, variant, verrouillage, masquage | Non. |
| État runtime d'App, erreurs, statut de génération d'image | Non. |

Identifier tous les chemins de contenu, notamment `appendImages`, les edits
BlockNote et le restore ; ils ne passent pas tous nécessairement par `updateValues`.
Les signatures de contenu n'acquièrent pas de nouveau `canvasId` venant du client.

Le compteur évolue par delta après B, sauf audit/réparation explicite. Un retry
ou une suppression déjà appliquée ne modifie pas de nouveau la cardinalité.

Le canvas n'est pas entièrement « froid » : deux éditions de contenu peuvent
toujours se contendre sur sa date, comme deux créations sur son compteur. Mesurer
ce coût ; un mécanisme de coalescence serait un chantier ciblé, pas une promesse
de zéro OCC dans tous les parcours.

### 7.7 Lecteurs serveur et IA

| Surface | Adaptation |
| --- | --- |
| `nodeDatas.listByCanvasId` | Lecture par `nodeDatas.by_canvasId`, sans lecture des placements. |
| `nodeTemplates.listForCanvas` | Résoudre les templates depuis les nodeDatas autorisés, pas `canvas.nodes[].data`. |
| `listRecentByCanvasId` | Index `canvasId/updatedAt`, limite validée, puis lookup du placement par `by_nodeDataId`. |
| `chunkBuilder` | Lookup exact du placement et contrôle du rattachement ; aucun choix arbitraire parmi des doublons. |
| Génération d'image | Placement exact, edges entrants par index, validation actuelle des références. |
| `getNodeWithNodeData` | Conserver son contrat exact et vérifier le rattachement du contenu. |
| List/read tools | Listings bornés ou paginés ; annoncer réellement la troncature et ses limites. |
| Validation de cellules et connexions | Lookups exacts des IDs/endpoints demandés, pas un préfixe de canvas. |
| Minimap et contexte IA | Adapter `generateCanvasMinimap` et `getCanvasChangesSinceLastMessage`. |
| Export | Pages de nodes/edges/contenu assemblées côté client, avec droits revérifiés. |
| Onboarding | Clone atomique borné, starters audités ; aucun canvas partiellement cloné présenté comme prêt. |

Les récents sautent les contenus sans placement avec une sur-lecture bornée et
un comportement de pagination/limite documenté. Ils peuvent être invalidés par un
drag puisqu'ils lisent des placements : ce chemin n'est pas le store de contenu.

Ne pas remplacer aveuglément `getCanvasNodesAndEdges` par `.take(N)`. Les tools de
tables et de connexions utilisent aujourd'hui son résultat comme ensemble
exhaustif. Les déplacer vers des lookups exacts ; réserver les résultats partiels
aux listings, avec détection par `N+1` ou pagination et propagation jusqu'au LLM.
Un filtre appliqué après troncature ne permet pas de retrouver un node hors page.

Les tools IA/MCP peuvent être adaptés lorsque leur contrat sémantique l'exige.
Il n'y a pas de contrainte artificielle sur le nombre de fichiers modifiés.

**Sortie de l'étape 3 :** ancien build réellement testé contre B, tous les lecteurs
serveur sur les tables, M1 désactivée et nouvelles API testées.

**Retour arrière :** utiliser une version backend compatible avec les tables.
Après la première écriture tables-only, les arrays sont périmés : revenir à A
perdrait les changements récents. Toute restauration de snapshot est une opération
distincte, approuvée et tenant compte des écritures postérieures au snapshot.

## 8. Étape 4 : frontend F et contrats de synchronisation

### 8.1 Quatre flux indépendants

| Abonnement | Lecture utile | Invalidé par un drag seul |
| --- | --- | --- |
| `canvases.read` | Métadonnées et background | Non. |
| `nodes.listByCanvas` | Placements du canvas et droits canvas | Oui. |
| `edges.listByCanvas` | Connexions du canvas et droits canvas | Non. |
| `nodeDatas.listByCanvasId` | Contenu par `canvasId` et droits canvas | Non. |

Ces flux sont exhaustifs dans les limites de phase 1. `undefined`, tableau vide
et erreur sont trois états différents. Un dépassement de capacité ne devient
jamais un tableau vide ou un canvas éditable incomplet.

- Au bootstrap, attendre métadonnées, nodes, **edges et nodeDatas**, puis hydrater
  les stores avant de monter les consommateurs interactifs.
- Attendre les edges est nécessaire pour les AppNodes qui lisent leurs entrées
  une seule fois au montage. Les templates nécessaires doivent aussi être prêts
  avant de monter leur éditeur custom.
- Isoler la synchronisation par `canvasId` et vider l'ancien état lors d'un
  changement de route. Ne pas combiner les nodes d'un canvas et le contenu d'un autre.
- Lors des mises à jour, préserver l'état local en cours et attendre l'hydratation
  du contenu d'un nouveau placement avant de monter son éditeur. La séparation
  des effets Zustand/React Flow ne doit pas exposer un état transitoire cassé.
- Adapter `useCanvasBootstrap`, la route `$canvasId`, `CanvasFlow` et `MobileCanvas`.
  Supprimer l'extraction par `delete` et le `JSON.stringify` de l'ancien DTO.

### 8.2 Optimisme et création

- Rebrancher tous les optimistic updates de nodes sur le cache de la nouvelle
  query de nodes, et ceux des edges sur la query d'edges.
- Conserver `pendingAutoSizeIds`, ses deux gardes de réconciliation/persistance,
  le seuil de dimensions, `dragging`, `resizing`, `selected` et les comparateurs
  d'identité. Le split ne remplace pas ces protections locales.
- Tester un autosize de titre A pendant un drag de B dans la fenêtre de debounce.
  La query de nodes peut encore renvoyer l'ancienne taille de A.
- Retirer le faux `resizing: true` des menus de variant seulement après fusion des
  écritures et validation de l'optimisme équivalent. Le vrai état de resize reste.
- `useCreateNode` appelle la création atomique, transmet le `zIndex` calculé et le
  cadrage des viewports, et conserve son retour `{ nodeId, nodeDataId }`.
- Éviter un double ajout quand la subscription voit le node avant le retour de la
  mutation : insertion locale idempotente par `nodeId`, avec sélection conservée.
- `NodeAddChange` ne repersiste pas une création déjà effectuée par cette mutation.
  Inventorier les autres chemins `addNodes` avant de retirer sa branche historique.

### 8.3 Ingestion et erreurs

La séquence reste : **création visible, upload, remplissage**. Ne pas attendre
l'upload pour créer le node. La duplication réutilise les values et conserve les
références R2 partagées via la mutation commune.

`createNodesFromFiles` utilise `createMany` dans la limite du lot ; les nodes du lot
apparaissent ensemble, les uploads restent indépendants. Un dépôt plus gros est
découpé explicitement côté client, sans prétendre qu'il est atomique globalement.

Sur échec d'upload, utiliser `deleteElements` ou le chemin commun de suppression
persistée, pas `setNodes(filter)`. Suivre aussi l'échec éventuel du rollback.
Hors ligne, les mutations Convex peuvent rester en attente puis être rejouées :
tester la convergence après reconnexion, ne pas exiger un rejet réseau immédiat.

Envelopper créations/suppressions/éditions d'edges dans le suivi de synchronisation
et d'erreurs utilisé pour les nodes. Un refus serveur remonte à l'utilisateur ;
la connexion perdue se présente comme une synchronisation en attente.

### 8.4 Surfaces à préserver

Les listings home/sidebar continuent de recevoir `nodeCount`. Adapter seulement
les composants dont le contrat change réellement, sans promettre zéro modification.
L'export reçoit séparément métadonnées, nodes et edges.

Vérifier navigation et deep links, mentions, `windowsStore`, attribution de la
window singleton viewport, marqueurs de tâches par nodeDataId, recherche, génération
d'images et entrées des AppNodes. Les converters doivent conserver les identités
publiques attendues par toutes ces surfaces.

**Sortie de l'étape 4 :** nouveau front validé sur desktop/mobile et coexistence
ancien/nouveau build testée sur le même canvas.
**Retour arrière :** l'ancien front reste utilisable grâce aux adaptateurs de B.

## 9. Étape 5 : stabilisation et preuve de fonctionnement

À chaque lot de code : `yarn typecheck` et `yarn typecheck:convex`. Exécuter aussi
la suite ajoutée pour ce chantier. Le typecheck ne prouve ni les droits, ni les
interleavings de migration, ni le comportement d'anciens clients.

### 9.1 Tests automatisés obligatoires

| Domaine | Scénarios minimaux |
| --- | --- |
| Droits | Owner/editor/viewer/public anonyme ; mauvais canvasId ; rattachement tiers refusé à l'ajout, lecture et cascade. |
| Intégrité | Doublons d'IDs et de nodeData, y compris intra-lot ; type/parent incohérent ; suppression concurrente d'une extrémité d'edge. |
| Création | Unicité atomique contenu/placement/edges ; échec d'une source annule tout ; compteur et refs R2 exacts. |
| Déplacement | Edges internes conservés, externes retirés ; chunks et canvasIds cohérents ; collision entre clones refusée ; dépassement sans écriture partielle. |
| Suppression | Edges supprimés ; parent avec enfant hors sélection refusé ; contenu illisible dès commit ; checkpoint unique ; duplication R2 préservée ; purge relancée après échec. |
| Soft-delete | Deux helpers d'accès, listings, dernier modifié, export, downloads et jobs retardés. |
| Migration | Normalisation des deux domiciles, miroir absent/divergent, reprise, mutation concurrente, inscription tardive et suppression du parent. |
| Legacy | Création commencée avant B et terminée après ; appel rejoué ; ancien `readCanvas` après nettoyage physique des arrays. |
| Lectures bornées | Listing tronqué annoncé ; lookup d'un ID au-delà du premier lot réussi ; export complet ; dépassement UI explicite. |
| Schéma | Nettoyage des champs avant retrait ; nouveaux canvas avec compteur présent ; M1 refusée après B. |

Les tests de logique utilisent `convex-test`. Les garanties réelles de réseau,
OCC et déploiement sont aussi vérifiées en environnement isolé avec deux clients ;
ne pas les déduire uniquement du simulateur.

### 9.2 Parcours et mesures

- Créer, dupliquer, déplacer, redimensionner, changer variant/couleur/z-index,
  masquer, verrouiller et supprimer ; recharger et vérifier la persistance.
- Déposer dix fichiers, provoquer un échec partiel puis une coupure réseau ; après
  reconnexion, aucun node dont le rollback a réussi ne réapparaît.
- Autosize de titre pendant un autre drag, et resize manuel après édition.
- Créer/supprimer un viewport et vérifier la transmission de sa fenêtre singleton.
- AppNodes avec entrées connectées dès le premier montage, et images avec références.
- Agent : création connectée atomique, lecture/listing, cellules node, BlockNote,
  recherche et mentions ; nouvelle inscription avec starters complets.
- Supprimer un gros canvas : disparition immédiate, purge qui progresse et finit,
  sans blocage sur le fan-out d'un seul nodeData.
- Export et fenêtres d'historique, ancrages des tâches et navigation vers les nodes.
- Deux builds et deux utilisateurs : aucune disparition ou écriture figée causée
  par la bascule ; tester aussi un ancien onglet revenu après une période hors ligne.

Mesurer avant/après sur un jeu comparable : octets lus/écrits par drag, exécutions
des queries sidebar/contenu/templates, latence et retries OCC. Sous le nouveau
front, un drag seul ne doit plus invalider ces trois surfaces. La query de nodes
reste invalidée, et le DTO legacy reste coûteux tant que des anciens clients l'utilisent.

Un drag sur A et une édition sur B ne partagent plus le canvas dans leurs write
sets. Deux drags sur des nodes indépendants ne doivent pas provoquer une contention
de graphe partagé. Mesurer séparément les créations, edges et bumps de récence,
qui ont d'autres sources légitimes de contention.

**Sortie de l'étape 5 :** rapport de tests, audit tables-only, mesures et suivi des
jobs en erreur validés. Fixer la fenêtre d'observation avant M2 ; aucune suppression
du stockage legacy tant qu'une anomalie d'intégrité demeure inexpliquée.

## 10. Étape 6 : migration M2, nettoyage du stockage

Cette migration est distincte de M1 : **elle ne copie aucune donnée depuis les
arrays**. Elle intervient seulement après stabilisation de B/F.

1. Confirmer que tous les écrivains sont tables-only, que les lecteurs legacy
   reconstruisent leur DTO et que les jobs M1 sont arrêtés/inopérants.
2. Prendre le snapshot de sécurité prévu et répéter le nettoyage à blanc.
3. Par lots, retirer réellement `canvases.nodes` et `canvases.edges` des documents
   avec un patch à `undefined`, pas leur affecter `[]`.
4. Retirer les champs temporaires `graphRevision` et `graphMigrated`. Le backend B
   ne doit plus les écrire ni en dépendre après la certification de M1.
5. Après audit et traitement des éventuelles valeurs historiques, retirer
   `nodeDatas.removedFromCanvasAt` et ses filtres de lecture devenus sans objet.
6. Vérifier puis traiter les éventuels documents de `scheduledJobs` avant retrait
   de sa déclaration. Retirer une table du schéma ne supprime pas ses documents.
7. Vérifier absence des champs retirés, présence de `nodeCount` partout, invariants
   des tables et fonctionnement du DTO legacy sans arrays stockés.

M2 est idempotente et peut reprendre après interruption. Elle ne modifie ni les
llmId, ni les valeurs de contenu, ni les chunks légitimes, ni les versions conservées.
Une réparation d'orphelins non décidée en étape 0 reste une opération séparée.

**Sortie de l'étape 6 :** audit physique du stockage réussi et aucun job de
migration susceptible de réécrire les champs retirés.
**Retour arrière :** conserver un backend tables-only ; ne pas tenter de réactiver
les arrays. Les adaptateurs ne dépendent pas de leur présence physique.

## 11. Étape 7 : backend C, resserrage

Après M2 seulement : retirer les champs legacy et temporaires des validateurs,
rendre `nodeCount` obligatoire et retirer les déclarations de tables obsolètes
dont le nettoyage est confirmé. Supprimer le dual-write et les helpers inutiles
qui subsisteraient, mais conserver les adaptateurs publics encore nécessaires.

Vérifier les références aux anciennes fonctions internes avant de les supprimer :
des tâches planifiées peuvent porter leur nom. Drainer, annuler ou conserver une
entrée sûre tant que des continuations connues existent.

Mettre à jour l'historique de `convex/migrations.ts` avec les déploiements concernés,
les rapports et le résultat des migrations. Ne pas conserver un backfill manuel
réexécutable qui ressusciterait un graphe à partir d'une ancienne représentation.

**Fin du chantier de stockage :** le modèle physique est séparé, le nouveau front
n'utilise plus le DTO monolithique et les anciennes API lisent les mêmes tables.

## 12. Étape 8 : retrait conditionnel des anciennes API

Cette étape n'est **pas un prérequis** au nettoyage des arrays ni au schéma final.
Elle peut être différée si les anciens clients ne peuvent pas être retirés sûrement.

- Mesurer les appels legacy sans enregistrer de contenu utilisateur.
- Établir une politique explicite de versions supportées et une demande de mise à
  jour compréhensible. Un silence dans les logs ne prouve pas l'absence d'onglets
  dormants ou de mutations encore en attente hors ligne.
- Tester reconnexion et créations en deux appels à la frontière du retrait. Ne
  pas accepter le premier appel puis faire disparaître le second sans stratégie.
- Tant que cette frontière n'est pas sûre, garder les adaptateurs sécurisés.
  Une éventuelle réponse `UPDATE_REQUIRED` doit arriver avant toute écriture,
  avec un parcours de rechargement testé et traitement des créations déjà engagées.
- Une fois le retrait validé, `nodeDatas.create` public et l'ajout legacy avec un
  contenu fourni peuvent disparaître. Les primitives internes gardent les checks.

Auditer alors les derniers nodeDatas sans placement issus du chemin legacy.
Ne pas les supprimer automatiquement : sauvegarde et règle de réparation validée,
avec maintien des références de fichiers et des versions nécessaires.

## 13. Cartographie de l'implémentation

| Domaine | Fichiers principaux à inspecter/adapter |
| --- | --- |
| Schéma et migration | `convex/schema.ts`, `convex/schemas/*`, `convex/migrations.ts`, configuration du composant migrations. |
| Droits | `convex/lib/auth.ts`, surfaces publiques, wrappers de lecture et contrôle des parents dans les writers internes. |
| Modèles de graphe | `models/canvasNodeModels.ts`, `models/canvasEdgeModels.ts`, futurs modèles nodes/edges et adaptateurs. |
| Cycle de vie | `models/canvasModels.ts`, `models/nodeDataModels.ts`, modèles chunks/R2/versions, `models/onboardingModels.ts`. |
| API | `canvases.ts`, `canvasNodes.ts`, `canvasEdges.ts`, nouveaux `nodes.ts`/`edges.ts`, `nodeDatas.ts`, `wrappers/*`. |
| Lecteurs transverses | Templates, recherche, `ia/imageGeneration.ts`, helpers minimap/contexte, `uploads.ts`, `dataExport.ts`. |
| Tools et MCP | Création, connexion, listing/lecture, validation des cellules node et contrats MCP concernés. |
| Frontend | Bootstrap, hooks nodes/edges/création/ingestion, autosize, menus de variant, converters, routes desktop/mobile, export. |
| Régressions | Fenêtres, singleton viewport, mentions, ancrages de tâches, AppNodes, fichiers partagés et historique. |

Cette liste oriente le travail ; elle ne remplace pas un inventaire des accès
directs aux arrays et des écritures de rattachement. Aucun nombre fixe de fichiers
modifiés n'est un critère de qualité ou de réussite.

## 14. Suites hors phase 1

### 14.1 Évolutions de capacité

Après mesures, décider séparément du chargement paginé/partiel des grands canvas,
du déplacement multi-lots avec état d'opération durable, du clonage asynchrone de
sources volumineuses et d'une éventuelle coalescence de la récence.

Un déplacement multi-lots devra définir sélection globale, visibilité pendant
l'opération, edges entre lots, références de recherche, reprise idempotente,
annulation et comportement si les droits changent. Ajouter « par lots » à une
boucle existante ne fournit pas ces garanties.

### 14.2 Contenu autonome et multi-placement

Le retrait de `nodeDatas.canvasId` exige une nouvelle spec et sa propre migration :

- Définir la propriété du contenu avant d'ajouter/backfiller `ownerId`. Le créateur
  du canvas courant est reconstructible ; l'auteur/propriétaire d'origine après
  des déplacements ne l'est pas nécessairement. Ne pas confondre ces sémantiques.
- Généraliser les partages et les droits directs du nodeData. Un éventuel contexte
  canvas fourni par le client doit être validé, jamais devenir une échappatoire.
- Repenser le scope de recherche : `canvasId` et `nodeId` ne décriront plus un
  placement unique. Choisir une stratégie avec des garanties de filtrage et de
  rappel, pas seulement un post-filtrage supposé suffisant.
- Décider du modèle de membership séparément de la géométrie pour ne pas réintroduire
  automatiquement des invalidations de contenu à chaque drag lors des joins.
- Adapter la cascade, la gestion des contenus détachés, les versions et les accès
  fichiers à plusieurs placements ou à des droits directs.
- Revoir toutes les maps nodeDataId vers un seul nodeId, les mentions, fenêtres,
  marqueurs de tâches et ambiguïtés de navigation.

La phase 1 prépare ces évolutions par des identités stables et des invariants
explicites. Elle ne les implémente pas et ne doit pas en anticiper les droits.
