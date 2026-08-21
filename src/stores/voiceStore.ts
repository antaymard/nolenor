import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { LiveTranscriptionProvider } from "@/hooks/useLiveTranscription";

interface VoiceStore {
  /**
   * Moteur de transcription live. Préférence locale à l'appareil : elle ne
   * remonte pas à Convex, chaque navigateur garde la sienne.
   */
  provider: LiveTranscriptionProvider;
  setProvider: (provider: LiveTranscriptionProvider) => void;
}

/**
 * Choix du moteur de dictée, partagé entre le sélecteur du composer et
 * `useNoleLiveTranscription`. Un store plutôt qu'une prop : le sélecteur vit
 * dans `ChatInput` alors que la valeur est consommée dans `useNoleChat` →
 * `useNoleSpeechInput` → `useNoleLiveTranscription`, et faire redescendre un
 * setter à travers toute cette chaîne pour un seul réglage ne vaut pas le coup.
 *
 * Le seul store persisté de l'app : un réglage qui saute à chaque rechargement
 * ne permet pas de comparer les deux moteurs sur plusieurs sessions, ce qui est
 * précisément l'intérêt du sélecteur.
 */
export const useVoiceStore = create<VoiceStore>()(
  devtools(
    persist(
      (set) => ({
        provider: "gladia",
        setProvider: (provider) => set({ provider }),
      }),
      {
        name: "nolenor-voice",
        // Seul le choix est persisté : si le store gagne d'autres champs, ils
        // ne partent pas en localStorage par inadvertance.
        partialize: (state) => ({ provider: state.provider }),
        // Une valeur inconnue en localStorage (moteur retiré, clé bidouillée)
        // ne doit pas produire une URL WebSocket invalide.
        merge: (persisted, current) => {
          const saved = (persisted as Partial<VoiceStore> | undefined)
            ?.provider;
          return {
            ...current,
            provider:
              saved === "mistral" || saved === "gladia"
                ? saved
                : current.provider,
          };
        },
      },
    ),
    { name: "voiceStore" },
  ),
);
