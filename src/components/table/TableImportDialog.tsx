import { useCallback, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Label } from "@/components/shadcn/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcn/toggle-group";
import { TbFileSpreadsheet, TbUpload } from "react-icons/tb";
import { cn } from "@/lib/utils";
import {
  COLUMN_TYPE_LABELS,
  type ColumnType,
  type TableColumn,
  type TableRowData,
} from "./types";
import {
  coerceCsvValue,
  inferColumnType,
  parseCsvFile,
  type ParsedCsv,
} from "./csv";

// `node` is omitted: a CSV cell can't reference an internal canvas node id
// in any meaningful way, so we don't offer it as an import target.
const IMPORT_TYPES: ColumnType[] = ["text", "number", "checkbox", "date", "link"];

const PREVIEW_ROWS = 5;
const TYPE_INFERENCE_SAMPLE_SIZE = 50;

// `__new__` = create a new column from the CSV header.
// `__skip__` = ignore this CSV column entirely.
// Anything else is the id of an existing column in the target table.
const TARGET_NEW = "__new__";
const TARGET_SKIP = "__skip__";

type ColumnMapping = {
  /** Index of this CSV column in the parsed header array. */
  csvIndex: number;
  csvHeader: string;
  /** `__new__`, `__skip__`, or an existing column id. */
  target: string;
  /** Column type to use when writing values (only meaningful for new columns;
   *  for existing columns we use the existing column's type). */
  type: ColumnType;
};

type ImportMode = "replace" | "append";

export interface TableImportResult {
  columns: TableColumn[];
  rows: TableRowData[];
  /** True if the table content (cols + rows) should be replaced wholesale. */
  replace: boolean;
}

export interface TableImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing columns in the target table (used for the mapping dropdown). */
  existingColumns: TableColumn[];
  /** True if the table currently has at least one row — controls the
   *  default mode (append) and visibility of the mode picker. */
  hasExistingData: boolean;
  /** Called with the materialized result when the user confirms. */
  onImport: (result: TableImportResult) => void;
}

