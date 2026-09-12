import { useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { TbDirections, TbLayoutBoard, TbUsers } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { useUserCanvases } from "@/hooks/useUserCanvases";
import {
  useCanvasNavigatorStore,
  type NavigatorMarker,
} from "@/stores/canvasNavigatorStore";
import {
  useCommandCenterStore,
  type CommandCenterMode,
} from "@/stores/commandCenterStore";
import type { CommandItem } from "./commandCenterTypes";

export const COMMAND_GROUPS = {
  canvases: "Canvases",
  sharedCanvases: "Shared with me",
  navigation: "Navigation",
  markers: "Markers",
} as const;

/**
 * Construit la liste des commandes disponibles pour le mode courant.
 *
 * Point d'extension unique du command center : ajouter une fonctionnalité, ce
 * n'est qu'ajouter des `CommandItem` ici (et un groupe dans `COMMAND_GROUPS`
 * pour fixer l'ordre des sections).
 *
 * `enabled` évite de faire tourner les requêtes tant que la modale est fermée.
 */
export function useCommandCenterItems({
  enabled,
  mode,
  markers,
}: {
  enabled: boolean;
  mode: CommandCenterMode;
  /**
   * Les repères du canvas, capturés à l'entrée dans le mode « go » par
   * l'appelant. Un instantané et non un abonnement : la liste ne vit que le
   * temps de quelques frappes.
   */
  markers: NavigatorMarker[];
}): {
  items: CommandItem[];
  isLoading: boolean;
} {
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();
  const setMode = useCommandCenterStore((state) => state.setMode);
  // Le command center est monté à la racine : selon la route courante il n'y a
  // pas de `canvasId`, d'où le `strict: false`.
  const { canvasId } = useParams({ strict: false }) as {
    canvasId?: Id<"canvases">;
  };

  // Présent seulement si un canvas est monté : c'est aussi ce qui décide si
  // l'entrée « Go to a marker… » a un sens sur la route courante.
  const hasNavigator = useCanvasNavigatorStore(
    (state) => state.navigator !== null,
  );

  // La requête reste active même en mode « go » : la couper ferait clignoter
  // un état de chargement au retour (Backspace), ce que le `hasBeenOpened` de
  // la modale cherche précisément à éviter.
  const { ownCanvases, sharedCanvases, isLoading } = useUserCanvases({
    enabled: enabled && isAuthenticated,
  });

  const items = useMemo<CommandItem[]>(() => {
    if (mode === "go") {
      return markers.map((marker): CommandItem => {
        const label = marker.title.trim() || "Untitled marker";
        return {
          id: `marker:${marker.xyNodeId}`,
          label,
          group: COMMAND_GROUPS.markers,
          icon: TbDirections,
          // Un repère dont la value `view` est absente ou abîmée : on le
          // montre — le cacher laisserait l'utilisateur le chercher — mais il
          // ne mène nulle part.
          hint: marker.framing ? undefined : "No view saved",
          // Figé à l'instantané d'entrée en mode « go » : la vue ne bouge pas
          // tant que la modale est ouverte, il est donc toujours juste.
          delta: marker.delta,
          run: () => {
            const { navigator } = useCanvasNavigatorStore.getState();
            if (!navigator) return;
            // Cadrage relu à l'exécution, pas celui de l'instantané : le
            // repère peut avoir été supprimé ou recadré depuis l'ouverture.
            const live = navigator
              .getMarkers()
              .find((current) => current.xyNodeId === marker.xyNodeId);
            if (!live?.framing) return;
            navigator.goTo(live.framing);
          },
        };
      });
    }

    const toCommand = (
      canvas: { _id: Id<"canvases">; name: string; description?: string },
      group: string,
      icon: typeof TbLayoutBoard,
    ): CommandItem => ({
      id: `canvas:${canvas._id}`,
      label: canvas.name,
      group,
      icon,
      hint: canvas._id === canvasId ? "Current" : undefined,
      keywords: canvas.description ? [canvas.description] : undefined,
      run: () => {
        void navigate({
          to: "/canvas/$canvasId",
          params: { canvasId: canvas._id },
        });
      },
    });

    return [
      // Fait connaître le mode « go » à qui ne l'a pas lu dans le pied de la
      // modale : la commande ne navigue pas, elle bascule le contexte de
      // recherche — d'où `keepOpen`.
      ...(hasNavigator
        ? [
            {
              id: "mode:go",
              label: "Go to a marker…",
              group: COMMAND_GROUPS.navigation,
              icon: TbDirections,
              hint: "go",
              keywords: ["marker", "viewport", "navigate", "jump"],
              keepOpen: true,
              run: () => setMode("go"),
            } satisfies CommandItem,
          ]
        : []),
      ...ownCanvases.map((canvas) =>
        toCommand(canvas, COMMAND_GROUPS.canvases, TbLayoutBoard),
      ),
      ...sharedCanvases.map((canvas) =>
        toCommand(canvas, COMMAND_GROUPS.sharedCanvases, TbUsers),
      ),
    ];
  }, [
    mode,
    markers,
    ownCanvases,
    sharedCanvases,
    canvasId,
    navigate,
    hasNavigator,
    setMode,
  ]);

  return { items, isLoading: mode === "all" && isLoading };
}
