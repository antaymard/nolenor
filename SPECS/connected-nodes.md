# Nodes connectés (Gmail, GitHub, Jira…) — Spec & Plan

> Feature : ouvrir le canvas aux objets qui vivent dans d'autres services. Un
> thread Gmail, une PR GitHub, un ticket Jira, un Google Doc deviennent des
> nodes lisibles dans Nolënor, qui restent à jour, et sur lesquels on peut agir
> — Nolë prépare un draft, l'utilisateur l'envoie d'un clic, puis suit le mail.
> La barre de recherche devient une omnibarre : elle cherche aussi dans les
> systèmes connectés et pose le node trouvé sur le canvas.
>
> Statut : **socle `connections` livré** (§6), le reste est du plan.

---

## 0. État des lieux

Le terrain est mieux préparé qu'il n'y paraît.

- `convex/lib/apiTokenCrypto.ts` appelle déjà `crypto.subtle` **depuis une
  mutation** : le runtime V8 de Convex fait de la Web Crypto, aucun `"use node"`
  n'est nécessaire pour chiffrer. Vérifié en round-trip AES-GCM avant d'écrire
  le socle.
- `convex/http.ts` sert déjà des `httpAction` publics avec garde d'origine,
  rate limiting par IP et auth par Bearer (route MCP). Un flux OAuth s'y range
  sans rien inventer. **Un déploiement Convex a une URL `.convex.site` publique
  même en dev** : callbacks OAuth et, plus tard, webhooks fonctionnent en local
  sans ngrok.
- Le découpage `schemas/` → `models/` → `wrappers/` → fonctions publiques est
  net et systématique.
- `convex/config/nodeConfig.ts` et `convex/ia/tools/index.ts` sont deux
  registres déclaratifs consommés par plusieurs surfaces. **C'est la forme du
  registre de providers.**
- `r2Objects` fait déjà du **comptage de références** sur une ressource
  partagée par plusieurs nodes : le modèle à recopier pour les abonnements
  webhook (N nodes → 1 abonnement chez le provider).
- `@convex-dev/rate-limiter` est installé, et `convex/lib/rateLimits.ts` a la
  bonne doctrine : borner ce qui coûte de l'argent réel ou tape un tiers.
- `nodeDatas.imageGeneration` vit **volontairement hors de `values`** parce
  qu'un write dans `values` déclenche checkpoint de version, réconciliation R2
  et réindexation. C'est le précédent qui commande le chemin d'écriture de la
  sync (§5.3).
- L'auth Google existe déjà — mais pour le **login**, à ne pas confondre avec
  une connexion Gmail (§1.4).

Frictions connues, déjà documentées dans `custom-nodes-templates.md` §0 :
`nodeTypeValidator` est un enum fermé consommé par une dizaine de switchs par
type (`chunkBuilder`, `getNodeDataTitle`, `makeNodeDataLLMFriendly`, minimap,
`WindowBody`, `WINDOW_SIZE_BY_TYPE`, `createNodeTool`…). Le node `fetch` existe
côté front sans exister côté backend — le précédent de désynchronisation à ne
pas reproduire. Composio a été branché puis **commenté**
(`convex/ia/noleCompletion.ts:68-88`) ; ses deux paquets restent dans
`package.json` et se contredisent en peer deps, au point de casser `npm ci`.

---

## 1. Décisions structurantes

### 1.1 Un type de node `connected` générique ✅

**Un seul littéral** ajouté à `nodeTypeValidator`. Le provider et la ressource
vivent dans `values` ; un sous-registre front `provider+resource → renderer`
fait le rendu — exactement comme `custom` délègue à `nodeTemplates`.

L'alternative (un `nodeType` par provider) donne gratuitement les icônes, les
filtres de recherche et les schémas par service, mais rouvre les dix switchs
par type à chaque intégration. Au dixième provider, c'est dix fois le même
travail ; ici c'est un module de données et un renderer.

L'alternative « tout en `nodeTemplates` » est écartée pour la raison inverse :
un template est un sac de champs éditable par l'utilisateur, sans provenance
distante, sans cycle de sync, et sans rendu dédié (fil de discussion, diff de
PR).

### 1.2 Connecteurs maison, sur Convex ✅

Table `connections` + chiffrement enveloppe + flux OAuth en `httpAction`. Pas de
Nango ni de Composio.

Ce qui coûte cher dans une intégration n'est pas la danse OAuth — c'est la
couche fetch/normalisation, que ces produits ne fournissent pas dans la forme
dont nos nodes ont besoin. Composio a déjà été essayé puis retiré ; le
`composioSanitizer` qui `JSON.stringify` toutes les sorties de tools dit assez
le degré d'ajustement que réclamait son modèle. Et un token qui reste chez nous
est un tiers de moins dans le chemin critique.

