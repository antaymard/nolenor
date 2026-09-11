import { v } from "convex/values";

// ── Sub-validators ──────────────────────────────────────────────────────

const subjectTypeValidator = v.union(
  v.literal("nodeData"),
  v.literal("canvas"),
  v.literal("user"),
);

const typeValidator = v.union(v.literal("one-liner"), v.literal("memory"));

const subjectIdValidator = v.union(
  v.id("nodeDatas"),
  v.id("canvases"),
  v.id("users"),
);

// ── Main validator ──────────────────────────────────────────────────────

const memoriesValidator = v.object({
  subjectType: subjectTypeValidator,
  subjectId: subjectIdValidator,
  type: typeValidator,
  content: v.string(),
  updatedAt: v.number(),
});

/*
  Plus tard, on fera du chunking des réponses de l'IA, et un système de parentId. Les pdf transcripted très longs auront un parent de content vide, et des children avec des chunks de contenu. Mieux pour le RAG. Et pareil, les images extraites des pdf seront des enfants, avec un content_type "image" ou "extracted_image". Et un champ memory pour stocker les infos d'extraction (page, position, url sur R2)...
*/

export {
  memoriesValidator,
  subjectTypeValidator,
  subjectIdValidator,
  typeValidator,
};
