import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Le scope d'un appel : ce que l'appelant a le droit de voir et de toucher.
 *
 * Il est décidé une fois, par qui expose le tool (un profil d'agent, un token
 * MCP, une étape de workflow), puis passé au noyau, qui est le seul à
 * l'appliquer. Un adaptateur ne filtre jamais lui-même : un même noyau sert
 * Nolë, le MCP et le CLI, et la porte doit se fermer au même endroit pour
 * tous.
 *
 * Un node hors du scope de lecture n'existe pas pour l'appelant : il n'est ni
 * listé, ni lisible, ni utilisable comme référence (« introuvable », pas
 * « interdit »).
 *
 * Sérialisable (cf. `vToolScope`) : un run pourra porter le sien, et
 * `Profile.tools(run)` reconstruire les mêmes tools à chaque step.
 */
export const vNodeSelection = v.union(v.literal("all"), v.array(v.string()));

export const vToolScope = v.object({
  userId: v.id("users"),
  canvasId: v.id("canvases"),
  read: vNodeSelection,
  /** `none` : lecture seule (token MCP `read`, CLI). */
  write: v.union(vNodeSelection, v.literal("none")),
});

export type NodeSelection = Infer<typeof vNodeSelection>;
export type ToolScope = Infer<typeof vToolScope>;

/** Tout le canvas, en lecture et en écriture : le scope de Nolë aujourd'hui. */
export function canvasScope({
  userId,
  canvasId,
}: {
  userId: Id<"users">;
  canvasId: Id<"canvases">;
}): ToolScope {
  return { userId, canvasId, read: "all", write: "all" };
}

function selects(selection: NodeSelection, nodeId: string): boolean {
  return selection === "all" || selection.includes(nodeId);
}

export function canReadNode(scope: ToolScope, nodeId: string): boolean {
  return selects(scope.read, nodeId);
}

export function canWriteNode(scope: ToolScope, nodeId: string): boolean {
  return scope.write !== "none" && selects(scope.write, nodeId);
}
