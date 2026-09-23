import type { Root } from "mdast";
import type { Plugin } from "unified";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Components } from "react-markdown";
import { buildLlmIdTextRegex, matchesLlmIdFormat } from "@/../convex/lib/llmId";
import { nodeMentionTokenSource } from "@/../convex/lib/nodeMentionToken";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";

/**
 * A code span or fence (skipped verbatim: it is how the syntax is shown
 * literally), or a `[[node:…]]` token. Group 1: the backtick run; group 2: the
 * node id; group 3: the optional `<type>|<title>` label.
 */
const CODE_OR_NODE_TOKEN_RE = new RegExp(
  String.raw`(\`+)[\s\S]*?\1|~~~[\s\S]*?~~~|` + nodeMentionTokenSource(),
  "g",
);

/** Ids safe to drop into a `#node-<id>` URL as is. */
const LINKABLE_NODE_ID_RE = /^[\w-]+$/;

/** A token still being typed at the very end of a streaming text. */
const TRAILING_PARTIAL_TOKEN_RE =
  /\[\[(?:n(?:o(?:d(?:e(?::[^\]]*\]?)?)?)?)?)?$/;

/** Link text is Markdown too: escape what could open emphasis, code or a table cell. */
function escapeLinkText(text: string): string {
  return text.replace(/[\\`*_[\]<>~|]/g, "\\$&");
}

/**
 * Rewrites the agent's `[[node:ID]]` / `[[node:ID|type|title]]` mention tokens
 * as `[title](#node-ID)` links, which `markdownComponents` renders as node
 * pills — the whole token becomes the pill, label included. The title (or the
 * id without one) is only the fallback shown if the node is no longer on the
 * canvas; the pill itself reads the live title.
 *
 * Done on the raw string, before Markdown parsing, because the label is free
 * text: a `_` or `*` in a title would otherwise be parsed as emphasis and split
 * the token across several mdast nodes.
 *
 * While streaming, a token cut mid-way at the end of the text is hidden until
 * it closes, instead of flashing its raw syntax.
 */
export function nodeMentionTokensToLinks(
  text: string,
  { streaming = false }: { streaming?: boolean } = {},
): string {
  const source = streaming ? text.replace(TRAILING_PARTIAL_TOKEN_RE, "") : text;
  if (!source.includes("[[node:")) return source;

  return source.replace(
    CODE_OR_NODE_TOKEN_RE,
    (match, _ticks, nodeId: string | undefined, label: string | undefined) => {
      if (nodeId === undefined || !LINKABLE_NODE_ID_RE.test(nodeId)) {
        return match;
      }
      // Label is `<type>|<title>` as read_nodes writes it; tolerate a bare title.
      const parts = (label ?? "").split("|");
      const title = (parts.length > 1 ? parts.slice(1).join("|") : parts[0])
        .replace(/\s+/g, " ")
        .trim();
      return `[${escapeLinkText(title || nodeId)}](#node-${nodeId})`;
    },
  );
}

/**
 * Remark plugin that turns bare node IDs in assistant text into links
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
 *
 * `[[node:…]]` tokens, the spelling the agent is asked to use, are already
 * links by then (`nodeMentionTokensToLinks`); this catches the bare ids of
 * older messages and of a model that skips the token.
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
