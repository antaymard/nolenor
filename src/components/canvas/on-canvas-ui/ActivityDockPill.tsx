import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { X } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/../convex/_generated/api";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useResolvedRunStatus } from "@/hooks/useThreadRunStatus";
import { getDockStatusAppearance } from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";
import ActivityDockNodes from "./ActivityDockNodes";

export type PendingThread = FunctionReturnType<
  typeof api.threads.listPendingThreads
>[number];

/** Laisse le temps d'aller cliquer une ligne dans le popover sans le perdre. */
const HOVER_CLOSE_DELAY_MS = 150;

/**
 * Une tâche du dock d'activité.
 *
 * Le clic ouvre la conversation **et** accuse réception : consulter, c'est
 * revoir, et demander un second clic sur le chemin courant serait du travail
 * pour rien. La croix accuse réception sans ouvrir.
 */
export default function ActivityDockPill({
  thread,
  onOpen,
}: {
  thread: PendingThread;
  onOpen: (threadId: string) => void;
}) {
  const status = useResolvedRunStatus(thread);
  const appearance = getDockStatusAppearance(status);
  const markReviewed = useMutation(api.threads.markThreadReviewed);

  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }, [cancelClose]);

  // Un tour en cours n'est pas revuable : il n'est pas fini. La croix ne
  // s'affiche donc pas, et le serveur refuserait de toute façon.
  const isRunning = status === "running";

  const handleReview = useCallback(() => {
    // Le serveur refuserait de toute façon un tour en cours : autant ne pas
    // faire l'aller-retour à chaque clic sur une tâche qui travaille.
    if (isRunning) return;
    void markReviewed({ threadId: thread.threadId }).catch(() => {
      // Échec sans conséquence : la pastille reste, l'utilisateur recliquera.
    });
  }, [isRunning, markReviewed, thread.threadId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => {
            cancelClose();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          onClick={() => {
            onOpen(thread.threadId);
            handleReview();
          }}
          className={cn(
            "group relative flex h-7 max-w-[220px] items-center gap-1.5 rounded-full border pl-2.5 text-left text-xs font-medium",
            "animate-in fade-in slide-in-from-bottom-2 duration-200",
            isRunning ? "pr-2.5" : "pr-7",
            appearance.className,
          )}
        >
          {/* Un point qui pulse, et non l'orbe : à cette taille elle serait
              illisible, et elle reste la signature de l'overlay live au bas de
              la conversation. */}
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              appearance.dotClassName,
              isRunning && "animate-pulse",
            )}
          />
          <PillLabel thread={thread} />
          {isRunning ? null : (
            // `span` et non `button` : la pastille en est déjà un, et les
            // imbriquer est invalide. Idiome de `MinimizedWindowPill`.
            <span
              role="button"
              aria-label="Marquer comme vu"
              onClick={(event) => {
                event.stopPropagation();
                handleReview();
              }}
              onMouseDown={(event) => event.stopPropagation()}
              className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10"
            >
              <X size={11} />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        // Le survol pilote l'ouverture : rendre le focus au déclencheur
        // rouvrirait le popover que l'on vient de fermer.
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="w-64 p-2"
      >
        <p className="mb-1.5 px-1 text-xs font-medium text-slate-600">
          {thread.title || "Sans titre"}
        </p>
        <ActivityDockNodes touchedNodes={thread.touchedNodes} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Le libellé s'adapte, parce qu'aucune source unique n'est bonne dans tous les
 * cas : un seul node touché, c'est son titre — le plus informatif et le cas
 * courant. Plusieurs, c'est le titre de la tâche et un compteur qui privilégie
 * la création. Aucun (tâche de lecture, ou tour qui vient de démarrer), c'est
 * le titre de la tâche seul.
 */
function PillLabel({ thread }: { thread: PendingThread }) {
  const { touchedNodes } = thread;
  const single = touchedNodes.length === 1 ? touchedNodes[0] : undefined;
  const singleTitle = useNodeDataTitle(single?.nodeDataId);

  if (single) {
    return (
      <span className="min-w-0 flex-1 truncate">
        {singleTitle ?? thread.title ?? "Nolë"}
      </span>
    );
  }

  const createdCount = touchedNodes.filter(
    (touch) => touch.kind === "created",
  ).length;
  // « 3 créés » l'emporte sur « 5 nodes » : c'est la création qui appelle un
  // coup d'œil.
  const counter =
    createdCount > 0
      ? `${createdCount} créé${createdCount > 1 ? "s" : ""}`
      : touchedNodes.length > 0
        ? `${touchedNodes.length} nodes`
        : null;

  return (
    <>
      <span className="min-w-0 flex-1 truncate">
        {thread.title || "Nolë"}
      </span>
      {counter ? (
        <span className="shrink-0 opacity-70">{counter}</span>
      ) : null}
    </>
  );
}
