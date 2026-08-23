import type { Node, NodeProps } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeType } from "./nodeTypes";
import type { colorsEnum } from "./style.types";

/**
 * Types for XyFlow (React Flow) adapter
 * These types bridge the gap between our Canvas types and React Flow types
 */

export interface TitleCanvasNodeData {
  text: string;
  level: "h1" | "h2" | "h3" | "p";
}

export interface DisplayPropsThatGoInXyData {
  color?: colorsEnum;
  locked?: boolean;
  hidden?: boolean;
  zIndex?: number;
}

/**
 * La charge `data` d'un node de canvas.
 *
 * La signature d'index porte les extras propres à certains types — `variant`
 * pour table/embed/app, le texte d'un title. Une union discriminée par `type`
 * serait plus stricte, mais elle n'apporterait rien ici : le seul champ lu
 * partout est `nodeDataId`, et c'est lui qu'on veut typé.
 */
export type XyNodeData = DisplayPropsThatGoInXyData & {
  nodeDataId: Id<"nodeDatas">;
} & Record<string, unknown>;

/**
 * Le node de canvas de cette app.
 *
 * Le second paramètre est l'union exacte des clés de `nodeTypes` — `type` cesse
 * d'être une chaîne libre, et les `as NodeType` disparaissent.
 */
export type XyNode = Node<XyNodeData, NodeType>;

/**
 * Ce que React Flow passe réellement à un composant de node.
 *
 * À ne pas confondre avec `XyNode` : `NodeProps` est un `Pick` du node, qui
 * **n'inclut pas `position`** (seulement `positionAbsoluteX/Y`). Les composants
 * étaient annotés `Node`, ce qui compilait — ils ne lisent que des champs
 * présents dans les deux — mais laissait passer un `xyNode.position` qui aurait
 * valu `undefined` à l'exécution.
 */
export type XyNodeProps = NodeProps<XyNode>;
