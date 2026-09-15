// Client Voyage AI (appel REST direct, pas de wrapper ai-sdk).
//
// Espace d'embedding partagé de la famille Voyage-4 : `voyage-4` (documents,
// qualité) et `voyage-4-lite` (requêtes, latence/coût) produisent des vecteurs
// compatibles tant que `output_dimension` est identique.

export const EMBEDDING_DIMENSIONS = 512;
export const DOCUMENT_EMBEDDING_MODEL = "voyage-4";
export const QUERY_EMBEDDING_MODEL = "voyage-4-lite";
/** Tag stocké en base pour traçabilité / future rotation de modèle. */
export const EMBEDDING_MODEL_TAG = "voyage-4:512";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

// Plafonds API Voyage pour `voyage-4` : 1000 textes / 320K tokens par requête.
// On reste largement en-dessous pour la robustesse (PDF OCR volumineux).
const MAX_TEXTS_PER_REQUEST = 64;
const MAX_CHARS_PER_REQUEST = 200_000;

// ── Texte source ───────────────────────────────────────────────────────────

/** Texte effectivement vectorisé : titre + contenu (meilleur rappel). */
export function buildEmbeddingText(
  title: string | undefined,
  text: string,
): string {
  const trimmedTitle = title?.trim() ?? "";
  const trimmedText = text.trim();
  if (!trimmedTitle) return trimmedText;
  if (!trimmedText) return trimmedTitle;
  // Titre déjà en tête du texte ? Évite la duplication.
  if (trimmedText.startsWith(trimmedTitle)) return trimmedText;
  return `${trimmedTitle}\n\n${trimmedText}`;
}

// ── Appels Voyage ──────────────────────────────────────────────────────────

type VoyageInputType = "query" | "document";

type VoyageEmbeddingEntry = {
  embedding: unknown;
  index: unknown;
};

function parseEmbeddingResponse(
  body: unknown,
  model: string,
  expectedCount: number,
): number[][] {
  const data =
    body && typeof body === "object"
      ? (body as { data?: unknown }).data
      : undefined;
  if (!Array.isArray(data)) {
    throw new Error(`[voyage] ${model} : réponse inattendue`);
  }
  const entries = data as VoyageEmbeddingEntry[];
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !Array.isArray(entry.embedding) ||
      typeof entry.index !== "number" ||
      !entry.embedding.every((n) => typeof n === "number")
    ) {
      throw new Error(`[voyage] ${model} : entrée d'embedding invalide`);
    }
  }
  const ordered = [...entries].sort(
    (a, b) => (a.index as number) - (b.index as number),
  );
  if (ordered.length !== expectedCount) {
    throw new Error(
      `[voyage] ${model} a retourné ${ordered.length} embeddings pour ${expectedCount} textes`,
    );
  }
  const embeddings = ordered.map((entry) => entry.embedding as number[]);
  for (const embedding of embeddings) {
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `[voyage] ${model} a retourné ${embedding.length} dims (attendu ${EMBEDDING_DIMENSIONS})`,
      );
    }
  }
  return embeddings;
}

async function callVoyage(
  inputs: string[],
  model: string,
  inputType: VoyageInputType,
  timeoutMs: number,
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[voyage] VOYAGE_API_KEY manquante (npx convex env set VOYAGE_API_KEY=...)",
    );
  }

  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: inputs,
      model,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
      truncation: true,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `[voyage] ${model} HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  return parseEmbeddingResponse(await response.json(), model, inputs.length);
}

/** Découpe un lot en sous-lots compatibles avec les plafonds Voyage. */
function splitBatch(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;
  for (const text of texts) {
    if (
      current.length >= MAX_TEXTS_PER_REQUEST ||
      (currentChars + text.length > MAX_CHARS_PER_REQUEST && current.length > 0)
    ) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Vectorise des documents avec `voyage-4` (512 dims, `input_type: "document"`).
 * Lève en cas d'échec : aux appelants de dégrader (indexation sans embedding).
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const batch of splitBatch(texts)) {
    const batchEmbeddings = await callVoyage(
      batch,
      DOCUMENT_EMBEDDING_MODEL,
      "document",
      60_000,
    );
    embeddings.push(...batchEmbeddings);
  }
  return embeddings;
}

/**
 * Vectorise une requête avec `voyage-4-lite` (512 dims, `input_type: "query"`).
 * Compatible avec les embeddings documents (espace partagé 4-series).
 */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await callVoyage(
    [text],
    QUERY_EMBEDDING_MODEL,
    "query",
    30_000,
  );
  if (!embedding) throw new Error("[voyage] réponse vide pour la requête");
  return embedding;
}
