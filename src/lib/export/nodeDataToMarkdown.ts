import type { Doc } from "@/../convex/_generated/dataModel";
import { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";
import { parseStoredBlockNoteDocument } from "@/../convex/lib/blockNoteDocument";
import { getFieldTypeConfig } from "@/../convex/config/fieldConfig";
import type { PartialBlock } from "@blocknote/core";
import { blockNoteBlocksToMarkdown } from "@/lib/blockNoteMarkdownConverter";
import type { ExportTemplate } from "./types";

/**
 * Rendu Markdown lisible d'un nodeData, pour l'export utilisateur.
 *
 * Volontairement lossy : c'est la version « je relis mes notes ailleurs ».
 * La fidélité totale est assurée par les `nodes.json` posés à côté dans
 * l'archive, donc aucun chemin ici n'a le droit de faire échouer l'export —
 * en cas de doute on tombe sur un bloc JSON plutôt que de throw.
 */

function fence(content: string, lang = ""): string {
  // Un contenu qui embarque déjà ``` casserait la clôture du bloc : on
  // allonge la barrière jusqu'à dépasser la plus longue séquence présente.
  const longest = [...content.matchAll(/`{3,}/g)].reduce(
    (max, m) => Math.max(max, m[0].length),
    2,
  );
  const bar = "`".repeat(longest + 1);
  return `${bar}${lang}\n${content}\n${bar}`;
}

function jsonBlock(value: unknown): string {
  try {
    return fence(JSON.stringify(value, null, 2), "json");
  } catch {
    return fence(String(value));
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `[label](url)`, avec un label de secours et l'échappement des `]`. */
function link(label: string, url: string): string {
  const safeLabel = (label || url || "untitled").replace(/[[\]]/g, "\\$&");
  return url ? `[${safeLabel}](${url})` : safeLabel;
}

/** Escape des `|` et des retours ligne, pour une cellule de table GFM. */
function tableCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const record = asRecord(value);
  if (record && typeof record.href === "string") {
    return link(asString(record.pageTitle), record.href).replace(/\|/g, "\\|");
  }
  if (typeof value === "boolean") return value ? "x" : "";
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

// ── Rich text ──────────────────────────────────────────────────────────────

/**
 * BlockNote → Markdown, dans le navigateur.
 *
 * On passe par `createSafeBlockNoteEditor` (et non `BlockNoteEditor.create`
 * directement) parce que certains documents historiques font throw la
 * construction ProseMirror. L'éditeur de secours est vide : quand le statut
 * n'est pas "ok" on le signale dans le Markdown au lieu de rendre du silence.
 *
 * Note : le chemin serveur équivalent (convex/ia/helpers/blockNoteMarkdown.ts)
 * passe par jsdom derrière un verrou global sérialisé — inutilisable pour
 * convertir des centaines de nodes. Ici le DOM est déjà là.
 */
// Synchrone dans @blocknote/core (contrairement au chemin serveur, qui doit
// attendre le jsdom) — la fonction reste `async` pour une seule signature
// côté appelants.
async function blockNoteValueToMarkdown(
  value: unknown,
): Promise<string | null> {
  const blocks = parseStoredBlockNoteDocument(value);
  if (!blocks || blocks.length === 0) return null;

  const result = blockNoteBlocksToMarkdown(blocks as unknown as PartialBlock[]);
  if (result.status !== "ok") {
    return "> This content could not be read back by the editor. Its raw version is intact in `nodes.json`.";
  }
  return result.markdown || null;
}

// ── Corps par type de node ─────────────────────────────────────────────────

async function renderBody(
  nodeData: Doc<"nodeDatas">,
  template: ExportTemplate | undefined,
): Promise<string> {
  const values = nodeData.values ?? {};

  switch (nodeData.type) {
    case "title": {
      const text = asString(values.text);
      if (!text) return "_Vide_";
      const level = asString(values.level);
      const hashes = { h1: "#", h2: "##", h3: "###" }[level];
      return hashes ? `${hashes} ${text}` : text;
    }


    case "blocknote":
      return (await blockNoteValueToMarkdown(values.doc)) ?? "_Document vide_";

    case "link": {
      const linkValue = asRecord(values.link);
      if (!linkValue) return "_Aucun lien_";
      const href = asString(linkValue.href);
      const lines = [link(asString(linkValue.pageTitle), href)];
      const description = asString(linkValue.pageDescription);
      if (description) lines.push("", description);
      return lines.join("\n");
    }

    case "embed": {
      const embed = asRecord(values.embed);
      if (!embed) return "_Aucun contenu embarqué_";
      const url = asString(embed.url) || asString(embed.embedUrl);
      const title = asString(embed.title);
      const kind = asString(embed.type);
      const lines = [link(title || url, url)];
      if (kind) lines.push("", `Type : ${kind}`);
      return lines.join("\n");
    }

    case "value": {
      const value = asRecord(values.value);
      if (!value) return "_Aucune valeur_";
      const label = asString(value.label);
      const unit = asString(value.unit);
      const raw = value.value;
      const rendered =
        typeof raw === "boolean" ? (raw ? "oui" : "non") : String(raw ?? "");
      const withUnit = unit ? `${rendered} ${unit}` : rendered;
      return label ? `**${label}** : ${withUnit}` : withUnit;
    }

    case "table": {
      const table = asRecord(values.table);
      const columns = asArray(table?.columns)
        .map(asRecord)
        .filter((column): column is Record<string, unknown> => column !== null);
      const rows = asArray(table?.rows);

      if (columns.length === 0) return "_Table vide_";

      const header = `| ${columns.map((c) => tableCell(c.name)).join(" | ")} |`;
      const separator = `| ${columns.map(() => "---").join(" | ")} |`;
      const body = rows.map((row) => {
        const cells = asRecord(asRecord(row)?.cells) ?? {};
        return `| ${columns
          .map((column) => tableCell(cells[asString(column.id)]))
          .join(" | ")} |`;
      });

      return [header, separator, ...body].join("\n");
    }

    case "image": {
      const images = asArray(values.images).map(asRecord);
      if (images.length === 0) return "_Aucune image_";
      return images
        .map((image, index) => {
          const url = asString(image?.url);
          const filename = asString(image?.filename) || `image-${index + 1}`;
          return url ? `![${filename}](${url})` : `- ${filename} _(URL absente)_`;
        })
        .join("\n\n");
    }

    case "pdf": {
      const files = asArray(values.files).map(asRecord);
      if (files.length === 0) return "_Aucun fichier_";
      return files
        .map((file) => `- ${link(asString(file?.filename), asString(file?.url))}`)
        .join("\n");
    }

    case "audio": {
      const audio = asRecord(values.audio);
      if (!audio) return "_Aucun fichier audio_";
      const lines = [
        `- ${link(
          asString(audio.label) || asString(audio.title) || asString(audio.filename),
          asString(audio.url),
        )}`,
      ];
      const artist = asString(audio.artist);
      if (artist) lines.push(`- Artiste : ${artist}`);
      const cover = asRecord(audio.cover);
      const coverUrl = asString(cover?.url);
      if (coverUrl) lines.push(`- Pochette : ${link("cover", coverUrl)}`);
      return lines.join("\n");
    }

    case "app": {
      const code = asString(values.code);
      if (!code) return "_Aucun code_";
      return fence(code, "jsx");
    }

    case "custom": {
      if (!template || template.fields.length === 0) return jsonBlock(values);

      const sections = template.fields.map(async (field) => {
        const value = values[field.id];
        if (value === undefined || value === null || value === "") {
          return `## ${field.name}\n\n_Vide_`;
        }

        // rich_text a droit à un vrai rendu Markdown ; pour tout le reste
        // `toLLMDisplay` du fieldConfig est déjà la forme lisible canonique
        // (ids de select → labels, unités des nombres, URL des images…).
        if (field.type === "rich_text") {
          const markdown = await blockNoteValueToMarkdown(value);
          return `## ${field.name}\n\n${markdown ?? "_Vide_"}`;
        }

        const display = getFieldTypeConfig(field.type).toLLMDisplay?.(
          value,
          field,
        );
        const rendered =
          display && display.length > 0
            ? field.type === "image"
              ? `![${field.name}](${display})`
              : display
            : jsonBlock(value);

        return `## ${field.name}\n\n${rendered}`;
      });

      return (await Promise.all(sections)).join("\n\n");
    }

    default:
      return jsonBlock(values);
  }
}

// ── Entrée publique ────────────────────────────────────────────────────────

export async function nodeDataToMarkdown(
  nodeData: Doc<"nodeDatas">,
  templatesById: Map<string, ExportTemplate>,
): Promise<string> {
  const template = nodeData.templateId
    ? templatesById.get(nodeData.templateId)
    : undefined;

  const title = getNodeDataTitle(nodeData, template);
  const updatedAt = new Date(nodeData.updatedAt).toISOString().slice(0, 10);
  const typeLabel = template?.name
    ? `${nodeData.type} · ${template.name}`
    : nodeData.type;

  let body: string;
  try {
    body = await renderBody(nodeData, template);
  } catch (error) {
    // Un node illisible ne fait pas tomber l'export : il part avec ses values
    // brutes et l'archive reste complète.
    console.error(
      `[export] Rendu Markdown impossible pour le node ${nodeData._id}, repli sur le JSON brut:`,
      error,
    );
    body = [
      "> This node could not be converted to Markdown. Here is its raw data.",
      "",
      jsonBlock(nodeData.values),
    ].join("\n");
  }

  return `# ${title}\n\n_${typeLabel} · updated ${updatedAt}_\n\n${body}\n`;
}
