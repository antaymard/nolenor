import { TbCalendar, TbLink, TbNetwork } from "react-icons/tb";
import { BlockNoteStatic } from "@/components/blocknote/BlockNoteStatic";
import { Checkbox } from "@/components/shadcn/checkbox";
import {
  getNodeDataTitle,
  getNodeIcon,
} from "@/components/utils/nodeDataDisplayUtils";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { parseRichTextCell } from "./richText";
import {
  DEFAULT_ROW_HEIGHT,
  ROW_HEIGHT_CONFIG,
  SELECT_COLOR_CLASSES,
  type ColumnType,
  type CellValue,
  type LinkCellValue,
  type NodeCellValue,
  type RowHeight,
  type SelectCellValue,
  type SelectOption,
} from "./types";
import { cn } from "@/lib/utils";
import { useNodeDataIdOf } from "@/lib/nodeIdentity";

export interface CellDisplayProps {
  type: ColumnType;
  value: CellValue | undefined;
  options?: SelectOption[];
  /**
   * Optionnel, défaut `short` : les consommateurs hors grille (TablePreview sur
   * le canvas, historique de versions) gardent la densité d'origine.
   */
  rowHeight?: RowHeight;
}

export function CellDisplay({
  type,
  value,
  options,
  rowHeight = DEFAULT_ROW_HEIGHT,
}: CellDisplayProps) {
  const nodeVal = value as NodeCellValue | null | undefined;
  // Appelé inconditionnellement : c'est un hook, et seule la branche `node`
  // s'en sert. `useNodeDataIdOf(undefined)` ne lit rien.
  const nodeDataId = useNodeDataIdOf(
    type === "node" ? nodeVal?.nodeId : undefined,
  );
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);

  if (type === "node") {
    const nodeData = nodeDataId ? nodeDatas.get(nodeDataId) : undefined;
    const title = nodeData
      ? getNodeDataTitle(nodeData)
      : nodeVal?.nodeId
        ? "Node supprimé"
        : null;
    const Icon = nodeData ? getNodeIcon(nodeData.type) : null;

    if (!title) {
      return <span className="block w-full min-h-[1.4em] px-1" />;
    }
    return (
      <span className="flex items-center gap-1 w-full min-h-[1.4em] px-1">
        <span
          className={`inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-medium max-w-full${!nodeData ? " opacity-50" : ""}`}
        >
          {Icon ? (
            <Icon size={13} className="shrink-0 text-muted-foreground" />
          ) : (
            <TbNetwork size={13} className="shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{title}</span>
        </span>
      </span>
    );
  }

  if (type === "richtext") {
    const doc = parseRichTextCell(value);
    if (!doc) return <span className="block w-full min-h-[1.4em] px-1" />;
    return (
      <div
        // `bn-readonly-container` porte les styles du rendu statique : sans elle
        // la préflight Tailwind laisse les listes sans puces.
        className="bn-readonly-container w-full min-h-[1.4em] overflow-hidden px-1 text-sm"
        // Clamp par hauteur de conteneur : le contenu est un arbre de blocs,
        // `line-clamp` n'a pas de sens sur une liste ou un tableau.
        style={{ maxHeight: `${ROW_HEIGHT_CONFIG[rowHeight].lines * 1.5}em` }}
      >
        <BlockNoteStatic blocks={doc} />
      </div>
    );
  }

  if (type === "select") {
    const ids = Array.isArray(value)
      ? (value as SelectCellValue)
      : typeof value === "string" && value.length > 0
        ? [value]
        : [];
    if (ids.length === 0 || !options) {
      return <span className="block w-full min-h-[1.4em] px-1" />;
    }
    const optionMap = new Map(options.map((o) => [o.id, o]));
    return (
      <span className="flex items-center gap-1 flex-wrap w-full min-h-[1.4em] px-1">
        {ids.map((id) => {
          const opt = optionMap.get(id);
          if (!opt) return null;
          const c = SELECT_COLOR_CLASSES[opt.color];
          return (
            <span
              key={id}
              className={cn(
                "inline-flex items-center max-w-full rounded-md px-1.5 py-0.5 font-medium",
                c.bg,
                c.text,
              )}
            >
              <span className="truncate">{opt.label}</span>
            </span>
          );
        })}
      </span>
    );
  }

  if (type === "checkbox") {
    return <Checkbox checked={!!value} disabled className="block" />;
  }

  if (type === "date") {
    const dateValue =
      value != null && value !== "" ? new Date(String(value)) : undefined;
    const displayValue =
      dateValue != null
        ? dateValue.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "";
    return (
      <span className="flex items-center gap-1 w-full min-h-[1.4em] rounded px-1">
        {displayValue && (
          <TbCalendar size={13} className="shrink-0 text-muted-foreground" />
        )}
        {displayValue}
      </span>
    );
  }

  if (type === "link") {
    const linkVal = value as LinkCellValue | null | undefined;
    let displayLabel = linkVal?.pageTitle ?? "";
    if (!displayLabel && linkVal?.href) {
      try {
        displayLabel = new URL(linkVal.href).hostname.replace(/^www\./, "");
      } catch {
        displayLabel = linkVal.href;
      }
    }
    return (
      <span className="flex items-center gap-1 w-full min-h-[1.4em] rounded px-1">
        {displayLabel && linkVal?.href ? (
          <>
            <TbLink size={13} className="shrink-0 text-muted-foreground" />
            <a
              href={linkVal.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {displayLabel}
            </a>
          </>
        ) : null}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "block w-full min-h-[1.4em] rounded px-1",
        ROW_HEIGHT_CONFIG[rowHeight].clamp,
      )}
    >
      {value != null ? String(value) : ""}
    </span>
  );
}
