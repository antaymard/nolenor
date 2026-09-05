import { useEffect, useRef, useState } from "react";
import type { Column } from "@tanstack/react-table";
import {
  TbArrowDown,
  TbArrowUp,
  TbArrowsSort,
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbList,
  TbTrash,
} from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Separator } from "@/components/shadcn/separator";
import { cn } from "@/lib/utils";
import { COLUMN_TYPE_CONFIG, columnTypeEntries } from "./types";
import type { ColumnType, TableColumn, TableRowData } from "./types";

export interface ColumnMenuProps {
  col: TableColumn;
  tanstackCol: Column<TableRowData, unknown>;
  readOnly?: boolean;
  /** Nombre de cellules que le changement de type ferait perdre, par type cible. */
  lossyCountFor: (type: ColumnType) => number;
  onNameChange: (name: string) => void;
  onTypeChange: (type: ColumnType) => void;
  onDelete: () => void;
  onEditOptions?: () => void;
  onClose: () => void;
}

/**
 * Le menu d'une colonne, ouvert au clic sur son en-tête.
 *
 * Avant, renommer une colonne demandait de deviner que le TEXTE de l'en-tête
 * était cliquable (seul indice : un `hover:underline`), pendant que le menu
 * déroulant — la vraie affordance, celle qui porte le chevron — ne proposait
 * pas « Renommer ». Ici le champ de nom est la première chose du menu et il est
 * déjà focus : le geste principal est aussi le plus visible.
 *
 * C'est un Popover et non un DropdownMenu : le menu Radix capte les touches
 * pour son typeahead, ce qui rend un champ texte inutilisable à l'intérieur.
 */
export function ColumnMenu({
  col,
  tanstackCol,
  readOnly,
  lossyCountFor,
  onNameChange,
  onTypeChange,
  onDelete,
  onEditOptions,
  onClose,
}: ColumnMenuProps) {
  const [name, setName] = useState(col.name);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sorted = tanstackCol.getIsSorted();

  useEffect(() => {
    // `select()` et pas seulement `focus()` : on renomme presque toujours pour
    // remplacer, rarement pour compléter.
    inputRef.current?.select();
  }, []);

  // Le nom est publié à la fermeture plutôt qu'à chaque frappe : sans ça,
  // chaque lettre tapée rejouerait un rendu complet de la grille.
  const commitName = () => {
    const next = name.trim();
    if (next && next !== col.name) onNameChange(next);
  };

  const closeWithName = () => {
    commitName();
    onClose();
  };

  const CurrentIcon = COLUMN_TYPE_CONFIG[col.type].icon;

  if (typePickerOpen) {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setTypePickerOpen(false)}
        >
          <TbChevronLeft size={14} />
          Column type
        </button>
        <Separator className="my-1" />
        <div className="flex flex-col gap-0.5">
          {columnTypeEntries().map(([value, config]) => {
            const Icon = config.icon;
            const lossy = value === col.type ? 0 : lossyCountFor(value);
            return (
              <button
                key={value}
                type="button"
                className="flex items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  if (value !== col.type) onTypeChange(value);
                  setTypePickerOpen(false);
                }}
              >
                <Icon size={15} className="mt-0.5 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight">{config.label}</span>
                  <span className="block text-xs leading-tight text-muted-foreground">
                    {lossy > 0
                      ? `Clears ${lossy} cell${lossy > 1 ? "s" : ""}`
                      : config.hint}
                  </span>
                </span>
                {col.type === value && (
                  <TbCheck size={14} className="mt-0.5 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Column name"
        className="h-8"
        disabled={readOnly}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            closeWithName();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setName(col.name);
            onClose();
          }
        }}
      />

      {!readOnly && (
        <button
          type="button"
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          onClick={() => {
            commitName();
            setTypePickerOpen(true);
          }}
        >
          <CurrentIcon size={15} className="shrink-0 opacity-70" />
          <span className="flex-1 text-left">
            {COLUMN_TYPE_CONFIG[col.type].label}
          </span>
          <TbChevronRight size={14} className="shrink-0 opacity-60" />
        </button>
      )}

      <Separator className="my-1" />

      <MenuItem
        icon={<TbArrowUp size={15} />}
        label="Sort A → Z"
        active={sorted === "asc"}
        onClick={() => {
          tanstackCol.toggleSorting(false);
          closeWithName();
        }}
      />
      <MenuItem
        icon={<TbArrowDown size={15} />}
        label="Sort Z → A"
        active={sorted === "desc"}
        onClick={() => {
          tanstackCol.toggleSorting(true);
          closeWithName();
        }}
      />
      {sorted && (
        <MenuItem
          icon={<TbArrowsSort size={15} />}
          label="Clear sort"
          onClick={() => {
            tanstackCol.clearSorting();
            closeWithName();
          }}
        />
      )}

      {!readOnly && col.type === "select" && onEditOptions && (
        <>
          <Separator className="my-1" />
          <MenuItem
            icon={<TbList size={15} />}
            label="Edit options…"
            onClick={() => {
              commitName();
              onEditOptions();
              onClose();
            }}
          />
        </>
      )}

      {!readOnly && (
        <>
          <Separator className="my-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 justify-start px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            <TbTrash size={15} />
            Delete column
          </Button>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
        active && "font-medium",
      )}
      onClick={onClick}
    >
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="flex-1">{label}</span>
      {active && <TbCheck size={14} className="shrink-0" />}
    </button>
  );
}
