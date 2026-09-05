import { useCallback, useRef } from "react";
import type { Block } from "@blocknote/core";
import BlockNoteFieldEditor from "@/components/blocknote/BlockNoteFieldEditor";
import { BlockNoteStatic } from "@/components/blocknote/BlockNoteStatic";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { stringifyBlockNoteDocumentForStorage } from "@/../convex/lib/blockNoteDocument";
import { cn } from "@/lib/utils";
import { parseRichTextCell } from "./richText";
import { ROW_HEIGHT_CONFIG, type RowHeight } from "./types";

export interface RichTextCellEditorProps {
  value: unknown;
  isEditing: boolean;
  readOnly?: boolean;
  rowHeight: RowHeight;
  onClick: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Cellule rich text.
 *
 * Rien n'est réécrit ici : l'éditeur est `BlockNoteFieldEditor` (le même que
 * les champs `rich_text` des custom nodes, déjà découplé de `nodeData` et déjà
 * câblé sur un flux value / onDocChange / onDirtyChange), et l'affichage est
 * `BlockNoteStatic`, le renderer en lecture seule utilisé par les nodes canvas.
 *
 * Un seul éditeur BlockNote est monté à la fois — celui de la cellule ouverte.
 * Monter un éditeur par cellule serait intenable en perf, d'où le rendu statique
 * partout ailleurs.
 */
export function RichTextCellEditor({
  value,
  isEditing,
  readOnly,
  rowHeight,
  onClick,
  onChange,
  onBlur,
}: RichTextCellEditorProps) {
  const doc = parseRichTextCell(value);
  const pendingRef = useRef<string | null>(null);

  const handleDocChange = useCallback((blocks: Block[]) => {
    // Sérialisé ici, comme dans RichTextEditor : un document structurellement
    // invalide n'est pas publié plutôt que d'être rejeté plus tard par le
    // serveur en ayant marqué la fenêtre dirty pour rien.
    try {
      pendingRef.current = stringifyBlockNoteDocumentForStorage(blocks);
    } catch (error) {
      console.error("[RichTextCellEditor] invalid document, not published:", error);
    }
  }, []);

  const noopDirty = useCallback(() => {}, []);

  const preview = (
    <div
      className={cn(
        // `bn-readonly-container` porte les styles du rendu statique.
        "bn-readonly-container w-full min-h-[1.4em] overflow-hidden rounded px-1 text-sm",
        !readOnly && "cursor-text hover:bg-muted/50",
      )}
      // Le clamp passe par la hauteur du conteneur et non par `line-clamp` : le
      // contenu est un arbre de blocs, couper à N lignes de texte n'aurait pas
      // de sens sur une liste (même parti pris que RichTextExcerptView).
      style={{ maxHeight: `${ROW_HEIGHT_CONFIG[rowHeight].lines * 1.5}em` }}
      onClick={readOnly ? undefined : onClick}
    >
      {doc ? (
        <BlockNoteStatic blocks={doc} />
      ) : (
        <span className="block min-h-[1.4em]" />
      )}
    </div>
  );

  if (readOnly) return preview;

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (open) return;
        if (pendingRef.current !== null) {
          onChange(pendingRef.current);
          pendingRef.current = null;
        }
        onBlur();
      }}
    >
      <PopoverTrigger asChild>{preview}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0 shadow-lg"
        style={{
          minWidth: "max(var(--radix-popover-trigger-width), 420px)",
          maxWidth: "min(640px, 90vw)",
        }}
      >
        <div className="max-h-[50vh] overflow-y-auto py-1">
          <BlockNoteFieldEditor
            value={value}
            onDocChange={handleDocChange}
            onDirtyChange={noopDirty}
            className="min-h-24 text-sm"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
