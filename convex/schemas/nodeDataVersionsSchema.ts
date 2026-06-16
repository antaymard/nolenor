import { v, type Infer } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

// ── Actor ───────────────────────────────────────────────────────────────
// Qui est à l'origine d'une écriture sur un nodeData. Stocké uniquement sur
// les versions (jamais sur nodeDatas) et passé en argument de fonction :
// la mutation publique le dérive de l'auth server-side, seuls les wrappers
// internes acceptent un actor explicite.

const nodeDataVersionActorValidator = v.union(
  v.object({ type: v.literal("user"), userId: v.id("users") }),
  v.object({
    type: v.literal("agent"),
    userId: v.id("users"),
    threadId: v.optional(v.string()),
  }),
  v.object({ type: v.literal("system") }),
);

type NodeDataVersionActor = Infer<typeof nodeDataVersionActorValidator>;

const nodeDataVersionTriggerValidator = v.union(
  v.literal("update"),
  v.literal("delete"),
  v.literal("restore"),
);

type NodeDataVersionTrigger = Infer<typeof nodeDataVersionTriggerValidator>;

// ── Main validator ──────────────────────────────────────────────────────
// Snapshot complet PRÉ-write des values d'un nodeData (checkpoint de session
// d'édition). canvasId/nodeType sont figés au moment du write : ils peuvent
// différer de l'état courant si le node a été déplacé ou supprimé depuis.

const nodeDataVersionsValidator = v.object({
  name: v.optional(v.string()),
  nodeDataId: v.id("nodeDatas"),
  canvasId: v.id("canvases"),
  nodeType: nodeTypeValidator,
  values: v.record(v.string(), v.any()),
  actor: nodeDataVersionActorValidator,
  changedKeys: v.array(v.string()),
  trigger: nodeDataVersionTriggerValidator,
});

export {
  nodeDataVersionsValidator,
  nodeDataVersionActorValidator,
  type NodeDataVersionActor,
  type NodeDataVersionTrigger,
};
