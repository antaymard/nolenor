import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Block, PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";
import { useBlockNoteSync } from "@convex-dev/prosemirror-sync/blocknote";
import { getVersion, sendableSteps } from "prosemirror-collab";
import { useMutation } from "convex/react";
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
//   - `values.doc` (lu par tout le reste de l'app) est republié depuis ici,
//     cf. `usePublishDoc`.
// Pas encore porté : l'onglet Plan (outline + recherche).

const PORTAL_ELEMENTS = { default: null } as const;

// Délai d'inactivité locale avant de republier `values.doc`. Chaque
// publication réindexe le node et peut créer un point de restauration.
const PUBLISH_DEBOUNCE_MS = 1500;

/**
 * Republie les blocs de l'éditeur dans `values.doc`.
 *
 * Seulement après une édition LOCALE (les steps reçus des autres ne
 * déclenchent rien : leur auteur publie), et seulement une fois tous nos
 * steps confirmés par le serveur — les blocs sont alors exactement le doc à
 * `getVersion(state)`, et le serveur refuse une version périmée.
 *
 * Publie aussi une fois à l'ouverture : rattrape un `values.doc` resté en
 * retard (dernier éditeur fermé avant sa publication). No-op côté serveur
 * si rien n'a changé.
 */
function usePublishDoc(editor: AppBlockNoteEditor, nodeDataId: Id<"nodeDatas">) {
  const publishDoc = useMutation(api.blocknoteSync.publishDoc);
  const hasLocalEditsRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(function publish() {
      timerRef.current = null;
      if (!hasLocalEditsRef.current) return;
      const state = editor.prosemirrorState;
      if (sendableSteps(state) !== null) {
        // Nos steps ne sont pas encore confirmés : on repasse plus tard.
        timerRef.current = setTimeout(publish, PUBLISH_DEBOUNCE_MS);
        return;
      }
      hasLocalEditsRef.current = false;
      publishDoc({
        nodeDataId,
        version: getVersion(state),
        doc: editor.document as unknown as Block[],
      }).catch((error: unknown) => {
        hasLocalEditsRef.current = true;
        console.warn("[BlocknoteSyncWindow] publish failed", error);
      });
    }, PUBLISH_DEBOUNCE_MS);
  }, [editor, nodeDataId, publishDoc]);

  useEffect(() => {
    schedule();
    const unsubscribe = editor.onChange(() => {
      // Une transaction locale laisse des steps non envoyés ; un step reçu
      // d'un autre éditeur, non.
      if (sendableSteps(editor.prosemirrorState) === null) return;
      hasLocalEditsRef.current = true;
      schedule();
    });
    return () => {
      unsubscribe?.();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [editor, schedule]);
}

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
  usePublishDoc(editor, nodeDataId);

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
