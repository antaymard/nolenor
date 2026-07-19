import type { Doc } from "../_generated/dataModel";
import { parseStoredPlateDocument } from "./plateDocumentStorage";

// `template` : requis pour un titre exact des nodes custom (titleFieldId).
// Les call-sites qui n'ont pas le template sous la main retombent sur une
// heuristique (première value texte courte) puis "Custom node".
export function getNodeDataTitle(
  nodeData: Doc<"nodeDatas">,
  template?: { name: string; titleFieldId?: string } | null,
): string {
  switch (nodeData.type) {
    case "document": {
      const doc = nodeData.values.doc;
      const docValue = parseStoredPlateDocument(doc);

      if (!docValue || docValue.length === 0) return "Document";

      const firstBlock = docValue[0] as {
        type?: string;
        children?: Array<{ text?: unknown }>;
      };

      if (firstBlock.type === "h1" || firstBlock.type === "h2") {
        const title = (firstBlock.children ?? [])
          .map((child) => (typeof child.text === "string" ? child.text : ""))
          .join(" ")
          .trim();
        return title || "Document";
      }

      return "Document";
    }

    case "link": {
      const link = nodeData.values.link as
        | { pageTitle?: unknown; href?: unknown }
        | undefined;

      return (
        (typeof link?.pageTitle === "string" ? link.pageTitle : undefined) ||
        (typeof link?.href === "string" ? link.href : undefined) ||
        "Link"
      );
    }

    case "embed": {
      const embed = nodeData.values.embed as { title?: unknown } | undefined;
      return typeof embed?.title === "string" ? embed.title : "Embed";
    }

    case "value": {
      const val = nodeData.values.value as { label?: unknown } | undefined;
      return typeof val?.label === "string" ? val.label : "Value";
    }

    case "pdf": {
      const files = nodeData.values.files as
        | Array<{ filename?: unknown }>
        | undefined;
      return typeof files?.[0]?.filename === "string"
        ? files[0].filename
        : "PDF";
    }

    case "image": {
      const images = nodeData.values.images as
        | Array<{ filename?: unknown }>
        | undefined;
      return typeof images?.[0]?.filename === "string"
        ? images[0].filename
        : "Image";
    }

    case "title": {
      const text = nodeData.values.text;
      return typeof text === "string" && text.length > 0 ? text : "Title";
    }

    case "table": {
      const title = nodeData.values.title;
      return typeof title === "string" ? title : "Table";
    }

    case "app": {
      const title = nodeData.values.title;
      return typeof title === "string" ? title : "App";
    }

    case "custom": {
      if (template?.titleFieldId) {
        const title = nodeData.values[template.titleFieldId];
        if (typeof title === "string" && title.trim().length > 0) {
          return title;
        }
      }
      if (template?.name) return template.name;

      // Values keyées par fieldId : sans template résolu, on prend la
      // première value texte plausible (courte, pas du JSON sérialisé).
      for (const value of Object.values(nodeData.values ?? {})) {
        if (
          typeof value === "string" &&
          value.trim().length > 0 &&
          value.length <= 120 &&
          !value.startsWith("[") &&
          !value.startsWith("{")
        ) {
          return value;
        }
      }
      return "Custom node";
    }

    default:
      return nodeData.type ?? "Node";
  }
}
