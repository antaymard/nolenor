"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { generateText } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import Parallel from "parallel-web";
import { uploadBuffer } from "../lib/r2";
import { blocksToMarkdown } from "../ia/helpers/blockNoteMarkdown";
import { parseStoredBlockNoteDocument } from "../lib/blockNoteDocument";
import { makeTableNodeDataLLMFriendly } from "../ia/helpers/makeNodeDataLLMFriendly";
import { getNodeDataTitle } from "../lib/getNodeDataTitle";
import { isNodeTypeEmbedded } from "../config/nodeConfig";
import { getSearchableTextForTemplateValues } from "../config/fieldConfig";
import { stripLoneSurrogates } from "../lib/textSanitize";
import {
  EMBEDDING_MODEL_TAG,
  buildEmbeddingText,
  embedDocuments,
} from "../lib/voyage";
import type { Doc, Id } from "../_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────────

type ChunkInput = Omit<Doc<"searchableChunks">, "_id" | "_creationTime">;

interface MistralOcrImage {
  id: string;
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
  image_base64?: string;
  image_annotation?: string | null;
}

interface MistralOcrPage {
  index: number;
  markdown: string;
  images: MistralOcrImage[];
}

interface MistralOcrResponse {
  pages: MistralOcrPage[];
}

// ── Main action ───────────────────────────────────────────────────────────────

// Champ porteur de contenu coûteux par nodeType (LLM vision / Mistral OCR).
// Si updatedKeys est fourni et ne contient pas ce champ → skip.
const EXPENSIVE_CONTENT_FIELD: Partial<Record<string, string>> = {
  pdf: "files",
  image: "images",
};

