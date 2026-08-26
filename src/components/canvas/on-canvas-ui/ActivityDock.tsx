import { useCallback, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import {
  useMarkThreadReviewed,
  useOpenNoleThread,
} from "@/hooks/useOpenNoleThread";
import { isPendingReview } from "@/lib/threadRunStatus";
import TaskCard from "./TaskCard";

/**
 * Au-delà, le dock percuterait `CanvasToolbar`, en `bottom-center`. Le reste
 * passe derrière un « +N ». Trois et non quatre depuis que les blocs portent
 * deux lignes : ils sont plus larges qu'une pastille.
 */
const MAX_VISIBLE_CARDS = 3;

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
  const open = useOpenNoleThread();
  const markReviewed = useMarkThreadReviewed();
  const [overflowOpen, setOverflowOpen] = useState(false);

  const threads = useQuery(api.threads.listPendingThreads, { canvasId });

  const openThread = useCallback(
    (threadId: string) => {
      open(threadId);
      setOverflowOpen(false);
    },
    [open],
  );

  // Le serveur filtre grossièrement (il ne peut pas lire l'horloge dans une
  // query) ; la décision finale se prend ici, avec l'heure du rendu. Pas de
  // minuterie à ce niveau : la seule transition temporelle est `running` →
  // `stale`, et les deux sont admis — c'est le bloc, lui, qui change d'aspect,
  // et il a ses propres minuteries.
  const pending = (threads ?? []).filter((thread) =>
    isPendingReview(thread, Date.now()),
  );

  // Rien à signaler : le bouton Nolë reste seul, comme `MinimizedWindowsStack`
  // quand aucune fenêtre n'est réduite.
  if (pending.length === 0) return null;

  const visible = pending.slice(0, MAX_VISIBLE_CARDS);
  const overflow = pending.slice(MAX_VISIBLE_CARDS);

  return (
    // Pas de coque commune : chaque tâche est son propre bloc, avec sa bordure
    // et son halo. Les enfermer dans un conteneur unique les faisait lire comme
    // une barre d'outils plutôt que comme des choses en cours, distinctes.
    <div className="flex items-center gap-2">
      {visible.map((thread) => (
        <TaskCard
          key={thread.threadId}
          thread={thread}
          showNodes
          onOpen={openThread}
          onReview={markReviewed}
        />
      ))}

      {overflow.length > 0 ? (
        <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${overflow.length} tâches de plus`}
              className="flex h-[46px] shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
            >
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-auto p-2">
            <div className="flex flex-col items-start gap-2">
              {overflow.map((thread) => (
                <TaskCard
                  key={thread.threadId}
                  thread={thread}
                  showNodes
                  onOpen={openThread}
                  onReview={markReviewed}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
