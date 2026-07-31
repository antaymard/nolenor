import type { Doc } from "../../_generated/dataModel";
import { getFieldTypeConfig } from "../../config/fieldConfig";
import { buildTemplateLLMSummary } from "../../config/templateConfig";
import { getCustomFieldLLMCodec } from "./customFieldLLMCodecs";

// Helpers LLM pour les custom nodes (nodes templatés par l'utilisateur).
// Les values sont keyées par fieldId : tout affichage passe par le template
// pour retrouver les noms de champs, tout schéma d'écriture est généré à la
// volée depuis les fields du template.

type NodeTemplate = Doc<"nodeTemplates">;

// Catalogue compact pour le system prompt : nom + one-liner uniquement,
// les schémas complets arrivent via read_nodes/list_nodes et les erreurs
// de validation (anti prompt-bloat).
export function formatTemplatesForPrompt(templates: NodeTemplate[]): string {
  const active = templates.filter((t) => t.archivedAt === undefined);
  if (active.length === 0) {
    return "(none — the user has not defined any custom node template yet)";
  }
  return active
    .map(
      (t) =>
        `- templateId: ${t._id} · "${t.name}" : ${
          t.llmDescription?.trim() || buildTemplateLLMSummary(t)
        }`,
    )
    .join("\n");
}

// Contenu d'un custom node en lignes `fieldName (fieldId): value` — le
// fieldId est nécessaire au LLM pour écrire via set_node_data. Async : les
// types dotés d'un codec LLM (rich_text : blocs BlockNote → markdown) sont
// convertis fidèlement, les autres passent par toLLMDisplay (synchrone).
export async function makeCustomNodeDataLLMFriendly(
  nodeData: Doc<"nodeDatas">,
  template: NodeTemplate | null | undefined,
): Promise<string> {
  if (!template) {
    return JSON.stringify(nodeData.values);
  }
  const lines = await Promise.all(
    template.fields.map(async (field) => {
      const config = getFieldTypeConfig(field.type);
      const raw = nodeData.values[field.id];

      const codec = getCustomFieldLLMCodec(field.type);
      const display = codec
        ? await codec.toLLM(raw, field)
        : config.toLLMDisplay
          ? config.toLLMDisplay(raw, field)
          : raw === undefined || raw === null
            ? ""
            : String(raw);
      return `${field.name} (${field.id}): ${display || "(empty)"}`;
    }),
  );
  return lines.join("\n");
}
