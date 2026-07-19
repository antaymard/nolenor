import { v, type Infer } from "convex/values";

const nodeTypeValues = [
  "link",
  "image",
  "document",
  "value",
  "embed",
  "title",
  "pdf",
  "table",
  "app",
  // Node défini par l'utilisateur : la forme des values est portée par un
  // document nodeTemplates (cf. nodeDatas.templateId), pas par nodeConfig.
  "custom",
] as const;

const nodeTypeValidator = v.union(
  ...nodeTypeValues.map((type) => v.literal(type)),
);

type NodeType = Infer<typeof nodeTypeValidator>;

export { nodeTypeValues, nodeTypeValidator };
export type { NodeType };
