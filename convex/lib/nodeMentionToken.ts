// `[[node:<nodeId>]]` — the one spelling the agent uses to name a canvas node,
// in documents (blockNoteMarkdown.ts) as in its chat replies (nodeLinks.tsx).
//
// Only the id is significant. `read_nodes` appends a human-readable label —
// `[[node:<nodeId>|<type>|<title>]]` — so the agent sees what a reference points
// at; everything after the first `|` is that label, and every reader ignores it
// (the chat renderer keeps the title as the text shown if the node is gone).
//
// Shared by the backend codec and the frontend so both recognise exactly the
// same tokens.

/**
 * Group 1: the node id, delimited by `|` or `]` so a title containing either
 * cannot swallow it. Group 2: the optional label (`<type>|<title>`), unparsed.
 */
const NODE_MENTION_TOKEN_SOURCE = String.raw`\[\[node:([^\]|\s]+)(?:\|([^\]]*))?\]\]`;

/** A fresh global regex over mention tokens (fresh, so `lastIndex` is never shared). */
export function buildNodeMentionTokenRegex(): RegExp {
  return new RegExp(NODE_MENTION_TOKEN_SOURCE, "g");
}

/** The same pattern as a string, to embed in a larger alternation. */
export function nodeMentionTokenSource(): string {
  return NODE_MENTION_TOKEN_SOURCE;
}
