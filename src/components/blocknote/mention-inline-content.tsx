import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { createReactInlineContentSpec } from "@blocknote/react";

import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { useGoToNode } from "@/hooks/useGoToNode";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { cn } from "@/lib/utils";

/**
 * Node-mention pill (`@` in the editor, see nodeMentionSuggestions.tsx).
 * Stored as `{ type: "mention", props: { nodeDataId, title } }`.
 *
 * `nodeDataId` is the only prop that matters live: every rendering surface
 * resolves the current title from `nodeDataStore` (via `useNodeDataTitle`),
 * so a pill stays in sync when the mentioned node is renamed elsewhere.
 * `title` is a one-time snapshot taken when the mention is inserted — it is
 * NEVER read by the interactive UI, only used as a fallback when the node no
 * longer exists on this canvas, and by the headless (default-schema) Convex
 * codec that turns pills into plain text for markdown/search/XML (see
 * convex/ia/helpers/blockNoteMarkdown.ts) — that codec has no DB access.
 */

const pillClassName =
  "inline-flex max-w-64 items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 align-baseline text-muted-foreground";

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
        {fallbackTitle || "Node introuvable"}
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
 * Interactive editable-editor rendering: clicking opens the mentioned node's
 * window, falling back to navigating to it on the canvas when that node has
 * no window to open (a `title`/`link`/`value` node, or a custom node whose
 * template has no windowLayout). `openWindow` owns that decision and reports
 * it back, so this handler never has to know the rule.
 *
 * `useReactFlow`/`useGoToNode` require a `ReactFlowProvider` ancestor; this
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
  const openWindow = useWindowsStore((s) => s.openWindow);
  const goToNode = useGoToNode();
  const { getNodes } = useReactFlow();

  const handleClick = useCallback(() => {
    if (!id || !nodeData) return;
    const xyNode = getNodes().find(
      (n) => (n.data as { nodeDataId?: string } | undefined)?.nodeDataId === id,
    );
    if (!xyNode) return;

    const opened = openWindow({
      xyNodeId: xyNode.id,
      nodeDataId: id,
      nodeType: nodeData.type,
    });
    if (!opened) goToNode(xyNode.id);
  }, [id, nodeData, getNodes, openWindow, goToNode]);

  if (!nodeData) {
    return (
      <span
        className={cn(pillClassName, "italic opacity-60")}
        title="Node introuvable"
      >
        {fallbackTitle || "Node introuvable"}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(pillClassName, "cursor-pointer hover:bg-muted/70")}
      title={label}
    >
      {Icon ? <Icon size={12} className="shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

export const nodeMentionInlineContentSpec = createReactInlineContentSpec(
  {
    type: "mention",
    propSchema: {
      nodeDataId: { default: "" },
      title: { default: "" },
    },
    content: "none",
  },
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
