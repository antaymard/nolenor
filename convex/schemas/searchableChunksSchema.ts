import { v, type Infer } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

// ── Sub-validators ──────────────────────────────────────────────────────

// Deux propriétaires distincts écrivent dans cette table :
//  - le chunkBuilder (`searchable/chunkBuilder.ts`) possède `node`, `page` et
//    `annotation` : des DÉRIVÉS des `values`, reconstruits à chaque write ;
//  - la transcription (`ia/transcriptionRun.ts`) possède `transcript` : de la
//    DONNÉE PRIMAIRE, déjà payée (OpenRouter), que rien ne sait régénérer
//    gratuitement. Le builder ne la supprime que quand le fichier source change
//    (`metadata.sourceKey`), cf. `SearchableChunkModels.upsertChunks`.
// Tout futur « reindex global » doit donc épargner `transcript`.
const chunkTypeValidator = v.union(
  v.literal("node"),
  v.literal("page"),
  v.literal("annotation"),
  v.literal("transcript"),
);

// ── Main validator ──────────────────────────────────────────────────────

const searchableChunksValidator = v.object({
  // Déprécié (étape 1/2) : le rattachement visuel se résout désormais à la
  // lecture via nodeDataId (cf. resolveNodeIds), plus écrit à la création.
  // Les chunks existants gardent leur valeur stockée, ignorée en lecture.
  // Étape 2/2 : jouer `migrations:stripNodeIdFromChunks` (qui balaie l'index
  // `by_nodeId`, seul usage qu'il lui reste), puis supprimer ce champ ET
  // l'index dans une poussée séparée — l'ordre compte, la validation de
  // schéma refuse un champ stocké absent du validateur.
  nodeDataId: v.id("nodeDatas"),
  canvasId: v.id("canvases"),
  chunkType: chunkTypeValidator,
  nodeType: nodeTypeValidator,
  templateId: v.optional(v.string()),
  title: v.optional(v.string()),
  text: v.string(),
  order: v.number(),
  metadata: v.optional(v.record(v.string(), v.any())),
  // Embedding Voyage-4 (512 dims, espace partagé 4-series) pour la recherche
  // sémantique. Optionnel : les chunks créés avant le backfill n'en ont pas
  // (exclus du vector search, toujours trouvables en keyword).
  embedding: v.optional(v.array(v.float64())),
  // Traçabilité du modèle, ex. "voyage-4:512". Permet une future rotation.
  embeddingModel: v.optional(v.string()),
});

// ── Recherche (keyword, sémantique, hybride) ─────────────────────────────
// Formes partagées par `semanticSearch` (actions), les wrappers, le tool IA
// et le front (via `Infer`, import type-only) : un seul endroit à modifier.

const searchModeValidator = v.union(
  v.literal("keyword"),
  v.literal("semantic"),
  v.literal("hybrid"),
);

type SearchModeValue = Infer<typeof searchModeValidator>;

/** Un chunk adressable, projeté sans l'embedding, avec son score de branche. */
const fusedHitValidator = v.object({
  nodeId: v.string(),
  nodeDataId: v.id("nodeDatas"),
  nodeType: nodeTypeValidator,
  chunkType: chunkTypeValidator,
  order: v.number(),
  text: v.string(),
  title: v.optional(v.string()),
  page: v.optional(v.number()),
  sectionTitle: v.optional(v.string()),
  /** Plage temporelle d'un chunk `transcript` (secondes). */
  startSec: v.optional(v.number()),
  endSec: v.optional(v.number()),
  /** Score RRF (hybride) ou similarité cosinus (sémantique pure). */
  score: v.number(),
  sources: v.array(v.union(v.literal("keyword"), v.literal("semantic"))),
  /** URL d'aperçu (chunks image / annotations PDF), branche sémantique. */
  imageUrl: v.optional(v.string()),
});

type FusedHit = Infer<typeof fusedHitValidator>;

/** Extrait centré sur un mot de la requête, pour l'affichage. */
const searchSnippetValidator = v.object({
  snippet: v.string(),
  chunkType: chunkTypeValidator,
  order: v.number(),
  page: v.optional(v.number()),
  /**
   * Chunk `transcript` : instant du passage (secondes). Précis au segment
   * quand l'extrait vient de la recherche keyword, au chunk sinon.
   */
  startSec: v.optional(v.number()),
  /** Titre du passage d'un chunk `transcript`, quand il a été résumé. */
  sectionTitle: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  matchStart: v.number(),
  matchEnd: v.number(),
});

type SearchSnippetValue = Infer<typeof searchSnippetValidator>;

/** Résultat regroupé par node, tel que servi au front. */
const groupedSearchResultValidator = v.object({
  type: nodeTypeValidator,
  nodeId: v.string(),
  nodeDataId: v.id("nodeDatas"),
  title: v.optional(v.string()),
  images: v.array(
    v.object({
      imageUrl: v.string(),
      page: v.optional(v.number()),
    }),
  ),
  snippets: v.array(searchSnippetValidator),
});

type GroupedSearchResult = Infer<typeof groupedSearchResultValidator>;

type ChunkTypeValue = Infer<typeof chunkTypeValidator>;

export {
  searchableChunksValidator,
  chunkTypeValidator,
  searchModeValidator,
  fusedHitValidator,
  searchSnippetValidator,
  groupedSearchResultValidator,
};
export type {
  ChunkTypeValue,
  SearchModeValue,
  FusedHit,
  SearchSnippetValue,
  GroupedSearchResult,
};
