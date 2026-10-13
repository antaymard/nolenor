/// <reference types="vite/client" />
// Le setup commun des tests de `tools/`. Double suffixe : ni module Convex
// (ignoré au déploiement), ni module de convex-test (cf. test.setup.ts), ni
// fichier de test pour vitest.
import { createRequire } from "node:module";
import { convexTest, type TestConvex } from "convex-test";
import prosemirrorSyncTest from "@convex-dev/prosemirror-sync/test";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { NodeType } from "../schemas/nodeTypeSchema";
import debouncerSchema from "../components/debouncer/schema";
import { attachToolCtx } from "../ia/tools/toolHelpers";
import schema from "../schema";
import { modules } from "../test.setup";
import type { ToolRunCtx } from "./runtime";
import { canvasScope, type ToolScope } from "./scope";
import bashTool from "./shell/bash.agent";

/**
 * En production, just-bash et jsdom sont chargés par `globalThis.require`
 * dans l'action Node qui exécute le tool. Le runtime de test n'en a pas.
 */
export function enableRequire(): void {
  (globalThis as { require?: unknown }).require = createRequire(
    import.meta.url,
  );
}

export type ToolsTest = {
  t: TestConvex<typeof schema>;
  userId: Id<"users">;
  canvasId: Id<"canvases">;
  /** Tout le canvas, comme Nolë. */
  scope: ToolScope;
  /** Le ctx qu'un noyau reçoit de l'action qui exécute le tool. */
  run: ToolRunCtx;
  /** Le tool `bash`, sa sortie rendue telle que le modèle la lit. */
  bash: (script: string) => Promise<string>;
};

/**
 * Un canvas vide, son propriétaire, et de quoi appeler les noyaux et le
 * shell. Les composants qu'utilise la lecture d'un blocknote (doc vivant)
 * sont enregistrés.
 */
export async function setupTools(): Promise<ToolsTest> {
  const t = convexTest(schema, modules);
  prosemirrorSyncTest.register(t);
  t.registerComponent(
    "debouncer",
    debouncerSchema,
    import.meta.glob("../components/debouncer/**/*.ts"),
  );
  const { userId, canvasId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: userId,
      name: "Canvas",
      updatedAt: Date.now(),
      isPublic: false,
    });
    return { userId, canvasId };
  });
  const run = {
    runQuery: t.query,
    runMutation: t.mutation,
    runAction: t.action,
  } as unknown as ToolRunCtx;
  const tool = attachToolCtx(
    bashTool({ threadCtx: { authUserId: userId, canvasId } }),
    run as never,
  );
  return {
    t,
    userId,
    canvasId,
    scope: canvasScope({ userId, canvasId }),
    run,
    bash: async (script) =>
      (await tool.execute!({ explanation: "test", script } as never, {
        toolCallId: "call",
        messages: [],
      })) as string,
  };
}

/** Un node et son nodeData, créés comme le fait l'app. */
export async function createNode(
  { t, canvasId }: Pick<ToolsTest, "t" | "canvasId">,
  {
    type,
    values = {},
    x = 0,
    y = 0,
    parentId,
    color,
    templateId,
  }: {
    type: NodeType;
    values?: Record<string, unknown>;
    x?: number;
    y?: number;
    /** La frame qui le contient (position alors relative à elle). */
    parentId?: string;
    color?: string;
    templateId?: Id<"nodeTemplates">;
  },
): Promise<{ id: string; nodeDataId: Id<"nodeDatas"> }> {
  const [created] = await t.mutation(
    internal.wrappers.nodeWrappers.createWithNodeData,
    {
      nodes: [
        {
          node: {
            canvasId,
            type,
            position: { x, y },
            width: 100,
            height: 100,
            ...(parentId && { parentId }),
            ...(color && { color }),
          },
          nodeDataValues: values,
          ...(templateId && { nodeDataTemplateId: templateId }),
        },
      ],
    },
  );
  const node = await t.run((ctx) =>
    ctx.db
      .query("nodes")
      .withIndex("by_llmid", (q) => q.eq("id", created.nodeId))
      .unique(),
  );
  return { id: created.nodeId, nodeDataId: node!.nodeDataId };
}

/** Le stdout d'une sortie de `bash`, sans ses balises. */
export function stdout(output: string): string {
  return /<stdout>\n([\s\S]*?)\n<\/stdout>/.exec(output)?.[1] ?? "";
}

/** Un document BlockNote stocké : un titre, et un paragraphe s'il est donné. */
export function blocknoteDoc(title: string, body?: string): string {
  const text = (value: string) => [{ type: "text", text: value, styles: {} }];
  return JSON.stringify([
    {
      id: "h",
      type: "heading",
      props: { level: 1 },
      content: text(title),
      children: [],
    },
    ...(body === undefined
      ? []
      : [
          {
            id: "p",
            type: "paragraph",
            props: {},
            content: text(body),
            children: [],
          },
        ]),
  ]);
}
