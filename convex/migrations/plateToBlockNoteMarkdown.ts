/* eslint-disable @typescript-eslint/no-explicit-any */
// Étape 2 du pont Markdown : sérialiser en Markdown le document Plate déjà
// réduit par `simplifyPlateForMarkdown`.
//
// Converter DÉDIÉ à la migration, volontairement distinct de
// `convex/ia/helpers/plateMarkdownConverter.ts` : celui-là sert le chemin
// agent (règles MDX `pill`, `remarkMention`, `date` rendu en français) et ne
// doit pas bouger. Ici on veut l'inverse — un Markdown le plus neutre
// possible, sans MDX, parce que la sortie est reparsée par BlockNote et que
// tout ce qu'il ne comprend pas ressortirait en texte littéral.
//
// Comme dans le converter agent, TOUS les imports Plate sont dynamiques :
// Convex analyse les modules de `convex/**` au déploiement, et un import Plate
// top-level suffit à faire échouer cette analyse avec `document is not
// defined`. Le chargement est mémoïsé, donc payé une seule fois pour toute la
// migration.

type MarkdownConverter = {
  api: { markdown: { serialize(args: { value: any[] }): string } };
};

let converterPromise: Promise<MarkdownConverter> | null = null;

async function loadConverter(): Promise<MarkdownConverter> {
  const [
    { createSlateEditor },
    { MarkdownPlugin, remarkMdx },
    { BaseListPlugin },
    { default: remarkGfm },
  ] = await Promise.all([
    import("platejs"),
    import("@platejs/markdown"),
    import("@platejs/list"),
    import("remark-gfm"),
  ]);

  return createSlateEditor({
    plugins: [
      // Indispensable : en Plate v53 les listes ne sont pas des types de nœuds
      // mais les propriétés `listStyleType` / `indent` / `checked` posées sur
      // des `p`. C'est ce plugin qui les retransforme en listes Markdown
      // imbriquées — sans lui, toutes les listes deviennent des paragraphes.
      BaseListPlugin,
      MarkdownPlugin.configure({
        options: {
          // `remarkGfm` porte les tableaux et les cases à cocher.
          //
          // `remarkMdx` est nécessaire pour UNE seule règle : `underline`, que
          // @platejs/markdown sérialise en `<u>` — un nœud `mdxJsxTextElement`
          // que `mdast-util-to-markdown` ne sait pas rendre sans lui (il lève
          // `Cannot handle unknown node "mdxJsxTextElement"`). Et ça vaut le
          // coup : BlockNote reparse `<u>texte</u>` en
          // `styles: { underline: true }`, donc le souligné traverse le pont
          // sans perte.
          //
          // C'est la SEULE règle émettrice de MDX encore atteignable ici.
          // Toutes les autres — `comment`, `date`, `highlight`, `kbd`,
          // `subscript`, `superscript`, `suggestion`, les `fontRules`
          // (color / backgroundColor / fontSize / fontFamily), les
          // `mediaRules` (audio / file / media_embed / video) et les
          // `columnRules` — sont retirées ou converties en amont par
          // `simplifyPlateForMarkdown`. C'est ce qui permet de réactiver
          // `remarkMdx` sans réintroduire le texte parasite (`<pill …>`) qui
          // avait motivé son retrait.
          remarkPlugins: [remarkGfm, remarkMdx],
        },
      }),
    ],
  });
}

function getConverter(): Promise<MarkdownConverter> {
  converterPromise ??= loadConverter();
  return converterPromise;
}

/** Document Plate (déjà simplifié) → Markdown neutre. */
export async function simplifiedPlateToMarkdown(nodes: any[]): Promise<string> {
  const converter = await getConverter();
  return converter.api.markdown.serialize({ value: nodes });
}
