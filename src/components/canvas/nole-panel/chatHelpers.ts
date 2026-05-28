export function extractUserMessageForDisplay(text: string): string {
  const match = /<user_message>\s*([\s\S]*?)\s*<\/user_message>/i.exec(text);
  if (!match) {
    return text;
  }

  return match[1] ?? text;
}
