/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildPillMarkdownRules } from "./pillMarkdownRules";

type MarkdownConverter = {
  api: {
    markdown: {
      deserialize(markdown: string): any[];
      serialize(args: { value: any[] }): string;
    };
  };
};

/**
 * Convex analyse les modules de `convex/**` au déploiement.
 *
 * Des imports Plate top-level suffisent à faire échouer cette analyse avec
 * `document is not defined`, même si le même code fonctionne ensuite en Node.
 *
 * Le "surcoût" de ce helper est donc volontairement concentré ici :
 * - premier appel : chargement dynamique des modules Plate/remark + création de l'éditeur
 * - appels suivants : réutilisation de la même promesse, donc plus de rechargement
 */
let converterPromise: Promise<MarkdownConverter> | null = null;

function serializeDateToMarkdown(slateNode: any) {
  if (!slateNode.date) {
    return { type: "text", value: "[Date non définie]" };
  }

  const date = new Date(slateNode.date);

  return {
    type: "text",
    value: date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

async function loadConverterDependencies() {
  const [
    { createSlateEditor },
    { MarkdownPlugin, remarkMdx, remarkMention },
    { BaseListPlugin },
    { default: remarkGfm },
    { default: remarkMath },
    pillMarkdownRules,
  ] = await Promise.all([
    import("platejs"),
    import("@platejs/markdown"),
    import("@platejs/list"),
    import("remark-gfm"),
    import("remark-math"),
    buildPillMarkdownRules(),
  ]);

  return {
    createSlateEditor,
    MarkdownPlugin,
    remarkMdx,
    remarkMention,
    BaseListPlugin,
    remarkGfm,
    remarkMath,
    pillMarkdownRules,
  };
}

async function getConverter(): Promise<MarkdownConverter> {
  if (!converterPromise) {
    converterPromise = loadConverterDependencies().then(
      ({
        createSlateEditor,
        MarkdownPlugin,
        remarkMdx,
        remarkMention,
        BaseListPlugin,
        remarkGfm,
        remarkMath,
        pillMarkdownRules,
      }) => {
        return createSlateEditor({
          plugins: [
            // Garde le même comportement que le front pour le round-trip markdown.
            BaseListPlugin,
            MarkdownPlugin.configure({
              options: {
                remarkPlugins: [
                  remarkMath,
                  remarkGfm,
                  remarkMdx,
                  remarkMention,
                ],
                rules: {
                  ...pillMarkdownRules,
                  date: {
                    // Côté LLM on préfère du texte lisible à un nœud MDX spécifique.
                    serialize: serializeDateToMarkdown,
                  },
                },
              },
            }),
          ],
        });
      },
    );
  }

  return converterPromise;
}

/**
 * Convertit une chaîne Markdown en Plate.js JSON (Slate Value).
 */
export async function markdownToPlateJson(markdown: string): Promise<any[]> {
  const converter = await getConverter();
  return converter.api.markdown.deserialize(markdown);
}

/**
 * Convertit du Plate.js JSON (Slate Value) en chaîne Markdown.
 * Avec `withBlockId: true`, préfixe chaque bloc de premier niveau par `[block:id]`.
 */
export async function plateJsonToMarkdown(
  nodes: any[],
  options?: { withBlockId?: boolean },
): Promise<string> {
  const converter = await getConverter();
  if (!options?.withBlockId) {
    return converter.api.markdown.serialize({ value: nodes });
  }

  return nodes
    .map((node) => {
      const md = converter.api.markdown.serialize({ value: [node] }).trim();
      if (node.id && md) {
        return `[block:${node.id}]\n${md}`;
      }
      return md;
    })
    .filter(Boolean)
    .join("\n\n");
}
