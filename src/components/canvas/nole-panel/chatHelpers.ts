/**
 * The text the user typed, out of a stored user message. Messages that carry
 * their context (steers) end with `<user_message>\n…\n</user_message>`; the
 * context before it can itself mention `<user_message>` inline (the language
 * reminder), so only an opening tag on its own line counts, and the capture
 * runs to the closing tag that ends the text.
 */
export function extractUserMessageForDisplay(text: string): string {
  const match = /(?:^|\n)<user_message>\n([\s\S]*)\n<\/user_message>\s*$/.exec(
    text,
  );
  return match ? match[1].trim() : text;
}
