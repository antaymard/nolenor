import { useCallback, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { useNoleStore } from "@/stores/noleStore";
import { isPendingReview } from "@/lib/threadRunStatus";
import ActivityDockPill from "./ActivityDockPill";

/**
 * Au-delà, le dock percuterait `CanvasToolbar`, en `bottom-center`. Le reste
 * passe derrière un « +N ».
 */
const MAX_VISIBLE_PILLS = 4;

/**
 * Le dock d'activité : ce que Nolë est en train de faire sur ce canvas, et ce
 * qu'il a fini sans qu'on l'ait encore relu.
 *
 * Ce n'est pas un flux d'activité récente, c'est une boîte de réception. Une
 * tâche finie y reste jusqu'à ce qu'on l'ait vue — donc une tâche lancée hier,
 * ou depuis le mobile, remonte et invite au check. Sans TTL : c'est la revue
 * qui l'en sort, pas le temps.
 */
export default function ActivityDock({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const setActiveThreadId = useNoleStore((state) => state.setActiveThreadId);
  const setPanelLayout = useNoleStore((state) => state.setPanelLayout);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const threads = useQuery(api.threads.listPendingThreads, { canvasId });

  const openThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId);
      setPanelLayout("expanded");
      setOverflowOpen(false);
    },
    [setActiveThreadId, setPanelLayout],
  );

  // Le serveur filtre grossièrement (il ne peut pas lire l'horloge dans une
  // query) ; la décision finale se prend ici, avec l'heure du rendu. Pas de
  // minuterie à ce niveau : la seule transition temporelle est `running` →
  // `stale`, et les deux sont admis — c'est la pastille, elle, qui change de
  // couleur, et elle a sa propre minuterie.
  const pending = (threads ?? []).filter((thread) =>
    isPendingReview(thread, Date.now()),
  );

  // Rien à signaler : le bouton Nolë reste seul, comme `MinimizedWindowsStack`
  // quand aucune fenêtre n'est réduite.
  if (pending.length === 0) return null;

  const visible = pending.slice(0, MAX_VISIBLE_PILLS);
  const overflow = pending.slice(MAX_VISIBLE_PILLS);

  return (
    // `py-1!` plutôt qu'une hauteur en dur : la coque partage la classe du
    // bouton Nolë, et 4px de part et d'autre d'une pastille `h-7` retombent
    // exactement sur la hauteur de son `h-9`.
    <div className="canvas-ui-container py-1! gap-1.5!">
      {visible.map((thread) => (
        <ActivityDockPill
          key={thread.threadId}
          thread={thread}
          onOpen={openThread}
        />
      ))}

      {overflow.length > 0 ? (
        <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${overflow.length} tâches de plus`}
              className="flex h-7 shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-auto p-2">
            <div className="flex flex-col items-start gap-1.5">
              {overflow.map((thread) => (
                <ActivityDockPill
                  key={thread.threadId}
                  thread={thread}
                  onOpen={openThread}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