export function TableImportDialog({
  open,
  onOpenChange,
  existingColumns,
  hasExistingData,
  onImport,
}: TableImportDialogProps) {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [mode, setMode] = useState<ImportMode>(
    hasExistingData ? "append" : "replace",
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Reset all state when dialog closes (so re-opening starts fresh).
  const reset = useCallback(() => {
    setParsed(null);
    setMappings([]);
    setMode(hasExistingData ? "append" : "replace");
    setParseError(null);
  }, [hasExistingData]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  // ---- Step 1: parse the user-selected file ------------------------------

  const handleFileSelected = useCallback(
    async (file: File) => {
      setParseError(null);
      try {
        const result = await parseCsvFile(file);
        if (result.headers.length === 0) {
          setParseError("Le fichier CSV est vide ou n'a pas d'en-têtes.");
          return;
        }
        setParsed(result);

        // Build the initial mapping: try to auto-match existing columns by
        // (case-insensitive) name, otherwise default to "create new column"
        // with an inferred type.
        const initial: ColumnMapping[] = result.headers.map((header, csvIndex) => {
          const samples = result.rows
            .slice(0, TYPE_INFERENCE_SAMPLE_SIZE)
            .map((r) => r[csvIndex] ?? "");
          const inferred = inferColumnType(samples);

          const matched = existingColumns.find(
            (c) => c.name.trim().toLowerCase() === header.trim().toLowerCase(),
          );

          return {
            csvIndex,
            csvHeader: header,
            target: matched ? matched.id : TARGET_NEW,
            type: matched ? matched.type : inferred,
          };
        });
        setMappings(initial);
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : "Could not read the file",
        );
      }
    },
    [existingColumns],
  );

  // ---- Mapping mutations -------------------------------------------------

  const updateMapping = useCallback(
    (csvIndex: number, patch: Partial<ColumnMapping>) => {
      setMappings((prev) =>
        prev.map((m) => (m.csvIndex === csvIndex ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  const onChangeTarget = useCallback(
    (csvIndex: number, target: string) => {
      // When mapping to an existing column we lock the type to that column's
      // type — silently ignore the per-row "type" select for this case.
      const existing = existingColumns.find((c) => c.id === target);
      updateMapping(csvIndex, {
        target,
        type: existing ? existing.type : mappings.find((m) => m.csvIndex === csvIndex)?.type ?? "text",
      });
    },
    [existingColumns, mappings, updateMapping],
  );

  // ---- Step 3: confirm — materialize columns & rows ----------------------

  const handleConfirm = useCallback(() => {
    if (!parsed) return;

    const replace = mode === "replace";

    // Decide which columns end up in the resulting table.
    //  - replace mode: every non-skipped mapping becomes a column. Reused
    //    mappings (target = existing id) are ignored for the schema since
    //    the existing schema is being thrown away — they all become "new".
    //  - append mode: keep existing columns intact; add a column for every
    //    mapping with target === __new__.
    const newColumnsFromCsv: TableColumn[] = [];
    /** Map csvIndex -> the target column id used to write its cells. */
    const csvIndexToTargetColId = new Map<number, string>();

    for (const m of mappings) {
      if (m.target === TARGET_SKIP) continue;

      if (replace) {
        // Always create new columns in replace mode.
        const id = crypto.randomUUID();
        newColumnsFromCsv.push({
          id,
          name: m.csvHeader || `Column ${m.csvIndex + 1}`,
          type: m.type,
        });
        csvIndexToTargetColId.set(m.csvIndex, id);
      } else if (m.target === TARGET_NEW) {
        const id = crypto.randomUUID();
        newColumnsFromCsv.push({
          id,
          name: m.csvHeader || `Column ${m.csvIndex + 1}`,
          type: m.type,
        });
        csvIndexToTargetColId.set(m.csvIndex, id);
      } else {
        // Reusing an existing column.
        csvIndexToTargetColId.set(m.csvIndex, m.target);
      }
    }

    // Final column list: existing (when appending) + new ones discovered.
    const finalColumns: TableColumn[] = replace
      ? newColumnsFromCsv
      : [...existingColumns, ...newColumnsFromCsv];

    // Build a quick lookup of target column id -> type for coercion.
    const colTypeById = new Map<string, ColumnType>(
      finalColumns.map((c) => [c.id, c.type]),
    );

    // Convert each CSV row into a TableRowData.
    const newRows: TableRowData[] = parsed.rows.map((row) => {
      const cells: TableRowData["cells"] = {};
      // Initialize every final-column cell to null so editors don't crash on
      // missing keys later.
      for (const col of finalColumns) cells[col.id] = null;

      for (const [csvIndex, targetColId] of csvIndexToTargetColId) {
        const type = colTypeById.get(targetColId) ?? "text";
        cells[targetColId] = coerceCsvValue(row[csvIndex] ?? "", type);
      }

      return { id: crypto.randomUUID(), cells };
    });

    onImport({ columns: finalColumns, rows: newRows, replace });
    handleOpenChange(false);
  }, [parsed, mappings, mode, existingColumns, onImport, handleOpenChange]);

  // ---- Render ------------------------------------------------------------

  const previewRows = useMemo(
    () => parsed?.rows.slice(0, PREVIEW_ROWS) ?? [],
    [parsed],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TbFileSpreadsheet />
            Import CSV
          </DialogTitle>
          <DialogDescription>
            {!parsed
              ? "Sélectionnez un fichier CSV pour commencer."
              : "Vérifiez la correspondance entre les colonnes CSV et la table cible."}
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <FilePickerStep
            onPick={handleFileSelected}
            error={parseError}
            inputRef={fileInputRef}
          />
        ) : (
          <div className="flex flex-col gap-4 overflow-hidden">
            <PreviewTable headers={parsed.headers} rows={previewRows} />

            <MappingTable
              mappings={mappings}
              mode={mode}
              existingColumns={existingColumns}
              onChangeTarget={onChangeTarget}
              onChangeType={(csvIndex, type) => updateMapping(csvIndex, { type })}
            />

            {hasExistingData && (
              <ModeSelector mode={mode} onChange={setMode} />
            )}
          </div>
        )}

        <DialogFooter>
          {parsed && (
            <Button variant="ghost" onClick={() => setParsed(null)}>
              Changer de fichier
            </Button>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !parsed ||
              // At least one column must actually be imported.
              mappings.every((m) => m.target === TARGET_SKIP)
            }
          >
            Import {parsed ? `(${parsed.rows.length} lines)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Step 1 — file picker
// --------------------------------------------------------------------------

function FilePickerStep({
  onPick,
  error,
  inputRef,
}: {
  onPick: (file: File) => void;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onPick(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-12 cursor-pointer transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50",
        )}
      >
        <TbUpload size={32} className="text-muted-foreground" />
        <p className="text-sm">
          Glissez un fichier CSV ici, ou cliquez pour parcourir.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
            // reset so picking the same file twice still triggers `onChange`
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 2a — preview of the first rows
// --------------------------------------------------------------------------

function PreviewTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1 block">
        Aperçu ({rows.length} premières lignes)
      </Label>
      <div className="border rounded-md overflow-auto max-h-40">
        <table className="text-xs w-full">
          <thead className="bg-muted">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-2 py-1 text-left font-medium border-r last:border-r-0 truncate max-w-[200px]">
                  {h || <span className="text-muted-foreground italic">(vide)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t">
                {headers.map((_, ci) => (
                  <td key={ci} className="px-2 py-1 border-r last:border-r-0 truncate max-w-[200px]">
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 2b — mapping table (one row per CSV column)
// --------------------------------------------------------------------------

function MappingTable({
  mappings,
  mode,
  existingColumns,
  onChangeTarget,
  onChangeType,
}: {
  mappings: ColumnMapping[];
  mode: ImportMode;
  existingColumns: TableColumn[];
  onChangeTarget: (csvIndex: number, target: string) => void;
  onChangeType: (csvIndex: number, type: ColumnType) => void;
}) {
  // In replace mode, mapping to an existing column is irrelevant (existing
  // schema is wiped). We still let the user pick "skip" but otherwise force
  // every column to be "new".
  const showExistingTargets = mode === "append" && existingColumns.length > 0;

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">Mapping des colonnes</Label>
      <div className="border rounded-md overflow-auto max-h-72">
        <table className="text-sm w-full">
          <thead className="bg-muted sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1.5 font-medium">Colonne CSV</th>
              <th className="px-2 py-1.5 font-medium">Cible</th>
              <th className="px-2 py-1.5 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => {
              const linkedExisting = existingColumns.find((c) => c.id === m.target);
              // Type select is disabled when reusing an existing column —
              // the existing column already dictates the type.
              const typeIsLocked = !!linkedExisting;
              return (
                <tr key={m.csvIndex} className="border-t">
                  <td className="px-2 py-1.5 font-medium truncate max-w-[200px]">
                    {m.csvHeader || (
                      <span className="text-muted-foreground italic">
                        (colonne {m.csvIndex + 1})
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={m.target}
                      onValueChange={(v) => onChangeTarget(m.csvIndex, v)}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TARGET_NEW}>
                          + Nouvelle colonne
                        </SelectItem>
                        <SelectItem value={TARGET_SKIP}>Ignorer</SelectItem>
                        {showExistingTargets &&
                          existingColumns.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}{" "}
                              <span className="text-muted-foreground">
                                ({COLUMN_TYPE_LABELS[c.type]})
                              </span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={m.type}
                      onValueChange={(v) => onChangeType(m.csvIndex, v as ColumnType)}
                      disabled={typeIsLocked || m.target === TARGET_SKIP}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPORT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {COLUMN_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 2c — append vs replace
// --------------------------------------------------------------------------

function ModeSelector({
  mode,
  onChange,
}: {
  mode: ImportMode;
  onChange: (m: ImportMode) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Mode d'import</Label>
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => {
          // ToggleGroup allows clearing — we don't.
          if (v) onChange(v as ImportMode);
        }}
        variant="outline"
        size="sm"
        className="w-fit"
      >
        <ToggleGroupItem value="append">
          Ajouter aux lignes existantes
        </ToggleGroupItem>
        <ToggleGroupItem value="replace">Remplacer la table</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
