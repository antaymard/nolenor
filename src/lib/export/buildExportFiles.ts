import type { Doc } from "@/../convex/_generated/dataModel";
import { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";
import { nodeDataToMarkdown } from "./nodeDataToMarkdown";
import { filenameSlug } from "@/lib/filenameSlug";
import type { CanvasWithNodeDatas, ExportFile, ExportTemplate } from "./types";

/**
 * Mise en forme de l'archive : arborescence, noms de fichiers, sommaires.
 *
 * Aucun accès réseau ici — `runExport` fournit les données déjà chargées.
 */

export function slugify(input: string): string {
  return filenameSlug(input, "untitled");
}

/** Un titre peut contenir des `[` / `]`, qui casseraient le lien du sommaire. */
function escapeLinkLabel(label: string): string {
  return label.replace(/[[\]]/g, "\\$&");
}

/** `1` → `001`. Préfixe qui conserve l'ordre et écarte les collisions de noms. */
function pad(index: number): string {
  return String(index).padStart(3, "0");
}

/**
 * Les nodeDatas dans l'ordre du canvas.
 *
 * `canvas.nodes` porte l'ordre voulu par l'utilisateur et le lien vers le
 * contenu ; la table `nodeDatas` n'a pas d'ordre propre. Les nodeDatas qu'aucun
 * node du canvas ne référence (désynchronisation historique) sont conservés en
 * fin de liste plutôt que perdus.
 */
function orderNodeDatas(
  canvas: Doc<"canvases">,
  nodeDatas: Doc<"nodeDatas">[],
): Doc<"nodeDatas">[] {
  const byId = new Map(nodeDatas.map((nodeData) => [nodeData._id, nodeData]));
  const ordered: Doc<"nodeDatas">[] = [];

  for (const node of canvas.nodes ?? []) {
    if (!node.nodeDataId) continue;
    const nodeData = byId.get(node.nodeDataId);
    if (!nodeData) continue;
    byId.delete(node.nodeDataId);
    ordered.push(nodeData);
  }

  return [...ordered, ...byId.values()];
}

function renderEdgeList(
  canvas: Doc<"canvases">,
  titleByCanvasNodeId: Map<string, string>,
): string[] {
  const edges = canvas.edges ?? [];
  if (edges.length === 0) return [];

  const lines = edges.map((edge) => {
    const source = titleByCanvasNodeId.get(edge.source) ?? edge.source;
    const target = titleByCanvasNodeId.get(edge.target) ?? edge.target;
    return `- ${source} → ${target}`;
  });

  return ["", "## Connections", "", ...lines];
}

export async function buildCanvasFiles(
  { canvas, nodeDatas }: CanvasWithNodeDatas,
  templatesById: Map<string, ExportTemplate>,
  index: number,
): Promise<ExportFile[]> {
  const dir = `canvases/${pad(index)}-${slugify(canvas.name)}`;
  const ordered = orderNodeDatas(canvas, nodeDatas);

  const files: ExportFile[] = [
    { path: `${dir}/canvas.json`, content: JSON.stringify(canvas, null, 2) },
    { path: `${dir}/nodes.json`, content: JSON.stringify(ordered, null, 2) },
  ];

  const summaryLines: string[] = [];
  const titleByNodeDataId = new Map<string, string>();

  for (const [position, nodeData] of ordered.entries()) {
    const template = nodeData.templateId
      ? templatesById.get(nodeData.templateId)
      : undefined;
    const title = getNodeDataTitle(nodeData, template);
    const filename = `${pad(position + 1)}-${slugify(title)}.md`;

    titleByNodeDataId.set(nodeData._id, title);
    files.push({
      path: `${dir}/nodes/${filename}`,
      content: await nodeDataToMarkdown(nodeData, templatesById),
    });
    summaryLines.push(
      `- [${escapeLinkLabel(title)}](nodes/${encodeURIComponent(filename)})`,
    );
  }

  // Les edges pointent vers des ids de nodes du canvas, pas vers des
  // nodeDatas : on rebrousse par `nodeDataId` pour afficher des titres.
  const titleByCanvasNodeId = new Map<string, string>();
  for (const node of canvas.nodes ?? []) {
    const title = node.nodeDataId
      ? titleByNodeDataId.get(node.nodeDataId)
      : undefined;
    titleByCanvasNodeId.set(node.id, title ?? node.type);
  }

  const readme = [
    `# ${canvas.name}`,
    "",
    canvas.description ?? "",
    "",
    `Updated ${new Date(canvas.updatedAt).toISOString().slice(0, 10)} · ${ordered.length} node(s)`,
    "",
    "## Nodes",
    "",
    ...(summaryLines.length > 0 ? summaryLines : ["_This canvas has no node._"]),
    ...renderEdgeList(canvas, titleByCanvasNodeId),
    "",
    "---",
    "",
    "`canvas.json` holds the full structure (positions, connections, slideshows, hotspots).",
    "`nodes.json` holds the raw content of every node, losslessly.",
    "",
  ].join("\n");

  files.push({ path: `${dir}/README.md`, content: readme });

  return files;
}

export function buildRootReadme(
  canvasNames: string[],
  exportedAt: Date,
): ExportFile {
  const content = [
    "# nolënor export",
    "",
    `Generated on ${exportedAt.toISOString().slice(0, 10)}.`,
    "",
    `${canvasNames.length} canvas(es) exported:`,
    "",
    ...canvasNames.map((name, index) => `${index + 1}. ${name}`),
    "",
    "## Format",
    "",
    "Each canvas gets its own folder under `canvases/`, containing:",
    "",
    "- `README.md` — node index and list of connections",
    "- `canvas.json` — the canvas structure (positions, connections, slideshows, hotspots)",
    "- `nodes.json` — the raw content of every node, losslessly",
    "- `nodes/` — one readable Markdown file per node",
    "",
    "The Markdown is there to be read and reused elsewhere; it is deliberately",
    "simplified (colors, alignments and advanced formatting do not survive it).",
    "The JSON next to it is the faithful version: whatever the Markdown drops,",
    "the JSON still has.",
    "",
    "## Attachments",
    "",
    "Images, PDFs and audio files are **not** bundled into this archive: they are",
    "referenced by URL. Download the ones that matter while your account is",
    "still active.",
    "",
  ].join("\n");

  return { path: "README.md", content };
}
