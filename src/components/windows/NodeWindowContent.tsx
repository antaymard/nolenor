import { lazy, Suspense } from "react";
import { Spinner } from "@/components/shadcn/spinner";
import type { OpenedWindow } from "@/stores/windowsStore";
import WindowContentErrorBoundary from "./WindowContentErrorBoundary";
import WindowLoadingState from "./WindowLoadingState";
import { isPendingDocId } from "@/lib/pendingDocIds";

// Window bodies are lazy-loaded: they pull heavy dependencies (BlockNote
// editor, pdfjs, tanstack-table…) that shouldn't weigh down the canvas chunk.
// Ce module est le *seul* point d'import de ces bodies : desktop et mobile
// partagent donc les mêmes chunks.
const BlocknoteWindow = lazy(() => import("./prebuilt/BlocknoteWindow"));
const LinkWindow = lazy(() => import("./prebuilt/LinkWindow"));
const ImageWindow = lazy(() => import("./prebuilt/ImageWindow"));
const PdfWindow = lazy(() => import("./prebuilt/PdfWindow"));
const TableWindow = lazy(() => import("./prebuilt/TableWindow"));
const AppWindow = lazy(() => import("./prebuilt/AppWindow"));
const VideoWindow = lazy(() => import("./prebuilt/VideoWindow"));
const CustomWindow = lazy(() => import("./prebuilt/CustomWindow"));

type NodeWindowContentProps = Pick<
  OpenedWindow,
  "nodeType" | "xyNodeId" | "nodeDataId"
>;

export default function NodeWindowContent(props: NodeWindowContentProps) {
  return (
    // Boundary *au-dessus* du Suspense : c'est le render du composant `lazy`
    // qui throw quand son chunk ne se charge pas, et Suspense n'attrape que
    // les promesses, pas les erreurs. La `key` remet la fenêtre à zéro quand
    // elle change de contenu, sinon un échec la figerait pour de bon.
    <WindowContentErrorBoundary key={`${props.nodeType}:${props.nodeDataId}`}>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        }
      >
        <NodeWindowBody {...props} />
      </Suspense>
    </WindowContentErrorBoundary>
  );
}

function NodeWindowBody({
  nodeType,
  xyNodeId,
  nodeDataId,
}: NodeWindowContentProps) {
  // Window ouverte dans la foulée d'une création : le `nodeDataId` est encore
  // l'id factice de l'optimistic, que le serveur n'a jamais vu. Monter le
  // body ici lui ferait lire un doc voué à disparaître et écrire sur un id
  // invalide. On attend la confirmation — `useSyncWindowNodeDataIds` repointe
  // la window sur le vrai id, et ce composant se remonte tout seul.
  if (isPendingDocId(nodeDataId)) {
    return <WindowLoadingState label="Creating" />;
  }

  switch (nodeType) {
    case "blocknote":
      return <BlocknoteWindow nodeDataId={nodeDataId} />;
    case "link":
      return <LinkWindow nodeDataId={nodeDataId} />;
    case "app":
      return <AppWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />;
    case "pdf":
      return <PdfWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />;
    case "image":
      return <ImageWindow nodeDataId={nodeDataId} />;
    case "table":
      return <TableWindow nodeDataId={nodeDataId} />;
    case "video":
      return <VideoWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />;
    case "custom":
      return <CustomWindow nodeDataId={nodeDataId} />;
    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {nodeType}
        </div>
      );
  }
}
