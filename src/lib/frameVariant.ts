import type { Node } from "@xyflow/react";
import {
  FRAME_COMPACT_HEIGHT,
  FRAME_COMPACT_VARIANT,
  FRAME_COMPACT_WIDTH,
} from "@/../convex/config/nodeConfig";

/**
 * La frame compacte, vue du rendu.
 *
 * Une variante comme une autre côté stockage (`variant: "compact"`), mais la
 * seule dont l'affichage déborde du node lui-même : la carte remplace la frame
 * ET masque son contenu. Les deux effets sont dérivés ici, au passage
 * Convex → React Flow, et jamais écrits :
 *
 * - la taille stockée de la frame reste celle de la frame dépliée — le rendu
 *   prend la taille fixe de la carte, revenir à la dépliée retrouve l'autre ;
 * - les enfants gardent leur `hidden` à eux. Le masquage par la frame se pose
 *   par-dessus, marqué `hiddenByFrame` pour que rien ne le confonde avec un
 *   masquage voulu sur le node, ni ne le persiste.
 */

type MaybeFrame = { type?: string; variant?: string };

export function isCompactFrame(node: MaybeFrame): boolean {
  return node.type === "frame" && node.variant === FRAME_COMPACT_VARIANT;
}

/** Même test sur un node React Flow, où la variante vit dans `data`. */
export function isCompactXyFrame(node: Node): boolean {
  return isCompactFrame({
    type: node.type,
    variant: node.data?.variant as string | undefined,
  });
}

export const FRAME_COMPACT_SIZE = {
  width: FRAME_COMPACT_WIDTH,
  height: FRAME_COMPACT_HEIGHT,
} as const;
