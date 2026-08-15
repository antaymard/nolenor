import { useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { TbLayoutBoard, TbUsers } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { useUserCanvases } from "@/hooks/useUserCanvases";
import type { CommandItem } from "./commandCenterTypes";

export const COMMAND_GROUPS = {
  canvases: "Canvas",
  sharedCanvases: "Partagés avec moi",
} as const;

/**
 * Construit la liste des commandes disponibles.
 *
 * Point d'extension unique du command center : ajouter une fonctionnalité, ce
 * n'est qu'ajouter des `CommandItem` ici (et un groupe dans `COMMAND_GROUPS`
 * pour fixer l'ordre des sections).
 *
 * `enabled` évite de faire tourner les requêtes tant que la modale est fermée.
 */
export function useCommandCenterItems({ enabled }: { enabled: boolean }): {
  items: CommandItem[];
  isLoading: boolean;
} {
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();
  // Le command center est monté à la racine : selon la route courante il n'y a
  // pas de `canvasId`, d'où le `strict: false`.
  const { canvasId } = useParams({ strict: false }) as {
    canvasId?: Id<"canvases">;
  };

  const { ownCanvases, sharedCanvases, isLoading } = useUserCanvases({
    enabled: enabled && isAuthenticated,
  });

  const items = useMemo<CommandItem[]>(() => {
    const toCommand = (
      canvas: { _id: Id<"canvases">; name: string; description?: string },
      group: string,
      icon: typeof TbLayoutBoard,
    ): CommandItem => ({
      id: `canvas:${canvas._id}`,
      label: canvas.name,
      group,
      icon,
      hint: canvas._id === canvasId ? "Actuel" : undefined,
      keywords: canvas.description ? [canvas.description] : undefined,
      run: () => {
        void navigate({
          to: "/canvas/$canvasId",
          params: { canvasId: canvas._id },
        });
      },
    });

    return [
      ...ownCanvases.map((canvas) =>
        toCommand(canvas, COMMAND_GROUPS.canvases, TbLayoutBoard),
      ),
      ...sharedCanvases.map((canvas) =>
        toCommand(canvas, COMMAND_GROUPS.sharedCanvases, TbUsers),
      ),
    ];
  }, [ownCanvases, sharedCanvases, canvasId, navigate]);

  return { items, isLoading };
}
