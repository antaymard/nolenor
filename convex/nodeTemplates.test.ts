/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

describe("nodeTemplates.listForCanvas", () => {
  test("rend chaque template référencé une seule fois, et seulement ceux du canvas", async () => {
    const t = convexTest(schema, modules);
    const { canvasId, used, expected } = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", {});
      const insertCanvas = () =>
        ctx.db.insert("canvases", {
          creatorId: owner,
          name: "Canvas",
          updatedAt: Date.now(),
          isPublic: true,
        });
      const canvasId = await insertCanvas();
      const otherCanvasId = await insertCanvas();
      const insertTemplate = () =>
        ctx.db.insert("nodeTemplates", {
          creatorId: owner,
          name: "T",
          fields: [],
          nodeLayout: null,
          defaultDimensions: { width: 100, height: 100 },
          updatedAt: Date.now(),
        });
      const used = [
        await insertTemplate(),
        await insertTemplate(),
        await insertTemplate(),
      ];
      const elsewhere = await insertTemplate();

      const insertNodeData = (
        canvas: Id<"canvases">,
        templateId?: Id<"nodeTemplates">,
      ) =>
        ctx.db.insert("nodeDatas", {
          canvasId: canvas,
          type: templateId ? "custom" : "blocknote",
          updatedAt: Date.now(),
          values: {},
          templateId,
        });
      // Plusieurs instances du même template, des nodes sans template, et un
      // template utilisé seulement sur un autre canvas.
      await insertNodeData(canvasId);
      await insertNodeData(canvasId, used[0]);
      await insertNodeData(canvasId, used[1]);
      await insertNodeData(canvasId, used[0]);
      await insertNodeData(canvasId);
      await insertNodeData(canvasId, used[2]);
      await insertNodeData(canvasId, used[1]);
      await insertNodeData(otherCanvasId, elsewhere);

      return {
        canvasId,
        used,
        expected: [...used].sort((a, b) => a.localeCompare(b)),
      };
    });

    const templates = await t.query(api.nodeTemplates.listForCanvas, {
      canvasId,
    });
    expect(templates.map((template) => template._id)).toEqual(expected);
    expect(new Set(templates.map((template) => template._id))).toEqual(
      new Set(used),
    );
  });

  test("canvas sans custom node : liste vide", async () => {
    const t = convexTest(schema, modules);
    const canvasId = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", {});
      const canvasId = await ctx.db.insert("canvases", {
        creatorId: owner,
        name: "Canvas",
        updatedAt: Date.now(),
        isPublic: true,
      });
      await ctx.db.insert("nodeDatas", {
        canvasId,
        type: "blocknote",
        updatedAt: Date.now(),
        values: {},
      });
      return canvasId;
    });

    expect(
      await t.query(api.nodeTemplates.listForCanvas, { canvasId }),
    ).toEqual([]);
  });
});
