import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { buildIndex, computeBreadcrumb } from "./searchBreadcrumb";

type Spec = {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string;
  values?: Record<string, unknown>;
};

function setup(specs: Spec[], edges: Array<[string, string]> = []) {
  const nodeDatas = new Map<Id<"nodeDatas">, Doc<"nodeDatas">>();
  const nodes: Node[] = specs.map((spec) => {
    const nodeDataId = `nd_${spec.id}` as Id<"nodeDatas">;
    nodeDatas.set(nodeDataId, {
      _id: nodeDataId,
      type: spec.type,
      values: spec.values ?? {},
    } as unknown as Doc<"nodeDatas">);
    return {
      id: spec.id,
      type: spec.type,
      position: { x: spec.x, y: spec.y },
      width: spec.width ?? 200,
      height: spec.height ?? 40,
      parentId: spec.parentId,
      data: { nodeDataId },
    };
  });
  const xyEdges: Edge[] = edges.map(([source, target]) => ({
    id: `${source}-${target}`,
    source,
    target,
  }));
  const index = buildIndex(nodes, xyEdges, nodeDatas);
  return (nodeId: string) =>
    computeBreadcrumb(index, nodeId).map((crumb) => crumb.label);
}

describe("computeBreadcrumb", () => {
  it("chains the frame, then titles from the outermost level", () => {
    const crumbs = setup([
      {
        id: "f",
        type: "frame",
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
        values: { title: "Projet" },
      },
      {
        id: "h1",
        type: "title",
        x: 10,
        y: 10,
        parentId: "f",
        values: { text: "Intro", level: "h1" },
      },
      {
        id: "h2",
        type: "title",
        x: 10,
        y: 100,
        parentId: "f",
        values: { text: "Contexte", level: "h2" },
      },
      { id: "n", type: "blocknote", x: 20, y: 200, parentId: "f" },
    ]);
    expect(crumbs("n")).toEqual(["Projet", "Intro", "Contexte"]);
  });

  it("prefers an explicit edge from a title over proximity", () => {
    const crumbs = setup(
      [
        {
          id: "near",
          type: "title",
          x: 0,
          y: 0,
          values: { text: "Near", level: "h2" },
        },
        {
          id: "far",
          type: "title",
          x: 5000,
          y: 5000,
          values: { text: "Far", level: "h2" },
        },
        { id: "n", type: "pdf", x: 0, y: 100 },
      ],
      [["far", "n"]],
    );
    expect(crumbs("n")).toEqual(["Far"]);
  });

  it("does not make a same-level title a parent", () => {
    const crumbs = setup([
      {
        id: "a",
        type: "title",
        x: 0,
        y: 0,
        values: { text: "A", level: "h2" },
      },
      {
        id: "b",
        type: "title",
        x: 0,
        y: 100,
        values: { text: "B", level: "h2" },
      },
    ]);
    expect(crumbs("b")).toEqual([]);
  });

  it("ignores titles outside the node's frame", () => {
    const crumbs = setup([
      { id: "t", type: "title", x: 0, y: 0, values: { text: "Outside" } },
      {
        id: "f",
        type: "frame",
        x: 0,
        y: 60,
        width: 500,
        height: 500,
        values: { title: "" },
      },
      { id: "n", type: "table", x: 0, y: 10, parentId: "f" },
    ]);
    expect(crumbs("n")).toEqual(["Frame"]);
  });

  it("survives a cycle of title edges", () => {
    const crumbs = setup(
      [
        {
          id: "a",
          type: "title",
          x: 0,
          y: 0,
          values: { text: "A", level: "h1" },
        },
        {
          id: "b",
          type: "title",
          x: 0,
          y: 1000,
          values: { text: "B", level: "h1" },
        },
      ],
      [
        ["a", "b"],
        ["b", "a"],
      ],
    );
    expect(crumbs("a")).toEqual(["B"]);
  });
});
