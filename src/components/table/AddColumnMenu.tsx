import { TbPlus } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { columnTypeEntries, type ColumnType } from "./types";

export interface AddColumnMenuProps {
  align?: "start" | "center" | "end";
  /** Le déclencheur ; par défaut le `+` de l'en-tête de la colonne d'actions. */
  children?: React.ReactNode;
  onAddColumn: (type: ColumnType) => void;
}

/** Le choix du type à l'ajout d'une colonne — en-tête de grille et état vide. */
export function AddColumnMenu({
  align = "end",
  children,
  onAddColumn,
}: AddColumnMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children ?? (
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-6"
            title="Add a column"
          >
            <TbPlus size={13} />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {columnTypeEntries().map(([value, config]) => {
          const Icon = config.icon;
          return (
            <DropdownMenuItem key={value} onClick={() => onAddColumn(value)}>
              <Icon size={12} className="mr-2 opacity-60" />
              {config.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
