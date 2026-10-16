import { memo, type CSSProperties, type ReactNode } from "react";
import {
  isLayoutContainer,
  type LayoutContainer,
  type LayoutLeaf,
  type LayoutTreeNode,
} from "@/../convex/lib/layoutTree";
import { EditableContainer, type LayoutEditor } from "./layoutEditing";

/**
 * Rendu d'un arbre de layout (cf. `convex/lib/layoutTree.ts`) : les
 * containers en divs flex, chaque feuille déléguée à l'usage — champs d'un
 * custom node, espaces d'une frame.
 *
 * `editor` présent : les containers deviennent sélectionnables et
 * réordonnables (cf. `layoutEditing`). Les feuilles reçoivent le même
 * `editor` et posent elles-mêmes leur enrobage éditable : elles seules
 * connaissent leur boîte.
 */

type LeafContext = {
  /**
   * La direction du container parent : un séparateur s'oriente contre elle,
   * trait vertical dans une ligne, horizontal dans une colonne.
   */
  parentDirection: "row" | "column";
  editor?: LayoutEditor;
};

type LayoutTreeRendererProps<Leaf extends LayoutLeaf> = {
  tree: LayoutContainer<Leaf>;
  renderLeaf: (leaf: Leaf, context: LeafContext) => ReactNode;
  editor?: LayoutEditor;
};

const ALIGN_MAP: Record<string, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

const JUSTIFY_MAP: Record<string, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};

function containerStyle(container: LayoutContainer): CSSProperties {
  return {
    display: "flex",
    flexDirection: container.direction,
    gap: container.gap ?? 8,
    alignItems: ALIGN_MAP[container.align ?? "stretch"],
    justifyContent: JUSTIFY_MAP[container.justify ?? "start"],
    padding: container.padding,
    flexGrow: container.grow,
    minWidth: 0,
    minHeight: 0,
  };
}

function TreeNode<Leaf extends LayoutLeaf>({
  node,
  renderLeaf,
  editor,
  isRoot,
  parentDirection,
}: {
  node: LayoutTreeNode<Leaf>;
  renderLeaf: LayoutTreeRendererProps<Leaf>["renderLeaf"];
  editor?: LayoutEditor;
  isRoot: boolean;
  parentDirection: "row" | "column";
}) {
  if (!isLayoutContainer(node)) {
    return <>{renderLeaf(node, { parentDirection, editor })}</>;
  }

  const style = containerStyle(node);
  const children = node.children.map((child) => (
    <TreeNode
      key={child.id}
      node={child}
      renderLeaf={renderLeaf}
      editor={editor}
      isRoot={false}
      parentDirection={node.direction}
    />
  ));

  if (editor) {
    return (
      <EditableContainer
        container={node}
        editor={editor}
        style={style}
        isRoot={isRoot}
      >
        {children}
      </EditableContainer>
    );
  }
  return <div style={style}>{children}</div>;
}

function LayoutTreeRenderer<Leaf extends LayoutLeaf>({
  tree,
  renderLeaf,
  editor,
}: LayoutTreeRendererProps<Leaf>) {
  return (
    <TreeNode
      node={tree}
      renderLeaf={renderLeaf}
      editor={editor}
      isRoot
      parentDirection="column"
    />
  );
}

export default memo(LayoutTreeRenderer) as typeof LayoutTreeRenderer;
export type { LeafContext, LayoutTreeRendererProps };
