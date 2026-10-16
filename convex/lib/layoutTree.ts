import { z } from "zod";

/**
 * Le moteur de layout : un arbre de containers flex dont les feuilles
 * dépendent de l'usage (cf. SPECS/layout-engine.md).
 *
 * - Custom node : les feuilles sont ses champs, des textes, des séparateurs
 *   (cf. `convex/config/templateConfig.ts`).
 * - Frame à espaces : les feuilles sont des espaces qui rangent d'autres
 *   nodes du canvas.
 *
 * Ce module ne connaît que les containers. Il est générique sur la feuille,
 * qui n'a qu'à porter un `kind` (jamais `"container"`) et un `id`. Toutes les
 * opérations sont pures et immuables : partagées par l'éditeur, la
 * validation serveur et, à terme, les tools de Nolë.
 */

export type LayoutLeaf = { kind: string; id: string };

export type LayoutContainer<Leaf extends LayoutLeaf = LayoutLeaf> = {
  kind: "container";
  id: string;
  direction: "row" | "column";
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  padding?: number;
  grow?: number;
  children: Array<LayoutTreeNode<Leaf>>;
};

export type LayoutTreeNode<Leaf extends LayoutLeaf = LayoutLeaf> =
  | LayoutContainer<Leaf>
  | Leaf;

export const MAX_CHILDREN_PER_CONTAINER = 20;

/**
 * Garde de type plutôt qu'un test de `kind` en place : sur une feuille
 * générique, `kind` vaut `string`, et `node.kind === "container"` ne
 * suffirait pas à TypeScript pour écarter la feuille.
 */
export function isLayoutContainer<Leaf extends LayoutLeaf>(
  node: LayoutTreeNode<Leaf>,
): node is LayoutContainer<Leaf> {
  return node.kind === "container";
}

// ── Schéma ──────────────────────────────────────────────────────────────

/**
 * Le schéma zod d'un arbre dont les feuilles valident `leafSchema`.
 *
 * Stocké en `v.any()` côté Convex (pas de validateurs récursifs) : ce parse
 * est obligatoire à chaque écriture, sinon un arbre malformé casserait le
 * rendu chez tous les viewers.
 */
export function buildLayoutContainerSchema<Leaf extends LayoutLeaf>(
  leafSchema: z.ZodType<Leaf>,
): z.ZodType<LayoutContainer<Leaf>> {
  const containerSchema: z.ZodType<LayoutContainer<Leaf>> = z.strictObject({
    kind: z.literal("container"),
    id: z.string().min(1).max(64),
    direction: z.enum(["row", "column"]),
    gap: z.number().min(0).max(100).optional(),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
    justify: z.enum(["start", "center", "end", "between"]).optional(),
    padding: z.number().min(0).max(100).optional(),
    grow: z.number().min(0).max(12).optional(),
    children: z
      .array(
        z.lazy(
          (): z.ZodType<LayoutTreeNode<Leaf>> =>
            z.union([containerSchema, leafSchema]),
        ),
      )
      .max(MAX_CHILDREN_PER_CONTAINER),
  });
  return containerSchema;
}

// ── Création ────────────────────────────────────────────────────────────

/** Ids stables (containers, feuilles) : jamais réutilisés ni modifiés. */
export function genLayoutId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export function newLayoutContainer<Leaf extends LayoutLeaf>(
  direction: "row" | "column",
): LayoutContainer<Leaf> {
  return {
    kind: "container",
    id: genLayoutId("c"),
    direction,
    gap: 8,
    children: [],
  };
}

// ── Parcours ────────────────────────────────────────────────────────────

/** Les feuilles de l'arbre, dans l'ordre du parcours. */
export function collectLayoutLeaves<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
): Leaf[] {
  return tree.children.flatMap((child) =>
    isLayoutContainer(child) ? collectLayoutLeaves(child) : [child],
  );
}

/** Tous les ids de l'arbre, racine comprise. */
export function collectLayoutNodeIds<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
): string[] {
  return [
    tree.id,
    ...tree.children.flatMap((child) =>
      isLayoutContainer(child) ? collectLayoutNodeIds(child) : [child.id],
    ),
  ];
}

/** Profondeur d'imbrication : ne compte que les containers. */
export function getLayoutDepth<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
): number {
  return (
    1 +
    Math.max(
      0,
      ...tree.children.map((child) =>
        isLayoutContainer(child) ? getLayoutDepth(child) : 0,
      ),
    )
  );
}

