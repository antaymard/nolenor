import { TbLink } from "react-icons/tb";
import { LuMousePointerClick } from "react-icons/lu";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";
import type { Doc } from "@/../convex/_generated/dataModel";

type Attachments = NonNullable<Doc<"messageMetadata">["attachments"]>;

/** Chips shown under a user message for its attached nodes / position / page. */
export function MessageAttachments({
  attachments,
}: {
  attachments: Attachments;
}) {
  const nodes = attachments.nodes ?? [];
  const { position, page } = attachments;
  const hasAny = nodes.length > 0 || !!position || !!page;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-1 max-w-4/5 justify-end">
      {nodes.map((n) => (
        <MentionedNodeCard key={n.id} nodeId={n.id} fallback={n.title} />
      ))}
      {position ? (
        <span className="inline-flex items-center gap-1 rounded-sm border bg-card px-2 py-0.5 text-xs text-muted-foreground">
          <LuMousePointerClick size={11} />({Math.round(position.x)},{" "}
          {Math.round(position.y)})
        </span>
      ) : null}
      {page && (page.title || page.url) ? (
        <a
          href={page.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-sm border bg-card px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/60 max-w-55"
        >
          <TbLink size={11} className="shrink-0" />
          <span className="truncate">{page.title ?? page.url}</span>
        </a>
      ) : null}
    </div>
  );
}
