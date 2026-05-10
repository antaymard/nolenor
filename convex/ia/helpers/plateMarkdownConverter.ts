/* eslint-disable @typescript-eslint/no-explicit-any */
import { installServerDomPolyfills } from "./serverDomPolyfills";

type MarkdownConverter = {
  api: {
    markdown: {
      deserialize(markdown: string): any[];
      serialize(args: { value: any[] }): string;
    };
  };
};

// Lazy singleton — Plate packages are loaded only on first actual conversion,
// after the server-side DOM polyfills have been installed.
let _converterPromise: Promise<MarkdownConverter> | null = null;

async function getConverter(): Promise<MarkdownConverter> {
  if (!_converterPromise) {
    _converterPromise = (async () => {
      installServerDomPolyfills();

      const [
        { createSlateEditor },
        {
          MarkdownPlugin,
          convertChildrenDeserialize,
          remarkMdx,
          remarkMention,
        },
        { BaseListPlugin },
        { default: remarkGfm },
        { default: remarkMath },
        { buildPillMarkdownRules },
      ] = await Promise.all([
        import("@platejs/core"),
        import("@platejs/markdown"),
        import("@platejs/list"),
        import("remark-gfm"),
        import("remark-math"),
        import("./pillMarkdownRules"),
      ]);

      const pillMarkdownRules = buildPillMarkdownRules(
        convertChildrenDeserialize,
      );

      return createSlateEditor({
        plugins: [
          BaseListPlugin,
          MarkdownPlugin.configure({
            options: {
              remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
              rules: {
                ...pillMarkdownRules,
                // Pour la sérialisation Plate→Markdown (lecture par le LLM) :
                // on convertit les éléments `date` en texte lisible plutôt qu'en MDX.
                date: {
                  serialize: (slateNode: any) => {
                    if (!slateNode.date) {
                      return { type: "text", value: "[Date non définie]" };
                    }
                    const d = new Date(slateNode.date);
                    return {
                      type: "text",
                      value: d.toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }),
                    };
                  },
                },
              },
            },
          }),
        ],
      }) as MarkdownConverter;
    })();
  }
  return _converterPromise;
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
