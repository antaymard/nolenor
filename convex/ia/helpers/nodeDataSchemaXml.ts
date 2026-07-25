// `<schema>` entries for the `<nodeDataSchemas>` block that `read_nodes` and
// `list_nodes` append to their output, telling the agent how to write to each
// node type it just saw.
//
// Both tools emitted this identical logic inline; keeping it here means the
// per-type tool lists (notably the blocknote one, which names six tools and two
// wire formats) are declared exactly once.

import { nodeDataConfig } from "../../config/nodeConfig";
import { formatZodSchemaAsMinimap } from "../../lib/jsonSchemaMinimap";

// Node types whose write surface is a set of dedicated tools rather than a
// `set_node_data` payload, so a schema minimap would be misleading.
const CUSTOM_SCHEMA_BY_TYPE: Record<string, string> = {
  document:
    '<schema type="document" tools="insert_document_content,string_replace_document_content" />',
  blocknote:
    '<schema type="blocknote" readFormat="blocknote-xml-v1" setFormat="markdown" blockEditFormat="blocknote-xml-v1" tools="set_node_data,insert_blocks,replace_block,delete_blocks,update_block_props,patch_block_text" />',
  table:
    '<schema type="table" tools="table_update_schema,table_insert_rows,table_update_rows,table_delete_rows" />',
};

/** One `<schema>` element describing how the agent should write to `nodeType`. */
export function buildNodeDataSchemaXml(nodeType: string): string {
  const custom = CUSTOM_SCHEMA_BY_TYPE[nodeType];
  if (custom) return custom;

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
