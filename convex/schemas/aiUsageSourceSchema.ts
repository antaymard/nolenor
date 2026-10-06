import { v } from "convex/values";

/**
 * Origine d'une consommation LLM. L'union est volontairement fermée : tout
 * nouvel appel LLM doit venir ajouter son literal ici, sinon il n'est pas
 * compté du tout. C'est le garde-fou contre les chemins non métrés qui se sont
 * accumulés jusqu'ici (worker et génération de titre ne l'étaient pas).
 *
 * Hors périmètre pour l'instant, et donc absents : le captioning d'images et
 * l'OCR PDF (searchable/chunkBuilder.ts), la dictée speech-to-text (speech.ts)
 * et la recherche web Parallel. Leur dépense n'apparaît pas dans
 * /settings/ai-usage. La transcription des nodes audio, elle, est comptée
 * (`transcription`, cf. ia/transcriptionRun.ts).
 */
const aiUsageSources = {
  nole: "nole",
  worker: "worker",
  threadTitle: "threadTitle",
  imageGeneration: "imageGeneration",
  transcription: "transcription",
  // L'aiguillage des demandes de l'omnibar (Jev, cf. ia/router/jevRouter.ts).
  router: "router",
} as const;

const vAiUsageSource = v.union(
  v.literal(aiUsageSources.nole),
  v.literal(aiUsageSources.worker),
  v.literal(aiUsageSources.threadTitle),
  v.literal(aiUsageSources.imageGeneration),
  v.literal(aiUsageSources.transcription),
  v.literal(aiUsageSources.router),
);

type AiUsageSource = typeof vAiUsageSource.type;

export { aiUsageSources, vAiUsageSource, type AiUsageSource };
