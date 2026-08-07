import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  filterSuggestionItems,
  type Block,
  type PartialBlock,
} from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";
import {
  getDefaultReactSlashMenuItems,
  SideMenuController,
  SuggestionMenuController,
} from "@blocknote/react";
import { parseStoredBlockNoteDocument } from "@/../convex/lib/blockNoteDocument";
import type { AppBlockNoteEditor } from "@/components/blocknote/schema";
import {
  getCustomSlashMenuItems,
  groupSuggestionItems,
} from "@/components/blocknote/registry";
import { createSafeBlockNoteEditor } from "@/components/blocknote/safeCreateEditor";
import { SideMenuWithoutAddButton } from "@/components/blocknote/SideMenu";
import CorruptedDocumentBanner from "@/components/blocknote/CorruptedDocumentBanner";
import { BlockNoteErrorBoundary } from "@/components/blocknote/BlockNoteErrorBoundary";
import { Spinner } from "@/components/shadcn/spinner";
import { useCanvasStore } from "@/stores/canvasStore";
import { cn } from "@/lib/utils";

// Éditeur BlockNote au niveau CHAMP, sans couplage à un nodeData.
//
// BlocknoteWindow (le node blocknote prébuilt) est câblé en dur sur
// `nodeDataId` + `values.doc` et sauvegarde lui-même : inutilisable pour un
// champ de custom node, qui reçoit sa value en prop et délègue la sauvegarde
// au flux dirty/save de la window. Le protocole d'hydratation Last-Write-Wins
// est en revanche identique et reproduit fidèlement ici : c'est lui qui évite
// de re-hydrater (et donc de perdre le curseur) quand le serveur ne fait que
// renvoyer en écho ce qu'on vient d'écrire.

const EMPTY_PARAGRAPH: PartialBlock = { type: "paragraph" };

// Monte les menus flottants de BlockNote sur document.body plutôt que dans
// .bn-container par défaut, qui se trouve imbriqué dans la chrome de fenêtre
// overflow:hidden/auto (WindowFrame) et les fait clipper à ses bords.
const PORTAL_ELEMENTS = { default: null } as const;

