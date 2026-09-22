import { useCallback, useMemo, useRef } from "react";
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
import { maxHeightForRowHeight, type RowHeight } from "./types";

export interface RichTextCellEditorProps {
  value: unknown;
  isEditing: boolean;
  rowHeight: RowHeight;
  onClick: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Les menus flottants de BlockNote (toolbar de formatage, slash menu, …) sont
 * portalés sur `document.body` (voir `PORTAL_ELEMENTS` dans
 * `BlockNoteFieldEditor`), donc HORS du `PopoverContent` Radix. Sans garde,
 * cliquer un bouton de la toolbar pendant une sélection fermait l'éditeur de
 * cellule au milieu de l'édition. Seules les surfaces flottantes sont
 * ignorées : cliquer le contenu d'un AUTRE éditeur BlockNote (une autre
 * fenêtre) ferme toujours normalement.
 */
function isBlockNoteFloatingUi(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      ".bn-toolbar, .bn-suggestion-menu, .bn-grid-suggestion-menu, .bn-side-menu, .bn-table-handle-menu, .bn-menu-dropdown",
    ) !== null
  );
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
  rowHeight,
  onClick,
  onChange,
  onBlur,
}: RichTextCellEditorProps) {
  // Mémoïsé : sans ça le `memo` de BlockNoteStatic ne prend jamais, puisqu'il
  // reçoit un tableau neuf à chaque rendu.
  const doc = useMemo(() => parseRichTextCell(value), [value]);
  const pendingRef = useRef<string | null>(null);

  const handleDocChange = useCallback((blocks: Block[]) => {
    // Sérialisé ici, comme dans RichTextEditor : un document structurellement
    // invalide n'est pas publié plutôt que d'être rejeté plus tard par le
    // serveur en ayant marqué la fenêtre dirty pour rien.
    try {
      pendingRef.current = stringifyBlockNoteDocumentForStorage(blocks);
    } catch (error) {
      console.error(
        "[RichTextCellEditor] invalid document, not published:",
        error,
      );
    }
  }, []);

  const noopDirty = useCallback(() => {}, []);

  /**
   * Publie le document en attente et referme. Partagé par la fermeture du
   * popover (clic dehors, Échap) et par `Ctrl/Cmd + Entrée` : les deux doivent
   * commettre la même chose, sinon valider au clavier perdrait la dernière
   * frappe.
   */
  const commit = useCallback(() => {
    if (pendingRef.current !== null) {
      onChange(pendingRef.current);
      pendingRef.current = null;
    }
    onBlur();
  }, [onChange, onBlur]);

  const preview = (
    <div
      className={cn(
        // `bn-readonly-container` porte les styles du rendu statique.
        "bn-readonly-container w-full min-h-[1.4em] overflow-hidden rounded px-1 text-sm",
        "cursor-text hover:bg-muted/50",
      )}
      // Le clamp passe par la hauteur du conteneur et non par `line-clamp` : le
      // contenu est un arbre de blocs, couper à N lignes de texte n'aurait pas
      // de sens sur une liste (même parti pris que RichTextExcerptView).
      style={maxHeightForRowHeight(rowHeight)}
      onClick={onClick}
    >
      {doc ? (
        <BlockNoteStatic blocks={doc} />
      ) : (
        <span className="block min-h-[1.4em]" />
      )}
    </div>
  );

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open) commit();
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
        // Empêcher le dismiss quand l'interaction vient d'un menu flottant
        // BlockNote (voir `isBlockNoteFloatingUi`). `preventDefault` sur ces
        // deux événements bloque la fermeture ; `onInteractOutside` seul ne
        // suffirait pas, le dismiss part d'ici.
        onPointerDownOutside={(e) => {
          if (isBlockNoteFloatingUi(e.target)) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (isBlockNoteFloatingUi(e.target)) e.preventDefault();
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
