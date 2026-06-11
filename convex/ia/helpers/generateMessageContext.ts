import type { NoleMessageMetadata } from "../nole";

function sanitizeXmlTagName(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "_");
  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `value_${sanitized}`;
}

function valueToXml(tagName: string, value: unknown, indent = 0): string {
  const safeTagName = sanitizeXmlTagName(tagName);
  const prefix = "  ".repeat(indent);

  if (value === null || value === undefined) {
    return `${prefix}<${safeTagName} />`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${prefix}<${safeTagName} />`;
    }

    const items = value
      .map((item) => valueToXml("item", item, indent + 1))
      .join("\n");

    return `${prefix}<${safeTagName}>\n${items}\n${prefix}</${safeTagName}>`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      return `${prefix}<${safeTagName} />`;
    }

    const children = entries
      .map(([key, childValue]) => valueToXml(key, childValue, indent + 1))
      .join("\n");

    return `${prefix}<${safeTagName}>\n${children}\n${prefix}</${safeTagName}>`;
  }

  return `${prefix}<${safeTagName}>${String(value)}</${safeTagName}>`;
}

function formatStructuredMessageContext(context: any): string {
  let viewportTag = "";
  const viewport = context.viewport;
  if (viewport?.bounds) {
    const { x1, y1, x2, y2 } = viewport.bounds;
    viewportTag = `<viewport bounds=[${Math.round(x1)}, ${Math.round(y1)} -> ${Math.round(x2)}, ${Math.round(y2)}]>`;
  }

  let openNodesSection = "";
  const openNodes = context.openNodes;
  if (Array.isArray(openNodes) && openNodes.length > 0) {
    const lines = openNodes
      .filter((n) => n.position)
      .map(
        (n) =>
          `${n.id} [${n.type}] (${Math.round(n.position.x)}, ${Math.round(n.position.y)}) ${n.title}`,
      );
    if (lines.length > 0) {
      openNodesSection = `<open_nodes>\n  ${lines.join("\n  ")}\n</open_nodes>`;
    }
  }

  let attachedPosTag = "";
  const attachedPosition = context.attachedPosition;
  if (attachedPosition) {
    attachedPosTag = `<target_position_on_canvas (${Math.round(attachedPosition.x)}, ${Math.round(attachedPosition.y)}) />`;
  }

  let attachedNodesSection = "";
  const attachedNodes = context.attachedNodes;
  if (Array.isArray(attachedNodes) && attachedNodes.length > 0) {
    const lines = attachedNodes
      .filter((n) => n.position && n.size)
      .map((n) => {
        const x1 = Math.round(n.position.x);
        const y1 = Math.round(n.position.y);
        const x2 = Math.round(x1 + n.size.width);
        const y2 = Math.round(y1 + n.size.height);
        return `${n.id} [${n.type}] [${x1}, ${y1} -> ${x2}, ${y2}] ${n.title}`;
      });
    if (lines.length > 0) {
      attachedNodesSection = `<attached_nodes>\n  ${lines.join("\n  ")}\n</attached_nodes>`;
    }
  }

  let attachedPageSection = "";
  const attachedPage = context.attachedPage;
  if (attachedPage && typeof attachedPage === "object") {
    const { title, url, text } = attachedPage as {
      title?: string;
      url?: string;
      text?: string;
    };
    let content = "";
    if (title) content += `<title>${title}</title>\n  `;
    if (url) content += `<url>${url}</url>\n  `;
    if (text) content += `<content>${text.substring(0, 12000)}</content>`;
    if (content) {
      attachedPageSection = `<attached_page>\n  ${content.trim()}\n</attached_page>`;
    }
  }

  let visibleNodesSection = "";
  const visibleNodes = viewport?.visibleNodes || viewport?.visibleNodeIds;
  if (Array.isArray(visibleNodes) && visibleNodes.length > 0) {
    const maxVisible = 10;
    const toShow = visibleNodes.slice(0, maxVisible);

    const lines = toShow.map((node) => {
      if (typeof node === "string") return node;
      return `${node.id} [${node.type}] ${node.title}`;
    });

    if (visibleNodes.length > maxVisible) {
      lines.push(`...truncated list. total is ${visibleNodes.length}`);
    }
    visibleNodesSection = `<visible_nodes>\n  ${lines.join("\n  ")}\n</visible_nodes>`;
  }

  // Assemblage final via un template literal explicite
  const blocks = [
    "Note: Coordinates are provided as [top-left -> bottom-right], e.g., [100, 200 -> 300, 400].",
    viewportTag,
    openNodesSection,
    attachedPosTag,
    attachedNodesSection,
    attachedPageSection,
    visibleNodesSection,
  ].filter(Boolean); // Retire les chaînes vides

  const reminder = `<reminders>
  - Always check if any skills apply to the user's request. If so, read the corresponding skill files. Multiple skill files may be needed for a single request. These files contain best practices built from testing that are needed for high-quality outputs.
  - Use the explanation field when using tools that support it, to provide context on your intent. This helps guide the worker's approach and focus.
  </reminders>`;

  if (blocks.length === 0) return `<message_context />\n\n${reminder}`;

  return `<message_context>\n${blocks.join("\n\n")}\n</message_context>\n\n${reminder}`;
}

export function generateMessageContext({
  metadata,
  canvasChangesSinceLastMessage,
}: {
  metadata?: NoleMessageMetadata;
  canvasChangesSinceLastMessage: string;
}): string {
  const runtimeParts: string[] = [];
  const messageContext = metadata?.messageContext;

  if (typeof messageContext === "string") {
    const trimmedMessageContext = messageContext.trim();
    if (trimmedMessageContext) {
      runtimeParts.push(trimmedMessageContext);
    }
  } else if (messageContext !== null && messageContext !== undefined) {
    if (
      typeof messageContext === "object" &&
      !Array.isArray(messageContext) &&
      ("viewport" in messageContext || "attachedPage" in messageContext)
    ) {
      runtimeParts.push(formatStructuredMessageContext(messageContext));
    } else {
      runtimeParts.push(valueToXml("message_context", messageContext));
    }
  }

  const trimmedCanvasChangesSinceLastMessage =
    canvasChangesSinceLastMessage.trim();
  if (trimmedCanvasChangesSinceLastMessage) {
    runtimeParts.push(trimmedCanvasChangesSinceLastMessage);
  }

  return runtimeParts.join("\n\n");
}
