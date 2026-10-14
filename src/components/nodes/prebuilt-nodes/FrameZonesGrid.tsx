import { Fragment, type ReactNode } from "react";
import {
  TbCalendarMonth,
  TbLayoutGrid,
  TbLayoutKanban,
  TbPlus,
  TbSquare,
  TbX,
} from "react-icons/tb";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import {
  FRAME_ZONE_PRESETS,
  ZONE_HEADER_HEIGHT,
  isTimeline,
  nextColumnLabel,
  timelineColumns,
  ZONE_ROW_HEADER_WIDTH,
  type FrameZones,
  type Zone,
} from "@/../convex/lib/frameZones";
import { cn } from "@/lib/utils";

type SetZones = (next: FrameZones | null, remap?: (zone: Zone) => Zone) => void;

/** L'indice d'une zone quand on retire la bande `removed` : les suivantes reculent d'un cran. */
function shiftAfter(index: number, removed: number) {
  return index > removed
    ? index - 1
    : index === removed
      ? Math.max(0, removed - 1)
      : index;
}

type Layout = "free" | "columns" | "matrix" | "timeline";

const LAYOUT_OPTIONS: Array<{ value: Layout; label: string; icon: ReactNode }> =
  [
    { value: "free", label: "Free layout", icon: <TbSquare /> },
    { value: "columns", label: "Columns (Kanban)", icon: <TbLayoutKanban /> },
    { value: "matrix", label: "Matrix", icon: <TbLayoutGrid /> },
    { value: "timeline", label: "Timeline", icon: <TbCalendarMonth /> },
  ];

/**
 * Le choix de grille, dans la toolbar de la frame, à côté de la taille du
 * titre et sous la même forme.
 *
 * Passer de colonnes à matrice garde les colonnes et ajoute des lignes ;
 * l'inverse retire les lignes. Une timeline pose six mois à partir du mois
 * courant et garde les lignes : avec des lignes, c'est une roadmap. On ne
 * repart d'un modèle que depuis une frame libre ou une timeline.
 */
