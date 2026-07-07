"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

const segmentValidator = v.object({
  text: v.string(),
  start: v.number(),
  end: v.number(),
});

/**
 * Action that receives an audio ArrayBuffer,
 * verifies authentication, and calls Mistral's
 * speech-to-text API (Voxtral Mini Transcribe) for transcription
 * with word-level timestamps.
 */
export const transcribe = action({
  args: {
    audio: v.bytes(),
    // Type MIME réel de l'enregistrement (Safari produit de l'audio/mp4, pas
    // du webm). Défaut audio/webm pour compat avec les anciens clients.
    mimeType: v.optional(v.string()),
  },
  returns: v.object({
    text: v.string(),
    segments: v.array(segmentValidator),
    language: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY is not configured");
    }

    // Build FormData for Mistral audio transcription API
    const mimeType = (args.mimeType ?? "audio/webm").split(";")[0].trim();
    const extension = mimeType.includes("mp4")
      ? "m4a"
      : mimeType.includes("ogg")
        ? "ogg"
        : "webm";
    const audioBlob = new Blob([args.audio], { type: mimeType });
    const formData = new FormData();
    formData.append("file", audioBlob, `recording.${extension}`);
    formData.append("model", "voxtral-mini-latest");
    // Note: timestamp_granularities is NOT compatible with language param
    formData.append("timestamp_granularities", "word");

    const response = await fetch(
      "https://api.mistral.ai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Mistral API error (${response.status}): ${errorBody}`);
    }

    const result = await response.json();

    return {
      text: result.text ?? "",
      segments: (result.segments ?? []).map(
        (s: { text: string; start: number; end: number }) => ({
          text: s.text,
          start: s.start,
          end: s.end,
        }),
      ),
      language: result.language ?? null,
    };
  },
});