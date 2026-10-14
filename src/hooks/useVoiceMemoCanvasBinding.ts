import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { Id } from "@/../convex/_generated/dataModel";
import { useCreateNode } from "./useCreateNode";
import { useFlowPosition } from "./useCanvasPointerPosition";
import { useCanvasHotkeysEnabled } from "./useCanvasHotkeysEnabled";
import { nextTopZIndex } from "@/lib/nodeLayering";
import { runIfIsolatedKeystroke } from "@/lib/isolatedKeystroke";
import {
  registerVoiceMemoBinding,
  useVoiceMemoStore,
} from "@/stores/voiceMemoStore";
import { voiceMemoNodeShape } from "@/components/voice-memo/voiceMemoNode";

/**
 * Relie le canvas ouvert au mémo vocal :
 * - il dit où poser le node (centre de la vue, au sommet de la pile) et le
 *   crée en local-first quand le mémo se termine ici ;
 * - le quitter (autre canvas, accueil) arrête l'enregistrement commencé ici et
 *   le sauve sur ce canvas, à la vue du moment ;
 * - R lance ou arrête l'enregistrement, comme le bouton de la toolbar.
 *
 * Doit être appelé sous le `ReactFlowProvider` du canvas.
 */
export function useVoiceMemoCanvasBinding({
  canvasId,
  canEdit,
  isTouch,
}: {
  canvasId: Id<"canvases">;
  canEdit: boolean;
  isTouch: boolean;
}) {
  const { createNode } = useCreateNode();
  const { getViewportCenter } = useFlowPosition();
  const { getNodes } = useReactFlow();

  // Le binding lit toujours les dernières fonctions sans se réenregistrer à
  // chaque rendu : seul le changement de canvas doit déclencher le garde-fou.
  const latest = useRef({ createNode, getViewportCenter, getNodes });
  useEffect(() => {
    latest.current = { createNode, getViewportCenter, getNodes };
  });

  useEffect(() => {
    if (!canEdit) return;
    const unregister = registerVoiceMemoBinding(canvasId, {
      getTarget: () => ({
        center: latest.current.getViewportCenter(),
        zIndex: nextTopZIndex(latest.current.getNodes()),
      }),
      create: async (values, target) => {
        const { type, width, height, color, position } =
          voiceMemoNodeShape(target);
        await latest.current.createNode({
          node: {
            id: "",
            type,
            width,
            height,
            position: { x: 0, y: 0 },
            data: { color },
          },
          position,
          initialValues: values,
        }).settled;
      },
    });
    return () => {
      // Avant de retirer le binding : `stop` lit la cible tout de suite.
      const { phase, canvasId: recordingCanvasId, stop } =
        useVoiceMemoStore.getState();
      if (
        recordingCanvasId === canvasId &&
        (phase === "recording" || phase === "starting")
      ) {
        stop();
      }
      unregister();
    };
  }, [canEdit, canvasId]);

  const hotkeysEnabled = useCanvasHotkeysEnabled({ canEdit, isTouch });
  useHotkey(
    "R",
    (event) => {
      if (event.repeat) return;
      runIfIsolatedKeystroke(event, () => {
        const { phase, hasPendingSave, start, stop, setPanelOpen } =
          useVoiceMemoStore.getState();
        if (phase === "recording") stop();
        // Un mémo en cours de sauvegarde, ou à sauver : on le montre plutôt
        // que d'en démarrer un autre.
        else if (phase === "saving" || hasPendingSave) setPanelOpen(true);
        else void start(canvasId);
      });
    },
    { enabled: hotkeysEnabled, ignoreInputs: true },
  );
}
