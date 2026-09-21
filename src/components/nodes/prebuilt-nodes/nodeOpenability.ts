/**
 * Which prebuilt node types can be opened in a window.
 *
 * Deliberately split out from prebuiltNodesConfig.ts, which also imports
 * every node's React component (BlocknoteNode, TableNode, ...). BlocknoteNode
 * renders BlockNoteStatic, which imports the blocknote registry — so any
 * module reachable FROM the registry/schema (e.g. the mention pill's click
 * handler, which needs to know whether the mentioned node type opens in a
 * window) must not import prebuiltNodesConfig.ts directly: doing so closes a
 * cycle back to itself. That cycle built without error but crashed at
 * runtime — "Cannot access 'X' before initialization" — once bundled, since
 * Rollup's module evaluation order left a const read before its own
 * initializer ran.
 *
 * This file has no component imports, so it's safe for both
 * prebuiltNodesConfig.ts (the source of truth `nodeUiConfig` derives
 * `canBeOpenInWindow` from, preserving today's behaviour exactly) and any
 * BlockNote-registry-reachable module to depend on directly.
 */
export const OPENABLE_PREBUILT_NODE_TYPES: ReadonlySet<string> = new Set([
  "image",
  // Ouvrable quelle que soit sa variante : la window rend le lien dans une
  // iframe, ce qui est le contenu de la variante `embed` en grand. Sur un
  // bandeau ou une carte, le double-clic vaut donc « ouvrir la page ici ».
  // Beaucoup de sites refuseront de s'embarquer, et un refus cross-origin est
  // indétectable — d'où la sortie vers le navigateur toujours visible dans la
  // barre de titre de `LinkWindow`.
  "link",
  "blocknote",
  "pdf",
  "table",
  "app",
  "video",
]);