// Forme canonique d'une value stockée : la même donnée nous arrive tantôt en
// `Block[]` (update optimiste du store) tantôt en string (écho Convex).
// Comparer par référence traiterait les deux comme des changements distants.
function docSignature(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function EditorLoading() {
  return (
    <span className="flex items-center gap-2 text-sm text-slate-500">
      <Spinner className="size-4" />
      Chargement de l'éditeur...
    </span>
  );
}

type BlockNoteFieldEditorProps = {
  value: unknown;
  onDocChange: (doc: Block[]) => void;
  onDirtyChange: (dirty: boolean) => void;
  className?: string;
};

function BlockNoteFieldEditor({
  value,
  onDocChange,
  onDirtyChange,
  className,
}: BlockNoteFieldEditorProps) {
  const hydrationFrameRef = useRef<number | null>(null);
  const skipNextChangeRef = useRef(false);
  const [isEditorReady, setIsEditorReady] = useState(true);
  const setFocus = useCanvasStore((s) => s.setFocus);

  // Créé une seule fois, avec le contenu initial : le premier paint est
  // correct et l'effet de re-hydratation ne rejoue pas au montage.
  //
  // `createSafeBlockNoteEditor` protège contre une valeur stockée qui ferait
  // trébucher le schéma ProseMirror (voir safeCreateEditor.ts) — sur échec,
  // elle renvoie un éditeur vide fonctionnel plutôt que de lever, et
  // `isCorrupted` bloque toute publication de changement (`onDocChange`/
  // `onDirtyChange`, qui alimentent le flux dirty/save différé du custom node)
  // tant que l'utilisateur n'a pas explicitement confirmé la perte via le
  // bandeau ci-dessous.
  const [{ editor, isCorrupted }] = useState<{
    editor: AppBlockNoteEditor;
    isCorrupted: boolean;
  }>(() => {
    const blocks = parseStoredBlockNoteDocument(value) as PartialBlock[] | null;
    const result = createSafeBlockNoteEditor(blocks);
    return { editor: result.editor, isCorrupted: result.status !== "ok" };
  });
  const [isCorruptionAcknowledged, setIsCorruptionAcknowledged] =
    useState(!isCorrupted);

  const lastHydratedSignatureRef = useRef<string | null>(null);
  if (lastHydratedSignatureRef.current === null) {
    lastHydratedSignatureRef.current = docSignature(value);
  }

  useEffect(() => {
    return () => {
      if (hydrationFrameRef.current !== null) {
        cancelAnimationFrame(hydrationFrameRef.current);
      }
    };
  }, []);

  // Re-hydratation Last-Write-Wins sur poussée serveur réellement nouvelle.
  useEffect(() => {
    const signature = docSignature(value);
    if (signature === lastHydratedSignatureRef.current) return;

    lastHydratedSignatureRef.current = signature;
    setIsEditorReady(false);

    if (hydrationFrameRef.current !== null) {
      cancelAnimationFrame(hydrationFrameRef.current);
    }

    hydrationFrameRef.current = requestAnimationFrame(() => {
      hydrationFrameRef.current = null;
      const blocks = parseStoredBlockNoteDocument(value) as
        | PartialBlock[]
        | null;
      const replacement = blocks && blocks.length > 0 ? blocks : [EMPTY_PARAGRAPH];

      skipNextChangeRef.current = true;
      try {
        editor.replaceBlocks(
          editor.document.map((b) => b.id),
          replacement,
        );
      } catch (err) {
        console.error("[BlockNoteFieldEditor] replaceBlocks failed:", err);
      } finally {
        // Remis à false inconditionnellement : un `true` resté en place
        // avalerait la prochaine édition de l'utilisateur (dirty perdu).
        skipNextChangeRef.current = false;
      }

      setIsEditorReady(true);
    });
  }, [value, editor]);

  const handleChange = useCallback(() => {
    // Blocked while an unacknowledged corruption banner is showing: the field
    // is visually covered and non-interactive at that point (see the render
    // below), but this guard is the actual defense — it stops the recovered
    // empty document from ever being published as a pending value before the
    // user agreed to lose the original.
    if (!isCorruptionAcknowledged) return;
    const doc = editor.document as unknown as Block[];
    onDocChange(doc);
    if (skipNextChangeRef.current) {
      skipNextChangeRef.current = false;
      return;
    }
    onDirtyChange(true);
  }, [editor, onDocChange, onDirtyChange, isCorruptionAcknowledged]);

  const handleContinueFromCorruption = useCallback(() => {
    setIsCorruptionAcknowledged(true);
    // Publish the recovered (empty) document right away, consistent with how
    // every other edit to this field is committed: through the deferred
    // pending-value channel, not a direct save.
    onDocChange(editor.document as unknown as Block[]);
    onDirtyChange(true);
  }, [editor, onDocChange, onDirtyChange]);

  // Gèle les raccourcis canvas pendant la frappe : sans ça, taper dans un
  // champ peut déclencher un raccourci de suppression de node.
  const handleFocus = useCallback(() => setFocus("richtext-editor"), [setFocus]);
  const handleBlur = useCallback(() => setFocus("canvas"), [setFocus]);

  return (
    <div className="relative" onFocus={handleFocus} onBlur={handleBlur}>
      <BlockNoteErrorBoundary resetKey={value}>
        <BlockNoteView
          editor={editor}
          theme="light"
          onChange={handleChange}
          className={cn("nodrag", className)}
          slashMenu={false}
          sideMenu={false}
          portalElements={PORTAL_ELEMENTS}
        >
          <SideMenuController
            sideMenu={SideMenuWithoutAddButton}
            portalElement={null}
          />
          <SuggestionMenuController
            triggerCharacter="/"
            portalElement={null}
            shouldOpen={(tr) =>
              !tr.selection.$from.parent.type.isInGroup("tableContent")
            }
            getItems={async (query) =>
              filterSuggestionItems(
                groupSuggestionItems([
                  ...getDefaultReactSlashMenuItems(editor),
                  ...getCustomSlashMenuItems(editor),
                ]),
                query,
              )
            }
          />
        </BlockNoteView>
      </BlockNoteErrorBoundary>
      {!isEditorReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/65">
          <EditorLoading />
        </div>
      )}
      {!isCorruptionAcknowledged && (
        <CorruptedDocumentBanner onContinue={handleContinueFromCorruption} />
      )}
    </div>
  );
}

export default memo(BlockNoteFieldEditor);
