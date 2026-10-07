import { memo, useEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";
import { useBlockNoteSync } from "@convex-dev/prosemirror-sync/blocknote";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { parseStoredBlockNoteDocument } from "@/../convex/lib/blockNoteDocument";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { blockNoteSchema, type AppBlockNoteEditor } from "@/components/blocknote/schema";
import { insertLineExtension } from "@/components/blocknote/insertLineExtension";
import { createSafeBlockNoteEditor } from "@/components/blocknote/safeCreateEditor";
import { useBlockNoteUpload } from "@/components/blocknote/useBlockNoteUpload";
import { AppEditorMenus } from "@/components/blocknote/AppEditorMenus";
import CorruptedDocumentBanner from "@/components/blocknote/CorruptedDocumentBanner";
import { BlockNoteErrorBoundary } from "@/components/blocknote/BlockNoteErrorBoundary";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import WindowLoadingState from "@/components/windows/WindowLoadingState";
import { useCanvasStore } from "@/stores/canvasStore";
import { useResolvedTheme } from "@/lib/theme";

// SPIKE — édition collaborative d'un node blocknote (cf. convex/blocknoteSync.ts).
//
// Différences avec BlocknoteWindow :
//   - le contenu vit dans le doc ProseMirror du composant prosemirror-sync,
//     échangé par steps avec les autres éditeurs ouverts : plus de bouton
//     Save, plus de dirty, plus de re-hydratation Last-Write-Wins ;
//   - `values.doc` (lu par tout le reste de l'app) est recopié par le serveur
//     seul, à partir des steps reçus (cf. convex/blocknoteMaterialize.ts).
// Pas encore porté : l'onglet Plan (outline + recherche).

const PORTAL_ELEMENTS = { default: null } as const;

function SyncedEditor({
  editor,
  nodeDataId,
}: {
  editor: AppBlockNoteEditor;
  nodeDataId: Id<"nodeDatas">;
}) {
  const theme = useResolvedTheme();
  const setFocus = useCanvasStore((s) => s.setFocus);
  const releaseFocus = useCanvasStore((s) => s.releaseFocus);
  useEffect(() => () => releaseFocus("richtext-editor"), [releaseFocus]);

  return (
    <div
      className="bn-window-doc relative h-full w-full"
      onFocus={() => setFocus("richtext-editor")}
      onBlur={() => setFocus("canvas")}
    >
      <BlockNoteErrorBoundary resetKey={nodeDataId}>
        <BlockNoteView
          editor={editor}
          theme={theme}
          className="nodrag h-full"
          slashMenu={false}
          sideMenu={false}
          portalElements={PORTAL_ELEMENTS}
        >
          <AppEditorMenus editor={editor} />
        </BlockNoteView>
      </BlockNoteErrorBoundary>
    </div>
  );
}

/**
 * Crée le doc vivant depuis `values.doc` à la première ouverture en sync.
 * Deux éditeurs qui le créent en même temps envoient le même contenu (ids de
 * blocs stockés) : le second échoue sans conséquence, le snapshot du premier
 * arrive.
 */
function CreateFromStoredDoc({
  storedDoc,
  create,
}: {
  storedDoc: unknown;
  create: (content: object) => Promise<void>;
}) {
  const [initial] = useState(() =>
    createSafeBlockNoteEditor(
      parseStoredBlockNoteDocument(storedDoc) as PartialBlock[] | null,
    ),
  );
  const [isAcknowledged, setIsAcknowledged] = useState(
    initial.status === "ok",
  );
  const startedRef = useRef(false);

  useEffect(() => {
    if (!isAcknowledged || startedRef.current) return;
    startedRef.current = true;
    create(initial.editor.prosemirrorState.doc.toJSON()).catch(
      (error: unknown) => {
        console.warn("[BlocknoteSyncWindow] create failed", error);
      },
    );
  }, [create, initial, isAcknowledged]);

  if (!isAcknowledged) {
    return (
      <div className="relative h-full w-full">
        <CorruptedDocumentBanner onContinue={() => setIsAcknowledged(true)} />
      </div>
    );
  }
  return <WindowLoadingState label="Preparing document" />;
}

function BlocknoteSyncWindow({ nodeDataId }: { nodeDataId: Id<"nodeDatas"> }) {
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const { setDirty, setSaveHandler } = useWindowFrameContext();

  // Plus de sauvegarde manuelle : chaque frappe part au serveur.
  useEffect(() => {
    setDirty(false);
    setSaveHandler(null);
  }, [setDirty, setSaveHandler]);

  // Même branchement R2 que BlocknoteWindow, via ref : l'éditeur est créé une
  // fois par le hook de sync.
  const uploadToR2 = useBlockNoteUpload();
  const uploadRef = useRef(uploadToR2);
  useEffect(() => {
    uploadRef.current = uploadToR2;
  }, [uploadToR2]);
  const [editorOptions] = useState(() => ({
    schema: blockNoteSchema,
    extensions: [insertLineExtension],
    uploadFile: (file: File) => uploadRef.current(file),
  }));

  const sync = useBlockNoteSync<AppBlockNoteEditor>(
    api.blocknoteSync,
    nodeDataId,
    {
      editorOptions,
      onSyncError: (error) =>
        console.warn("[BlocknoteSyncWindow] sync error", error),
    },
  );

  if (sync.isLoading || !nodeDataValues) return <WindowLoadingState />;
  if (!sync.editor) {
    return (
      <CreateFromStoredDoc storedDoc={nodeDataValues.doc} create={sync.create} />
    );
  }
  return <SyncedEditor editor={sync.editor} nodeDataId={nodeDataId} />;
}

export default memo(BlocknoteSyncWindow);
