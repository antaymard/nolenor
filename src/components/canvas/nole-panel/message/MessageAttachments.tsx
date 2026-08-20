import { LuMousePointerClick } from "react-icons/lu";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";
import type { Doc } from "@/../convex/_generated/dataModel";

type Attachments = NonNullable<Doc<"messageMetadata">["attachments"]>;

/** Chips shown under a user message for its attached nodes / position. */
export function MessageAttachments({
  attachments,
}: {
  attachments: Attachments;
}) {
  const nodes = attachments.nodes ?? [];
  const { position } = attachments;
  const hasAny = nodes.length > 0 || !!position;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-1 max-w-4/5 justify-end">
      {nodes.map((n) => (
        <MentionedNodeCard key={n.id} nodeId={n.id} fallback={n.title} />
      ))}
      {position ? (
        <span className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600">
          <LuMousePointerClick size={11} />({Math.round(position.x)},{" "}
          {Math.round(position.y)})
        </span>
      ) : null}
    </div>
  );
}