### 1.3 Pull d'abord, webhooks ensuite ✅

v1 : rafraîchissement à l'ouverture, bouton manuel, cron sur les canvas
récemment ouverts. Le socle indexé (`connectedRefs`) est posé dès le départ
pour que les webhooks se branchent dessus sans refonte (§5).

### 1.4 La connexion Gmail ne réutilise pas le login Google ✅

Deux raisons, et aucune n'est négociable :

- `@convex-dev/auth` ne conserve pas de refresh token. Sans `access_type=offline`
  ni `prompt=consent`, il n'y a rien à rafraîchir : la connexion meurt au bout
  d'une heure.
- Si les scopes Gmail vivaient sur le provider de login, révoquer l'accès Gmail
  casserait la connexion au produit.

Deux clients OAuth, deux consentements, deux jeux de variables d'environnement.

---

## 2. Architecture

```
┌─ providersConfig ──────────────────────────────────────────────┐
│ registre déclaratif : auth, hôtes API, ressources, patterns    │
│ d'URL, recherche, normalisation, actions, événements webhook   │
└───┬────────────┬───────────────┬──────────────┬────────────────┘
    │            │               │              │
┌───▼─────┐ ┌────▼──────┐ ┌──────▼──────┐ ┌─────▼────────┐
│connexions│ │ resolver  │ │  omnibarre  │ │ sync (pull   │
│+ crypto  │ │ URL→ref   │ │  fédérée    │ │ puis push)   │
└───┬──────┘ └────┬──────┘ └──────┬──────┘ └─────┬────────┘
    │             └───────────────┴──────────────┘
    │                             │
┌───▼──────────────┐   ┌──────────▼──────────────────┐
│ broker d'appels  │   │ node `connected`            │
│ (proxy crédité)  │◄──┤ values.remote / values.local│
└───┬──────────────┘   └─────────────────────────────┘
    │
    ├─ app node (SDK `nolenor.call`)
    ├─ tools de l'agent
    └─ actions utilisateur (envoyer, commenter, transitionner)
```

Les briques 1 (connexions + crypto) et 6 (graine du broker) sont **livrées**
(§6). Les autres sont décrites ici et découpées en phases (§9).

---

## 3. Le registre de providers

Un module déclaratif par service, seul point d'extension :

```ts
{ id, label, icon,
  auth: { authorizeUrl, tokenUrl, scopes, usePkce, readCredentials, … },
  apiHosts: [...],                      // allowlist SSRF
  identity: { url, parse, summarize },  // qui est ce compte
  resources: {                          // à venir, phases 1-2
    thread: {
      urlPatterns: [...],                  // collage → ref
      fetch(ref, client) → RemoteObject,   // normalisé
      search(query, client) → Candidate[], // omnibarre
      actions: { reply, archive, … },
      webhook: { events, toRef },
    },
  },
}
```

Deux règles apprises en écrivant le socle :

- **`readCredentials` est une fonction, pas un nom de variable.** Le runtime
  Convex ne garantit que les accès `process.env.X` statiques. Un
  `process.env[nom]` calculé rendrait `undefined` partout — soit un provider
  éternellement « non configuré », sans la moindre erreur pour le dire.
- **`apiHosts` n'inclut pas les endpoints d'auth.** Un appel proxifié n'a
  aucune raison d'aller parler au serveur de tokens.

---

## 4. Le node `connected`

```ts
values = {
  provider, resource, connectionId, ref,      // identité
  remote: { title, url, status, participants, updatedAt, body, raw },
  local:  { draft?, notes? },                 // ce que l'utilisateur possède
  sync:   { lastSyncedAt, cursor, state },
}
```

**La séparation `remote` / `local` est la décision structurante du node.** Une
synchronisation ne doit jamais écraser ce que l'utilisateur ou Nolë a écrit. Un
draft vit dans `local` jusqu'à l'envoi ; une fois envoyé il acquiert un `ref` et
bascule sous le régime `remote`.

**`remote` est normalisé** — titre, url, statut, participants, corps — et le
`raw` du provider rangé à côté. Sans cette enveloppe, chaque consommateur
(indexation de recherche, sérialisation pour le LLM, titre du node, minimap)
redevient spécifique au provider, et le dixième provider coûte aussi cher que
le premier.

`connectionId` et pas seulement `provider` : deux comptes Gmail sont deux
connexions, et un node doit savoir par laquelle il passe.

---

## 5. Synchronisation

