/**
 * Raccourci Markdown des title nodes : « # », « ## » ou « ### » suivi d'une
 * espace en tête du texte fixe le niveau (h1 à h3) et disparaît du texte.
 *
 * Partagé entre la saisie dans `TitleNode` et la création par l'agent
 * (`create_node`), pour que les deux comprennent exactement la même chose.
 */
const HEADING_PREFIX = /^(#{1,3}) (.*)$/;

export function parseTitleHeading(
  raw: string,
): { level: "h1" | "h2" | "h3"; text: string } | null {
  const match = raw.match(HEADING_PREFIX);
  if (!match) return null;
  return {
    level: `h${match[1].length}` as "h1" | "h2" | "h3",
    text: match[2],
  };
}