async function rebuildChunksForNodeData(
  ctx: ActionCtx,
  {
    nodeDataId,
    updatedKeys,
  }: {
    nodeDataId: Doc<"nodeDatas">["_id"];
    updatedKeys?: string[];
  },
): Promise<void> {
  // console.log("[chunkBuilder] rebuildChunks:start", {
  //   nodeDataId,
  //   updatedKeys,
  // });

  const nodeData = await ctx.runQuery(
    internal.wrappers.nodeDataWrappers.readNodeData,
    { _id: nodeDataId },
  );
  if (!nodeData) {
    console.log("[chunkBuilder] rebuildChunks:nodeData-not-found", {
      nodeDataId,
    });
    return;
  }

  // Pas de résolution du llmId ici : les chunks ne portent plus leur
  // rattachement visuel, il se résout à la lecture (cf. resolveNodeIds).
  // Le builder est donc insensible à l'ordre création/attachement.

  // Custom nodes : le template porte les noms de champs (texte indexé) et
  // le titleFieldId (titre du chunk).
  const template = nodeData.templateId
    ? await ctx.runQuery(internal.wrappers.nodeTemplateWrappers.getTemplate, {
        templateId: nodeData.templateId,
      })
    : null;

  const rawChunks = await buildChunks(ctx, nodeData, updatedKeys, template);
  const chunks = rawChunks.map((chunk) => ({
    ...chunk,
    title: chunk.title ? stripLoneSurrogates(chunk.title) : chunk.title,
    text: stripLoneSurrogates(chunk.text),
  }));

  // Vectorisation Voyage-4 (title + text), sauf types exclus via
  // `nodeConfig` (`search.embed: false` : title, embed, audio, video,
  // viewport) — leurs chunks restent keyword seuls. En cas d'échec (clé
  // absente, réseau, quota), on dégrade : upsert sans embedding, la recherche
  // keyword reste opérationnelle et le backfill couvrira le chunk plus tard.
  if (chunks.length > 0 && !isNodeTypeEmbedded(nodeData.type)) {
    console.log("[chunkBuilder] rebuildChunks:skip-embed-by-config", {
      nodeDataId,
      nodeType: nodeData.type,
      chunkCount: chunks.length,
    });
  } else if (chunks.length > 0) {
    try {
      const embeddings = await embedDocuments(
        chunks.map((chunk) => buildEmbeddingText(chunk.title, chunk.text)),
      );
      chunks.forEach((chunk, i) => {
        chunk.embedding = embeddings[i];
        chunk.embeddingModel = EMBEDDING_MODEL_TAG;
      });
    } catch (error) {
      console.warn("[chunkBuilder] rebuildChunks:embed-failed", {
        nodeDataId,
        chunkCount: chunks.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log("[chunkBuilder] rebuildChunks:chunks-built", {
    nodeDataId,
    nodeType: nodeData.type,
    chunkCount: chunks.length,
  });

  await ctx.runMutation(
    internal.wrappers.searchableChunkWrappers.upsertChunks,
    {
      nodeDataId,
      chunks,
    },
  );

  // console.log("[chunkBuilder] rebuildChunks:upsert-complete", {
  //   nodeDataId,
  //   chunkCount: chunks.length,
  // });
}

export const rebuildChunks = internalAction({
  args: {
    nodeDataId: v.id("nodeDatas"),
    updatedKeys: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { nodeDataId, updatedKeys }) => {
    await rebuildChunksForNodeData(ctx, { nodeDataId, updatedKeys });
    return null;
  },
});

export const rebuildChunksBatch = internalAction({
  args: {
    nodeDataIds: v.array(v.id("nodeDatas")),
  },
  returns: v.null(),
  handler: async (ctx, { nodeDataIds }) => {
    const seenNodeDataIds = new Set<string>();

    for (const nodeDataId of nodeDataIds) {
      const dedupeKey = String(nodeDataId);
      if (seenNodeDataIds.has(dedupeKey)) {
        continue;
      }
      seenNodeDataIds.add(dedupeKey);
      await rebuildChunksForNodeData(ctx, { nodeDataId });
    }

    return null;
  },
});

// ── Dispatcher ────────────────────────────────────────────────────────────────

async function buildChunks(
  // `ctx` n'est utilisé que par la branche `link`, qui relit les chunks
  // existants du node pour réutiliser un résumé déjà payé. Le passer ici
  // plutôt que de lire les chunks dans `rebuildChunksForNodeData` évite
  // d'imposer cette lecture à TOUS les types — un PDF en porte des centaines.
  ctx: ActionCtx,
  nodeData: Doc<"nodeDatas">,
  updatedKeys?: string[],
  template?: Doc<"nodeTemplates"> | null,
): Promise<ChunkInput[]> {
  console.log("[chunkBuilder] buildChunks:start", {
    nodeDataId: nodeData._id,
    nodeType: nodeData.type,
    updatedKeys,
  });

  // Guard: for expensive branches (LLM/OCR), skip if the content field wasn't updated
  if (updatedKeys) {
    const expensiveField = EXPENSIVE_CONTENT_FIELD[nodeData.type];
    if (expensiveField && !updatedKeys.includes(expensiveField)) {
      console.log("[chunkBuilder] buildChunks:skip-expensive-branch", {
        nodeDataId: nodeData._id,
        nodeType: nodeData.type,
        requiredField: expensiveField,
        updatedKeys,
      });
      return [];
    }
  }
  const base = {
    nodeDataId: nodeData._id,
    canvasId: nodeData.canvasId,
    nodeType: nodeData.type,
    templateId: nodeData.templateId ? String(nodeData.templateId) : undefined,
    title: getNodeDataTitle(nodeData, template),
  };

  switch (nodeData.type) {
    case "title": {
      const text = String(nodeData.values.text ?? "").trim();
      if (!text) return [];
      return [{ ...base, chunkType: "node", order: 0, text }];
    }

    case "link": {
      return await buildLinkChunks(ctx, base, nodeData);
    }

    case "value": {
      const val = nodeData.values.value as
        | { value?: unknown; unit?: string; label?: string }
        | undefined;
      if (!val) return [];
      const parts = [String(val.value ?? ""), val.unit].filter(
        (p) => p !== undefined && p !== null && String(p).trim() !== "",
      );
      return [
        { ...base, chunkType: "node", order: 0, text: parts.join(" | ") },
      ];
    }

    case "embed": {
      const embed = nodeData.values.embed as
        | { url?: string; title?: string; type?: string }
        | undefined;
      if (!embed?.url) return [];
      const domain = safeDomain(embed.url);
      const parts = [embed.type, embed.url, domain].filter(Boolean);
      return [
        { ...base, chunkType: "node", order: 0, text: parts.join(" | ") },
      ];
    }

    case "table": {
      const text = makeTableNodeDataLLMFriendly(nodeData.values.table);
      if (!text.trim()) return [];
      return [{ ...base, chunkType: "node", order: 0, text }];
    }

    case "blocknote": {
      const parsed = parseStoredBlockNoteDocument(nodeData.values.doc);
      if (!parsed || parsed.length === 0) return [];
      const firstBlockType = (parsed[0] as { type?: string } | undefined)?.type;
      const body = firstBlockType === "heading" ? parsed.slice(1) : parsed;
      if (body.length === 0) return [];
      const text = await blocksToMarkdown(body);
      if (!text.trim()) return [];
      return [{ ...base, chunkType: "node", order: 0, text }];
    }

    case "audio": {
      // Cheap branch: the filename is all we have to go on until transcription
      // lands, and it is what the user searches for.
      const audio = nodeData.values.audio as
        | {
            filename?: string;
            mimeType?: string;
            title?: string;
            artist?: string;
            label?: string;
          }
        | null
        | undefined;
      if (!audio?.filename) return [];
      // Index the tags too: people search for the artist, not "01 - Track.mp3".
      const parts = [
        audio.label,
        audio.artist,
        audio.title,
        audio.filename,
        audio.mimeType,
      ].filter(Boolean);
      return [
        { ...base, chunkType: "node", order: 0, text: parts.join(" | ") },
      ];
    }

    case "video": {
      // Same cheap branch as audio: the name is all we have until
      // transcription lands, and it is what the user searches for.
      const video = nodeData.values.video as
        | { filename?: string; mimeType?: string; label?: string }
        | null
        | undefined;
      if (!video?.filename) return [];
      const parts = [video.label, video.filename, video.mimeType].filter(
        Boolean,
      );
      return [
        { ...base, chunkType: "node", order: 0, text: parts.join(" | ") },
      ];
    }

    case "image": {
      return await buildImageChunks(base, nodeData.values);
    }

    case "viewport": {
      // Le titre est tout ce que ce node porte de cherchable : la position ne
      // se cherche pas. `base.title` le porte déjà pour l'index `search_title`,
      // le chunk le répète pour l'index `search_text`.
      const title = String(nodeData.values.title ?? "").trim();
      if (!title) return [];
      return [{ ...base, chunkType: "node", order: 0, text: title }];
    }

    case "frame": {
      // Même forme que `viewport`, même raison : le contenu d'une frame est
      // fait des nodes qu'elle groupe, qui s'indexent chacun pour soi. Elle
      // n'apporte que son titre. Sans ce `case`, le `default` rendrait une
      // liste vide et la frame serait introuvable — silencieusement.
      const title = String(nodeData.values.title ?? "").trim();
      if (!title) return [];
      return [{ ...base, chunkType: "node", order: 0, text: title }];
    }

    case "custom": {
      // Concatène les champs textuels (`nom: valeur` par ligne, labels de
      // select résolus, unités incluses). Pas d'indexation vision en V1.
      if (!template) return [];
      const text = getSearchableTextForTemplateValues(
        template,
        nodeData.values,
      );
      if (!text.trim()) return [];
      return [{ ...base, chunkType: "node", order: 0, text }];
    }

    case "pdf": {
      return await buildPdfChunks(base, nodeData);
    }

    default:
      return [];
  }
}

// ── Image branch ─────────────────────────────────────────────────────────────

async function buildImageChunks(
  base: Omit<ChunkInput, "chunkType" | "order" | "text" | "metadata">,
  values: Record<string, unknown>,
): Promise<ChunkInput[]> {
  const images = values.images as Array<{ url: string }> | undefined;
  if (!images || images.length === 0) {
    console.log("[chunkBuilder] buildImageChunkText:no-images");
    return [];
  }

  const chunks = await Promise.all(
    images.map((img, order) => buildSingleImageChunk(base, img, order)),
  );

  return chunks.filter((chunk): chunk is ChunkInput => chunk !== null);
}

type StructuredImageMetadata = {
  url: string;
  filename: string;
  order: number;
  title: string;
  imageType: string;
  summary: string;
  visibleText: string;
  keyFacts: string;
  searchTerms: string[];
  rawText: string;
};

async function buildSingleImageChunk(
  base: Omit<ChunkInput, "chunkType" | "order" | "text" | "metadata">,
  img: { url: string } | undefined,
  order: number,
): Promise<ChunkInput | null> {
  if (!img?.url) {
    console.log("[chunkBuilder] buildImageChunkText:missing-image-url");
    return null;
  }

  const filename = img.url.split("/").pop() ?? "image";
  console.log("[chunkBuilder] buildImageChunkText:start", {
    imageUrl: img.url,
    filename,
  });

  try {
    const result = await generateText({
      model: openrouter("deepseek/deepseek-v4.1-flash"),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: img.url },
            {
              type: "text",
              text: `Analyze this image so that another agent can work from the text alone without ever seeing the image, and so both a human user and Nolë can reliably find it with text search.

Your response must be factual, self-contained, retrieval-oriented, and follow this exact format:
TITLE: <specific concise title>
IMAGE_TYPE: <photo, screenshot, chart, diagram, table, poster, document scan, map, UI, artwork, or other>
SUMMARY: <dense self-contained summary that explains the image well enough for someone who never sees it>
VISIBLE_TEXT: <verbatim transcription of all legible text, numbers, labels, headings, legend items, axis labels, table headers/cells, UI labels; write NONE if there is no readable text>
KEY_FACTS: <important entities, objects, actions, relationships, layout, data, trends, values, dates, places, brands, products, measurements, and any other information needed to reason about the image>
SEARCH_TERMS: <comma-separated keywords, aliases, alternate spellings, abbreviations, named entities, topics, and likely search phrases that should help retrieval>

Rules:
- Do not hallucinate. If something is uncertain, say UNKNOWN or PROBABLY.
- Make SUMMARY and KEY_FACTS sufficient for an agent that never sees the image.
- Preserve visible text verbatim in VISIBLE_TEXT, even if it is partial, noisy, or misspelled.
- If the image is a chart, table, diagram, map, screenshot, UI, or scanned document, describe its structure and the important data or controls.
- If the image contains people, places, products, logos, or brands, name them only when clearly visible.
- Include search terms that a user might type to find this image later. Prefer precise retrieval terms over generic tags.
- Add French and English search terms when they are clearly useful and you are confident they are correct.
- Respond in the same language as the main visible text. If there is no visible text or the languages are mixed, write in French, but keep VISIBLE_TEXT verbatim in its original language(s).`,
            },
          ],
        },
      ],
    });

    console.log("[chunkBuilder] buildImageChunkText:success", {
      imageUrl: img.url,
      order,
      responseLength: result.text.length,
    });

    const imageMetadata = parseImageLlmOutput({
      url: img.url,
      filename,
      order,
      rawText: result.text,
    });

    return {
      ...base,
      chunkType: "node",
      order,
      text: buildImageSearchText(imageMetadata),
      metadata: {
        imageUrl: imageMetadata.url,
        filename: imageMetadata.filename,
        imageOrder: imageMetadata.order,
        image: imageMetadata,
      },
    };
  } catch (error) {
    console.error("Image chunk generation failed", {
      imageUrl: img.url,
      order,
      error,
    });

    const fallbackMetadata = buildFallbackImageMetadata({
      url: img.url,
      filename,
      order,
    });

    return {
      ...base,
      chunkType: "node",
      order,
      text: buildImageSearchText(fallbackMetadata),
      metadata: {
        imageUrl: fallbackMetadata.url,
        filename: fallbackMetadata.filename,
        imageOrder: fallbackMetadata.order,
        image: fallbackMetadata,
        indexingFallback: true,
      },
    };
  }
}

