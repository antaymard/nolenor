"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { generateText } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { uploadBuffer } from "../lib/r2";
import { plateJsonToMarkdown } from "../ia/helpers/plateMarkdownConverter";
import { parseStoredPlateDocument } from "../lib/plateDocumentStorage";
import { makeTableNodeDataLLMFriendly } from "../ia/helpers/makeNodeDataLLMFriendly";
import { getNodeDataTitle } from "../lib/getNodeDataTitle";
import { getSearchableTextForTemplateValues } from "../config/fieldConfig";
import type { Doc } from "../_generated/dataModel";

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

  const { nodes } = await ctx.runQuery(
    internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
    { canvasId: nodeData.canvasId },
  );
  const matchingCanvasNode = nodes.find(
    (node) => node.nodeDataId === nodeDataId,
  );
  const nodeId = matchingCanvasNode?.id ?? (nodeDataId as string);

  if (!matchingCanvasNode) {
    console.warn("[chunkBuilder] rebuildChunks:canvas-node-not-found", {
      nodeDataId,
      canvasId: nodeData.canvasId,
    });
  }

  // Custom nodes : le template porte les noms de champs (texte indexé) et
  // le titleFieldId (titre du chunk).
  const template = nodeData.templateId
    ? await ctx.runQuery(internal.wrappers.nodeTemplateWrappers.getTemplate, {
        templateId: nodeData.templateId,
      })
    : null;

  const chunks = await buildChunks(nodeData, nodeId, updatedKeys, template);

  // console.log("[chunkBuilder] rebuildChunks:chunks-built", {
  //   nodeDataId,
  //   nodeType: nodeData.type,
  //   chunkCount: chunks.length,
  // });

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
  nodeData: Doc<"nodeDatas">,
  nodeId: string,
  updatedKeys?: string[],
  template?: Doc<"nodeTemplates"> | null,
): Promise<ChunkInput[]> {
  // console.log("[chunkBuilder] buildChunks:start", {
  //   nodeDataId: nodeData._id,
  //   nodeType: nodeData.type,
  //   updatedKeys,
  // });

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
    nodeId,
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
      const link = nodeData.values.link as
        | { href?: string; pageTitle?: string }
        | undefined;
      if (!link?.href) return [];
      const domain = safeDomain(link.href);
      const parts = [link.href, domain].filter(Boolean);
      return [
        { ...base, chunkType: "node", order: 0, text: parts.join(" | ") },
      ];
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

    case "document": {
      const parsed = parseStoredPlateDocument(nodeData.values.doc);
      if (!parsed || parsed.length === 0) return [];
      const firstBlockType = (parsed[0] as { type?: string } | undefined)?.type;
      const body =
        firstBlockType === "h1" || firstBlockType === "h2"
          ? parsed.slice(1)
          : parsed;
      if (body.length === 0) return [];
      const text = await plateJsonToMarkdown(body);
      if (!text.trim()) return [];
      return [{ ...base, chunkType: "node", order: 0, text }];
    }

    case "image": {
      return await buildImageChunks(base, nodeData.values);
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
      model: openrouter("~anthropic/claude-haiku-latest"),
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
