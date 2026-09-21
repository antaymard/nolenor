import { memo, useEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";

import type { BlockNoteBlock } from "@/../convex/lib/blockNoteDocument";
import type { AppBlockNoteEditor } from "./schema";
import { createSafeBlockNoteEditor } from "./safeCreateEditor";
import { BlockNoteErrorBoundary } from "./BlockNoteErrorBoundary";
import { cn } from "@/lib/utils";

/**
 * Un VRAI BlockNote, en lecture seule.
 *
 * À ne pas confondre avec `BlockNoteStatic`, qui re-rend le document en HTML
 * sémantique : celui-là existe parce que le canvas ne peut pas monter un
 * éditeur ProseMirror par node. Ici il n'y en a qu'un à l'écran à la fois
 * (l'aperçu d'une version), donc on monte l'éditeur lui-même — c'est le seul
 * moyen d'obtenir, au pixel près, ce que la fenêtre d'édition affiche :
 * mêmes marges, même rythme vertical, mêmes specs React pour les blocs
 * personnalisés.
 *
 * `editable={false}` coupe la frappe ; les surfaces flottantes sont coupées
 * explicitement plutôt que de compter sur `isEditable` — rien ne doit pouvoir
 * modifier un document archivé.
 */

/** BlockNote garde toujours un bloc : un document vide s'hydrate avec celui-ci. */
const EMPTY_PARAGRAPH: PartialBlock = { type: "paragraph" };

/**
 * Forme canonique du document, pour ne ré-hydrater que sur un vrai changement.
 * Même rôle que le `docSignature` de `BlocknoteWindow`.
 */
function blocksSignature(blocks: BlockNoteBlock[]): string {
  return JSON.stringify(blocks);
}

interface BlockNoteReadOnlyViewProps {
  blocks: BlockNoteBlock[];
  className?: string;
}

function BlockNoteReadOnlyViewImpl({
  blocks,
  className,
}: BlockNoteReadOnlyViewProps) {
  // Créé une fois avec le contenu initial, comme dans `BlocknoteWindow` : le
  // premier paint est déjà le bon. `createSafeBlockNoteEditor` encaisse un
  // document stocké que le schéma ProseMirror refuse et rend un éditeur vide
  // plutôt que de lever — ici rien n'est jamais réécrit, donc pas de bandeau
  // de corruption à faire acquitter : il n'y a aucune sauvegarde à bloquer.
  const [editor] = useState<AppBlockNoteEditor>(
    () =>
      createSafeBlockNoteEditor(blocks as PartialBlock[] | null).editor,
  );

  const hydratedSignatureRef = useRef<string | null>(null);
  if (hydratedSignatureRef.current === null) {
    hydratedSignatureRef.current = blocksSignature(blocks);
  }

  // Changer de version sans démonter le composant : l'éditeur reçoit le
  // nouveau document au lieu de rester sur l'ancien.
  useEffect(() => {
    const signature = blocksSignature(blocks);
    if (signature === hydratedSignatureRef.current) return;
    hydratedSignatureRef.current = signature;
    try {
      editor.replaceBlocks(
        editor.document.map((b) => b.id),
        blocks.length > 0 ? (blocks as PartialBlock[]) : [EMPTY_PARAGRAPH],
      );
    } catch (err) {
      console.error("[BlockNoteReadOnlyView] replaceBlocks failed:", err);
    }
  }, [blocks, editor]);

  return (
    <BlockNoteErrorBoundary resetKey={editor}>
      <BlockNoteView
        editor={editor}
        theme="light"
        editable={false}
        slashMenu={false}
        sideMenu={false}
        formattingToolbar={false}
        linkToolbar={false}
        filePanel={false}
        tableHandles={false}
        className={cn("nodrag", className)}
      />
    </BlockNoteErrorBoundary>
  );
}

export const BlockNoteReadOnlyView = memo(BlockNoteReadOnlyViewImpl);