function buildFallbackImageMetadata({
  url,
  filename,
  order,
}: {
  url: string;
  filename: string;
  order: number;
}): StructuredImageMetadata {
  const title = filename.replace(/\.[^./\\]+$/, "") || filename;
  const searchTerms = Array.from(
    new Set([
      filename,
      title,
      ...filename
        .split(/[^a-zA-Z0-9]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ]),
  );

  return {
    url,
    filename,
    order,
    title,
    imageType: "image",
    summary:
      "Vision description unavailable. Indexed from filename and source URL only.",
    visibleText: "UNKNOWN",
    keyFacts: `Source image URL: ${url}`,
    searchTerms,
    rawText: "",
  };
}

function parseImageLlmOutput({
  url,
  filename,
  order,
  rawText,
}: {
  url: string;
  filename: string;
  order: number;
  rawText: string;
}): StructuredImageMetadata {
  const normalizedText = rawText.replace(/\r\n/g, "\n").trim();
  const fields = extractOrderedLabelSections(normalizedText, [
    "TITLE",
    "IMAGE_TYPE",
    "SUMMARY",
    "VISIBLE_TEXT",
    "KEY_FACTS",
    "SEARCH_TERMS",
  ]);

  return {
    url,
    filename,
    order,
    title: fields.TITLE ?? "UNKNOWN",
    imageType: fields.IMAGE_TYPE ?? "UNKNOWN",
    summary: fields.SUMMARY || normalizedText || "UNKNOWN",
    visibleText: fields.VISIBLE_TEXT ?? "UNKNOWN",
    keyFacts: fields.KEY_FACTS || normalizedText || "UNKNOWN",
    searchTerms: parseSearchTerms(fields.SEARCH_TERMS),
    rawText: normalizedText,
  };
}

function extractOrderedLabelSections(
  rawText: string,
  labels: string[],
): Record<string, string | undefined> {
  const sections: Record<string, string | undefined> = {};

  let currentLabel: string | null = null;
  let currentLines: string[] = [];

  const flushCurrentLabel = () => {
    if (!currentLabel) return;
    const value = currentLines.join("\n").trim();
    sections[currentLabel] = value.length > 0 ? value : undefined;
  };

  for (const line of rawText.split("\n")) {
    const matchingLabel = labels.find((label) => line.startsWith(`${label}:`));

    if (matchingLabel) {
      flushCurrentLabel();
      currentLabel = matchingLabel;
      currentLines = [line.slice(matchingLabel.length + 1).trimStart()];
      continue;
    }

    if (currentLabel) {
      currentLines.push(line);
    }
  }

  flushCurrentLabel();

  return sections;
}

function parseSearchTerms(rawValue: string | undefined): string[] {
  if (!rawValue) return [];

  return rawValue
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && term.toUpperCase() !== "NONE");
}