export function findLayoutNode<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  nodeId: string,
): LayoutTreeNode<Leaf> | null {
  if (tree.id === nodeId) return tree;
  for (const child of tree.children) {
    if (child.id === nodeId) return child;
    if (isLayoutContainer(child)) {
      const found = findLayoutNode(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export function findLayoutParentId<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  nodeId: string,
): string | null {
  for (const child of tree.children) {
    if (child.id === nodeId) return tree.id;
    if (isLayoutContainer(child)) {
      const found = findLayoutParentId(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Chemin racine → node, ids inclus, le node lui-même en dernier. Vide si le
 * node est introuvable.
 */
export function getLayoutAncestorPath<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  nodeId: string,
): string[] {
  const walk = (node: LayoutTreeNode<Leaf>, trail: string[]): string[] => {
    const path = [...trail, node.id];
    if (node.id === nodeId) return path;
    if (!isLayoutContainer(node)) return [];
    for (const child of node.children) {
      const found = walk(child, path);
      if (found.length > 0) return found;
    }
    return [];
  };
  return walk(tree, []);
}

// ── Opérations immuables ────────────────────────────────────────────────

/** Applique `fn` à chaque container, de la racine vers les feuilles. */
function mapContainers<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  fn: (container: LayoutContainer<Leaf>) => LayoutContainer<Leaf>,
): LayoutContainer<Leaf> {
  const next = fn(tree);
  return {
    ...next,
    children: next.children.map((child) =>
      isLayoutContainer(child) ? mapContainers(child, fn) : child,
    ),
  };
}

export function updateLayoutNode<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  nodeId: string,
  // Partiel sur l'union : l'appelant connaît le kind du nœud qu'il patche,
  // cette fonction n'a pas à le redémontrer.
  patch: Partial<LayoutTreeNode<Leaf>>,
): LayoutContainer<Leaf> {
  const patchNode = <T extends LayoutTreeNode<Leaf>>(node: T): T =>
    node.id === nodeId ? ({ ...node, ...patch } as T) : node;
  return mapContainers(patchNode(tree), (container) => ({
    ...container,
    children: container.children.map(patchNode),
  }));
}

export function removeLayoutNode<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  nodeId: string,
): { tree: LayoutContainer<Leaf>; removed: LayoutTreeNode<Leaf> | null } {
  const removed = tree.id === nodeId ? null : findLayoutNode(tree, nodeId);
  if (!removed) return { tree, removed: null };
  return {
    tree: mapContainers(tree, (container) => ({
      ...container,
      children: container.children.filter((child) => child.id !== nodeId),
    })),
    removed,
  };
}

/** `index` absent ou hors bornes : en fin (ou en tête) du container. */
export function insertLayoutNode<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  containerId: string,
  index: number | undefined,
  node: LayoutTreeNode<Leaf>,
): LayoutContainer<Leaf> {
  return mapContainers(tree, (container) => {
    if (container.id !== containerId) return container;
    const children = [...container.children];
    const at =
      index === undefined
        ? children.length
        : Math.max(0, Math.min(index, children.length));
    children.splice(at, 0, node);
    return { ...container, children };
  });
}

/**
 * Déplace un node vers (containerId, index). Refuse — arbre inchangé — de
 * déplacer la racine, ou un container dans lui-même ou un descendant.
 */
export function moveLayoutNode<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  nodeId: string,
  targetContainerId: string,
  targetIndex: number | undefined,
): LayoutContainer<Leaf> {
  const node = findLayoutNode(tree, nodeId);
  if (!node || node.id === tree.id) return tree;
  if (isLayoutContainer(node) && findLayoutNode(node, targetContainerId)) {
    return tree;
  }

  const { tree: without, removed } = removeLayoutNode(tree, nodeId);
  if (!removed || !findLayoutNode(without, targetContainerId)) return tree;
  return insertLayoutNode(without, targetContainerId, targetIndex, removed);
}

/**
 * Entoure un node d'un nouveau container, à sa place exacte.
 *
 * `containerId: null` signale un refus : node racine ou introuvable, ou
 * profondeur `maxDepth` dépassée. Refuser au geste plutôt qu'à la
 * validation : l'erreur ne tomberait qu'à l'enregistrement, loin du geste
 * qui l'a causée.
 */
export function wrapLayoutNode<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  nodeId: string,
  direction: "row" | "column",
  maxDepth: number,
): { tree: LayoutContainer<Leaf>; containerId: string | null } {
  const parentId = findLayoutParentId(tree, nodeId);
  if (!parentId) return { tree, containerId: null };
  const parent = findLayoutNode(tree, parentId) as LayoutContainer<Leaf>;
  const index = parent.children.findIndex((child) => child.id === nodeId);

  const { tree: without, removed } = removeLayoutNode(tree, nodeId);
  if (!removed) return { tree, containerId: null };

  const container: LayoutContainer<Leaf> = {
    ...newLayoutContainer<Leaf>(direction),
    children: [removed],
  };
  // Le node retiré a décalé ses suivants d'un cran : réinsérer à `index` le
  // remet exactement où il était.
  const next = insertLayoutNode(without, parentId, index, container);
  if (getLayoutDepth(next) > maxDepth) return { tree, containerId: null };
  return { tree: next, containerId: container.id };
}

/**
 * Où insérer à partir d'une sélection : DANS un container sélectionné (en
 * fin), juste APRÈS une feuille sélectionnée, à la racine sans sélection.
 */
export function resolveLayoutInsertionPoint<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  selectedId: string | null,
): { containerId: string; index: number | undefined } {
  const selected = selectedId ? findLayoutNode(tree, selectedId) : null;
  if (!selected) return { containerId: tree.id, index: undefined };
  if (isLayoutContainer(selected)) {
    return { containerId: selected.id, index: undefined };
  }

  const parentId = findLayoutParentId(tree, selected.id);
  if (!parentId) return { containerId: tree.id, index: undefined };
  const parent = findLayoutNode(tree, parentId) as LayoutContainer<Leaf>;
  const index = parent.children.findIndex((child) => child.id === selected.id);
  return { containerId: parentId, index: index < 0 ? undefined : index + 1 };
}

/** Retire toutes les feuilles qui vérifient `predicate`. */
export function removeLayoutLeaves<Leaf extends LayoutLeaf>(
  tree: LayoutContainer<Leaf>,
  predicate: (leaf: Leaf) => boolean,
): LayoutContainer<Leaf> {
  return mapContainers(tree, (container) => ({
    ...container,
    children: container.children.filter(
      (child) => isLayoutContainer(child) || !predicate(child),
    ),
  }));
}
