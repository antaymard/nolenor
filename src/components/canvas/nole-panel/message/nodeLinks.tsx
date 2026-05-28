import type { Components } from "react-markdown";
import { buildLlmIdTextRegex } from "@/../convex/lib/llmId";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";

/**
 * Turn every node ID found in raw assistant text into a markdown link
 * (`[id](#node-id)`) so it can be rendered as a clickable node card.
 *
 * Uses the exact same regex as the ID matcher to guarantee that only valid
 * node-ID formats are linkified.
 */
export function preprocessTextWithNodeLinks(text: string): string {
  if (!text) return "";
  return text.replace(
    buildLlmIdTextRegex(),
    (match) => `[${match}](#node-${match})`,
  );
}

/**
 * Markdown component overrides for assistant text: `#node-<id>` links render as
 * inline node cards; everything else renders as a normal external link.
 */
export const markdownComponents: Components = {
  a: ({ href, children }) => {
    if (href?.startsWith("#node-")) {
      const nodeId = href.replace("#node-", "");
      // `children` is the original text, used as fallback if no node matches.
      return <MentionedNodeCard nodeId={nodeId} inline fallback={children} />;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-blue-500 hover:underline"
      >
        {children}
      </a>
    );
  },
};