function buildImageSearchText(image: StructuredImageMetadata): string {
  const searchTerms =
    image.searchTerms.length > 0 ? image.searchTerms.join(", ") : "NONE";

  return [
    `IMAGE_TYPE: ${image.imageType}`,
    `SUMMARY: ${image.summary}`,
    `VISIBLE_TEXT: ${image.visibleText}`,
    `KEY_FACTS: ${image.keyFacts}`,
    `SEARCH_TERMS: ${searchTerms}`,
  ].join("\n");
}

// ── Link branch ───────────────────────────────────────────────────────────────

// La question posée à Parallel sur la page. En anglais comme les autres
// call-sites Parallel (`websearchTool`, `openWebPageTool`) : c'est la langue
// que l'API attend, et elle n'impose pas celle de la réponse, qui suit la page.
const LINK_INDEXING_OBJECTIVE =
  "Summarize this page so that it can be found later by keyword and by semantic search. " +
  "State what the page is about, who published it, and its main claims, conclusions and key " +
  "facts, figures and dates. Name the entities it covers: people, organisations, products, " +
  "technologies, places. Prefer concrete, specific terms over generic ones. Do not speculate " +
  "about content that is not on the page.";

// Plafond du résumé. La contrainte n'est ni la limite Convex de 1 Mo par
// document (très loin) ni le batching Voyage (200 000 caractères par requête,
// que `splitBatch` découpe de toute façon), mais la qualité du vecteur :
// `callVoyage` envoie `truncation: true`, donc au-delà du contexte du modèle la
// fin du texte est silencieusement absente de l'embedding. 8 000 caractères
// ≈ 2 000 tokens : tout le chunk est réellement vectorisé.
const LINK_SUMMARY_MAX_CHARS = 8_000;

