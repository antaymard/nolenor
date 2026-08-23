import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { X } from "lucide-react";
import { api } from "@/../convex/_generated/api";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { useResolvedRunStatus } from "@/hooks/useThreadRunStatus";
import {
  getDockStatusAppearance,
  type PendingThread,
} from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";
import ActivityDockNodes from "./ActivityDockNodes";
import TaskPillBody from "./TaskPill";

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
            "group relative flex h-7 max-w-[260px] items-center gap-1.5 rounded-full border pl-2.5 text-left text-xs font-medium",
            "animate-in fade-in slide-in-from-bottom-2 duration-200",
            isRunning ? "pr-2.5" : "pr-7",
            appearance.className,
          )}
        >
          <TaskPillBody
            thread={thread}
            appearance={appearance}
            isRunning={isRunning}
            showNodeChip
          />
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
        {/* Le sujet de la conversation, que la pastille ne montre plus : elle
            porte l'action en cours, qui est le plus utile là où la place manque.
            Ici il y en a, et les deux se complètent. */}
        <p className="px-1 text-xs font-medium text-slate-600">
          {thread.title || "Sans titre"}
        </p>
        {/* La même action que la pastille, mais entière : c'est la raison
            d'être du survol, où la troncature n'a plus lieu d'être. */}
        {thread.lastActivity ? (
          <p className="mt-0.5 px-1 text-xs text-slate-400">
            {thread.lastActivity.text}
          </p>
        ) : null}
        <div className="mt-1.5">
          <ActivityDockNodes touchedNodes={thread.touchedNodes} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
