import { TbFilter, TbPlus, TbX } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { cn } from "@/lib/utils";
import {
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  defaultOperatorFor,
  operatorNeedsValue,
  type FilterConjunction,
  type FilterOperator,
  type TableFilter,
} from "./filters";
import type { TableColumn } from "./types";

export interface FilterPopoverProps {
  columns: TableColumn[];
  filters: TableFilter[];
  conjunction: FilterConjunction;
  onFiltersChange: (filters: TableFilter[]) => void;
  onConjunctionChange: (conjunction: FilterConjunction) => void;
}

export function FilterPopover({
  columns,
  filters,
  conjunction,
  onFiltersChange,
  onConjunctionChange,
}: FilterPopoverProps) {
  const columnsById = new Map(columns.map((c) => [c.id, c]));

  const addFilter = () => {
    const column = columns[0];
    if (!column) return;
    onFiltersChange([
      ...filters,
      {
        id: crypto.randomUUID(),
        columnId: column.id,
        operator: defaultOperatorFor(column.type),
        value: "",
      },
    ]);
  };

  const patch = (id: string, next: Partial<TableFilter>) => {
    onFiltersChange(
      filters.map((f) => (f.id === id ? { ...f, ...next } : f)),
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-7 px-2", filters.length > 0 && "text-primary")}
          disabled={columns.length === 0}
        >
          <TbFilter size={14} />
          Filter
          {filters.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-xs">
              {filters.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[440px] max-w-[92vw] p-2">
        {filters.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            No filters yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filters.map((filter, index) => {
              const column = columnsById.get(filter.columnId) ?? columns[0];
              const operators = OPERATORS_BY_TYPE[column.type];
              return (
                <div key={filter.id} className="flex items-center gap-1.5">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">
                    {index === 0 ? (
                      "Where"
                    ) : index === 1 ? (
                      <Select
                        value={conjunction}
                        onValueChange={(v) =>
                          onConjunctionChange(v as FilterConjunction)
                        }
                      >
                        <SelectTrigger size="sm" className="h-7 w-full px-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">And</SelectItem>
                          <SelectItem value="any">Or</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="pl-1.5">
                        {conjunction === "all" ? "And" : "Or"}
                      </span>
                    )}
                  </span>

                  <Select
                    value={column.id}
                    onValueChange={(colId) => {
                      const next = columnsById.get(colId);
                      if (!next) return;
                      // L'opérateur courant peut ne pas exister pour le nouveau
                      // type (« contient » sur une case à cocher) : on retombe
                      // sur le premier opérateur valide.
                      patch(filter.id, {
                        columnId: colId,
                        operator: operators.includes(filter.operator)
                          ? filter.operator
                          : defaultOperatorFor(next.type),
                        value: "",
                      });
                    }}
                  >
                    <SelectTrigger size="sm" className="h-7 min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={filter.operator}
                    onValueChange={(op) =>
                      patch(filter.id, { operator: op as FilterOperator })
                    }
                  >
                    <SelectTrigger size="sm" className="h-7 w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operators.map((op) => (
                        <SelectItem key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {operatorNeedsValue(filter.operator) &&
                    (column.type === "select" ? (
                      <Select
                        value={
                          Array.isArray(filter.value) ? filter.value[0] : undefined
                        }
                        onValueChange={(v) => patch(filter.id, { value: [v] })}
                      >
                        <SelectTrigger size="sm" className="h-7 w-28 shrink-0">
                          <SelectValue placeholder="Option" />
                        </SelectTrigger>
                        <SelectContent>
                          {(column.options ?? []).map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={typeof filter.value === "string" ? filter.value : ""}
                        type={column.type === "date" ? "date" : "text"}
                        placeholder="Value"
                        className="h-7 w-28 shrink-0 text-sm"
                        onChange={(e) =>
                          patch(filter.id, { value: e.target.value })
                        }
                      />
                    ))}

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-7 shrink-0"
                    onClick={() =>
                      onFiltersChange(filters.filter((f) => f.id !== filter.id))
                    }
                    title="Remove filter"
                  >
                    <TbX size={14} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-1.5 flex items-center justify-between border-t pt-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addFilter}>
            <TbPlus size={14} />
            Add filter
          </Button>
          {filters.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => onFiltersChange([])}
            >
              Clear all
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
