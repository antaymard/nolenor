// Ce qui franchit la frontière du dossier. Les éditeurs de cellule, le menu de
// colonne et la fiche de ligne n'y figurent pas : ce sont des détails de
// composition de `Table`, et les exporter annonçait une API publique qui
// n'existe pas.
export { Table } from "./Table";
export type { TableProps } from "./Table";

export { TablePreview } from "./TablePreview";
export type { TablePreviewProps } from "./TablePreview";

export { CellDisplay } from "./CellDisplay";
export type { CellDisplayProps } from "./CellDisplay";

export { CellEditor } from "./CellEditor";
export type { CellEditorProps } from "./CellEditor";

export { LinkCellEditor } from "./LinkCellEditor";
export type { LinkCellEditorProps } from "./LinkCellEditor";

export { SelectCellEditor } from "./SelectCellEditor";
export type { SelectCellEditorProps } from "./SelectCellEditor";

export { SelectOptionsDialog } from "./SelectOptionsDialog";
export type { SelectOptionsDialogProps } from "./SelectOptionsDialog";



export { TableImportDialog } from "./TableImportDialog";
export type { TableImportResult } from "./TableImportDialog";

export { buildCsv, downloadCsv } from "./csv";

export type {
  ColumnType,
  CellValue,
  LinkCellValue,
  NodeCellValue,
  RowHeight,
  SelectColor,
  SelectCellValue,
  SelectOption,
  SummaryKind,
  TableColumn,
  TableRowData,
  TableData,
} from "./types";
export {
  COLUMN_TYPE_CONFIG,
  COLUMN_TYPE_LABELS,
  DEFAULT_ROW_HEIGHT,
  SELECT_COLOR_CLASSES,
  SELECT_COLOR_PALETTE,
} from "./types";

export { coerceCellValue } from "./coerce";
