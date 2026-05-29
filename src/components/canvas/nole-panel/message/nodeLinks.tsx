import type { Root } from "mdast";
import type { Plugin } from "unified";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Components } from "react-markdown";
import { buildLlmIdTextRegex, matchesLlmIdFormat } from "@/../convex/lib/llmId";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";

/**
 * Remark plugin that turns node-ID mentions in assistant text into links
 * (`#node-<id>`), later rendered as clickable node pills by `markdownComponents`.
 *
 * Works on the parsed mdast tree rather than the raw string, so it operates on
 * `text` nodes only — IDs inside inline code or fenced code blocks are not
 * `text` nodes and are therefore left untouched (rendered literally). It also
 * skips existing links so a real URL containing an ID-like substring is safe.
 *
 * `findAndReplace` uses the same regex as the ID matcher; the replacer returns
 * `false` (treated as "no match") for tokens that match the loose regex but
 * fail the strict format check, mirroring `matchLlmIdsInText`.
 */
export const remarkNodeMentions: Plugin<[], Root> = () => (tree) => {
  findAndReplace(
    tree,
    [
      [
        buildLlmIdTextRegex(),
        (match: string) => {
          if (!matchesLlmIdFormat(match)) return false;
          return {
            type: "link",
            url: `#node-${match}`,
            children: [{ type: "text", value: match }],
          };
        },
      ],
    ],
    { ignore: ["link"] },
  );
};

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
