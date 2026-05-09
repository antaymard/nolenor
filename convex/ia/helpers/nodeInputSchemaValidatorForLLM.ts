import { z } from "zod";
import { nodeDataConfig, nodeTypeZodValidator } from "../../config/nodeConfig";
import { formatZodSchemaAsMinimap } from "../../lib/jsonSchemaMinimap";

type NodeType = z.infer<typeof nodeTypeZodValidator>;

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `- ${path}: ${issue.message}`;
}

/**
 * Validates tool input against a node's schema and returns a readable string error for LLMs.
 * Returns null when input is valid.
 */
export function validateNodeInputSchemaForLLM({
  nodeType,
  input,
}: {
  nodeType: NodeType;
  input: unknown;
}): string | null {
  const nodeConfig = nodeDataConfig.find((config) => config.type === nodeType);

  if (!nodeConfig) {
    const supportedTypes = nodeTypeZodValidator.options.join(", ");
    return [
      "Input validation failed.",
      `Unknown node type: ${nodeType}.`,
      `Supported node types: ${supportedTypes}.`,
    ].join("\n");
  }

  const schema = nodeConfig.toolInputSchema ?? nodeConfig.dataValuesSchema;
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
