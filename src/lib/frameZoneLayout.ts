import type { CanvasNode } from "@/types";
import {
  arrangeInZones,
  zoneOf,
  type FrameZones,
  type Zone,
} from "@/../convex/lib/frameZones";

/**
 * Le rangement des frames à zones, branché sur les écritures de mise en page
 * du canvas (cf. `convex/lib/frameZones.ts` pour la règle elle-même).
 *
 * Un drag ou un redimensionnement produit des `LayoutUpdate` ; ce module en
 * déduit les frames à zones touchées et ce que leur rangement ajoute à
 * l'écriture. Le tout part dans la même mutation et la même entrée
 * d'historique que le geste : un seul Ctrl+Z défait le dépôt ET le rangement.
 */

type XY = { x: number; y: number };

/**
 * Une écriture de mise en page : où le node est, quelle taille il fait, et à
 * quelle frame il appartient. La forme que `nodes.patch` attend pour tout ce
 * que produisent un drag et un redimensionnement.
 */
export type LayoutUpdate = {
  nodeId: string;
  props: {
    position?: XY;
    width?: number;
    height?: number;
    /** `null` = sortie de frame. Voyage avec `position` : cf. le flush. */
    parentId?: string | null;
  };
};

/**
 * Fusionne deux listes d'écritures, une entrée par node.
 *
 * Indispensable et pas cosmétique : l'optimistic update de `nodes.patch` ne
 * garde que la DERNIÈRE entrée d'un même node. Deux entrées séparées — le
 * dépôt (position + frame) puis le rangement (position) — perdraient le
 * changement de frame jusqu'au retour serveur.
 *
 * `extra` l'emporte sur `base`, sauf `keepBase` : côté annulation, c'est
 * l'origine capturée avant le geste qui fait foi.
 */
export function mergeLayoutUpdates(
  base: LayoutUpdate[],
  extra: LayoutUpdate[],
  { keepBase = false }: { keepBase?: boolean } = {},
): LayoutUpdate[] {
  const byId = new Map(
    base.map((update) => [update.nodeId, { ...update.props }]),
  );
  for (const { nodeId, props } of extra) {
    const current = byId.get(nodeId);
    byId.set(
      nodeId,
      keepBase ? { ...props, ...current } : { ...current, ...props },
    );
  }
  return [...byId].map(([nodeId, props]) => ({ nodeId, props }));
}

/** Au-dessous, un écart de position ou de taille ne vaut pas une écriture. */
const EPSILON = 0.5;

function moved(a: XY, b: XY) {
  return Math.abs(a.x - b.x) >= EPSILON || Math.abs(a.y - b.y) >= EPSILON;
}

/**
 * Range une frame à zones : ses enfants dans leur zone, et la frame agrandie
 * si besoin. Rend les écritures (`after`) et leur inverse (`before`), node
 * par node, limitées à ce qui change vraiment.
 *
 * `zoneFor` dit dans quelle zone va chaque enfant : la règle diffère selon le
 * geste (cf. les appelants), le rangement non.
 */
export function arrangeFrame({
  frame,
  zones,
  children,
  zoneFor,
}: {
  frame: { id: string; width: number; height: number };
  zones: FrameZones;
  /** En coordonnées de la frame, à leur place d'avant le rangement. */
  children: Array<{ id: string; position: XY; width: number; height: number }>;
  zoneFor: (child: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => Zone;
}): { after: LayoutUpdate[]; before: LayoutUpdate[] } {
  const rects = children.map((child) => ({
    id: child.id,
    ...child.position,
    width: child.width,
    height: child.height,
  }));
  const { positions, size } = arrangeInZones({
    zones,
    size: frame,
    children: rects.map((rect) => ({ ...rect, zone: zoneFor(rect) })),
  });

  const after: LayoutUpdate[] = [];
  const before: LayoutUpdate[] = [];
  for (const child of children) {
    const position = positions.get(child.id);
    if (!position || !moved(position, child.position)) continue;
    after.push({ nodeId: child.id, props: { position } });
    before.push({ nodeId: child.id, props: { position: child.position } });
  }
  if (
    size.width - frame.width >= EPSILON ||
    size.height - frame.height >= EPSILON
  ) {
    after.push({ nodeId: frame.id, props: size });
    before.push({
      nodeId: frame.id,
      props: { width: frame.width, height: frame.height },
    });
  }
  return { after, before };
}

/**
 * Ce que des écritures de mise en page entraînent dans les frames à zones :
 * celles qui reçoivent ou perdent un node, celles dont un enfant change de
 * taille, celles qu'on redimensionne.
 *
 * Tout se lit sur l'état STOCKÉ (`canvasNodes`) auquel on applique `updates` :
 * c'est la taille dépliée d'une frame compacte (le node React Flow porte celle
 * de sa carte), et c'est l'état d'avant le geste, d'où se lit la zone de
 * chacun.
 *
 * La zone se lit dans la grille d'AVANT le geste : redimensionner une frame
 * élargit ses colonnes, et un node resté sur place pourrait sinon tomber dans
 * la colonne voisine. Un redimensionnement par le bord gauche ou haut déplace
 * en plus l'origine de la frame — les enfants sont ramenés dans l'ancien
 * repère avant lecture.
 */
export function zoneArrangementsFor(
  updates: LayoutUpdate[],
  canvasNodes: CanvasNode[],
  zonesOf: (frame: CanvasNode) => FrameZones | null,
): { after: LayoutUpdate[]; before: LayoutUpdate[] } {
  const stored = new Map(canvasNodes.map((node) => [node.id, node]));
  const next = new Map(stored);
  for (const { nodeId, props } of updates) {
    const node = next.get(nodeId);
    if (!node) continue;
    next.set(nodeId, {
      ...node,
      ...(props.position && { position: props.position }),
      ...(props.width !== undefined && { width: props.width }),
      ...(props.height !== undefined && { height: props.height }),
      ...(props.parentId !== undefined && {
        parentId: props.parentId ?? undefined,
      }),
    });
  }

  const frameIds = new Set<string>();
  for (const { nodeId, props } of updates) {
    if (props.width !== undefined || props.height !== undefined) {
      frameIds.add(nodeId);
    }
    for (const parentId of [
      next.get(nodeId)?.parentId,
      stored.get(nodeId)?.parentId,
    ]) {
      if (parentId) frameIds.add(parentId);
    }
  }

  const after: LayoutUpdate[] = [];
  const before: LayoutUpdate[] = [];
  for (const frameId of frameIds) {
    const frame = next.get(frameId);
    const frameBefore = stored.get(frameId);
    if (!frame || !frameBefore || frame.type !== "frame") continue;
    const zones = zonesOf(frame);
    if (!zones) continue;

    const shift = {
      x: frame.position.x - frameBefore.position.x,
      y: frame.position.y - frameBefore.position.y,
    };
    const arranged = arrangeFrame({
      frame: { id: frame.id, width: frame.width, height: frame.height },
      zones,
      children: [...next.values()].filter((node) => node.parentId === frameId),
      zoneFor: (rect) =>
        zoneOf(zones, frameBefore, {
          ...rect,
          x: rect.x + shift.x,
          y: rect.y + shift.y,
        }),
    });
    after.push(...arranged.after);
    before.push(...arranged.before);
  }
  return { after, before };
}