### 5.1 Trois niveaux

1. **À la demande** — refresh à l'ouverture du node ou de la window
   (stale-while-revalidate) et bouton manuel.
2. **Pull de fond** — cron sur les nodes des canvas récemment ouverts
   uniquement. Sans ce filtre, le coût croît avec le stock mort.
3. **Push (webhooks)** — route unique `/webhooks/:provider` → vérification de
   signature → écriture d'un événement brut dans un ledger append-only (dédup
   par id d'événement du provider) → action de fan-out → patch des nodeDatas.
   Le handler rend 200 vite ; le travail se fait après, parce que les providers
   réessaient.

### 5.2 `connectedRefs` dès la v1

`values` est un `record(string, any)` : **on ne peut pas indexer dedans**. Sans
une table dédiée, un webhook ne saurait jamais quels nodes réveiller. D'où, dès
le premier jet et même sans webhooks :

```
connectedRefs: { provider, externalId, nodeDataId, connectionId }
  .index("by_provider_and_externalId", ["provider", "externalId"])
```

C'est elle qui portera plus tard le comptage de références des abonnements, sur
le modèle de `r2Objects`.

### 5.3 Les écritures de sync ne passent pas par `updateValues`

`nodeDataModels.updateValues` crée un checkpoint de version et replanifie
`chunkBuilder.rebuildChunks`. Une sync toutes les 30 s remplirait
`nodeDataVersions` de bruit machine et rejouerait de l'OCR et de la vision LLM
pour rien. Il faut un chemin d'écriture dédié — sans checkpoint, avec
réindexation débouncée — dans l'esprit de ce que fait déjà `imageGeneration` en
vivant hors de `values`.

### 5.4 Gmail est le cas difficile

Pas de webhook simple : `users.watch` + un topic Pub/Sub GCP, **qui expire tous
les 7 jours** et demande un cron de renouvellement. Raison de plus pour que le
premier jet soit en pull.

### 5.5 Ce que Convex donne gratuitement

Un patch de nodeData se propage à tous les canvas ouverts par réactivité. Aucun
polling client à écrire.

---

## 6. Le socle livré

### 6.1 Ce qui existe maintenant

| Fichier | Rôle |
|---|---|
| `convex/schemas/connectionsSchema.ts` | table `connections` : secret chiffré, scopes, statut, bail de refresh |
| `convex/schemas/oauthAttemptsSchema.ts` | consentement en vol, à usage unique |
| `convex/lib/secretCrypto.ts` | AES-GCM en enveloppe, versionné, + aléa (nonce, PKCE) |
| `convex/lib/allowedOrigins.ts` | allowlist d'origines, extraite d'`auth.ts` et partagée avec lui |
| `convex/config/providersConfig.ts` | registre : `google` (Gmail readonly) et `github` |
| `convex/models/connectionModels.ts` | upsert, révocation, bail de refresh, vue publique |
| `convex/models/oauthAttemptModels.ts` | création, consommation, purge |
| `convex/wrappers/connectionWrappers.ts` | surface interne pour actions et httpAction |
| `convex/lib/providerClient.ts` | échange de tokens, refresh sous bail, `probeIdentity`, `callProvider` |
| `convex/connections.ts` | `list`, `catalog`, `startOAuth`, `disconnect`, `testConnection` |
| `convex/http.ts` | route `GET /integrations/oauth/callback` |
| `src/routes/settings/connections.tsx` + `src/components/settings/connections/` | l'écran |

### 6.2 Le chiffrement

AES-GCM et pas CBC : GCM authentifie le chiffré, donc un octet modifié en base
fait échouer le déchiffrement au lieu de rendre un clair corrompu. Clé maître
en variable d'environnement, IV aléatoire par écriture, `keyVersion` stocké avec
chaque ligne pour permettre une rotation (poser la nouvelle variable, ajouter un
cas dans `readMasterKeyEnv`, laisser les lignes se réécrire au fil des refresh).

Le clair ne sort jamais de Convex : aucune query publique ne rend de matériel de
token, et le validator `returns` de `connections.list` en fait une garantie
vérifiée par le compilateur plutôt qu'une intention.

### 6.3 Le flux OAuth

```
startOAuth (mutation)          → écrit une ligne oauthAttempts, rend l'URL
  ↓ le front suit l'URL
consentement chez le provider
  ↓ GET /integrations/oauth/callback?code&state
consumeAttempt (usage unique)  → valide le nonce, supprime la ligne
requestToken                   → échange le code
probeIdentity                  → identifie le compte AVANT d'écrire
upsertFromOAuth                → chiffre, insère ou met à jour
  ↓ 302
/settings/connections?connected=google
```

