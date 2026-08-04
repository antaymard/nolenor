// Conversion d'un document PlateJS en document BlockNote — pont Markdown.
//
// Volontairement séparé du runner (`plateToBlockNote.ts`) et libre de tout
// import `_generated/*` : la conversion est une fonction pure au sens où elle
// ne touche ni base ni contexte Convex. C'est ce qui permet de la rejouer
// telle quelle sur des documents réels, hors déploiement, plutôt que d'en
// ré-implémenter une copie approximative pour la tester.
//
// Pipeline :
//   values.doc
//     -> parseStoredPlateDocument      (tolère string | array)
//     -> simplifyPlateForMarkdown      (réduction pure au sous-ensemble Markdown)
//     -> simplifiedPlateToMarkdown     (Plate -> Markdown, converter dédié)
//     -> markdownToBlockNoteBlocks     (Markdown -> blocs, + pills date)
//     -> normalizeReplaceDocumentBlocks (pose les ids ET valide)
//     -> garde de fidélité du texte
//     -> JSON.stringify

import { markdownToBlockNoteBlocks } from "../ia/helpers/blockNoteMarkdown";
import {
  extractInlineText,
  normalizeReplaceDocumentBlocks,
} from "../lib/blockNoteDocument";
import { parseStoredPlateDocument } from "../lib/plateDocumentStorage";
import {
  plateDocumentHasSubstance,
  plateVisibleText,
  simplifyPlateForMarkdown,
  type SimplifyStats,
} from "./plateSimplify";
import { simplifiedPlateToMarkdown } from "./plateToBlockNoteMarkdown";

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const EMPTY_DOCUMENT = "[]";

/**
 * Le sérialiseur Markdown de Plate rend un paragraphe vide par un espace de
 * largeur nulle (U+200B), qui deviendrait un bloc BlockNote contenant un
 * caractère invisible. Aucun contenu légitime n'en dépend ici : on les retire
 * avant de mesurer si le Markdown est vide et avant de le reparser.
 */
const ZERO_WIDTH_RE = /[\u200B\uFEFF]/g;

// ── Garde de fidélité du texte ──────────────────────────────────────────────
//
// Le pont Markdown est lossy sur le STYLE, ce qui est assumé. Sur le TEXTE il
// ne doit rien perdre ni rien inventer — or il le fait dans au moins un cas
// réel : un leaf contenant `<b>gras?</b>` est échappé par Plate en
// `\<b>gras?\</b>`, mais BlockNote n'honore pas l'échappement `\<`. Il
// interprète la balise comme du HTML brut et laisse la barre oblique inverse
// dans le texte. Aucune erreur n'est levée — le document serait écrit corrompu.
//
// Plutôt que de traiter ce cas particulier (les contournements testés
// échouent : `&lt;` n'est pas décodé non plus, et l'ensemble des échappements
// reconnus par BlockNote est partiel — `\[` passe, `\<` et `\@` non), on
// compare le texte visible attendu au texte visible produit. Toute divergence
// met le document en quarantaine au lieu de l'écrire.

/** Texte visible d'un arbre de blocs BlockNote, dans l'ordre du document. */
function blockNoteVisibleText(blocks: readonly unknown[]): string {
  let out = "";
  for (const block of blocks) {
    if (block === null || typeof block !== "object") continue;
    const { content, children } = block as {
      content?: unknown;
      children?: unknown;
    };
    if (content !== undefined) out += extractInlineText(content);
    if (Array.isArray(children)) out += blockNoteVisibleText(children);
  }
  return out;
}

const DATE_TOKEN_RE = /\[\[date:\d{4}-\d{2}-\d{2}\]\]/g;

/**
 * Forme comparable des deux textes.
 *
 * - Les tokens `[[date:…]]` sont retirés : côté Plate simplifié ce sont du
 *   texte, côté BlockNote ce sont des pills sans texte. La divergence est
 *   voulue.
 * - Toute espace est supprimée, pas seulement normalisée : la sérialisation
 *   Markdown déplace légitimement des espaces (`<u>a </u>b` devient
 *   `<u>a</u> b`) et joint les cellules d'un tableau ou les lignes d'un bloc de
 *   code avec un séparateur qui n'existe pas côté Plate. Ce qu'on veut vérifier
 *   ici, ce sont les caractères perdus ou ajoutés — pas l'espacement.
 */
function comparableText(text: string): string {
  return text
    .replace(DATE_TOKEN_RE, "")
    .replace(ZERO_WIDTH_RE, "")
    .replace(/\s+/g, "");
}

/** Extrait autour de la première divergence, pour rendre l'échec triable. */
function describeTextDivergence(expected: string, actual: string): string {
  let i = 0;
  while (i < expected.length && i < actual.length && expected[i] === actual[i]) {
    i += 1;
  }
  const from = Math.max(0, i - 20);
  const excerpt = (s: string) => JSON.stringify(s.slice(from, i + 20));
  return `attendu ${excerpt(expected)} (${expected.length} car.), obtenu ${excerpt(actual)} (${actual.length} car.)`;
}

// ── Conversion d'un document ────────────────────────────────────────────────

export type Conversion =
  | { ok: true; doc: string; stats: SimplifyStats }
  | { ok: false; reason: string };

/**
 * Un document vide reste vide ; un document qui AVAIT du contenu mais dont la
 * conversion ne produit rien est un échec, jamais une écriture. Sans ce
 * garde-fou, un bug de sérialisation viderait silencieusement des documents
 * utilisateur, sans aucune trace.
 */
export async function convertDocument(raw: unknown): Promise<Conversion> {
  const parsed = parseStoredPlateDocument(raw);
  if (!parsed) {
    return { ok: false, reason: "document PlateJS illisible (JSON invalide)" };
  }

  const emptyStats: SimplifyStats = { degraded: {}, dropped: {} };
  if (parsed.length === 0) {
    return { ok: true, doc: EMPTY_DOCUMENT, stats: emptyStats };
  }

  const hadSubstance = plateDocumentHasSubstance(parsed);
  const { nodes, stats } = simplifyPlateForMarkdown(parsed);

  let markdown: string;
  try {
    markdown = (await simplifiedPlateToMarkdown(nodes)).replace(ZERO_WIDTH_RE, "");
  } catch (error) {
    return { ok: false, reason: `sérialisation Markdown: ${describeError(error)}` };
  }

  if (markdown.trim() === "") {
    if (hadSubstance) {
      return { ok: false, reason: "le document avait du contenu, le Markdown est vide" };
    }
    return { ok: true, doc: EMPTY_DOCUMENT, stats };
  }

  try {
    const blocks = await markdownToBlockNoteBlocks(markdown);
    if (blocks.length === 0) {
      return { ok: false, reason: "Markdown non vide mais aucun bloc BlockNote produit" };
    }
    // Pose les ids manquants ET valide (ids uniques, types inline connus,
    // grille de table cohérente) : un document invalide lève ici, avant toute
    // écriture.
    const normalized = normalizeReplaceDocumentBlocks(blocks);

    const expected = comparableText(plateVisibleText(nodes));
    const actual = comparableText(blockNoteVisibleText(normalized));
    if (expected !== actual) {
      return {
        ok: false,
        reason: `texte altéré par la conversion — ${describeTextDivergence(expected, actual)}`,
      };
    }

    return { ok: true, doc: JSON.stringify(normalized), stats };
  } catch (error) {
    return { ok: false, reason: `conversion BlockNote: ${describeError(error)}` };
  }
}
