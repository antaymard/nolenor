import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { nodeTypeValidator } from "./nodeTypeSchema";

const nodesValidator = v.object({
  id: v.string(), // llmid
  status: v.optional(v.literal("trashed")),
  // Horodatage du passage à la corbeille, posé par `trashNode` et effacé par
  // `untrashNode`. Porté ici et pas déduit d'un `updatedAt` : la table n'en a
  // pas, et surtout la purge doit compter depuis la mise à la corbeille, pas
  // depuis la dernière écriture quelconque.
  trashedAt: v.optional(v.number()),
  nodeDataId: v.id("nodeDatas"),
  canvasId: v.id("canvases"),
  type: nodeTypeValidator,
  position: v.object({
    x: v.number(),
    y: v.number(),
  }),
  width: v.number(),
  height: v.number(),
  locked: v.optional(v.boolean()),
  hidden: v.optional(v.boolean()),
  zIndex: v.optional(v.number()),
  color: v.optional(v.string()),
  variant: v.optional(v.string()),

  parentId: v.optional(v.string()),
  extent: v.optional(
    v.union(v.literal("parent"), v.array(v.array(v.number()))),
  ),
  extendParent: v.optional(v.boolean()),
  data: v.optional(v.record(v.string(), v.any())),
});

export { nodesValidator };

/**
 * Props modifiables via `patch` : tout le visuel/positionnel, rien de
 * l'identité (`id`, `nodeDataId`, `canvasId`, `type`) ni du lifecycle
 * (`status`/`trashedAt`, réservés à `trash`/`untrash`). Chaque champ est
 * optionnel : seuls les
 * champs fournis sont écrits (`position`/`width`/`height`/… en remplacement,
 * `data` en fusion shallow comme le legacy `updateCanvasNodes`).
 */
const nodePatchPropsValidator = v.object({
  position: v.optional(
    v.object({
      x: v.number(),
      y: v.number(),
    }),
  ),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  locked: v.optional(v.boolean()),
  hidden: v.optional(v.boolean()),
  zIndex: v.optional(v.number()),
  color: v.optional(v.string()),
  variant: v.optional(v.string()),
  parentId: v.optional(v.string()),
  extent: v.optional(
    v.union(v.literal("parent"), v.array(v.array(v.number()))),
  ),
  extendParent: v.optional(v.boolean()),
  data: v.optional(v.record(v.string(), v.any())),
});

type NodePatchProps = Infer<typeof nodePatchPropsValidator>;

/**
 * DTO « canvas » node : la forme exposée au front (React Flow, attachments)
 * et aux tools de l'agent, projetée depuis les docs tables par `toCanvasNode`.
 * Tout sauf `canvasId` (porté par le canvas) et `status` (détail de
 * storage) ; `nodeDataId` redevient optionnel — les converters front
 * partent de XyNodes qui ne le portent pas forcément.
 */
export type CanvasNode = Omit<
  Infer<typeof nodesValidator>,
  "canvasId" | "status" | "trashedAt" | "nodeDataId"
> & { nodeDataId?: Id<"nodeDatas"> };

const nodeCreateInputValidator = nodesValidator.omit(
  "id",
  "nodeDataId",
  "status",
  "trashedAt",
);

const nodeCreateWithDataItemValidator = v.object({
  // llmId optionnel : fourni par le client (création local-first, le visuel
  // précède la confirmation serveur), sinon généré côté serveur.
  id: v.optional(v.string()),
  node: nodeCreateInputValidator,
  nodeDataValues: v.record(v.string(), v.any()),
  nodeDataTemplateId: v.optional(v.id("nodeTemplates")),
});

const nodePatchUpdateValidator = v.object({
  nodeId: v.string(),
  props: nodePatchPropsValidator,
});

type NodeCreateWithDataItem = Infer<typeof nodeCreateWithDataItemValidator>;
type NodePatchUpdate = Infer<typeof nodePatchUpdateValidator>;

export { nodePatchPropsValidator, nodeCreateWithDataItemValidator, nodePatchUpdateValidator };
export type { NodePatchProps, NodeCreateWithDataItem, NodePatchUpdate };