export function FrameLayoutToggle({
  zones,
  setZones,
}: {
  zones: FrameZones | null;
  setZones: SetZones;
}) {
  const layout: Layout = !zones
    ? "free"
    : isTimeline(zones)
      ? "timeline"
      : zones.rows.length > 0
        ? "matrix"
        : "columns";

  const choose = (next: string) => {
    // `single` rend "" quand on re-clique l'option active : rien à faire.
    if (!next || next === layout) return;
    if (next === "free") return setZones(null);
    if (next === "timeline") {
      return setZones({
        columns: timelineColumns(new Date()),
        rows: zones?.rows ?? [],
      });
    }
    const preset = FRAME_ZONE_PRESETS[next as "columns" | "matrix"];
    setZones({
      columns: zones && layout !== "timeline" ? zones.columns : preset.columns,
      rows: preset.rows,
    });
  };

  return (
    <ToggleGroup
      type="single"
      variant="default"
      value={layout}
      onValueChange={choose}
    >
      {LAYOUT_OPTIONS.map(({ value, label, icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className="h-8 min-w-8 [&_svg:not([class*='size-'])]:size-[18px]"
        >
          {icon}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * La grille d'une frame à zones, peinte sous son contenu : titres de
 * colonne en haut, de ligne à gauche, et les séparations.
 *
 * Une grille CSS aux mêmes proportions que `zoneGrid` (bandes d'en-tête fixes,
 * cellules égales) : elle suit la taille de la frame sans avoir à la lire.
 *
 * Titres renommables au double-clic, comme celui de la frame. Frame
 * sélectionnée, chaque titre se retire (×) et un + ajoute une bande.
 */
function FrameZonesGrid({
  zones,
  setZones,
  isSelected,
  labelClassName,
}: {
  zones: FrameZones;
  setZones: SetZones;
  isSelected: boolean;
  labelClassName: string;
}) {
  const { columns, rows } = zones;
  const hasRows = rows.length > 0;

  const renameColumn = (index: number, label: string) =>
    setZones({
      ...zones,
      columns: columns.map((c, i) => (i === index ? label.trim() : c)),
    });
  const renameRow = (index: number, label: string) =>
    setZones({
      ...zones,
      rows: rows.map((r, i) => (i === index ? label.trim() : r)),
    });

  const addColumn = () =>
    setZones({ ...zones, columns: [...columns, nextColumnLabel(zones)] });
  // Une frame sans lignes en a implicitement une : la première ajoutée en
  // fait deux, nommées.
  const addRow = () =>
    setZones({
      ...zones,
      rows: hasRows ? [...rows, `Row ${rows.length + 1}`] : ["Row 1", "Row 2"],
    });

  const removeColumn = (index: number) =>
    setZones(
      { ...zones, columns: columns.filter((_, i) => i !== index) },
      (zone) => ({ ...zone, column: shiftAfter(zone.column, index) }),
    );
  // Une seule ligne nommée ne vaut pas une bande d'en-tête : retirer l'avant-
  // dernière revient à une frame en colonnes.
  const removeRow = (index: number) =>
    setZones(
      {
        ...zones,
        rows: rows.length <= 2 ? [] : rows.filter((_, i) => i !== index),
      },
      (zone) => ({
        ...zone,
        row: rows.length <= 2 ? 0 : shiftAfter(zone.row, index),
      }),
    );

  const header = (
    label: string,
    placeholder: string,
    onRename: (label: string) => void,
    onRemove: (() => void) | null,
  ) => (
    <div className="group/zone flex min-w-0 items-center gap-0.5 px-3">
      <InlineEditableText
        value={label}
        onSave={onRename}
        singleLine
        placeholder={placeholder}
        className={cn(
          "nodrag nopan truncate text-sm font-semibold",
          labelClassName,
        )}
        inputClassName="text-sm font-semibold"
      />
      {isSelected && onRemove && (
        <ZoneButton
          label={`Remove ${label || placeholder.toLowerCase()}`}
          onClick={onRemove}
          hoverOnly
        >
          <TbX />
        </ZoneButton>
      )}
    </div>
  );

  return (
    <div
      className="absolute inset-0 grid"
      style={{
        gridTemplateColumns: `${hasRows ? `${ZONE_ROW_HEADER_WIDTH}px ` : ""}repeat(${columns.length}, minmax(0, 1fr))`,
        gridTemplateRows: `${ZONE_HEADER_HEIGHT}px repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))`,
      }}
    >
      {hasRows && <div className="border-b border-black/10" />}
      {columns.map((label, index) => (
        <div
          key={`column-${index}`}
          className={cn(
            "flex items-center border-b border-black/10",
            (index > 0 || hasRows) && "border-l",
          )}
        >
          {header(
            label,
            "Column",
            (next) => renameColumn(index, next),
            columns.length > 1 ? () => removeColumn(index) : null,
          )}
        </div>
      ))}

      {(hasRows ? rows : [null]).map((label, rowIndex) => (
        <Fragment key={`row-${rowIndex}`}>
          {label !== null && (
            <div
              className={cn(
                "flex items-start pt-3",
                rowIndex > 0 && "border-t border-black/10",
              )}
            >
              {header(
                label,
                "Row",
                (next) => renameRow(rowIndex, next),
                () => removeRow(rowIndex),
              )}
            </div>
          )}
          {columns.map((_, columnIndex) => (
            <div
              key={columnIndex}
              className={cn(
                "border-black/10",
                (columnIndex > 0 || hasRows) && "border-l",
                rowIndex > 0 && "border-t",
              )}
            />
          ))}
        </Fragment>
      ))}

      {/* Hors de la frame, contre la bande qu'ils prolongent : dedans, ils
          couvriraient le titre de la dernière colonne. Le + de ligne est là
          même sans lignes : c'est lui qui fait d'une timeline une roadmap. */}
      {isSelected && (
        <div
          className="absolute left-full ml-1.5 flex items-center"
          style={{ height: ZONE_HEADER_HEIGHT }}
        >
          <ZoneButton label="Add column" onClick={addColumn}>
            <TbPlus />
          </ZoneButton>
        </div>
      )}
      {isSelected && (
        <div
          className="absolute top-full mt-1.5 flex justify-center"
          style={{ width: ZONE_ROW_HEADER_WIDTH }}
        >
          <ZoneButton label="Add row" onClick={addRow}>
            <TbPlus />
          </ZoneButton>
        </div>
      )}
    </div>
  );
}

function ZoneButton({
  label,
  onClick,
  hoverOnly = false,
  children,
}: {
  label: string;
  onClick: () => void;
  hoverOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        // Le clic reste au bouton : il ne (dé)sélectionne rien sur le canvas.
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "nodrag nopan flex size-6 shrink-0 items-center justify-center rounded bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground [&_svg]:size-4",
        hoverOnly && "hidden group-hover/zone:flex",
      )}
    >
      {children}
    </button>
  );
}

export default FrameZonesGrid;
