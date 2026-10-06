import { useMutation, useQuery } from "convex/react";
import { TbClockHour4, TbX } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";

/**
 * Les messages envoyés pendant que Nolë travaille, pas encore placés.
 *
 * Le serveur les garde en file et les fait entrer dans le run au step suivant
 * (après le round de tools en cours) ; ils apparaissent alors comme des
 * messages normaux du fil, et disparaissent d'ici. Tant qu'ils attendent, on
 * peut les retirer.
 */
export function QueuedMessages({ threadId }: { threadId: string }) {
  const queued = useQuery(api.harness.ingress.listQueuedSubmissions, {
    threadId,
  });
  const withdraw = useMutation(api.harness.ingress.withdrawSubmission);

  if (!queued || queued.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {queued.map((submission) => (
        <QueuedBubble
          key={submission._id}
          prompt={submission.prompt}
          onWithdraw={() => void withdraw({ submissionId: submission._id })}
        />
      ))}
    </div>
  );
}

function QueuedBubble({
  prompt,
  onWithdraw,
}: {
  prompt: string;
  onWithdraw: () => void;
}) {
  return (
    <div className="group flex max-w-4/5 flex-col items-end gap-1">
      <div className="relative rounded-2xl rounded-br-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-2 whitespace-pre-wrap text-slate-500">
        {prompt}
        <button
          type="button"
          onClick={onWithdraw}
          aria-label="Retirer ce message"
          title="Retirer ce message"
          className="absolute -top-2 -left-2 hidden size-5 items-center justify-center rounded-full border border-slate-200 bg-surface text-slate-500 shadow-sm group-hover:flex hover:text-slate-900"
        >
          <TbX size={12} />
        </button>
      </div>
      <span className="flex items-center gap-1 text-[11px] text-slate-400">
        <TbClockHour4 size={12} />
        En file — ajouté après l'étape en cours
      </span>
    </div>
  );
}
