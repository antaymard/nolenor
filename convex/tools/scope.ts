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
 *
 * ── ÉTAT ACTUEL : la brique existe, rien ne l'alimente encore ──────────────
 *
 * Personne ne peut aujourd'hui fournir un scope autre que `canvasScope` (tout
 * le canvas) :
 * - la harness ne transporte pas de scope : `RunInfo` n'en a pas, et
 *   `Profile.tools(run)` n'en passe pas aux factories ;
 * - les adaptateurs fabriquent donc eux-mêmes `canvasScope` depuis le
 *   `threadCtx` (cf. `nodes/listNodes.agent.ts`) ;
 * - le MCP ne traduit pas encore la permission de son token (`read`) en
 *   `write: "none"` : il s'appuie toujours sur son propre filtrage des tools ;
 * - seuls les noyaux de `tools/` appliquent le scope. Les tools encore dans
 *   `ia/tools/` (dont toutes les écritures) l'ignorent.
 *
 * Pour qu'il serve : un `scope` optionnel sur le run (absent = tout le
 * canvas), fixé à sa création et passé par `Profile.tools(run)` aux
 * factories ; la harness le transporte sans l'interpréter.
 *
 * ── Cas d'usage attendus ───────────────────────────────────────────────────
 *
 * - Nolë dans le panel : tout le canvas, lecture et écriture (`canvasScope`).
 * - Étape d'automation guidée : le modèle reçoit un tool d'édition lié à un
 *   node précis et ne peut écrire nulle part ailleurs (`write: [nodeId]`),
 *   en lisant éventuellement le reste du canvas comme contexte
 *   (`read: "all"`) ou seulement ses entrées (`read: [ids…]`).
 * - Token MCP `read` et CLI `nole` en lecture seule : `write: "none"`.
 * - Worker lancé sur une sous-tâche : le scope de son parent, ou plus étroit,
 *   jamais plus large.
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
