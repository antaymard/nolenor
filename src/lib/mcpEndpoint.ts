/**
 * URL du endpoint MCP, dérivée de l'URL Convex du client.
 *
 * Convex sert les HTTP actions (dont /mcp) sur `.convex.site`, alors que le
 * client temps réel parle à `.convex.cloud` : seul le TLD change. On dérive
 * donc l'URL au lieu de la demander en variable d'env supplémentaire.
 */
export function getMcpEndpointUrl(): string | null {
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (!convexUrl) return null;

  try {
    const url = new URL(convexUrl);
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    url.pathname = "/mcp";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Commande `claude mcp add` prête à coller, en une seule ligne. */
export function buildClaudeCodeCommand(
  endpointUrl: string,
  token: string,
): string {
  return `claude mcp add --transport http nolenor ${endpointUrl} --header "Authorization: Bearer ${token}" --scope user`;
}
