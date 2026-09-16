export function extractUserMessageForDisplay(text: string): string {
  const match = /<user_message>\s*([\s\S]*?)\s*<\/user_message>/i.exec(text);
  if (!match) {
    return text;
  }

  return match[1] ?? text;
}

/** Un rapport de sous-agent, tel que la conversation doit l'afficher. */
export type SubAgentReport = {
  id: string;
  canvasId: string;
  status: string;
  brief?: string;
  body: string;
};

const SUBAGENT_REPORTS_BLOCK =
  /<subagent_reports>([\s\S]*)<\/subagent_reports>/i;
const SUBAGENT_REPORT_ENTRY =
  /<report\s+([^>]*)>\n?([\s\S]*?)\n?\s*<\/report>/gi;

function readAttribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attributes);
  return match?.[1] === undefined ? undefined : unescapeXml(match[1]);
}

/** Inverse d'`escapeXmlAttribute` / `escapeXmlText` (cf. convex/lib/xml.ts). */
function unescapeXml(value: string): string {
  return (
    value
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'")
      // `&amp;` en dernier, sinon « &amp;lt; » se déplierait en « < ».
      .replaceAll("&amp;", "&")
  );
}

/**
 * Reconnaît le message que `ia/subAgents.deliverIfReady` dépose sur le thread
 * quand un lot de sous-agents a fini.
 *
 * Il est enregistré avec le rôle `user` — c'est une entrée du modèle, et le
 * composant agent n'a pas d'autre rôle pour ça — mais ce n'est pas l'humain
 * qui parle. Sans cette reconnaissance, la conversation afficherait le XML brut
 * dans une bulle utilisateur, ce qui se lirait comme une panne.
 *
 * `null` quand ce n'en est pas un, ce qui est le cas de tous les autres
 * messages : l'appelant retombe alors sur le rendu normal.
 */
export function parseSubAgentReports(text: string): SubAgentReport[] | null {
  const block = SUBAGENT_REPORTS_BLOCK.exec(text);
  if (!block?.[1]) return null;

  const reports: SubAgentReport[] = [];
  // `lastIndex` est porté par la regex globale : on la réinitialise, sinon un
  // second appel repartirait d'où le premier s'était arrêté.
  SUBAGENT_REPORT_ENTRY.lastIndex = 0;
  let entry = SUBAGENT_REPORT_ENTRY.exec(block[1]);
  while (entry !== null) {
    const attributes = entry[1] ?? "";
    reports.push({
      id: readAttribute(attributes, "id") ?? "",
      canvasId: readAttribute(attributes, "canvasId") ?? "",
      status: readAttribute(attributes, "status") ?? "success",
      brief: readAttribute(attributes, "brief"),
      body: unescapeXml(entry[2] ?? "").trim(),
    });
    entry = SUBAGENT_REPORT_ENTRY.exec(block[1]);
  }

  // Une balise présente mais aucun rapport lisible : mieux vaut le rendu brut
  // que de faire disparaître le message.
  return reports.length > 0 ? reports : null;
}
