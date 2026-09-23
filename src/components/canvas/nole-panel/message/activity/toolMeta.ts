import type { IconType } from "react-icons";
import {
  TbAdjustmentsHorizontal,
  TbArrowsRightLeft,
  TbBoxMultiple,
  TbBulb,
  TbCode,
  TbColumns,
  TbCursorText,
  TbFileText,
  TbLayoutGrid,
  TbListSearch,
  TbNotebook,
  TbPencil,
  TbPhoto,
  TbReplace,
  TbRobot,
  TbRowInsertBottom,
  TbRowRemove,
  TbSearch,
  TbSparkles,
  TbSquarePlus,
  TbTable,
  TbTextPlus,
  TbTool,
  TbTrash,
  TbWorld,
  TbWorldSearch,
} from "react-icons/tb";

/**
 * Famille d'un tool : sert au résumé d'un bloc d'activité (« Read 3 nodes,
 * edited 2 ») et à savoir quels nodes mettre en avant — seuls ceux qu'on a
 * créés ou modifiés intéressent l'utilisateur une fois le tour fini.
 */
export type ToolCategory =
  | "read"
  | "search"
  | "web-search"
  | "web-open"
  | "create"
  | "edit"
  | "connect"
  | "memory"
  | "skill"
  | "agent"
  | "other";

type ToolMeta = {
  icon: IconType;
  category: ToolCategory;
  /** Libellé de repli, quand le modèle n'a pas (encore) écrit d'`explanation`. */
  label: string;
};

/**
 * Noms alignés sur `convex/ia/tools/*` (`ToolConfig.name`). Un tool absent
 * d'ici — un tool MCP, un tool ajouté plus tard — n'est pas une erreur : il
 * retombe sur `getToolMeta`'s défaut générique.
 */
const TOOL_META: Record<string, ToolMeta> = {
  read_nodes: { icon: TbFileText, category: "read", label: "Read nodes" },
  list_nodes: { icon: TbListSearch, category: "read", label: "List nodes" },
  view_image: { icon: TbPhoto, category: "read", label: "View image" },
  list_user_canvases: {
    icon: TbLayoutGrid,
    category: "read",
    label: "List canvases",
  },
  search_canvas: { icon: TbSearch, category: "search", label: "Search canvas" },
  websearch: { icon: TbWorldSearch, category: "web-search", label: "Web search" },
  open_webpage: { icon: TbWorld, category: "web-open", label: "Open web page" },
  create_node: { icon: TbSquarePlus, category: "create", label: "Create node" },
  set_node_data: { icon: TbPencil, category: "edit", label: "Update node" },
  insert_blocks: { icon: TbTextPlus, category: "edit", label: "Insert blocks" },
  replace_block: { icon: TbReplace, category: "edit", label: "Replace block" },
  delete_blocks: { icon: TbTrash, category: "edit", label: "Delete blocks" },
  patch_block_text: {
    icon: TbCursorText,
    category: "edit",
    label: "Edit block text",
  },
  update_block_props: {
    icon: TbAdjustmentsHorizontal,
    category: "edit",
    label: "Update block",
  },
  table_insert_rows: {
    icon: TbRowInsertBottom,
    category: "edit",
    label: "Insert rows",
  },
  table_update_rows: { icon: TbTable, category: "edit", label: "Update rows" },
  table_delete_rows: { icon: TbRowRemove, category: "edit", label: "Delete rows" },
  table_update_schema: {
    icon: TbColumns,
    category: "edit",
    label: "Update table schema",
  },
  group_nodes: { icon: TbBoxMultiple, category: "edit", label: "Group nodes" },
  patch_app_node_code: { icon: TbCode, category: "edit", label: "Edit app code" },
  create_connection: {
    icon: TbArrowsRightLeft,
    category: "connect",
    label: "Connect nodes",
  },
  memory: { icon: TbNotebook, category: "memory", label: "Update memory" },
  load_skill: { icon: TbSparkles, category: "skill", label: "Load skill" },
  run_subAgent: { icon: TbRobot, category: "agent", label: "Run sub-agent" },
};

export const REASONING_ICON = TbBulb;

/** `list_user_canvases` → « List user canvases ». */
export function humanizeToolName(name: string): string {
  const spaced = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1) || name;
}

export function getToolMeta(name: string): ToolMeta {
  return (
    TOOL_META[name] ?? {
      icon: TbTool,
      category: "other",
      label: humanizeToolName(name),
    }
  );
}

/** Catégories dont les nodes cités méritent une pastille dans le résumé. */
export const WRITE_CATEGORIES: ReadonlySet<ToolCategory> = new Set([
  "create",
  "edit",
  "connect",
]);