Quatre choix qui méritent d'être dits :

- **`startOAuth` est une mutation, pas une action.** Rien n'y parle au réseau :
  on écrit une tentative et on assemble une URL. Autant que ce soit
  transactionnel, et que la tentative n'existe jamais sans son URL.
- **La tentative est consommée AVANT tout appel réseau.** Un `state` rejoué ne
  doit pas pouvoir déclencher un second échange de code, même si le premier a
  échoué en chemin.
- **L'identité est sondée avant l'écriture.** `externalAccountId` est la clé
  d'upsert : c'est lui qui distingue « reconnecter le même Gmail » de « en
  relier un second ». Écrire d'abord et corriger ensuite créerait, le temps d'un
  appel réseau, une ligne dont la clé est fausse.
- **Une seule route de callback pour tous les providers.** C'est le `state` qui
  porte le provider, pas le chemin : une adresse de moins à recopier dans chaque
  console.

### 6.4 Le bail de refresh

Dix nodes qui se réveillent ensemble sur un token expiré déclencheraient dix
refresh concurrents — et Google invalide les refresh tokens qu'il voit rejouer.
`claimRefresh` pose un `refreshingUntil` dans une mutation : la
transactionnalité de Convex fait que deux appelants ne peuvent pas le lire et
l'écrire tous les deux. Les éconduits attendent brièvement puis relisent la
ligne.

Piège associé : Google ne renvoie pas de refresh token à chaque refresh.
L'écraser avec `undefined` condamnerait la connexion au cycle suivant — le code
conserve donc l'ancien quand la réponse n'en porte pas.

### 6.5 Les gardes de `callProvider`

- **Allowlist d'hôtes par provider**, sinon `callProvider` est un proxy SSRF
  authentifié — avec un token attaché, en prime.
- **`redirect: "manual"`**, parce qu'un 302 vers un autre hôte contournerait
  l'allowlist en emportant l'en-tête `Authorization`.
- **Plafond de lecture** : une action Convex n'est pas un proxy.
- **401/403 ⇒ `needs_reauth`** : le credential a été révoqué chez le provider
  pendant qu'on l'avait en base ; la connexion doit le dire, pas rendre une
  erreur opaque à chaque appel suivant.

### 6.6 Variables d'environnement

```
npx convex env set CONNECTIONS_MASTER_KEY "$(openssl rand -base64 32)"
npx convex env set GOOGLE_INTEGRATION_CLIENT_ID     <...>
npx convex env set GOOGLE_INTEGRATION_CLIENT_SECRET <...>
```

URI de redirection à déclarer chez le provider :
`<CONVEX_SITE_URL>/integrations/oauth/callback`. L'écran de settings l'affiche
pour les providers non configurés, ainsi que le nom des variables manquantes —
`redirect_uri_mismatch` est l'erreur qu'on ne veut pas chercher deux fois.

---

## 7. Le broker d'appels

C'est la réponse à « que l'app node ou du code généré par l'IA puisse taper des
API privées sans manipuler les credentials ».

Aujourd'hui `nolenor:fetch` (`src/hooks/useAppNodeRunner.ts`) exécute le `fetch`
**dans le navigateur**. Un secret ne peut pas passer par là. Le broker inverse
le sens :

```
nolenor.call(connectionId, request)
  → postMessage
  → action Convex : authentifie, vérifie l'hôte, injecte le credential,
    borne la réponse, journalise
  → seul le corps revient
```

Le navigateur ne voit qu'un `connectionId` opaque. `isPrivateUrl`, aujourd'hui
côté front, remonte côté serveur : c'est là qu'un garde SSRF a une valeur.

La même action sert les tools de l'agent (`call_connected_api`) et les actions
déclarées des ressources : une seule surface d'appel crédité, une seule surface
à auditer. Reste à ajouter par-dessus : un consentement par app node (« cette
app veut accéder à ton Gmail ») et un journal d'appels.

`lib/providerClient.callProvider` est cette action moins le consentement et le
journal. Les gardes qui comptent sont déjà là, posées pendant que la surface est
petite.

---

## 8. Angles morts

Les points qui ne sautent pas aux yeux, et qui changent des décisions de schéma.

