import { z } from "zod";
import { nodeTypeValues } from "../schemas/nodeTypeSchema";

const nodeTypeZodValidator = z.enum(nodeTypeValues);

type NodeVariant = {
  label: string;
  defaultWidth: number;
  defaultHeight: number;
  resizable?: boolean;
  isDefault?: boolean;
};

type NodeDataConfigItem = {
  type: z.infer<typeof nodeTypeZodValidator>;
  label: string;
  description: string;
  llmDescription: string;
  defaultDimensions: {
    width: number;
    height: number;
    resizable?: boolean;
  };
  variants?: Record<string, NodeVariant>;
  defaultColor?: string;
  dataValuesSchema: z.ZodTypeAny;
  toolInputSchema?: z.ZodTypeAny; // Optional schema specifically for tool inputs, if different from dataValuesSchema
};

const nodeDataConfig: Array<NodeDataConfigItem> = [
  {
    type: "title",
    label: "Title",
    description:
      "Node for free text labels on the canvas. Supports h1/h2/h3/p heading levels for the whole text. Does not support rich markdown.",
    llmDescription:
      "For sections headings, hubs nodes, parents of related sub nodes. Use this node for titles (for branches in trees of thought), subtitles, or any standalone text that doesn't require rich formatting. If you need rich text formatting (bold, italic, lists, etc.), use the Document node instead. \nThe required data values for this node are 'text' (the content of the label) and 'level' (the heading level, which can be 'h1', 'h2', 'h3', or 'p').",
    defaultDimensions: { width: 220, height: 33, resizable: true },
    defaultColor: "transparent",
    dataValuesSchema: z
      .object({
        text: z.string().describe("The text content of the label.").default(""),
        level: z
          .enum(["h1", "h2", "h3", "p"])
          .describe("The heading level of the text.")
          .default("p"),
      })
      .default({ text: "", level: "p" }),
  },
  {
    type: "link",
    label: "Link",
    description: "Node for storing a link.",
    llmDescription:
      "For storing/displaying a link. \nThe required data value is 'link', an object with 'href' (the URL of the link) and 'pageTitle' (the title of the linked page).",
    defaultDimensions: { width: 220, height: 33, resizable: false },
    variants: {
      default: {
        label: "Default",
        defaultWidth: 220,
        defaultHeight: 33,
        isDefault: true,
      },
      preview: {
        label: "Preview",
        defaultWidth: 320,
        defaultHeight: 120,
      },
    },

    dataValuesSchema: z
      .object({
        link: z
          .object({
            href: z
              .string()
              .describe(
                "The url of the link. You can visit the page using the open_web_page tool.",
              )
              .default(""),
            pageTitle: z
              .string()
              .describe("The title of the linked page.")
              .default(""),
          })
          .default({ href: "", pageTitle: "" }),
      })
      .default({ link: { href: "", pageTitle: "" } }),
    toolInputSchema: z
      .object({
        link: z
          .object({
            href: z.string().describe("The url of the link."),
            pageTitle: z.string().describe("The title of the linked page."),
            pageImage: z
              .string()
              .optional()
              .describe("Optional preview image URL for the linked page."),
            pageDescription: z
              .string()
              .optional()
              .describe("Optional description of the linked page."),
            siteName: z
              .string()
              .optional()
              .describe("Optional site name of the linked page."),
          })
          .strict(),
      })
      .strict(),
  },
  {
    type: "image",
    label: "Image",
    description: "Node for storing an image.",
    llmDescription:
      "For storing/displaying an image. Use this node to display images on the canvas, including the ones you extracted or generated via others tools or sources. \nThe required data value is 'images', an array of objects each with a 'url' (the URL of the image).",
    defaultDimensions: { width: 320, height: 320, resizable: true },
    dataValuesSchema: z
      .object({
        images: z
          .array(
            z.object({
              url: z
                .string()
                .describe(
                  "The URL of the image. Use the view_image tool to view it.",
                ),
            }),
          )
          .default([]),
      })
      .default({ images: [] }),
    toolInputSchema: z
      .object({
        images: z
          .array(
            z
              .object({
                url: z.string().describe("The URL of the image."),
              })
              .strict(),
          )
          .describe("The images to display on the node."),
      })
      .strict(),
  },
  {
    type: "document",
    label: "Document",
    description: "Node for storing a rich text document (Plate.js / markdown).",
    llmDescription:
      "For storing/displaying rich text content. Use this node for any text content that requires rich formatting (bold, headings, lists, links, imgs (using url), callouts, files, etc.). \nThe required data value for this node is 'doc' (the markdown content of the document).",
    defaultDimensions: { width: 320, height: 320, resizable: true },
    variants: {
      default: {
        label: "Preview",
        defaultWidth: 320,
        defaultHeight: 320,
        isDefault: true,
      },
      title: {
        label: "Title",
        defaultWidth: 220,
        defaultHeight: 33,
        resizable: false,
      },
    },
    dataValuesSchema: z
      .object({
        doc: z.string().default("[]"),
      })
      .default({ doc: "[]" }),
    toolInputSchema: z.object({
      doc: z.string().describe("The markdown content of the document."),
    }),
  },
  {
    type: "blocknote",
    label: "Blocknote",
    description:
      "Node for storing a rich text document (BlockNote editor).",
    llmDescription:
      "For storing/displaying rich text content using the BlockNote editor. Use this node for any text content that requires rich formatting (bold, headings, lists, links, colors, alignment, tables, etc.). Read via read_nodes: content is returned as annotated markdown where each block is wrapped in `<block id=\"…\" type=\"…\" props='{…}'>…</block>` (props shown only when non-default; children nested). Edit using the block-id-addressed tools (insert_blocks, replace_block, delete_blocks, update_block_props, patch_block_text) — never hand-edit the raw JSON. For a full replace via set_node_data, the required data value is 'doc': a markdown string (converted to blocks) or a JSON array string of blocks.",
    defaultDimensions: { width: 320, height: 320, resizable: true },
    variants: {
      default: {
        label: "Preview",
        defaultWidth: 320,
        defaultHeight: 320,
        isDefault: true,
      },
      title: {
        label: "Title",
        defaultWidth: 220,
        defaultHeight: 33,
        resizable: false,
      },
    },
    dataValuesSchema: z
      .object({
        doc: z.string().default("[]"),
      })
      .default({ doc: "[]" }),
    toolInputSchema: z.object({
      doc: z
        .string()
        .describe(
          "The markdown content of the document (converted to BlockNote blocks), or a JSON array string of BlockNote blocks.",
        ),
    }),
  },
  {
    type: "value",
    label: "Value",
    description: "Node for storing a value (text, number, boolean).",
    llmDescription:
      "For storing a value that can be of type text, number, or boolean. Use this node to store and display any discrete piece of data in a dashboard / KPI way. \nThe required data value is 'value', an object with 'type' (the type of the value: 'text', 'number', or 'boolean'), 'value' (the actual value stored in the node), and optional 'unit' (the unit of the value, if applicable) and 'label' (an optional label for the value).",
    defaultDimensions: { width: 220, height: 120, resizable: true },

    dataValuesSchema: z
      .object({
        value: z
          .object({
            type: z
              .enum(["text", "number", "boolean"])
              .describe(
                "The type of the value: 'text', 'number', or 'boolean'.",
              )
              .default("text"),
            value: z
              .union([z.string(), z.number(), z.boolean()])
              .describe("The actual value stored in the node.")
              .default(""),
            unit: z
              .string()
              .optional()
              .describe(
                "The unit of the value, if applicable (e.g., 'kg', 'm', etc.).",
              ),
            label: z
              .string()
              .optional()
              .describe("An optional label for the value."),
          })
          .default({ type: "text", value: "" }),
      })
      .default({ value: { type: "text", value: "" } }),
    toolInputSchema: z
      .object({
        value: z
          .object({
            type: z
              .enum(["text", "number", "boolean"])
              .describe(
                "The type of the value: 'text', 'number', or 'boolean'.",
              ),
            value: z
              .union([z.string(), z.number(), z.boolean()])
              .describe("The actual value stored in the node."),
            unit: z
              .string()
              .optional()
              .describe(
                "The unit of the value, if applicable (e.g., 'kg', 'm', etc.).",
              ),
            label: z
              .string()
              .optional()
              .describe("An optional label for the value."),
          })
          .strict(),
      })
      .strict(),
  },
  {
    type: "embed",
    label: "Embed",
    description:
      "Node for storing embedded content (YouTube, Google Docs/Sheets/Slides, or generic iframe).",
    llmDescription:
      "For storing/displaying embedded content such as YouTube videos, Google Docs/Sheets/Slides, or any generic iframe content. Use this node to embed external content directly onto the canvas. \nThe required data value is 'embed', an object with 'url' (the original URL used to create the embed), 'embedUrl' (the embeddable URL used in the iframe source), optional 'title' (a title for the embedded content), and 'type' (the embed provider/type inferred from the URL, which can be 'youtube', 'google-docs', 'google-sheets', 'google-slides', or 'generic').",
    defaultDimensions: { width: 480, height: 320, resizable: true },
    variants: {
      preview: {
        label: "Preview",
        defaultWidth: 480,
        defaultHeight: 320,
        resizable: true,
        isDefault: true,
      },
      title: {
        label: "Title",
        defaultWidth: 220,
        defaultHeight: 33,
        resizable: false,
      },
    },

    dataValuesSchema: z
      .object({
        embed: z
          .object({
            url: z
              .string()
              .describe("The original URL or source used to create the embed.")
              .default(""),
            embedUrl: z
              .string()
              .describe("The embeddable URL used in the iframe source.")
              .default(""),
            title: z
              .string()
              .optional()
              .describe("An optional title for the embedded content."),
            type: z
              .enum([
                "youtube",
                "google-docs",
                "google-sheets",
                "google-slides",
                "generic",
              ])
              .describe("The embed provider/type inferred from the URL.")
              .default("generic"),
          })
          .default({ url: "", embedUrl: "", type: "generic" }),
      })
      .default({ embed: { url: "", embedUrl: "", type: "generic" } }),
    toolInputSchema: z
      .object({
        embed: z
          .object({
            url: z
              .string()
              .describe("The original URL or source used to create the embed."),
            embedUrl: z
              .string()
              .describe("The embeddable URL used in the iframe source."),
            title: z
              .string()
              .optional()
              .describe("An optional title for the embedded content."),
            type: z
              .enum([
                "youtube",
                "google-docs",
                "google-sheets",
                "google-slides",
                "generic",
              ])
              .describe("The embed provider/type inferred from the URL."),
          })
          .strict(),
      })
      .strict(),
  },
  {
    type: "pdf",
    label: "PDF",
    description: "Node for storing uploaded PDF files.",
    llmDescription:
      "For storing/displaying uploaded PDF files. The user can read them directly within Nolënor, double-clicking on the file to open it. \nThe required data value are 'url' (the public URL of the uploaded file), 'filename' (the display filename), 'mimeType' (the MIME type of the file), 'size' (the file size in bytes), 'uploadedAt' (the upload timestamp in epoch milliseconds), and 'key' (the storage key/path of the file).",
    defaultDimensions: { width: 220, height: 33, resizable: false },
    dataValuesSchema: z
      .object({
        files: z
          .array(
            z.object({
              url: z.string().describe("The public URL of the uploaded file."),
              filename: z.string().describe("The display filename."),
              mimeType: z.string().describe("The MIME type of the file."),
              size: z.number().describe("The file size in bytes."),
              uploadedAt: z
                .number()
                .describe("Upload timestamp (epoch milliseconds)."),
              key: z.string().describe("The storage key/path of the file."),
            }),
          )
          .default([]),
      })
      .default({ files: [] }),
  },
  {
    type: "table",
    label: "Table",
    description:
      "Node for structured tabular data with typed columns (text, number, checkbox, date, link).",
    llmDescription:
      "For structured tabular data with typed columns. Use this node to store and display any structured data in a table format, where you can define the columns and their types (text, number, checkbox, date, link). When updating a file, you can ask the agentTool to add rows, update specific rows or remove them, to make the update more reliable. \nThe required data value are tanstack-table compatible : 'columns' (an array of column definitions, each with an 'id', 'name', and 'type') and 'rows' (an array of row objects, each with an 'id' and 'cells' that map column ids to their respective values). An optional 'title' field (string) can be set to give the table a title.",
    defaultDimensions: { width: 400, height: 300, resizable: true },
    variants: {
      default: {
        label: "Preview",
        defaultWidth: 400,
        defaultHeight: 300,
        isDefault: true,
      },
      title: {
        label: "Title",
        defaultWidth: 220,
        defaultHeight: 33,
      },
    },

    dataValuesSchema: z
      .object({
        title: z.string().optional(),
        table: z
          .object({
            columns: z
              .array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  type: z.enum(["text", "number", "checkbox", "date", "link"]),
                }),
              )
              .default([]),
            rows: z
              .array(
                z.object({
                  id: z.string(),
                  cells: z.record(
                    z.string(),
                    z.union([
                      z.string(),
                      z.number(),
                      z.boolean(),
                      z.null(),
                      z.object({
                        href: z.string(),
                        pageTitle: z.string(),
                        pageImage: z.string().optional(),
                        pageDescription: z.string().optional(),
                      }),
                    ]),
                  ),
                }),
              )
              .default([]),
          })
          .default({ columns: [], rows: [] }),
      })
      .default({ table: { columns: [], rows: [] } }),
  },
  {
    type: "app",
    label: "App",
    description:
      "Node for interactive React miniapps, dashboards, charts, calculators...",
    llmDescription:
      "For interactive React miniapps, dashboards, charts, calculators, or any reactive UI component tied to canvas data. The app runs in a sandboxed iframe and can read data from connected source nodes via the nolenor SDK. \nThe required data values are 'code' (the JSX string of the React component, named App, generated by Nolë) and 'state' (free-form JSON persisted by the app, null on first run).",
    defaultDimensions: { width: 400, height: 300, resizable: true },
    variants: {
      preview: {
        label: "Preview",
        defaultWidth: 400,
        defaultHeight: 300,
        resizable: true,
        isDefault: true,
      },
      title: {
        label: "Title",
        defaultWidth: 220,
        defaultHeight: 33,
        resizable: false,
      },
    },
    dataValuesSchema: z
      .object({
        code: z.string().default(""),
        state: z.any().nullable().default(null),
        // Bumped automatically server-side when `code` changes. Used to
        // discard stale runtime errors posted by an iframe still running an
        // older version of the code.
        __v: z.string().optional(),
        // Captured from the iframe's runtime (window.onerror,
        // unhandledrejection, console.error, React ErrorBoundary).
        // Read-only for the LLM — it is reset to [] each time `code` changes.
        errors: z
          .array(
            z.object({
              type: z.string(),
              message: z.string(),
              stack: z.string().optional(),
              source: z.string().optional(),
              line: z.number().optional(),
              col: z.number().optional(),
              timestamp: z.number(),
            }),
          )
          .optional(),
      })
      .default({ code: "", state: null }),
  },
];

function getDefaultNodeDataValues(
  nodeType: z.infer<typeof nodeTypeZodValidator>,
) {
  const config = nodeDataConfig.find((item) => item.type === nodeType);
  if (!config) {
    return null;
  }
  return config.dataValuesSchema.parse(undefined);
}

export { nodeDataConfig, nodeTypeZodValidator, getDefaultNodeDataValues };
export type { NodeDataConfigItem, NodeVariant };
