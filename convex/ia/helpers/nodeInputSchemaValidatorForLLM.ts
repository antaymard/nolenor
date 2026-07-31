import { z } from "zod";
import type { Doc } from "../../_generated/dataModel";
import { nodeDataConfig, nodeTypeZodValidator } from "../../config/nodeConfig";
import { buildTemplateToolSchema } from "../../config/fieldConfig";
import { formatZodSchemaAsMinimap } from "../../lib/jsonSchemaMinimap";

type NodeType = z.infer<typeof nodeTypeZodValidator>;

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `- ${path}: ${issue.message}`;
}

/**
 * Validates tool input against a node's schema and returns a readable string error for LLMs.
 * Returns null when input is valid.
 * For custom nodes, the schema is built at runtime from the node's template
 * (values keyed by fieldId) — `template` is then required.
 */
export function validateNodeInputSchemaForLLM({
  nodeType,
  input,
  template,
}: {
  nodeType: NodeType;
  input: unknown;
  template?: Doc<"nodeTemplates"> | null;
}): string | null {
  let schema: z.ZodTypeAny;

  if (nodeType === "custom") {
    if (!template) {
      return [
        "Input validation failed.",
        "This custom node has no resolvable template (missing or deleted).",
        "Read the node with read_nodes to inspect its raw values.",
      ].join("\n");
    }
    schema = buildTemplateToolSchema(template);
  } else {
    const nodeConfig = nodeDataConfig.find(
      (config) => config.type === nodeType,
    );

    if (!nodeConfig) {
      const supportedTypes = nodeTypeZodValidator.options.join(", ");
      return [
        "Input validation failed.",
        `Unknown node type: ${nodeType}.`,
        `Supported node types: ${supportedTypes}.`,
      ].join("\n");
    }

    schema = nodeConfig.toolInputSchema ?? nodeConfig.dataValuesSchema;
  }

  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return null;
  }

  const incorrectFields = parsed.error.issues.map(formatIssue).join("\n");
  const minimap =
    formatZodSchemaAsMinimap(schema) ?? "Schema serialization is unavailable.";

  return [
    "Input validation failed.",
    `Node type: ${nodeType}`,
    "Incorrect fields:",
    incorrectFields || "- (unknown issue)",
    "Expected schema:",
    minimap,
    "Please provide only a JSON object that strictly matches this schema.",
  ].join("\n");
}
