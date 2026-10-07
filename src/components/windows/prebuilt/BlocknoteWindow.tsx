import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Block, PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";
import { useBlockNoteSync } from "@convex-dev/prosemirror-sync/blocknote";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  parseStoredBlockNoteDocument,
  type BlockNoteBlock,
} from "@/../convex/lib/blockNoteDocument";
import { useNodeDataValues } from "@/hooks/useNodeData";
import {
  blockNoteSchema,
  type AppBlockNoteEditor,
} from "@/components/blocknote/schema";
import { insertLineExtension } from "@/components/blocknote/insertLineExtension";
import { createSafeBlockNoteEditor } from "@/components/blocknote/safeCreateEditor";
import { useBlockNoteUpload } from "@/components/blocknote/useBlockNoteUpload";
import { AppEditorMenus } from "@/components/blocknote/AppEditorMenus";
import { BlockNoteReadOnlyView } from "@/components/blocknote/BlockNoteReadOnlyView";
import CorruptedDocumentBanner from "@/components/blocknote/CorruptedDocumentBanner";
import { BlockNoteErrorBoundary } from "@/components/blocknote/BlockNoteErrorBoundary";
import { BlocknoteOutlinePanel } from "@/components/windows/side-panel/BlocknoteOutlinePanel";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import WindowLoadingState from "@/components/windows/WindowLoadingState";
import {
  extractHeadings,
  headingsSignature,
  type Heading,
} from "@/lib/blocknoteOutline";
import { revealElement } from "@/lib/revealElement";
import { useCanvasStore } from "@/stores/canvasStore";
import { useResolvedTheme } from "@/lib/theme";

// Window d'un node blocknote, en édition collaborative (cf.
// convex/blocknoteSync.ts).
//
// Le contenu vit dans le doc ProseMirror du composant prosemirror-sync,
// échangé par steps avec les autres éditeurs ouverts : pas de bouton Save, pas
// de dirty, pas de re-hydratation Last-Write-Wins. `values.doc`, lu par tout
// le reste de l'app, est recopié par le serveur seul à partir des steps reçus
// (cf. convex/blocknoteLiveDoc.ts).

// Monte les menus flottants de BlockNote sur document.body plutôt que dans
// .bn-container, imbriqué dans la chrome overflow:hidden/auto de la window
// (WindowFrame), qui les rognait à ses bords.
const PORTAL_ELEMENTS = { default: null } as const;

/**
 * L'onglet Plan de la window : sommaire des titres et recherche dans le doc.
 * Scopé à `containerRef` pour que `scrollIntoView` trouve l'ancêtre réellement
 * scrollable, en flottant comme en plein écran.
 */
