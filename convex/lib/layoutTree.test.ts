import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildLayoutContainerSchema,
  collectLayoutLeaves,
  collectLayoutNodeIds,
  findLayoutParentId,
  getLayoutAncestorPath,
  getLayoutDepth,
  insertLayoutNode,
  moveLayoutNode,
  removeLayoutLeaves,
  removeLayoutNode,
  resolveLayoutInsertionPoint,
  updateLayoutNode,
  wrapLayoutNode,
  type LayoutContainer,
} from "./layoutTree";

type Leaf = { kind: "leaf"; id: string; label?: string };
type Tree = LayoutContainer<Leaf>;

const leaf = (id: string): Leaf => ({ kind: "leaf", id });
const box = (
  id: string,
  children: Tree["children"],
  direction: "row" | "column" = "column",
): Tree => ({ kind: "container", id, direction, children });

// root(column) : a, row(b, c), d
const tree = box("root", [
  leaf("a"),
  box("row", [leaf("b"), leaf("c")], "row"),
  leaf("d"),
]);

const shape = (node: Tree["children"][number]): unknown =>
  node.kind === "container" ? { [node.id]: node.children.map(shape) } : node.id;

describe("parcours", () => {
  it("lists leaves and ids in tree order", () => {
    expect(collectLayoutLeaves(tree).map((l) => l.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(collectLayoutNodeIds(tree)).toEqual([
      "root",
      "a",
      "row",
      "b",
      "c",
      "d",
    ]);
  });

  it("counts container depth only", () => {
    expect(getLayoutDepth(tree)).toBe(2);
    expect(getLayoutDepth(box("empty", []))).toBe(1);
  });

  it("finds parents and ancestor paths", () => {
    expect(findLayoutParentId(tree, "c")).toBe("row");
    expect(findLayoutParentId(tree, "root")).toBeNull();
    expect(getLayoutAncestorPath(tree, "c")).toEqual(["root", "row", "c"]);
    expect(getLayoutAncestorPath(tree, "missing")).toEqual([]);
  });
});

describe("opérations", () => {
  it("updates a node without touching the others", () => {
    const next = updateLayoutNode(tree, "b", { label: "B" });
    expect(collectLayoutLeaves(next)[1]).toEqual({
      kind: "leaf",
      id: "b",
      label: "B",
    });
    expect(next.children[0]).toBe(tree.children[0]);
    expect(updateLayoutNode(tree, "root", { gap: 4 }).gap).toBe(4);
  });

  it("removes a node, never the root", () => {
    const { tree: next, removed } = removeLayoutNode(tree, "row");
    expect(removed?.id).toBe("row");
    expect(shape(next)).toEqual({ root: ["a", "d"] });
    expect(removeLayoutNode(tree, "root").removed).toBeNull();
  });

  it("inserts at an index, clamped, or at the end", () => {
    expect(shape(insertLayoutNode(tree, "row", 1, leaf("x")))).toEqual({
      root: ["a", { row: ["b", "x", "c"] }, "d"],
    });
    expect(shape(insertLayoutNode(tree, "row", 99, leaf("x")))).toEqual({
      root: ["a", { row: ["b", "c", "x"] }, "d"],
    });
    expect(shape(insertLayoutNode(tree, "root", undefined, leaf("x")))).toEqual(
      { root: ["a", { row: ["b", "c"] }, "d", "x"] },
    );
  });

  it("moves a node, refusing to move a container into itself", () => {
    expect(shape(moveLayoutNode(tree, "a", "row", 0))).toEqual({
      root: [{ row: ["a", "b", "c"] }, "d"],
    });
    expect(moveLayoutNode(tree, "row", "row", 0)).toBe(tree);
    expect(moveLayoutNode(tree, "root", "row", 0)).toBe(tree);
  });

  it("wraps a node in place, within the depth limit", () => {
    const { tree: next, containerId } = wrapLayoutNode(tree, "d", "row", 4);
    expect(containerId).not.toBeNull();
    expect(shape(next)).toEqual({
      root: ["a", { row: ["b", "c"] }, { [containerId!]: ["d"] }],
    });
    expect(wrapLayoutNode(tree, "b", "row", 2)).toEqual({
      tree,
      containerId: null,
    });
    expect(wrapLayoutNode(tree, "root", "row", 4).containerId).toBeNull();
  });

  it("resolves where to insert from the selection", () => {
    expect(resolveLayoutInsertionPoint(tree, null)).toEqual({
      containerId: "root",
      index: undefined,
    });
    expect(resolveLayoutInsertionPoint(tree, "row")).toEqual({
      containerId: "row",
      index: undefined,
    });
    expect(resolveLayoutInsertionPoint(tree, "b")).toEqual({
      containerId: "row",
      index: 1,
    });
  });

  it("removes the leaves matching a predicate", () => {
    expect(
      shape(removeLayoutLeaves(tree, (l) => l.id === "a" || l.id === "c")),
    ).toEqual({ root: [{ row: ["b"] }, "d"] });
  });
});

describe("schéma", () => {
  const schema = buildLayoutContainerSchema(
    z.strictObject({ kind: z.literal("leaf"), id: z.string() }),
  );

  it("accepts a tree of containers and known leaves", () => {
    expect(schema.safeParse(tree).success).toBe(true);
  });

  it("rejects an unknown leaf, deep in the tree", () => {
    const bad = box("root", [
      box("row", [{ kind: "space", id: "s" } as never]),
    ]);
    expect(schema.safeParse(bad).success).toBe(false);
  });
});
