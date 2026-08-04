# Nolënor — Résumé technique (court)

Ce fichier doit rester léger pour éviter de surcharger le contexte des agents.

## Produit

- Nolënor est un workspace visuel orienté canvas + nœuds, pensé pour un usage IA non bloquant.
- L'agent principal s'appelle Nolë.
- Les sorties IA sont structurées en blocs/nœuds, pas en long texte linéaire.

## Stack principale

- Frontend: React 19, TypeScript, Vite, TanStack Router, Zustand, React Flow, BlockNote, Tailwind 4.
- Backend: Convex (temps réel + auth + serverless), `@convex-dev/agent`.
- Packages: yarn.

## Domaine de données (Convex)

- `canvases`: structure du canvas (nodes/edges/slideshows, metadata).
- `nodeDatas`: contenu métier des nœuds (values, status, automation config/progress, dependencies).
- `shares`: permissions de partage des canvases.
- `scheduledJobs`: orchestration asynchrone.

## Capacités produit déjà présentes

- CRUD canvas + recherche full-text + partage + collaboration temps réel.
- Nœuds principaux: document, image, link, pdf, value, embed, title.
- Automations de nœuds en mode agent et data processing.
- Chat Nolë avec outils serveur (lecture/manipulation de nœuds, websearch, édition document).

## Chantiers en cours

- Refonte des templates de nœuds custom.
- Slideshows.
- Nœud Fetch HTTP.

## Références

- Pour le détail exhaustif produit/roadmap, préférer la documentation projet (README et docs internes) plutôt que ce fichier d'instructions.

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

1. **canvasStore** — canvas actif, statut de sync (idle/unsynced/saving/saved/error), focus (canvas/richtext-editor/modal), outil actif (edit/slides/draw), permission
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
