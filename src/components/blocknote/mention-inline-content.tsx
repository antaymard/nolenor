import { useCallback, type MouseEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { createReactInlineContentSpec } from "@blocknote/react";

import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import {
  OPEN_MODIFIER_LABEL,
  isOpenModifier,
  useActivateNode,
} from "@/hooks/useActivateNode";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { cn } from "@/lib/utils";
import { mentionInlineContentConfig } from "@/../convex/lib/blockNoteCustomSchema";

/**
 * Node-mention pill (`@` in the editor, see nodeMentionSuggestions.tsx).
 * Stored as `{ type: "mention", props: { nodeDataId, title } }`.
 *
 * `nodeDataId` is the only prop that matters live: every rendering surface
 * resolves the current title from `nodeDataStore` (via `useNodeDataTitle`),
 * so a pill stays in sync when the mentioned node is renamed elsewhere.
 * `title` is a one-time snapshot taken when the mention is inserted — it is
 * NEVER read by the interactive UI, only used as a fallback when the node no
 * longer exists on this canvas.
 *
 * The agent sees the pill as the `[[node:<canvasNodeId>|<type>|<title>]]` token
 * and can author one back as `[[node:<canvasNodeId>]]`. The Convex codec is
 * pure and cannot map `nodeDataId` to a canvas node id on its own, so
 * `read_nodes` hands it the correspondence and the write-side tools resolve the
 * ids the agent wrote (convex/ia/helpers/blockNoteMarkdown.ts,
 * convex/ia/helpers/resolveNodeMentionTokens.ts). The snapshot `title` is what
 * the codec falls back to when a mentioned node has left the canvas, and the
 * search index always uses it — a machine token would be noise there.
 */

const pillClassName =
  "inline-flex max-w-64 items-center gap-1 rounded-sm bg-muted px-1.5 py-[0.12em] align-middle leading-none text-muted-foreground";

function useMentionPillData(nodeDataId: string | undefined) {
  const id = nodeDataId as Id<"nodeDatas"> | undefined;
  const nodeData = useNodeDataStore(
    useCallback((s) => (id ? s.nodeDatas.get(id) : undefined), [id]),
  );
  const liveTitle = useNodeDataTitle(id);
  const Icon = nodeData
    ? (NODE_TYPE_ICON_MAP[nodeData.type] ?? NODE_TYPE_ICON_MAP.title)
    : undefined;
  const label = nodeData ? liveTitle || nodeData.type : undefined;
  return { id, nodeData, label, Icon };
}

/**
 * Static (read-only, non-interactive) rendering of a mention pill: icon +
 * live title, no click. Used by the canvas read-only renderer
 * (BlockNoteStatic, via the registry) AND by the spec's `toExternalHTML`
 * (clipboard / HTML export) so the two surfaces never diverge — same
 * convention as DatePillView / CalloutView.
 */
export function MentionPillView({
  nodeDataId,
  title: fallbackTitle,
}: {
  nodeDataId?: string;
  title?: string;
}) {
  const { nodeData, label, Icon } = useMentionPillData(nodeDataId);

  if (!nodeData) {
    return (
      <span className={cn(pillClassName, "italic opacity-60")}>
        {fallbackTitle || "Node not found"}
      </span>
    );
  }

  return (
    <span className={pillClassName}>
      {Icon ? <Icon size={12} className="shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Interactive editable-editor rendering: clicking goes to the mentioned node
 * on the canvas; Cmd/Ctrl+click opens its window instead (still a go to when
 * that node has no window — a `title`/`link`/`value` node, or a custom node
 * whose template has no windowLayout). `useActivateNode` owns that rule.
 *
 * `useReactFlow`/`useActivateNode` require a `ReactFlowProvider` ancestor; this
 * component only ever mounts inside BlocknoteWindow, which is always rendered
 * within the canvas route's provider, and the existing BlockNoteErrorBoundary
 * around every editor is the safety net if a pasted document ever displaced
 * it elsewhere.
 */
function InteractiveMentionPill({
  nodeDataId,
  title: fallbackTitle,
}: {
  nodeDataId?: string;
  title?: string;
}) {
  const { id, nodeData, label, Icon } = useMentionPillData(nodeDataId);
  const activateNode = useActivateNode();
  const { getNodes } = useReactFlow();

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!id || !nodeData) return;
      const xyNode = getNodes().find(
        (n) =>
          (n.data as { nodeDataId?: string } | undefined)?.nodeDataId === id,
      );
      if (!xyNode) return;

      activateNode(
        { nodeId: xyNode.id, nodeDataId: id, nodeType: nodeData.type },
        { open: isOpenModifier(event) },
      );
    },
    [id, nodeData, getNodes, activateNode],
  );

  if (!nodeData) {
    return (
      <span
        className={cn(pillClassName, "italic opacity-60")}
        title="Node not found"
      >
        {fallbackTitle || "Node not found"}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(pillClassName, "cursor-pointer hover:bg-muted/70")}
      title={`${label} — click to go to, ${OPEN_MODIFIER_LABEL}+click to open`}
    >
      {Icon ? <Icon size={12} className="shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

export const nodeMentionInlineContentSpec = createReactInlineContentSpec(
  mentionInlineContentConfig,
  {
    render: (props) => (
      <InteractiveMentionPill
        nodeDataId={props.inlineContent.props.nodeDataId}
        title={props.inlineContent.props.title}
      />
    ),
    toExternalHTML: (props) => (
      <MentionPillView
        nodeDataId={props.inlineContent.props.nodeDataId}
        title={props.inlineContent.props.title}
      />
    ),
  },
);