**8.1 L'URL d'un mail Gmail n'est pas résolvable.** Les permaliens modernes
(`#inbox/FMfcgz…`) ne sont **pas** les `threadId` de l'API, et `/u/0/` est un
index d'ordre de connexion, pas une identité de compte : avec deux comptes
connectés, l'URL ne dit pas duquel elle vient. Donc (a) le collage Gmail passe
par une résolution best-effort — essai sur chaque connexion, recherche par
`rfc822msgid` — avec repli sur « choisis le thread » ; (b) **l'omnibarre est le
chemin principal pour Gmail**, le collage l'exception. Pour GitHub, Jira ou
Linear, dont les URLs sont propres et résolvables, c'est l'inverse. Cela
réordonne la roadmap : la recherche fédérée n'est pas un confort tardif, c'est
la porte d'entrée du premier provider.

**8.2 Un node connecté sur un canvas partagé fuit.** Le snapshot d'un thread
privé devient lisible par tous les viewers, et une action « Envoyer »
s'exécuterait avec les credentials du *propriétaire de la connexion*, pas de
celui qui clique. Règle à poser avant le premier node : la connexion appartient
à un utilisateur, les actions ne sont exécutables que par lui, et les autres
voient soit le snapshot, soit un placeholder selon un réglage du node. Sans
cette règle, la fonctionnalité est un incident de confidentialité en attente.

**8.3 Envoyer un mail deux fois est irréversible.** Toute action sortante a
besoin d'une clé d'idempotence et d'une machine à états persistée
(`pending → sent → failed`) — qui est aussi, gratuitement, le « suivi du mail ».

**8.4 Quotas des providers.** Gmail compte en unités par utilisateur, GitHub en
5000 requêtes/heure. Le throttle doit être **par connexion**, pas par
utilisateur Nolënor : c'est le quota du compte de l'utilisateur qu'on brûle, et
c'est lui qui se retrouve bloqué chez lui. Un backoff sur 429/403 va avec.

**8.5 Révocation et expiration.** Un token révoqué doit rendre un node en état
« reconnecter », pas une erreur qui casse le canvas. L'état de connexion fait
partie du rendu du node dès le premier jet.

**8.6 Taille et pièces jointes.** Un document Convex plafonne à 1 Mio : un
thread de 200 messages avec pièces jointes n'y tient pas. Corps tronqué,
pagination à la demande, pièces jointes dans R2 via `r2Objects` (comptage de
références déjà en place).

**8.7 Suppression et export.** Déconnecter un provider doit décider du sort des
snapshots (purge ou gel), et `convex/dataExport.ts` doit les couvrir. Déjà
partiellement traité : `disconnect` supprime la ligne plutôt que de la marquer
révoquée — la seule bonne façon de ne pas fuiter un credential est de ne plus
l'avoir. Reste à traiter, en phase 1 : les nodes qui pointent sur une connexion
supprimée.

**8.8 Indexation.** `chunkBuilder` doit indexer `remote.body` pour qu'un thread
Gmail soit trouvable par la recherche locale. Gratuit une fois l'enveloppe
normalisée en place, coûteux si on stocke du JSON brut de provider.

**8.9 Le callback OAuth est un endpoint public non borné.** Il est protégé par
l'usage unique de la tentative, mais un flot de requêtes invalides reste
possible. À border si l'endpoint devient visible.

---

## 9. Phases

| Phase | Contenu | État |
|---|---|---|
| **0** | Socle `connections` : schéma, chiffrement, OAuth, settings, `callProvider` | **fait** |
| **1** | Node `connected` + renderer Gmail thread en lecture + refresh à la demande + `connectedRefs` | à faire |
| **2** | Omnibarre : recherche Gmail → création de node (chemin principal, cf. §8.1) ; collage d'URL GitHub | à faire |
| **3** | Draft + envoi + suivi : ledger d'actions idempotent | à faire |
| **4** | GitHub en second provider — **le vrai test du registre**, tant que l'abstraction est bon marché à corriger | à faire |
| **5** | Broker complet : `nolenor.call` dans le SDK app node, tool agent, consentement par app, audit | à faire |
| **6** | Webhooks : ledger d'événements, abonnements comptés par référence, Pub/Sub Gmail + cron de renouvellement | à faire |

---

## 10. L'omnibarre

`useSearch` interroge `searchableChunks` : local, réactif, scopé au canvas. Le
distant ne peut pas être une query réactive — c'est une **action** par provider,
débouncée, avec son propre état de chargement. Les résultats locaux ne doivent
jamais attendre le réseau d'un tiers.

Le bon découpage est un registre de **sources de recherche** (locale, canvas,
providers…), chacune rendant des items d'une forme commune, et une seule UI de
liste. Reste à trancher, en phase 2 : `CommandCenter` (Cmd+K global) et
`SearchModale` (recherche canvas) sont aujourd'hui deux surfaces distinctes —
l'omnibarre les fusionne, ou n'étend que la seconde.
