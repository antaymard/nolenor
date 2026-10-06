import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { TbArrowRight, TbLoader2 } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useOpenNoleThread } from "@/hooks/useOpenNoleThread";

/** Combien de temps la ligne « Added to … » reste sous la barre. */
const NOTICE_MS = 8000;

/**
 * Où sont parties les dernières demandes de l'omnibar : « Routing… » le
 * temps de l'aiguillage, puis une ligne qui dit où la demande a atterri,
 * avec de quoi l'ouvrir — ou la renvoyer en nouvelle tâche tant qu'elle
 * attend sa place dans un run en cours.
 */
export default function OmnibarFeed({ canvasId }: { canvasId: Id<"canvases"> }) {
  const dispatches = useQuery(api.harness.dispatch.listRecentDispatches, {
    canvasId,
  });
  const redirect = useMutation(api.ia.nole.redispatchAsNew);
  const open = useOpenNoleThread();
  const [now, setNow] = useState(() => Date.now());

  const visible = (dispatches ?? []).filter(
    (dispatch) =>
      !dispatch.redirected &&
      (dispatch.status === "routing" ||
        (dispatch.routedAt !== null && now - dispatch.routedAt < NOTICE_MS)),
  );

  // Une horloge seulement tant qu'il y a une ligne à faire disparaître.
  useEffect(() => {
    if (visible.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible.length]);

  if (visible.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-1">
      {visible.map((dispatch) =>
        dispatch.status === "routing" ? (
          <div
            key={dispatch._id}
            className="flex items-center gap-2 rounded-xl bg-surface/90 px-3 py-1.5 text-xs text-slate-500 shadow-sm"
          >
            <TbLoader2 size={14} className="shrink-0 animate-spin text-violet-500" />
            <span className="truncate">Finding the right task for “{dispatch.prompt}”…</span>
          </div>
        ) : (
          <div
            key={dispatch._id}
            className="flex items-center gap-2 rounded-xl bg-surface/90 px-3 py-1.5 text-xs text-slate-600 shadow-sm"
          >
            <TbArrowRight size={14} className="shrink-0 text-violet-500" />
            <span className="min-w-0 flex-1 truncate">
              {noticeText(dispatch.kind, dispatch.threadTitle)}
            </span>
            {dispatch.canRedirect && (
              <button
                type="button"
                onClick={() => void redirect({ dispatchId: dispatch._id })}
                className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                Start a new task instead
              </button>
            )}
            {dispatch.threadId && (
              <button
                type="button"
                onClick={() => open(dispatch.threadId!)}
                className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-violet-600 hover:bg-violet-50"
              >
                Open
              </button>
            )}
          </div>
        ),
      )}
    </div>
  );
}

function noticeText(kind: string | null, title: string | null) {
  const task = title ? `“${title}”` : "an earlier task";
  switch (kind) {
    case "steer":
      return `Added to ${task} — Nolë takes it into account as it works`;
    case "answer":
      return `Answered the question in ${task}`;
    case "continue":
      return `Continued ${task}`;
    default:
      return "Started a new task";
  }
}
