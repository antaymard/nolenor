// `<schema>` entries for the `<nodeDataSchemas>` block that `read_nodes` and
// `list_nodes` append to their output, telling the agent how to write to each
// node type it just saw.
//
// Both tools emitted this identical logic inline; keeping it here means the
// per-type tool lists (notably the blocknote one, which names six tools and two
// wire formats) are declared exactly once.

import type { Doc } from "../../_generated/dataModel";
import { nodeDataConfig } from "../../config/nodeConfig";
import { buildTemplateToolSchema } from "../../config/fieldConfig";
import { formatZodSchemaAsMinimap } from "../../lib/jsonSchemaMinimap";

// Node types whose write surface is a set of dedicated tools rather than a
// `set_node_data` payload, so a schema minimap would be misleading.
// (Named "dedicated tools" rather than "custom" to avoid colliding with the
// "custom" node type, whose schema is template-derived — see below.)
const DEDICATED_TOOLS_SCHEMA_BY_TYPE: Record<string, string> = {
  blocknote:
    '<schema type="blocknote" readFormat="blocknote-xml-v1" setFormat="markdown" blockEditFormat="blocknote-xml-v1" tools="set_node_data,insert_blocks,replace_block,delete_blocks,update_block_props,patch_block_text" />',
  table:
    '<schema type="table" tools="table_update_schema,table_insert_rows,table_update_rows,table_delete_rows" />',
};

/**
 * `<schema>` elements for "custom" (user-templated) nodes. Their write shape
 * comes from the instance's template fields (values keyed by field id), not
 * from the node type — so one element is emitted per distinct template present
 * in the tool's result rather than a single one for the type.
 */
function buildTemplateSchemaXml(templates: Doc<"nodeTemplates">[]): string {
  const unique = new Map(templates.map((t) => [String(t._id), t]));
  return [...unique.values()]
    .map((template) => {
      const minimap = formatZodSchemaAsMinimap(
        buildTemplateToolSchema(template),
      );
      const attrs = `type="custom" templateId="${template._id}" templateName="${template.name}" tool="set_node_data"`;
      return minimap
        ? `<schema ${attrs}>\n${minimap}\n</schema>`
        : `<schema ${attrs} />`;
    })
    .join("\n");
}

/**
 * One `<schema>` element describing how the agent should write to `nodeType`.
 * `customTemplates` is only consulted for the "custom" type, which needs one
 * entry per template rather than one per type.
 */
export function buildNodeDataSchemaXml(
  nodeType: string,
  customTemplates: Doc<"nodeTemplates">[] = [],
): string {
  if (nodeType === "custom") return buildTemplateSchemaXml(customTemplates);

  const dedicated = DEDICATED_TOOLS_SCHEMA_BY_TYPE[nodeType];
  if (dedicated) return dedicated;

  const toolsAttr =
    nodeType === "app"
      ? 'tools="set_node_data,patch_app_node_code"'
      : 'tool="set_node_data"';

  const config = nodeDataConfig.find((item) => item.type === nodeType);
  if (!config) return `<schema type="${nodeType}" ${toolsAttr} />`;

  const minimap = formatZodSchemaAsMinimap(
    config.toolInputSchema ?? config.dataValuesSchema,
  );
  if (!minimap) return `<schema type="${nodeType}" ${toolsAttr} />`;

  return `<schema type="${nodeType}" ${toolsAttr}>\n${minimap}\n</schema>`;
}