// Indexer n'a pas besoin d'un fetch live : le cache Parallel fait l'affaire, et
// il amortit le second rebuild du collage (cf. `useCanvasContentIngest`, qui
// crée le node avec l'URL pour titre puis le patche une fois LinkPreview
// résolu). Minimum imposé par l'API : 600.
const LINK_EXTRACT_MAX_AGE_SECONDS = 86_400;

type LinkValues = {
  href?: unknown;
  pageTitle?: unknown;
  pageDescription?: unknown;
  pageImage?: unknown;
};

/** Ce que l'extraction rapporte, et ce qu'on restocke pour le réutiliser. */
type LinkPageSummary = {
  summary: string;
  pageTitle?: string;
  publishDate?: string;
  fetchedAt: number;
};

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parallel n'extrait que du web public : une `data:` ou une `blob:` n'a
 * rien à donner.
 */
function isFetchableWebUrl(href: string): boolean {
  try {
    const { protocol } = new URL(href);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Lecture défensive de la réponse d'extraction : l'API est en beta et sa forme
 * n'est garantie par rien à l'exécution — un cast menteur planterait loin de sa
 * cause. Même parti pris que `ia/agents.ts` pour les réponses OpenRouter.
 */
function readExtractedPage(response: unknown): {
  content: string;
  title?: string;
  publishDate?: string;
} | null {
  if (typeof response !== "object" || response === null) return null;
  const results = (response as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) return null;

  const first = results[0];
  if (typeof first !== "object" || first === null) return null;
  const record = first as Record<string, unknown>;

  // `excerpts` est le format ciblé par l'objectif — c'est le résumé.
  // `full_content` n'est qu'un repli si rien de pertinent n'a été extrait.
  const excerpts = Array.isArray(record.excerpts)
    ? record.excerpts
        .map((excerpt) => readString(excerpt))
        .filter((excerpt): excerpt is string => excerpt !== undefined)
    : [];
  const content =
    excerpts.length > 0
      ? excerpts.join("\n\n")
      : readString(record.full_content);
  if (!content) return null;

  return {
    content,
    title: readString(record.title),
    publishDate: readString(record.publish_date),
  };
}

/**
 * Un résumé déjà payé pour CETTE url, relu depuis les chunks du node.
 *
 * `upsertChunks` fait un delete-then-insert : sans cette relecture, chaque
 * reconstruction repartirait de zéro et rappellerait Parallel. Or un node est
 * réécrit plus souvent qu'il n'y paraît — le collage d'une URL écrit deux fois,
 * et chaque restauration de version repasse par là.
 */
async function findCachedLinkSummary(
  ctx: ActionCtx,
  nodeDataId: Id<"nodeDatas">,
  href: string,
): Promise<LinkPageSummary | null> {
  const existing = await ctx.runQuery(
    internal.wrappers.searchableChunkWrappers.listByNodeDataId,
    { nodeDataId },
  );

  for (const chunk of existing) {
    const metadata = chunk.metadata;
    if (!metadata || metadata.sourceUrl !== href) continue;
    const summary = readString(metadata.summary);
    if (!summary) continue;
    return {
      summary,
      pageTitle: readString(metadata.pageTitle),
      publishDate: readString(metadata.publishDate),
      fetchedAt:
        typeof metadata.fetchedAt === "number"
          ? metadata.fetchedAt
          : Date.now(),
    };
  }

  return null;
}

async function fetchLinkSummary(href: string): Promise<LinkPageSummary | null> {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) {
    console.warn("[chunkBuilder] buildLinkChunks:no-parallel-key", { href });
    return null;
  }

  // Client instancié ici et non au niveau module : son constructeur LÈVE quand
  // la clé manque, et ce throw à l'import casserait la construction des chunks
  // de TOUS les types de node, pas seulement des liens.
  const client = new Parallel({ apiKey });

  try {
    const response = await client.beta.extract({
      urls: [href],
      // Avec un objectif, `excerpts` renvoie du markdown ciblé sur la question.
      // Sans objectif il ferait doublon avec le contenu complet — que l'on ne
      // demande donc pas.
      objective: LINK_INDEXING_OBJECTIVE,
      excerpts: { max_chars_per_result: LINK_SUMMARY_MAX_CHARS },
      full_content: false,
      fetch_policy: { max_age_seconds: LINK_EXTRACT_MAX_AGE_SECONDS },
    });

    const page = readExtractedPage(response);
    if (!page) {
      console.warn("[chunkBuilder] buildLinkChunks:extract-empty", { href });
      return null;
    }

    // Assainir APRÈS la troncature, et pas seulement sur `text` : `.slice()`
    // compte des unités UTF-16, donc couper au plafond peut trancher une paire
    // de surrogates en deux. Convex refuse une chaîne Unicode invalide, et
    // `rebuildChunksForNodeData` ne nettoie que `title` et `text` — le résumé
    // repart aussi dans `metadata`, que personne ne nettoie derrière nous.
    return {
      summary: stripLoneSurrogates(
        page.content.slice(0, LINK_SUMMARY_MAX_CHARS),
      ),
      pageTitle: page.title ? stripLoneSurrogates(page.title) : undefined,
      publishDate: page.publishDate,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    // Dégrader, jamais lever : un lien doit rester trouvable en keyword même
    // quand Parallel est indisponible. Choix inverse de la branche PDF, qui
    // lève sur une clé Mistral manquante — les liens sont bien plus nombreux,
    // et casser leur indexation coûterait plus cher qu'un chunk pauvre.
    console.warn("[chunkBuilder] buildLinkChunks:extract-failed", {
      href,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function buildLinkChunks(
  ctx: ActionCtx,
  base: Omit<ChunkInput, "chunkType" | "order" | "text" | "metadata">,
  nodeData: Doc<"nodeDatas">,
): Promise<ChunkInput[]> {
  const link = nodeData.values.link as LinkValues | undefined;
  const href = readString(link?.href);
  if (!href) return [];

  const domain = safeDomain(href);
  // Déjà rapportées par LinkPreview à la création du node, et jusqu'ici
  // indexées nulle part : gratuites à ajouter.
  const pageDescription = readString(link?.pageDescription);
  const pageImage = readString(link?.pageImage);

  const page = isFetchableWebUrl(href)
    ? ((await findCachedLinkSummary(ctx, nodeData._id, href)) ??
      (await fetchLinkSummary(href)))
    : null;

  console.log("[chunkBuilder] buildLinkChunks:done", {
    nodeDataId: nodeData._id,
    href,
    summarized: page !== null,
    summaryChars: page?.summary.length ?? 0,
  });

  // Le titre stocké vaut l'URL tant que les métadonnées ne sont pas résolues
  // (collage), et pour tout lien créé par l'agent : celui de Parallel prend
  // alors le relais. `base.title` n'est PAS touché — il reste le titre du node,
  // celui qu'affichent le canvas et les résultats de recherche.
  const storedTitle = readString(link?.pageTitle);
  const pageTitle =
    storedTitle && storedTitle !== href
      ? storedTitle
      : (page?.pageTitle ?? storedTitle ?? href);

  const lines = [`TITLE: ${pageTitle}`, `URL: ${href}`];
  if (domain) lines.push(`SITE: ${domain}`);
  if (page?.publishDate) lines.push(`PUBLISHED: ${page.publishDate}`);
  if (pageDescription) lines.push(`DESCRIPTION: ${pageDescription}`);
  if (page) lines.push("SUMMARY:", page.summary);

  const metadata: Record<string, unknown> = {};
  if (page) {
    // `sourceUrl` est la clé de réutilisation : tant que l'URL ne bouge pas,
    // les reconstructions suivantes repartent de ce résumé sans rappeler
    // Parallel. Changer l'URL invalide le cache, ce qui est le but.
    metadata.sourceUrl = href;
    metadata.summary = page.summary;
    metadata.fetchedAt = page.fetchedAt;
    if (page.pageTitle) metadata.pageTitle = page.pageTitle;
    if (page.publishDate) metadata.publishDate = page.publishDate;
  } else {
    metadata.indexingFallback = true;
  }
  // Lu par `getImageUrlFromMetadata` : l'aperçu du lien s'affiche dans les
  // résultats de recherche, comme le font déjà images et annotations PDF.
  if (pageImage) metadata.imageUrl = pageImage;

  return [
    { ...base, chunkType: "node", order: 0, text: lines.join("\n"), metadata },
  ];
}

// ── PDF branch ────────────────────────────────────────────────────────────────

async function buildPdfChunks(
  base: Omit<ChunkInput, "chunkType" | "order" | "text" | "metadata">,
  nodeData: Doc<"nodeDatas">,
): Promise<ChunkInput[]> {
  const files = nodeData.values.files as
    | Array<{ url: string; filename: string; mimeType: string }>
    | undefined;
  if (!files || files.length === 0) {
    console.log("[chunkBuilder] buildPdfChunks:no-files", {
      nodeDataId: nodeData._id,
    });
    return [];
  }

  const pdfFiles = files.filter((f) => f.mimeType === "application/pdf");
  if (pdfFiles.length === 0) {
    console.log("[chunkBuilder] buildPdfChunks:no-pdf-files", {
      nodeDataId: nodeData._id,
      fileCount: files.length,
    });
    return [];
  }

  console.log("[chunkBuilder] buildPdfChunks:start", {
    nodeDataId: nodeData._id,
    fileCount: files.length,
    pdfFileCount: pdfFiles.length,
  });

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not configured");

  const allChunks: ChunkInput[] = [];

  for (const pdf of pdfFiles) {
    console.log("[chunkBuilder] buildPdfChunks:ocr-request", {
      nodeDataId: nodeData._id,
      pdfUrl: pdf.url,
      filename: pdf.filename,
    });

    const response = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: { type: "document_url", document_url: pdf.url },
        include_image_base64: true,
        bbox_annotation_format: {
          type: "json_schema",
          json_schema: {
            name: "image_annotation",
            strict: true,
            schema: {
              type: "object",
              properties: {
                image_type: {
                  type: "string",
                  description:
                    "Type of image (photo, diagram, chart, table, logo, etc.)",
                },
                short_description: {
                  type: "string",
                  description: "Short description of the image content",
                },
                summary: {
                  type: "string",
                  description:
                    "Full summary of the image content. Should be self-sufficient and include all relevant details, including any visible text, data, and visual elements. It should allow someone who cannot see the image to fully understand its content and significance, and search with text for relevant information.",
                },
              },
              required: ["image_type", "short_description", "summary"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Mistral OCR error (${response.status}): ${errorBody}`);
      continue;
    }

    const ocrResult = (await response.json()) as MistralOcrResponse;
    const totalPages = ocrResult.pages.length;

    console.log("[chunkBuilder] buildPdfChunks:ocr-success", {
      nodeDataId: nodeData._id,
      pdfUrl: pdf.url,
      totalPages,
    });

    // Upload images and build URL map
    const imageUrlMap = new Map<string, string>();

    for (const page of ocrResult.pages) {
      for (const img of page.images) {
        if (!img.image_base64) continue;

        const base64Data = img.image_base64.replace(
          /^data:image\/[^;]+;base64,/,
          "",
        );
        const buffer = Buffer.from(base64Data, "base64");
        const mimeMatch = img.image_base64.match(/^data:(image\/[^;]+);/);
        const mimeType = mimeMatch?.[1] ?? "image/jpeg";
        const ext = mimeType.split("/")[1] ?? "jpeg";

        const key = `${nodeData._id}/${img.id}.${ext}`;
        const publicUrl = await uploadBuffer(
          key,
          buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          ),
          mimeType,
        );
        imageUrlMap.set(img.id, publicUrl);
      }
    }

    console.log("[chunkBuilder] buildPdfChunks:image-upload-complete", {
      nodeDataId: nodeData._id,
      pdfUrl: pdf.url,
      uploadedImageCount: imageUrlMap.size,
    });

    // Build one chunk per page + one per annotation
    for (const page of ocrResult.pages) {
      const pageImages = page.images.filter((img) => imageUrlMap.has(img.id));

      // Replace Mistral image placeholders with R2 URLs in markdown
      let md = page.markdown;
      for (const [imageId, url] of imageUrlMap) {
        const escapedId = imageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(
          `!\\[([^\\]]*)\\]\\(${escapedId}[^)]*\\)`,
          "g",
        );
        md = md.replace(pattern, `![$1](${url})`);
      }

      // Page chunk
      allChunks.push({
        ...base,
        chunkType: "page",
        order: page.index,
        text: md,
        metadata: {
          page: page.index + 1,
          totalPages,
          sections: extractSections(page.markdown),
          hasImages: pageImages.length > 0,
          imageCount: pageImages.length,
        },
      });

      // Annotation chunks (one per image)
      for (let i = 0; i < page.images.length; i++) {
        const img = page.images[i];
        const publicUrl = imageUrlMap.get(img.id);
        if (!publicUrl) continue;

        const annotation = parseAnnotation(img.image_annotation);
        const text = annotation
          ? `${annotation.short_description}\n${annotation.summary}`
          : img.id;

        allChunks.push({
          ...base,
          chunkType: "annotation",
          order: page.index * 1000 + i,
          text,
          metadata: {
            page: page.index + 1,
            imageUrl: publicUrl,
            boundingBox: {
              x: img.top_left_x,
              y: img.top_left_y,
              w: img.bottom_right_x - img.top_left_x,
              h: img.bottom_right_y - img.top_left_y,
            },
          },
        });
      }
    }

    console.log("[chunkBuilder] buildPdfChunks:pdf-chunks-complete", {
      nodeDataId: nodeData._id,
      pdfUrl: pdf.url,
      runningChunkCount: allChunks.length,
    });
  }

  console.log("[chunkBuilder] buildPdfChunks:done", {
    nodeDataId: nodeData._id,
    totalChunkCount: allChunks.length,
  });

  return allChunks;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function extractSections(
  markdown: string,
): Array<{ level: string; title: string }> {
  const sections: Array<{ level: string; title: string }> = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      sections.push({
        level: `h${match[1].length}`,
        title: match[2].trim(),
      });
    }
  }
  return sections;
}

function parseAnnotation(
  raw: string | null | undefined,
): { image_type: string; short_description: string; summary: string } | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