function usePlanTab(
  editor: AppBlockNoteEditor,
  containerRef: RefObject<HTMLDivElement | null>,
) {
  const { setPlanTabContent } = useWindowFrameContext();
  const [headings, setHeadings] = useState<Heading[]>(() =>
    extractHeadings(editor.document as unknown as Block[]),
  );
  const headingsSigRef = useRef(headingsSignature(headings));

  // Les steps reçus des autres éditeurs passent aussi par `onChange` : le
  // sommaire suit le doc partagé, pas seulement la frappe locale.
  useEffect(
    () =>
      editor.onChange(() => {
        const next = extractHeadings(editor.document as unknown as Block[]);
        const signature = headingsSignature(next);
        if (signature === headingsSigRef.current) return;
        headingsSigRef.current = signature;
        setHeadings(next);
      }),
    [editor],
  );

  const findBlockElement = useCallback(
    (blockId: string) => {
      const root = containerRef.current;
      if (!root) return undefined;
      return Array.from(root.querySelectorAll<HTMLElement>("[data-id]")).find(
        (el) => el.getAttribute("data-id") === blockId,
      );
    },
    [containerRef],
  );
  const scrollToHeading = useCallback(
    (heading: Heading) => {
      findBlockElement(heading.id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [findBlockElement],
  );
  const scrollToSearchHit = useCallback(
    (blockId: string) => {
      const target = findBlockElement(blockId);
      if (target) revealElement(target);
    },
    [findBlockElement],
  );
  // Stables : la recherche lit le doc à la demande et s'abonne elle-même aux
  // changements, le Plan n'est pas republié à chaque frappe.
  const getDoc = useCallback(
    () => editor.document as unknown as Block[],
    [editor],
  );
  const subscribeToDocChanges = useCallback(
    (callback: () => void) => editor.onChange(callback),
    [editor],
  );

  useEffect(() => {
    setPlanTabContent(
      <BlocknoteOutlinePanel
        headings={headings}
        onSelect={scrollToHeading}
        getDoc={getDoc}
        subscribeToDocChanges={subscribeToDocChanges}
        onSelectBlock={scrollToSearchHit}
        className="h-full"
      />,
    );
    return () => setPlanTabContent(null);
  }, [
    headings,
    scrollToHeading,
    getDoc,
    subscribeToDocChanges,
    scrollToSearchHit,
    setPlanTabContent,
  ]);
}

function SyncedEditor({
  editor,
  nodeDataId,
  isReadOnly,
}: {
  editor: AppBlockNoteEditor;
  nodeDataId: Id<"nodeDatas">;
  isReadOnly: boolean;
}) {
  const theme = useResolvedTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  usePlanTab(editor, containerRef);

  // Un viewer suit le doc en direct mais n'y écrit pas : le serveur
  // refuserait ses steps (cf. `checkWrite`).
  useEffect(() => {
    editor.isEditable = !isReadOnly;
  }, [editor, isReadOnly]);

  // Gèle les raccourcis canvas pendant la frappe. `blur` ne part pas quand un
  // élément focalisé est démonté (window fermée autrement que par son
  // bouton) : sans ce relâchement, le store resterait sur `richtext-editor`.
  const setFocus = useCanvasStore((s) => s.setFocus);
  const releaseFocus = useCanvasStore((s) => s.releaseFocus);
  useEffect(() => () => releaseFocus("richtext-editor"), [releaseFocus]);

  return (
    <div
      ref={containerRef}
      // `bn-window-doc` : mesure centrée quand la window est large (cf.
      // blocknote-overrides.css).
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
 *
 * Un document stocké que le schéma refuse (cf. safeCreateEditor.ts) n'est
 * remplacé par un doc vide qu'après confirmation explicite : jusque-là,
 * l'original reste récupérable côté serveur.
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
        console.warn("[BlocknoteWindow] create failed", error);
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

function BlocknoteWindow({ nodeDataId }: { nodeDataId: Id<"nodeDatas"> }) {
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const { setDirty, setSaveHandler } = useWindowFrameContext();
  const isReadOnly = useCanvasStore(
    (state) => state.canvas?._permission === "viewer",
  );

  // Plus de sauvegarde manuelle : chaque frappe part au serveur.
  useEffect(() => {
    setDirty(false);
    setSaveHandler(null);
  }, [setDirty, setSaveHandler]);

  // Upload R2 pour les blocs image/video/audio/file : sans `uploadFile`,
  // BlockNote n'affiche que l'onglet "Embed" par URL et le paste/drag & drop
  // de fichiers est mort. Via ref : l'éditeur est créé une fois par le hook
  // de sync, la callback Convex peut changer ensuite.
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
        console.warn("[BlocknoteWindow] sync error", error),
    },
  );

  if (sync.isLoading || !nodeDataValues) return <WindowLoadingState />;
  if (sync.editor) {
    return (
      <SyncedEditor
        editor={sync.editor}
        nodeDataId={nodeDataId}
        isReadOnly={isReadOnly}
      />
    );
  }
  // Jamais ouvert en sync. Seul un éditeur peut créer le doc vivant : un
  // viewer lit `values.doc` tel quel.
  if (isReadOnly) {
    return (
      <div className="bn-window-doc relative h-full w-full">
        <BlockNoteReadOnlyView
          blocks={
            (parseStoredBlockNoteDocument(nodeDataValues.doc) ??
              []) as BlockNoteBlock[]
          }
          className="h-full"
        />
      </div>
    );
  }
  return (
    <CreateFromStoredDoc storedDoc={nodeDataValues.doc} create={sync.create} />
  );
}

export default memo(BlocknoteWindow);
