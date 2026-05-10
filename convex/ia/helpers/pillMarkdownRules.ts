/* eslint-disable @typescript-eslint/no-explicit-any */

type ConvertChildrenDeserialize = (
  children: any,
  deco: any,
  options: any,
) => any;

/**
 * Règles markdown pour le mark custom "pill".
 *
 * Sérialisation :  { text: "texte", pill: "blue" } → <pill color="blue">texte</pill>
 * Désérialisation : <pill color="blue">texte</pill> → { text: "texte", pill: "blue" }
 *
 * Nécessite remarkMdx dans les remarkPlugins.
 * Fichier dupliqué de src/components/plate/pillMarkdownRules.ts pour le runtime Convex.
 */
export function buildPillMarkdownRules(
  convertChildrenDeserialize: ConvertChildrenDeserialize,
) {
  return {
    pill: {
      mark: true,
      deserialize: (mdastNode: any, deco: any, options: any) => {
        const colorAttr = mdastNode.attributes?.find(
          (attr: any) => attr.name === "color",
        );
        const color = colorAttr?.value || "default";
        return convertChildrenDeserialize(
          mdastNode.children,
          { pill: color, ...deco },
          options,
        ) as any;
      },
      serialize: (slateNode: any) => {
        const color =
          typeof slateNode.pill === "string" ? slateNode.pill : "default";
        return {
          type: "mdxJsxTextElement",
          name: "pill",
          attributes:
            color !== "default"
              ? [{ type: "mdxJsxAttribute", name: "color", value: color }]
              : [],
          children: [{ type: "text", value: slateNode.text || "" }],
        };
      },
    },
  };
}
