/**
 * Génère `convex/lib/titleFontMetrics.ts` : les chasses de Nunito (400 et
 * 600) et ses paires de crénage les plus marquées, en em.
 *
 * Le serveur dimensionne les title nodes sans DOM ni canvas (cf.
 * `convex/lib/titleNodeSizing.ts`) : il lui faut une table figée de la police
 * que le client affiche. On la mesure une fois ici, dans Chromium, avec les
 * fichiers de police que sert Google Fonts (via fontsource), pour que les
 * chiffres soient ceux du navigateur et pas ceux d'un parseur de police.
 *
 * À relancer seulement si la police ou les graisses des titres changent :
 *
 *   npm i --no-save @fontsource/nunito playwright-core
 *   node scripts/generateTitleFontMetrics.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const fontDir = path.join(
  path.dirname(require.resolve("@fontsource/nunito/package.json")),
  "files",
);
const outFile = path.resolve("convex/lib/titleFontMetrics.ts");

const WEIGHTS = [400, 600];
// Sous ce seuil (en em), une paire de crénage ne vaut pas sa place dans le
// fichier : l'erreur cumulée reste autour du pixel sur un long h1.
const KERNING_THRESHOLD_EM = 0.02;

const CODE_POINTS = [
  ...range(0x20, 0x7e), // ASCII imprimable
  ...range(0xa0, 0x17f), // Latin-1 + Latin étendu A
  0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac,
  0x2192,
];

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const fontFaces = WEIGHTS.flatMap((weight) =>
  ["latin-ext", "latin"].map((subset) => {
    const file = path.join(fontDir, `nunito-${subset}-${weight}-normal.woff2`);
    const data = fs.readFileSync(file).toString("base64");
    return `@font-face{font-family:Nunito;font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2");}`;
  }),
).join("\n");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();
await page.setContent(`<style>${fontFaces}</style>`);

const metrics = await page.evaluate(
  async ({ weights, codePoints, threshold }) => {
    for (const weight of weights) await document.fonts.load(`${weight} 16px Nunito`);
    const ctx = document.createElement("canvas").getContext("2d");
    const chars = codePoints.map((cp) => String.fromCodePoint(cp));
    const pairChars = chars.filter((c) => c > " " && c <= "~");
    const round = (n) => Math.round(n * 1000);

    return weights.map((weight) => {
      ctx.font = `${weight} 1000px Nunito`;
      const em = (s) => ctx.measureText(s).width / 1000;
      const advances = chars.map((c) => round(em(c)));
      const kerningPairs = [];
      const kerningValues = [];
      for (const a of pairChars) {
        for (const b of pairChars) {
          const k = em(a + b) - em(a) - em(b);
          if (Math.abs(k) < threshold) continue;
          kerningPairs.push(a + b);
          kerningValues.push(round(k));
        }
      }
      return { weight, advances, kerningPairs, kerningValues };
    });
  },
  { weights: WEIGHTS, codePoints: CODE_POINTS, threshold: KERNING_THRESHOLD_EM },
);
await browser.close();

const chars = CODE_POINTS.map((cp) => String.fromCodePoint(cp)).join("");
const lines = [
  "// Généré par scripts/generateTitleFontMetrics.mjs — ne pas éditer à la main.",
  "// Nunito, mesurée dans Chromium. Valeurs en millièmes d'em.",
  "",
  "/** Les caractères couverts par `advances`, dans le même ordre. */",
  `export const METRIC_CHARS = ${JSON.stringify(chars)};`,
  "",
  "export const NUNITO_METRICS: Record<",
  "  400 | 600,",
  "  { advances: number[]; kerningPairs: string; kerningValues: number[] }",
  "> = {",
  ...metrics.flatMap(({ weight, advances, kerningPairs, kerningValues }) => [
    `  ${weight}: {`,
    `    advances: [${advances.join(",")}],`,
    "    // Paires de deux caractères ASCII, concaténées.",
    `    kerningPairs: ${JSON.stringify(kerningPairs.join(""))},`,
    `    kerningValues: [${kerningValues.join(",")}],`,
    "  },",
  ]),
  "};",
  "",
];
fs.writeFileSync(outFile, lines.join("\n"));
console.log(`Wrote ${outFile}`);
