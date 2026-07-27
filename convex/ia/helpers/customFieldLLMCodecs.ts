import type { FieldType } from "../../schemas/fieldTypeSchema";
import type { TemplateField } from "../../config/fieldConfig";
import {
  parseStoredBlockNoteDocument,
  stringifyBlockNoteDocumentForStorage,
  type BlockNoteBlock,
} from "../../lib/blockNoteDocument";
import { blocksToMarkdown, markdownToBlockNoteBlocks } from "./blockNoteMarkdown";

// Couche 1.5 du design "variants de champs" : traduction entre la forme
// STOCKÉE d'une value de champ custom et la forme que l'agent manipule.
//
// Ce module est délibérément SÉPARÉ de convex/config/fieldConfig.ts et ne doit
// jamais y être importé : les conversions markdown ↔ BlockNote passent par
// jsdom (headlessBlockNote), et fieldConfig est à la fois importé par le front
// et analysé par Convex au déploiement — un import top-level de cette chaîne
// suffirait à faire échouer l'analyse ("document is not defined").
//
// Les deux sens vivent ici ensemble parce qu'ils sont l'exacte symétrie l'un
// de l'autre : avant, l'entrée (markdown → doc) était un cas spécial de
// setNodeDataTool et la sortie (doc → markdown) un cas spécial de
// customTemplateHelpers, sans que rien ne garantisse qu'ils restent alignés.

type LLMCodec = {
  // Ce que le LLM a écrit → ce qu'on persiste.
  fromLLM: (raw: unknown, field: TemplateField) => Promise<unknown>;
  // Ce qu'on a stocké → ce que le LLM lit.
  toLLM: (value: unknown, field: TemplateField) => Promise<string>;
};

const customFieldLLMCodecs: Partial<Record<FieldType, LLMCodec>> = {
  rich_text: {
    fromLLM: async (raw) => {
      // null = effacement explicite du champ, à laisser passer tel quel.
      if (raw === null) return null;
      if (typeof raw !== "string") return raw;
      const blocks = await markdownToBlockNoteBlocks(raw);
      return stringifyBlockNoteDocumentForStorage(blocks);
    },
    toLLM: async (value) => {
      const parsed = parseStoredBlockNoteDocument(value);
      if (!parsed || parsed.length === 0) return "";
      return blocksToMarkdown(parsed as BlockNoteBlock[]);
    },
  },
};

function getCustomFieldLLMCodec(type: FieldType): LLMCodec | undefined {
  return customFieldLLMCodecs[type];
}

// Applique les codecs d'entrée sur une map de values écrite par l'agent.
// Mute et retourne la map reçue (elle est déjà une copie de travail locale au
// call-site du tool).
async function decodeLLMValuesForTemplate(
  values: Record<string, unknown>,
  fields: TemplateField[],
): Promise<Record<string, unknown>> {
  for (const field of fields) {
    if (!(field.id in values)) continue;
    const codec = getCustomFieldLLMCodec(field.type);
    if (!codec) continue;
    values[field.id] = await codec.fromLLM(values[field.id], field);
  }
  return values;
}

export {
  customFieldLLMCodecs,
  getCustomFieldLLMCodec,
  decodeLLMValuesForTemplate,
};
export type { LLMCodec };
