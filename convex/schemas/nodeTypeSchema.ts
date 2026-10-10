import { v, type Infer } from "convex/values";

const nodeTypeValues = [
  "link",
  "image",
  "blocknote",
  "value",
  "title",
  "pdf",
  "table",
  "app",
  "audio",
  "video",
  // Conteneur : regroupe des nodes, qui le déclarent en `parentId` et portent
  // dès lors une position RELATIVE à lui. Seul type à le faire — c'est ce qui
  // rend le groupement explicite, là où la minimap devait jusqu'ici le
  // deviner à la proximité. Ne se crée qu'à la souris (`creatable: false`).
  "frame",
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
