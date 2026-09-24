import { useMemo } from "react";
import { TbCalendar, TbLink, TbNetwork } from "react-icons/tb";
import { BlockNoteStatic } from "@/components/blocknote/BlockNoteStatic";
import { Checkbox } from "@/components/shadcn/checkbox";
import {
  getNodeDataTitle,
  getNodeIcon,
} from "@/components/utils/nodeDataDisplayUtils";
import { useNodeData } from "@/hooks/useNodeData";
import { formatAbsoluteDate } from "@/lib/isoDate";
import { parseRichTextCell } from "./richText";
import {
  cellShellClass,
  DEFAULT_ROW_HEIGHT,
  ROW_HEIGHT_CONFIG,
  maxHeightForRowHeight,
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

/** La coque commune à toutes les branches, pour qu'elles coupent pareil. */
const SHELL = "flex min-w-0 w-full items-center gap-1 min-h-[1.4em] px-1";

export function CellDisplay({
  type,
  value,
  options,
  rowHeight = DEFAULT_ROW_HEIGHT,
}: CellDisplayProps) {
  // Appelé inconditionnellement : c'est un hook, et seule la branche
  // `richtext` s'en sert. Sans mémo, chaque rendu de la grille reparse le JSON
  // et rend un NOUVEAU tableau, ce qui fait rater le `memo` de BlockNoteStatic
  // et re-rend tout l'arbre de blocs de chaque cellule.
  const richTextDoc = useMemo(
    () => (type === "richtext" ? parseRichTextCell(value) : null),
    [type, value],
  );

  if (type === "node") {
    return (
      <NodeCellDisplay value={value as NodeCellValue | null | undefined} />
    );
  }

  if (type === "richtext") {
    const doc = richTextDoc;
    if (!doc) return <span className="block w-full min-h-[1.4em] px-1" />;
    return (
      <div
        // `bn-readonly-container` porte les styles du rendu statique : sans elle
        // la préflight Tailwind laisse les listes sans puces.
        className="bn-readonly-container w-full min-h-[1.4em] overflow-hidden px-1 text-sm"
        // Clamp par hauteur de conteneur : le contenu est un arbre de blocs,
        // `line-clamp` n'a pas de sens sur une liste ou un tableau.
        style={maxHeightForRowHeight(rowHeight)}
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
      <span
        className={cn(SHELL, cellShellClass(rowHeight))}
        // En `short` la coque coupe déjà ; au-delà les étiquettes s'enroulent,
        // et c'est la hauteur de ligne qui borne l'empilement.
        style={
          rowHeight === "short" ? undefined : maxHeightForRowHeight(rowHeight)
        }
      >
        {ids.map((id) => {
          const opt = optionMap.get(id);
          if (!opt) return null;
          const c = SELECT_COLOR_CLASSES[opt.color];
          return (
            <span
              key={id}
              className={cn(
                "inline-flex min-w-0 max-w-full items-center rounded-lg px-1.5 py-0.5 font-medium",
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
    // `formatAbsoluteDate` lit la date ISO nue sur ses composantes LOCALES :
    // `new Date("2024-03-05")` est spec'é UTC et reculait l'affichage d'un jour
    // à l'ouest de Greenwich.
    const displayValue = formatAbsoluteDate(value) ?? "";
    return (
      // Une date est un jeton unique : elle ne revient jamais à la ligne, quelle
      // que soit la hauteur de ligne. C'est ce qui la faisait tenir sur deux ou
      // trois lignes dans une colonne étroite du canvas.
      <span className={cn(SHELL, "overflow-hidden rounded whitespace-nowrap")}>
        {displayValue && (
          <TbCalendar size={13} className="shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{displayValue}</span>
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
      <span className={cn(SHELL, "overflow-hidden rounded whitespace-nowrap")}>
        {displayLabel && linkVal?.href ? (
          <>
            <TbLink size={13} className="shrink-0 text-muted-foreground" />
            <a
              href={linkVal.href}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-blue-500 hover:underline"
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

/**
 * La branche `node` : un lien vers un autre node du canvas, affiché par son
 * titre.
 *
 * Isolée dans son propre composant parce qu'elle est la seule à lire le store
 * React Flow et les nodeDatas. Quand ces lectures vivaient dans `CellDisplay`,
 * TOUTES les cellules de TOUTES les tables du canvas s'y abonnaient, quel que
 * soit le type de leur colonne : un sélecteur de plus par cellule, réévalué à
 * chaque frame de pan et de drag, et un re-rendu de chaque cellule à la moindre
 * modification d'un nodeData, n'importe où sur le canvas.
 */
function NodeCellDisplay({
  value,
}: {
  value: NodeCellValue | null | undefined;
}) {
  const nodeDataId = useNodeDataIdOf(value?.nodeId);
  // Le seul doc concerné, pas toute la map : on ne re-rend que quand CE node
  // change.
  const nodeData = useNodeData(nodeDataId);
  const title = nodeData
    ? getNodeDataTitle(nodeData)
    : value?.nodeId
      ? "Deleted node"
      : null;
  const Icon = nodeData ? getNodeIcon(nodeData.type) : null;

  if (!title) {
    return <span className="block w-full min-h-[1.4em] px-1" />;
  }
  return (
    <span className={cn(SHELL, "overflow-hidden whitespace-nowrap")}>
      <span
        className={cn(
          "inline-flex min-w-0 max-w-full items-center gap-1 rounded-lg bg-muted px-1.5 py-0.5 font-medium",
          !nodeData && "opacity-50",
        )}
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
