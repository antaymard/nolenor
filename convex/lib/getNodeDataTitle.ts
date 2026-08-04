import type { Doc } from "../_generated/dataModel";
import {
  extractInlineText,
  parseStoredBlockNoteDocument,
} from "./blockNoteDocument";

// `template` : requis pour un titre exact des nodes custom (titleFieldId).
// Les call-sites qui n'ont pas le template sous la main retombent sur une
// heuristique (première value texte courte) puis "Custom node".
export function getNodeDataTitle(
  nodeData: Doc<"nodeDatas">,
  template?: { name: string; titleFieldId?: string } | null,
): string {
  switch (nodeData.type) {
    case "blocknote": {
      const docValue = parseStoredBlockNoteDocument(nodeData.values.doc);
      const firstBlock = docValue?.[0];

      // Only a leading heading block names the node.
      if (firstBlock?.type !== "heading") return "Blocknote";
      return extractInlineText(firstBlock.content).trim() || "Blocknote";
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

    case "audio": {
      const audio = nodeData.values.audio as
        | {
            label?: unknown;
            artist?: unknown;
            title?: unknown;
            filename?: unknown;
          }
        | null
        | undefined;

      const str = (value: unknown): string | undefined =>
        typeof value === "string" && value.trim().length > 0
          ? value.trim()
          : undefined;

      // A name the user typed beats the file's own tags, which in turn beat
      // the filename — "01 - Track.mp3" is nobody's idea of a title.
      const label = str(audio?.label);
      if (label) return label;

      const title = str(audio?.title);
      const artist = str(audio?.artist);
      if (title) return artist ? `${artist} — ${title}` : title;

      return str(audio?.filename) ?? "Audio";
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
