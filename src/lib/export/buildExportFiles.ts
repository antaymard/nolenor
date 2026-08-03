import type { Doc } from "@/../convex/_generated/dataModel";
import { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";
import { nodeDataToMarkdown } from "./nodeDataToMarkdown";
import type { CanvasWithNodeDatas, ExportFile, ExportTemplate } from "./types";

/**
 * Mise en forme de l'archive : arborescence, noms de fichiers, sommaires.
 *
 * Aucun accès réseau ici — `runExport` fournit les données déjà chargées.
 */

const MAX_SLUG_LENGTH = 60;

export function slugify(input: string): string {
  const slug = input
    .normalize("NFD")
    // Retire les diacritiques (bloc Combining Diacritical Marks).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return slug || "sans-titre";
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

  return ["", "## Connexions", "", ...lines];
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
    `Mis à jour le ${new Date(canvas.updatedAt).toISOString().slice(0, 10)} · ${ordered.length} node(s)`,
    "",
    "## Nodes",
    "",
    ...(summaryLines.length > 0 ? summaryLines : ["_Ce canvas ne contient aucun node._"]),
    ...renderEdgeList(canvas, titleByCanvasNodeId),
    "",
    "---",
    "",
    "`canvas.json` contient la structure complète (positions, connexions, slideshows, hotspots).",
    "`nodes.json` contient le contenu brut de chaque node, sans perte.",
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
    "# Export nolënor",
    "",
    `Généré le ${exportedAt.toISOString().slice(0, 10)}.`,
    "",
    `${canvasNames.length} canvas exporté(s) :`,
    "",
    ...canvasNames.map((name, index) => `${index + 1}. ${name}`),
    "",
    "## Format",
    "",
    "Chaque canvas a son dossier dans `canvases/`, contenant :",
    "",
    "- `README.md` — sommaire des nodes et liste des connexions",
    "- `canvas.json` — la structure du canvas (positions, connexions, slideshows, hotspots)",
    "- `nodes.json` — le contenu brut de tous les nodes, sans perte",
    "- `nodes/` — un fichier Markdown lisible par node",
    "",
    "Le Markdown est là pour être relu et réutilisé ailleurs ; il est volontairement",
    "simplifié (couleurs, alignements et mises en forme avancées ne survivent pas).",
    "Le JSON à côté est la version fidèle : si un détail manque dans le Markdown,",
    "il est dans le JSON.",
    "",
    "## Fichiers joints",
    "",
    "Les images, PDF et fichiers audio ne sont **pas** inclus dans cette archive :",
    "ils sont référencés par leur URL. Pensez à télécharger ceux qui comptent tant",
    "que votre compte est actif.",
    "",
  ].join("\n");

  return { path: "README.md", content };
}
