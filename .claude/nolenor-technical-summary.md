# Nolënor — Résumé technique

_Dernière mise à jour : 20 mars 2026_

Ce document sert de contexte technique pour les agents et collaborateurs qui n'ont pas accès au code. Il décrit la stack, l'état actuel du produit, les chantiers en cours, et la vision.

---

## Nom et étymologie

Nolënor vient de l'Elfique de Tolkien : Nolë (la connaissance) + nor (la région, le territoire). Littéralement : « le territoire de la connaissance ».

L'agent IA principal s'appelle Nolë.

---

## Vision

Nolënor est un workspace visuel (canvas + nœuds) conçu pour l'ère agentique. La thèse fondatrice : les outils actuels de travail avec l'IA (chat linéaire d'un côté, agents autonomes boîte noire de l'autre) ne sont pas la bonne interface. Il faut un nouvel outil, de la même façon que Notion a été la bonne interface pour l'ère du collaboratif et du dynamique.

Nolënor propose une surface de contrôle visuelle et granulaire sur le travail de l'IA, avec deux modes d'interaction :

**Mode Tony Stark (réflexion humaine enrichie par l'IA)** : l'humain réfléchit, dirige, explore un sujet. Nolë exécute des sous-tâches en parallèle et renvoie des blocs visuels structurés (pas des pavés de texte). L'humain garde le rythme, zoome où il veut, approfondit tel ou tel aspect. L'IA est un accélérateur de pensée, non-bloquant.

**Mode workflow (réflexion IA enrichie par l'humain)** : l'humain construit un pipeline de blocs connectés (type n8n mais visuel, avec des résultats intermédiaires). L'IA déroule, l'humain intervient aux points de contrôle — valide, corrige, relance. Chaque étape est visible et manipulable sur le canvas.

La différenciation par rapport aux concurrents (Spine, Flowith, Miro AI) : Nolë opère sur des blocs structurés (pas du texte libre), les résultats intermédiaires sont visibles nœud par nœud, tout est non-bloquant (un nœud qui tourne n'empêche pas de bosser sur un autre), et l'humain peut intervenir à n'importe quel moment sur n'importe quel nœud.

---

## Stack technique

### Frontend

- **Framework** : React 19 + TypeScript
- **Build** : Vite 7
- **Routing** : TanStack React Router (file-based routing)
- **State management** : Zustand (6 stores principaux)
- **Canvas** : React Flow (@xyflow/react)
- **Rich text editor** : Plate.js (v51) avec une trentaine de plugins (headings, listes, tables, code blocks, math, media, mentions, emojis, comments, drag & drop, autoformat, export Markdown/DOCX)
- **UI** : Radix UI + shadcn/ui + Tailwind CSS 4
- **Drag & drop** : DnD Kit
- **Formulaires** : TanStack React Form + Formik
- **Icônes** : Lucide React + React Icons
- **Notifications** : Sonner + React Hot Toast

### Backend

- **Plateforme** : Convex (base de données temps réel, fonctions serverless, auth)
- **Agent IA** : @convex-dev/agent (framework d'agents Convex)
- **Auth** : @convex-dev/auth (email-based)
- **Temps réel** : natif Convex (queries réactives, mutations, actions)
- **Recherche** : full-text search Convex (index `search_name` sur les canvas)

### APIs externes

- **OpenRouter** : gateway pour tous les appels LLM (env var `OPENROUTER_API_KEY`)
- **Linkup API** : recherche web et extraction de contenu (env var `LINKUP_API_KEY`)
- **Mistral** : speech-to-text via Voxtral (env var `MISTRAL_API_KEY`)
- **LinkPreview API** : extraction de métadonnées d'URLs (env var `LINK_PREVIEW_APIKEY`)
- **Cloudflare R2 (via AWS SDK)** : stockage de fichiers avec URLs présignées
- **ElevenLabs** : text-to-speech (présent dans les dépendances, intégration en cours)

### Modèles IA utilisés

- `minimax/minimax-m2.7` (via OpenRouter) — agent Nolë principal + automation
- `stepfun/step-3.5-flash:free` (via OpenRouter) — agent Brain (génération interne)
- `anthropic/claude-sonnet-4-5` (via OpenRouter) — analyse de PDF
- `anthropic/claude-haiku-4-5` (via OpenRouter) — analyse d'images
- `voxtral-mini-latest` (Mistral) — transcription audio

---

## Architecture des données

Base Convex avec les tables principales suivantes :

### canvases

Table centrale. Chaque canvas contient :

- `creatorId` : ID de l'utilisateur créateur
- `name` : nom du canvas (indexé en full-text)
- `isPublic` : toggle public/privé (optionnel)
- `updatedAt` : timestamp de dernière modification
- `nodes` : tableau de nœuds (position x/y, dimensions, type, data, couleur, z-index, lock, hidden)
- `edges` : tableau d'edges (source, target, handles, data)
- `slideshows` : tableau de slideshows (chantier en cours)
- Index `by_creator` : lookup rapide par utilisateur
- Index `by_creator_and_updatedAt` : tri par dernière modification
- Index `search_name` : recherche full-text

### nodeDatas

Données persistantes de chaque nœud (séparées du canvas pour le temps réel) :

- `templateId` : référence au template (si nœud custom)
- `type` : type de nœud
- `values` : record clé-valeur (contenu du nœud)
- `status` : idle | working | error
- `automationMode` : off | agent | dataProcessing
- `agent` : configuration de l'agent (model, instructions, touchableFields)
- `automationProgress` : suivi temps réel (currentStepType, currentStepData, timestamps)
- `dependencies` : tableau de dépendances input/output avec d'autres nœuds
- `dataProcessing` : tableau de transformations champ par champ (field, sourceNode, expression)

### shares

Système de partage :

- `resourceType` : "canvas" (extensible)
- `canvasId`, `userId`, `permission` (viewer | editor), `grantedBy`
- Index `by_canvas_and_user`, `by_user`, `by_canvas`

### nodeTemplates

Templates de nœuds custom (chantier en cours, pas dispo) :

- `name`, `description`, `icon`, `isSystem`, `creatorId`
- `fields` : tableau de champs typés (short_text, url, select, image, image_url, number, date, rich_text, boolean, document, file)
- `visuals` : variantes d'affichage (node et window)

### Autres tables

- `scheduledJobs` : jobs planifiés (type, nodeDataId, scheduledAt, jobId)
- Tables d'auth Convex (users, sessions, etc.)

---

## État actuel du produit

Ce qui est fonctionnel et livrable aujourd'hui.

### Canvas et navigation

- Création, renommage, suppression de canvas
- Recherche par nom (full-text search)
- Toggle public/privé
- Navigation auto vers le dernier canvas modifié
- Routes : `/` (home), `/signin`, `/canvas/$canvasId`, `/settings`, `/settings/templates/$templateId`

### Nœuds disponibles (7 types)

Chaque nœud vit sur le canvas React Flow avec drag & drop, redimensionnement, couleur, z-index, lock/hide.

1. **Document** — éditeur rich text complet via Plate.js. Headings, listes (ordonnées, non-ordonnées, tâches), tables, code blocks avec syntax highlighting, math, callouts, media, mentions, emojis, comments, drag & drop de blocs, export Markdown/DOCX, autoformat markdown. Min 250x150px.

2. **Image** — upload et affichage. Stockage vers Cloudflare R2. Min 100x100px.

3. **Link** — URL avec extraction automatique de métadonnées (titre, description, image de preview) via LinkPreview API. Taille fixe 220x40px. Deux variantes : default et preview.

4. **PDF** — upload et visualisation de PDF. Stockage vers Cloudflare R2 avec URLs présignées. Taille fixe 220x40px.

5. **Value** — affichage de valeurs typées. Types : text, number, boolean. Avec label et unité optionnels.

6. **Embed** — contenu externe embarqué. Support YouTube, Google Docs/Sheets/Slides, et embeds génériques.

7. **Title** — labels simples positionnés sur le canvas. Niveaux : h1, h2, h3, p. Stocké comme nodeData de type title. Taille par défaut 220x33px, redimensionnable.

**Non disponible** : le nœud Fetch (requêtes HTTP) est dans le code mais pas encore implémenté.

### Système de fenêtres (windows)

Les nœuds peuvent être ouverts en fenêtres agrandies. Plusieurs fenêtres peuvent coexister simultanément. Navigation par liens entre fenêtres. Géré par le windowsStore.

### Edges et dépendances

- Connexion entre nœuds avec edges
- Tracking automatique des dépendances input/output
- Les dépendances alimentent le système d'automation (les nœuds en input fournissent du contexte à l'agent)
- Types : input, output
- Champs optionnels : degree, shouldTriggerUpdate

### Partage et collaboration

- Partage par email avec 3 niveaux : viewer (lecture seule), editor (modification), owner (contrôle total + partage)
- Validation que l'utilisateur cible existe
- Protection contre le self-share
- Support des canvas publics (accès sans invitation)
- Temps réel natif via Convex (tous les utilisateurs voient les changements en live)

### Nolë — Agent IA principal

**Chat** :

- Conversations multi-turn avec historique persistant
- Streaming temps réel (word-by-word, throttle 200ms)
- Titres de threads auto-générés
- Gestion de threads (créer, lister, supprimer)
- Contexte : le system prompt inclut le contenu du canvas (nœuds, edges) et le contexte utilisateur

**Outils de l'agent** :

L'architecture actuelle des tools est basée sur des factories (closures) dans `convex/ia/tools`, assemblées dans `convex/ia/agents.ts` avec un runtime context (`authUserId`, `canvasId`).

Tools exposés par Nolë Chat :

1. `websearch` (`websearchTool`) — recherche web via Linkup (agentic search) avec `depth` (`standard`, `deep`), filtres `include_domains`/`exclude_domains` et fenêtre temporelle `from_date`/`to_date`. Retourne des résultats avec titres, URLs et extraits.
2. `open_webpage` (`openWebPageTool`) — extraction de pages web/PDF publiques en markdown via Linkup (max 10 URLs, JS rendu automatiquement). Flags optionnels `include_raw_html` et `extract_images`.
3. `read_nodes` (`readNodesTool`) — lecture de nœuds ciblés du canvas et retour en XML orienté LLM.
4. `node_and_edge_manipulation` (`nodeAgentTool`) — sous-agent spécialisé pour créer/modifier des nœuds (hors édition document) et créer/modifier des edges.
5. `string_replace_document_content` (`stringReplaceDocumentContentTool`) — remplacement ciblé de contenu dans les nœuds document.
6. `insert_document_content` (`insertDocumentContentTool`) — insertion de contenu à un emplacement précis dans les nœuds document.

**Automation sur les nœuds** :

- 3 modes : off, agent, dataProcessing
- Mode agent : l'IA reçoit des instructions custom et le contexte des nœuds input. L'exécution est orchestrée par `createAutomationAgent` (max 5 steps), avec un outillage d'update de nodeData branché dynamiquement côté automation.
- Mode dataProcessing : transformations champ par champ via expressions (sans agent IA)
- Suivi de progression temps réel : step types (automation_launched, tool_launched=X, tool_completed=X, automation_completed)
- Statut du nœud : idle → working → idle/error

### Speech-to-text

- Enregistrement audio dans le navigateur
- Transcription via Mistral Voxtral (modèle `voxtral-mini-latest`)
- Timestamps au niveau du mot
- Détection automatique de la langue
- Format d'entrée : audio/webm

### Fichiers et médias

- Upload vers Cloudflare R2 via AWS SDK
- URLs présignées pour les uploads (sécurisé, temporaire)
- URLs publiques permanentes pour le contenu uploadé
- Stockage organisé par user ID
- Métadonnées : filename, mimeType, taille, date

### Conversion Markdown ↔ Plate.js

- `markdownToPlateJson()` : markdown → JSON Plate.js (avec plugins remark-math, remark-gfm, remark-mdx, remark-mention)
- `plateJsonToMarkdown()` : JSON Plate.js → markdown
- Utilisé partout : stockage, affichage, échange avec l'IA, import/export

### Gestion d'erreurs

Messages d'erreur standardisés : CANVAS_NOT_FOUND, UNAUTHORIZED_USER, USER_NOT_FOUND, EMAIL_NOT_FOUND, SHARING_WITH_SELF, INSUFFICIENT_PERMISSIONS, THREAD_NOT_FOUND_OR_FORBIDDEN.

---

## Chantiers en cours (pas encore disponibles)

### Templates de nœuds custom

Le système existe dans le code (table nodeTemplates, éditeur dans /settings/templates) mais il est à refaire complètement. Il permettra de créer des types de nœuds personnalisés avec des champs typés (11 types : short_text, url, select, image, image_url, number, date, rich_text, boolean, document, file) et des variantes visuelles.

### Slideshows

Le système de présentations existe (données dans la table canvases, slideshowStore côté frontend) mais est en chantier. Prévu : création de slides, réordonnancement, mode plein écran.

### Nœud Fetch

Type de nœud pour les requêtes HTTP (GET/POST/PUT/DELETE avec headers, query params, body). Présent dans le code mais pas fonctionnel.

---

## Ce qui vient après — Roadmap technique

### IA et Nolë

- Nolë qui opère par blocs et opérations visuelles, pas par texte : créer un nœud, mettre à jour une valeur, connecter deux éléments, au lieu de cracher un mur de texte
- Orchestration non-bloquante : Nolë met à jour un nœud pendant que l'humain travaille sur un autre
- Mode Tony Stark complet : co-pilotage synchrone humain-IA, délégation de tâches de computing/recherche à l'agent
- Amélioration du système d'automation : chaînage de nœuds en workflows, cascade automatique, résultats intermédiaires visibles
- Voice interaction (ElevenLabs déjà dans les dépendances) pour une interaction type Jarvis

### Custom nodes (après refonte templates)

- Templates de nœuds custom fonctionnels avec l'éditeur de champs
- 11 types de champs
- Variantes visuelles (affichage nœud compact sur canvas / fenêtre étendue)
- Templates système fournis + templates utilisateur personnels

### Mode workflow

- Connexion de blocs en pipelines type n8n
- Intégration avec des sources externes (email, APIs)
- Blocs d'extraction, de transformation, de visualisation
- Validation humaine à chaque étape
- Relance partielle en cas d'erreur

---

## Stores frontend (Zustand)

6 stores principaux :

1. **canvasStore** — canvas actif, statut de sync (idle/unsynced/saving/saved/error), focus (canvas/platejs), outil actif (edit/slides/draw), permission
2. **nodeDataStore** — Map<Id, Doc> pour lookup O(1). CRUD sur les données de nœuds.
3. **noleStore** — état du chat IA. Canvas attaché, nœuds attachés, position.
4. **windowsStore** — gestion des fenêtres ouvertes
5. **slideshowStore** — état des présentations
6. **templateStore** — gestion des templates

---

## Permissions et accès

3 niveaux :

- **viewer** : lecture seule
- **editor** : création et modification de contenu
- **owner** : contrôle total + gestion du partage

Fonctions backend :

- `requireAuth()` : lève une erreur si pas authentifié
- `optionalAuth()` : retourne userId ou null
- `requireCanvasAccess(permission)` : valide le niveau d'accès
- `getCanvasAccess()` : retourne les infos d'accès sans lever d'erreur

---

## Structure du code

```
/convex/                    Backend Convex
  /ia/                      Agents IA
    agents.ts               Assemblage des agents (Nolë, automation, tool-agent)
    nole.ts                 Entrée principale du chat Nolë (streaming)
    noleToolRuntimeContext.ts Runtime context des tools (authUserId, canvasId)
    /nole/                  Prompting/système de l'agent Nolë
    /tools/                 Tools IA (web, lecture de nœuds, manipulation nœuds/edges, édition document)
  /automation/              Pipeline d'automation des nœuds
  /model/                   Couche business logic
  /schemas/                 Validateurs de données (Zod)
  /config/                  Configuration (erreurs, etc.)
  schema.ts                 Schéma de la base de données
  http.ts                   Endpoints HTTP
  auth.ts / auth.config.ts  Configuration auth
  uploads.ts                Gestion des fichiers (R2)
  speech.ts                 Speech-to-text (Mistral)
  links.ts                  Extraction de métadonnées d'URLs
  shares.ts                 Système de partage
  threads.ts                Threads de conversation
  canvases.ts               CRUD canvas
  nodeDatas.ts              CRUD données de nœuds
  canvasNodes.ts            Opérations sur les nœuds du canvas
  canvasEdges.ts            Opérations sur les edges

/src/                       Frontend React
  /routes/                  Pages (TanStack Router, file-based)
  /components/              Composants UI
  /stores/                  Stores Zustand
  /hooks/                   Hooks custom
  /lib/                     Utilitaires
  /types/                   Types TypeScript
```
