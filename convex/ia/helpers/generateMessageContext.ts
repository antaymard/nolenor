import type { NoleMessageMetadata } from "../nole";
import { toIsoDateString } from "../../lib/datePill";
import { escapeXmlAttribute, escapeXmlText } from "../../lib/xml";

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

type ContextNodeRef = {
  id: string;
  type?: string;
  title?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
};

type StructuredMessageContext = {
  generatedAt?: string;
  localDate?: string;
  timeZone?: string;
  viewport?: {
    bounds?: { x1: number; y1: number; x2: number; y2: number };
    visibleNodes?: Array<string | ContextNodeRef>;
    visibleNodeIds?: Array<string | ContextNodeRef>;
  };
  openNodes?: ContextNodeRef[];
  attachedPosition?: { x: number; y: number };
  attachedNodes?: ContextNodeRef[];
};

function formatStructuredMessageContext(
  context: StructuredMessageContext,
): string {
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
      openNodesSection = `<open_nodes hint="These nodes have been opened by the user, meaning they might be relevnt context">\n  ${lines.join("\n  ")}\n</open_nodes>`;
    }
  }

  let attachedPosTag = "";
  const attachedPosition = context.attachedPosition;
  if (attachedPosition) {
      attachedPosTag = `<target_position_on_canvas (${Math.round(attachedPosition.x)}, ${Math.round(attachedPosition.y)}) hint="The user attached this position on purpose. Pass it as the absolute position (position arg of create_node) when creating nodes here." />`;
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
      attachedNodesSection = `<attached_nodes hint="The user attached these on purpose, to draw your attention on them in priority.">\n  ${lines.join("\n  ")}\n</attached_nodes>`;
    }
  }

  // Assemblage final via un template literal explicite
  const blocks = [
    "Note: Coordinates are provided as [top-left -> bottom-right], e.g., [100, 200 -> 300, 400].",
    viewportTag,
    openNodesSection,
    attachedPosTag,
    attachedNodesSection,
  ].filter(Boolean); // Retire les chaînes vides

  const reminder = `<reminders>
  - Always check if any skills apply to the user's request. If so, read the corresponding skill files. Multiple skill files may be needed for a single request. These files contain best practices built from testing that are needed for high-quality outputs.
  - Use the explanation field when using tools that support it, to provide context on your intent. It is shown to the user as the label of the call.
  </reminders>`;

  if (blocks.length === 0) return `<message_context />\n\n${reminder}`;

  return `<message_context>\n${blocks.join("\n\n")}\n</message_context>\n\n${reminder}`;
}

// ── <now> ────────────────────────────────────────────────────────────────────
//
// La date du jour n'est nulle part ailleurs : ni dans le system prompt, ni dans
// un résultat de tool. Sans elle, « demain » ou « vendredi prochain » n'ont pas
// de réponse et le modèle invente une date absolue — en pratique celle de son
// cutoff, ce qui produit des pills `[[date:…]]` fausses sans que rien ne le
// signale.
//
// Elle part par message, jamais dans le system prompt (qui est mis en cache et
// se périmerait à minuit) et jamais en base (une date stockée avec le message
// serait relue telle quelle à chaque tour suivant).
//
// L'horloge est celle du CLIENT (`messageContextGenerator.ts`) : une pill de
// date est un jour calendaire local, et le serveur Convex tourne en UTC.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const NOW_HINT =
  "The user's current date, taken from their own clock. Resolve every relative " +
  'date they give ("today", "tomorrow", "next friday", "in two weeks") against ' +
  "it, and write the result as-is in a [[date:YYYY-MM-DD]] pill token. Never " +
  "guess a date: nothing else in this conversation tells you what day it is.";

const UTC_FALLBACK_HINT =
  "The user's local date was not provided for this message: the date above is " +
  "the server's, in UTC, and may be one day off. Ask rather than assume when " +
  "the exact day matters.";

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Le bloc `<now>` du tour. `messageContext` vient du client et n'est validé par
 * personne (`v.any()` dans `nole.ts`), donc la date est reprise seulement si
 * elle a bien la forme canonique ; sinon on retombe sur l'horloge du serveur,
 * en le disant, plutôt que de ne rien émettre et de laisser le modèle deviner.
 */
function formatNow(messageContext: unknown): string {
  const record = readRecord(messageContext);
  const clientDate = readString(record, "localDate");
  const isClientDate = ISO_DATE_RE.test(clientDate);

  // Le runtime Convex est en UTC, donc `toIsoDateString` (qui lit les champs
  // LOCAUX) y rend bien la date UTC.
  const date = isClientDate ? clientDate : toIsoDateString(new Date());
  const timeZone = isClientDate ? readString(record, "timeZone") : "UTC";
  const localTime = isClientDate ? readString(record, "generatedAt") : "";

  const attributes =
    `date="${escapeXmlAttribute(date)}"` +
    (timeZone ? ` timeZone="${escapeXmlAttribute(timeZone)}"` : "") +
    (localTime ? ` localTime="${escapeXmlAttribute(localTime)}"` : "");

  // Le hint est le corps de l'élément, pas un attribut : il est long et plein
  // de guillemets, que `escapeXmlAttribute` rendrait en `&quot;`/`&apos;`.
  const hint = isClientDate
    ? NOW_HINT
    : `${NOW_HINT} ${UTC_FALLBACK_HINT}`;

  return `<now ${attributes}>\n${escapeXmlText(hint)}\n</now>`;
}

export function generateMessageContext({
  metadata,
  canvasChangesSinceLastMessage,
}: {
  metadata?: NoleMessageMetadata;
  canvasChangesSinceLastMessage: string;
}): string {
  const messageContext = metadata?.messageContext;
  // En tête : c'est le repère contre lequel tout le reste du tour se lit, et
  // il est le seul bloc émis inconditionnellement.
  const runtimeParts: string[] = [formatNow(messageContext)];

  if (typeof messageContext === "string") {
    const trimmedMessageContext = messageContext.trim();
    if (trimmedMessageContext) {
      runtimeParts.push(trimmedMessageContext);
    }
  } else if (messageContext !== null && messageContext !== undefined) {
    if (
      typeof messageContext === "object" &&
      !Array.isArray(messageContext) &&
      "viewport" in messageContext
    ) {
      runtimeParts.push(
        formatStructuredMessageContext(messageContext as StructuredMessageContext),
      );
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
