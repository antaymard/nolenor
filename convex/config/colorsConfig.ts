/**
 * La palette de couleurs partagée : nodes, frames, edges, callouts et canvas.
 *
 * Source unique des clés, importable des deux côtés : le front y accroche ses
 * classes Tailwind (`src/components/ui/styles.ts`), le serveur s'en sert pour
 * valider (`canvases.color`) et pour publier la liste aux outils de Nolë.
 *
 * Rangée par teinte, du rouge au rose : c'est l'ordre des pastilles dans les
 * menus. Les neutres (`default`, `transparent`) ferment la marche.
 */
export const NODE_COLORS = [
  "red",
  "orange",
  "yellow",
  "lime",
  "green",
  "teal",
  "sky",
  "blue",
  "purple",
  "pink",
  "default",
  "transparent",
] as const;

export type NodeColor = (typeof NODE_COLORS)[number];

/**
 * Les teintes qu'un canvas peut porter : la palette des nodes sans ses
 * neutres — une tuile « transparente » ou « par défaut » ne distinguerait
 * aucun canvas d'un autre.
 */
export const CANVAS_COLORS = [
  "red",
  "orange",
  "yellow",
  "lime",
  "green",
  "teal",
  "sky",
  "blue",
  "purple",
  "pink",
] as const satisfies ReadonlyArray<NodeColor>;

export type CanvasColor = (typeof CANVAS_COLORS)[number];
