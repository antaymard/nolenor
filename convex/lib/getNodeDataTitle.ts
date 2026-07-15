import type { Doc } from "../_generated/dataModel";
import { parseStoredPlateDocument } from "./plateDocumentStorage";

export function getNodeDataTitle(nodeData: Doc<"nodeDatas">): string {
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

    case "blocknote": {
      const doc = nodeData.values.doc;
      const docValue = parseStoredPlateDocument(doc);

      if (!docValue || docValue.length === 0) return "Blocknote";

      const firstBlock = docValue[0] as {
        type?: string;
        props?: { level?: unknown };
        content?: unknown;
      };

      // BlockNote heading blocks have type "heading" with props.level (1-6).
      // Extract text from the content array (inline nodes with `text` field).
      const extractText = (content: unknown): string => {
        if (!Array.isArray(content)) return "";
        return content
          .map((child) => {
            if (!child || typeof child !== "object") return "";
            const c = child as { text?: unknown; content?: unknown };
            if (typeof c.text === "string") return c.text;
            if (c.content) return extractText(c.content);
            return "";
          })
          .join("")
          .trim();
      };

      if (firstBlock.type === "heading") {
        const title = extractText(firstBlock.content);
        return title || "Blocknote";
      }

      return "Blocknote";
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

    default:
      return nodeData.type ?? "Node";
  }
}
