import { create } from "zustand";

/**
 * Session d'ingest depuis la modale d'onboarding (cf. `OnboardingDropzone`).
 *
 * Les fichiers droppés créent de vrais nodes sur le canvas, en arrière-plan,
 * pendant que la modale reste ouverte. Le store fait le lien entre trois
 * endroits qui ne se parlent pas directement :
 * - `OnboardingDropzone` démarre la session et y reporte la progression,
 * - `useEmptyCanvasOnboarding` maintient la modale ouverte tant qu'une
 *   session existe (le canvas n'est plus vide dès le premier node, sans ce
 *   garde la modale se fermerait en plein upload),
 * - `OnboardingChatInput` bloque l'envoi tant que `active` est vrai.
 *
 * Tout vit en mémoire : un reload en plein upload avorte les transferts, les
 * nodes déjà créés restent, et l'onboarding retombe sur son comportement
 * normal (nettoyage du param sur canvas non vide).
 */
interface OnboardingIngestState {
  /** Incrémenté à chaque drop : les callbacks d'une session périmée (modale
   * fermée en plein upload, uploads qui continuent en tâche de fond) sont
   * ignorés. */
  sessionId: number;
  /** Vrai depuis le premier drop jusqu'au `reset` explicite (fermeture ou
   * envoi depuis la modale). */
  hasSession: boolean;
  /** Uploads / créations encore en cours. */
  active: boolean;
  /** Nombre de drops successifs : chaque session décale son origine pour ne
   * pas empiler exactement les clusters. */
  dropCount: number;
  total: number;
  done: number;
  currentLabel: string;
  currentPercent: number;
  failed: number;
  /** Démarre une session pour `total` fichiers, retourne son `sessionId`. */
  start: (total: number) => number;
  reportProgress: (
    sessionId: number,
    done: number,
    total: number,
    currentLabel: string,
    currentPercent: number,
  ) => void;
  finish: (sessionId: number, failed: number) => void;
  reset: () => void;
}

export const useOnboardingIngestStore = create<OnboardingIngestState>()(
  (set, get) => ({
    sessionId: 0,
    hasSession: false,
    active: false,
    dropCount: 0,
    total: 0,
    done: 0,
    currentLabel: "",
    currentPercent: 0,
    failed: 0,
    start: (total) => {
      const sessionId = get().sessionId + 1;
      set({
        sessionId,
        hasSession: true,
        active: true,
        dropCount: get().dropCount + 1,
        total,
        done: 0,
        currentLabel: "",
        currentPercent: 0,
        failed: 0,
      });
      return sessionId;
    },
    reportProgress: (
      sessionId,
      done,
      total,
      currentLabel,
      currentPercent,
    ) => {
      if (get().sessionId !== sessionId) return;
      set({ done, total, currentLabel, currentPercent });
    },
    finish: (sessionId, failed) => {
      if (get().sessionId !== sessionId) return;
      set({ active: false, failed });
    },
    reset: () => {
      set({
        hasSession: false,
        active: false,
        total: 0,
        done: 0,
        currentLabel: "",
        currentPercent: 0,
        failed: 0,
      });
    },
  }),
);
