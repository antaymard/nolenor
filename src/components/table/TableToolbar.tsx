import { TbLineHeight, TbSearch, TbX } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { cn } from "@/lib/utils";
import { FilterPopover } from "./FilterPopover";
import type { FilterConjunction, TableFilter } from "./filters";
import { ROW_HEIGHT_CONFIG, type RowHeight, type TableColumn } from "./types";

export interface TableToolbarProps {
  columns: TableColumn[];
  search: string;
  onSearchChange: (value: string) => void;
  filters: TableFilter[];
  conjunction: FilterConjunction;
  onFiltersChange: (filters: TableFilter[]) => void;
  onConjunctionChange: (conjunction: FilterConjunction) => void;
  rowHeight: RowHeight;
  onRowHeightChange?: (rowHeight: RowHeight) => void;
  /** Lignes visibles / lignes totales, pour le compteur de droite. */
  visibleRowCount: number;
  totalRowCount: number;
  readOnly?: boolean;
}

const ROW_HEIGHTS: RowHeight[] = ["short", "medium", "tall"];

/**
 * Barre d'outils de la grille.
 *
 * La recherche occupait avant une bande pleine largeur au-dessus du tableau,
 * pour un champ utilisé de temps en temps. Elle rejoint ici les autres réglages
 * de vue, et la place gagnée revient aux données.
 */
export function TableToolbar({
  columns,
  search,
  onSearchChange,
  filters,
  conjunction,
  onFiltersChange,
  onConjunctionChange,
  rowHeight,
  onRowHeightChange,
  visibleRowCount,
  totalRowCount,
  readOnly,
}: TableToolbarProps) {
  const isFiltered = visibleRowCount !== totalRowCount;

  return (
    <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
      <div className="relative min-w-0 flex-1">
        <TbSearch
          size={14}
          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-7 border-transparent bg-transparent pl-7 text-sm shadow-none focus-visible:border-input"
        />
        {search && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="absolute top-1/2 right-1 size-5 -translate-y-1/2"
            onClick={() => onSearchChange("")}
            title="Clear search"
          >
            <TbX size={13} />
          </Button>
        )}
      </div>

      <FilterPopover
        columns={columns}
        filters={filters}
        conjunction={conjunction}
        onFiltersChange={onFiltersChange}
        onConjunctionChange={onConjunctionChange}
      />

      {!readOnly && onRowHeightChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2" title="Row height">
              <TbLineHeight size={14} />
              {ROW_HEIGHT_CONFIG[rowHeight].label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ROW_HEIGHTS.map((value) => (
              <DropdownMenuItem
                key={value}
                onClick={() => onRowHeightChange(value)}
                className={cn(value === rowHeight && "font-semibold")}
              >
                {ROW_HEIGHT_CONFIG[value].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <span className="shrink-0 px-1 text-xs whitespace-nowrap text-muted-foreground">
        {isFiltered
          ? `${visibleRowCount} of ${totalRowCount}`
          : `${totalRowCount} ${totalRowCount === 1 ? "row" : "rows"}`}
      </span>
    </div>
  );
}
