/**
 * Taille d'un title node, calculée côté serveur.
 *
 * Le client mesure le texte avec un fantôme dans le DOM
 * (`useTitleNodeSizing`), mais il fait confiance aux dimensions persistées au
 * premier rendu : un title créé ou réécrit par l'agent garderait la taille par
 * défaut jusqu'à la prochaine édition. Ici, pas de DOM ni de canvas — on
 * additionne les chasses de Nunito, figées dans `titleFontMetrics.ts`.
 *
 * Les constantes doivent suivre le client au pixel : les classes de
 * `titleLevelStyles.ts` (et le `p` de `LEVELS` dans `TitleNode.tsx`), le thème
 * Tailwind de `src/index.css`, les paddings et la bordure de
 * `useTitleNodeSizing`.
 */
import { METRIC_CHARS, NUNITO_METRICS } from "./titleFontMetrics";

export type TitleLevel = "h1" | "h2" | "h3" | "p";
export type TitleSizingMode = "auto" | "manual";

/**
 * Taille et interligne (px) de chaque niveau, tels que Tailwind les rend. Les
 * titres ont des tailles arbitraires (`text-[28px]`…) qui ne posent pas
 * d'interligne : il hérite du `line-height: 1.5` du preflight.
 */
const LEVEL_TYPOGRAPHY: Record<
  TitleLevel,
  { fontSize: number; lineHeight: number; weight: 400 | 600 }
> = {
  h1: { fontSize: 28, lineHeight: 42, weight: 600 }, // text-[28px] font-semibold
  h2: { fontSize: 22, lineHeight: 33, weight: 600 }, // text-[22px] font-semibold
  h3: { fontSize: 17, lineHeight: 25.5, weight: 600 }, // text-[17px] font-semibold
  p: { fontSize: 15, lineHeight: 22.5, weight: 400 }, // text-base (15px dans le thème)
};

// `p-1 px-2` autour du texte, bordure 1px de NodeFrame.
const PADDING_X = 16;
const PADDING_Y = 8;
const BORDER_TOTAL = 2;
/** Ce que le fantôme affiche quand le titre est vide. */
const PLACEHOLDER = "Click to edit...";
/**
 * Marge contre la sous-estimation : le texte est en `overflow-hidden`, un
 * pixel de trop ne se voit pas, un pixel de moins coupe la dernière lettre.
 * Couvre les paires de crénage écartées de la table.
 */
const SAFETY_PX = 2;

type FontTable = {
  advances: Map<string, number>;
  kerning: Map<string, number>;
  fallback: number;
};

const fontTables = new Map<400 | 600, FontTable>();

function getFontTable(weight: 400 | 600): FontTable {
  const cached = fontTables.get(weight);
  if (cached) return cached;

  const raw = NUNITO_METRICS[weight];
  const chars = Array.from(METRIC_CHARS);
  const advances = new Map(chars.map((c, i) => [c, raw.advances[i] / 1000]));
  const kerning = new Map<string, number>();
  raw.kerningValues.forEach((value, i) => {
    kerning.set(raw.kerningPairs.slice(i * 2, i * 2 + 2), value / 1000);
  });
  // Chasse moyenne des minuscules : l'ordre de grandeur d'un caractère latin
  // absent de la table.
  const lower = Array.from("abcdefghijklmnopqrstuvwxyz");
  const fallback =
    lower.reduce((sum, c) => sum + (advances.get(c) ?? 0), 0) / lower.length;

  const table = { advances, kerning, fallback };
  fontTables.set(weight, table);
  return table;
}

/** Chasse (em) d'un caractère hors table : rendu par une police de repli. */
function fallbackAdvance(char: string, table: FontTable): number {
  const cp = char.codePointAt(0) ?? 0;
  // Marques combinantes, sélecteurs de variante, joints : sans chasse.
  if (
    (cp >= 0x300 && cp <= 0x36f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0x200d
  ) {
    return 0;
  }
  // Emoji : un peu plus large qu'un em dans les polices couleur.
  if (cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf)) return 1.25;
  // CJK, kana, hangul : pleine chasse.
  if (cp >= 0x2e80) return 1;
  return table.fallback;
}

/** Largeur (em) d'une ligne, sans retour à la ligne. */
function lineWidthEm(line: string, table: FontTable): number {
  const chars = Array.from(line);
  let width = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    width += table.advances.get(c) ?? fallbackAdvance(c, table);
    if (i + 1 < chars.length) {
      width += table.kerning.get(c + chars[i + 1]) ?? 0;
    }
  }
  return width;
}

/**
 * Nombre de lignes d'un paragraphe en `white-space: pre-wrap` dans une boîte
 * de `maxWidth` px. Coupe aux espaces seulement — le fantôme n'a pas
 * `break-words`, un mot trop long déborde sans ajouter de ligne. Les espaces
 * en fin de ligne pendent hors de la boîte et ne comptent pas.
 */
function countWrappedLines(
  paragraph: string,
  maxWidth: number,
  fontSize: number,
  table: FontTable,
): number {
  // Chaque segment = un mot suivi de ses espaces.
  const segments = paragraph.match(/[^ ]*( +|$)/g)?.filter(Boolean) ?? [];
  if (segments.length === 0) return 1;

  let lines = 1;
  let current = "";
  for (const segment of segments) {
    const candidate = current + segment;
    const visibleWidth = lineWidthEm(candidate.trimEnd(), table) * fontSize;
    if (current !== "" && visibleWidth > maxWidth) {
      lines++;
      current = segment;
    } else {
      current = candidate;
    }
  }
  return lines;
}

export function normalizeTitleLevel(level: unknown): TitleLevel {
  return level === "h1" || level === "h2" || level === "h3" ? level : "p";
}

/**
 * Dimensions d'un title node pour un texte et un niveau donnés.
 *
 * - `auto` : largeur = la ligne la plus longue, rien ne revient à la ligne
 *   (seuls les `\n` du texte créent des lignes).
 * - `manual` : la largeur est celle de l'utilisateur (`width`), seule la
 *   hauteur suit le texte replié.
 */
export function measureTitleNode({
  text,
  level,
  sizingMode = "auto",
  width,
}: {
  text: string;
  level: TitleLevel;
  sizingMode?: TitleSizingMode;
  width?: number;
}): { width: number; height: number } {
  const { fontSize, lineHeight, weight } = LEVEL_TYPOGRAPHY[level];
  const table = getFontTable(weight);
  const paragraphs = (text.length === 0 ? PLACEHOLDER : text).split("\n");
  const frameX = PADDING_X + BORDER_TOTAL;
  const frameY = PADDING_Y + BORDER_TOTAL;

  if (sizingMode === "manual" && width !== undefined) {
    const innerWidth = Math.max(0, width - frameX);
    const lines = paragraphs.reduce(
      (sum, p) => sum + countWrappedLines(p, innerWidth, fontSize, table),
      0,
    );
    return { width, height: Math.ceil(lines * lineHeight + frameY) };
  }

  const textWidth = Math.max(
    ...paragraphs.map((p) => lineWidthEm(p, table) * fontSize),
  );
  return {
    width: Math.ceil(textWidth + SAFETY_PX + frameX),
    height: Math.ceil(paragraphs.length * lineHeight + frameY),
  };
}
