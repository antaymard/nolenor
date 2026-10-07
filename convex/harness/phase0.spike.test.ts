/// <reference types="vite/client" />
// Phase 0 — spike de faisabilité de la harness.
//
// Vérifie, contre le vrai composant @convex-dev/agent 0.6.4 et un modèle
// factice, les hypothèses dont dépend le kernel :
//   1. un step lancé avec des tools SANS `execute` rend la main avec ses tool
//      calls sauvés, sans résultat (décision A) ;
//   2. un tool result écrit par une MUTATION avec le promptMessageId du run
//      reste dans l'`order` du run et est relu par le step suivant ;
//   3. un steer est un message `user` : le composant lui ouvre TOUJOURS un
//      nouvel `order`. Le run déplace donc son promptMessageId sur le steer,
//      et un contextHandler assemble le contexte lui-même (restitution du
//      llmPrompt du message d'ouverture). La réponse suivante est sauvée dans
//      l'order du steer.
// Plus deux constats qui fondent le design : sans résultat, la lib retire le
// tool call du contexte (R20 : résultat et état terminal doivent être écrits
// ensemble), et un message sauvé hors de l'`order` courant est invisible tant
// que le promptMessageId ne bouge pas (R13).
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import agentTest from "@convex-dev/agent/test";
import {
  Agent,
  createThread,
  docsToModelMessages,
  filterOutOrphanedToolMessages,
  listMessages,
  type MessageDoc,
  mockModel,
  saveMessage,
  saveMessages,
} from "@convex-dev/agent";
import { jsonSchema, stepCountIs, tool, type ModelMessage } from "ai";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { components } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";



/** Le mock enregistre chaque appel ; son type public ne l'expose pas. */
type RecordingModel = ReturnType<typeof mockModel> & {
  doStreamCalls: { prompt: LanguageModelV3Prompt }[];
};
function recordingModel(args: Parameters<typeof mockModel>[0]): RecordingModel {
  return mockModel(args) as RecordingModel;
}

function setup() {
  const t = convexTest(schema, modules);
  agentTest.register(t, "agent");
  return t;
}

// Tool défini pour le modèle uniquement : pas d'execute (décision A).
const tools = {
  read_nodes: tool({
    description: "Read nodes",
    inputSchema: jsonSchema<{ nodeIds: string[] }>({
      type: "object",
      properties: { nodeIds: { type: "array", items: { type: "string" } } },
      required: ["nodeIds"],
    }),
  }),
};

const TOOL_CALL = {
  type: "tool-call" as const,
  toolCallId: "call_1",
  toolName: "read_nodes",
  input: JSON.stringify({ nodeIds: ["n1"] }),
};

/** Rôles et types de parts du prompt reçu par le modèle, pour comparaison. */
function shape(prompt: LanguageModelV3Prompt) {
  return prompt.map((m) => {
    if (typeof m.content === "string") return `${m.role}:text`;
    return `${m.role}:${m.content.map((c) => c.type).join("+")}`;
  });
}

function textOf(prompt: LanguageModelV3Prompt): string {
  return JSON.stringify(prompt);
}

/** Écrit un tool result dans l'order du run, comme le fera `tool.ts`. */
function toolResultMessage(output: string): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: TOOL_CALL.toolCallId,
        toolName: TOOL_CALL.toolName,
        output: { type: "text", value: output },
      },
    ],
  };
}

async function listSorted(
  ctx: Parameters<typeof listMessages>[0],
  threadId: string,
): Promise<MessageDoc[]> {
  const page = await listMessages(ctx, components.agent, {
    threadId,
    paginationOpts: { cursor: null, numItems: 100 },
    excludeToolMessages: false,
  });
  return [...page.page].sort(
    (a, b) => a.order - b.order || a.stepOrder - b.stepOrder,
  );
}

/**
 * Prototype de l'assemblage de `transcript.ts` : messages réussis, tool calls
 * orphelins retirés, contenu du message d'ouverture du run remplacé par le
 * llmPrompt.
 */
function assembleRunContext(
  docs: MessageDoc[],
  run: { runStartMessageId: string; runStartContent: string },
): ModelMessage[] {
  const visible = filterOutOrphanedToolMessages(
    docs.filter((d) => d.status === "success"),
  ).map((d) =>
    d._id === run.runStartMessageId
      ? { ...d, message: { role: "user" as const, content: run.runStartContent } }
      : d,
  );
  return docsToModelMessages(visible);
}

describe("phase 0 — boucle externe sur le composant agent", () => {
  test("tools sans execute → tool result par mutation → steer → relus au step suivant", async () => {
    const t = setup();
    const model = recordingModel({
      contentSteps: [
        [TOOL_CALL],
        [{ type: "text", text: "Done reading" }],
      ],
    });
    const agent = new Agent(components.agent, {
      name: "spike",
      languageModel: model,
    });

    const { threadId, promptMessageId } = await t.action(async (ctx) => {
      const threadId = await createThread(ctx, components.agent, {});
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId,
        prompt: "raw user text",
      });
      return { threadId, promptMessageId: messageId };
    });

    // Step 1 : tools sans execute, un seul step.
    const step1 = await t.action(async (ctx) => {
      const result = await agent.streamText(
        ctx,
        { threadId },
        {
          promptMessageId,
          prompt: "<canvas>ctx</canvas> raw user text",
          tools,
          stopWhen: stepCountIs(1),
        },
        { saveStreamDeltas: true },
      );
      await result.consumeStream();
      return {
        toolCalls: (await result.toolCalls).map((c) => c.toolCallId),
        toolResults: (await result.toolResults).length,
      };
    });
    expect(step1.toolCalls).toEqual(["call_1"]);
    expect(step1.toolResults).toBe(0);

    // Le modèle a reçu llmPrompt, pas le texte brut sauvé (R1).
    expect(textOf(model.doStreamCalls[0].prompt)).toContain("<canvas>ctx</canvas>");

    // Tool result écrit par une MUTATION, dans l'order du run.
    // Steer : un message `user` ouvre TOUJOURS un nouvel order dans le
    // composant (messages.ts, addMessages), même avec promptMessageId. Le run
    // déplace donc son promptMessageId sur le steer.
    const steerId = await t.run(async (ctx) => {
      await saveMessages(ctx, components.agent, {
        threadId,
        promptMessageId,
        messages: [toolResultMessage("node n1 content")],
      });
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId,
        prompt: "STEER: use the table instead",
      });
      return messageId;
    });

    const docs = await t.action(async (ctx) => listSorted(ctx, threadId));
    expect(
      docs.map((d) => [d.order, d.stepOrder, d.message?.role]),
    ).toEqual([
      [0, 0, "user"],
      [0, 1, "assistant"],
      [0, 2, "tool"],
      [1, 0, "user"],
    ]);

    // Step 2 : promptMessageId = le steer (position de sauvegarde), et un
    // contextHandler qui assemble le contexte du run lui-même, en restituant
    // le llmPrompt sur le message qui a ouvert le run.
    await t.action(async (ctx) => {
      const result = await agent.streamText(
        ctx,
        { threadId },
        { promptMessageId: steerId, tools, stopWhen: stepCountIs(1) },
        {
          saveStreamDeltas: true,
          contextHandler: async (ctx) =>
            assembleRunContext(await listSorted(ctx, threadId), {
              runStartMessageId: promptMessageId,
              runStartContent: "<canvas>ctx</canvas> raw user text",
            }),
        },
      );
      await result.consumeStream();
    });
    const prompt2 = model.doStreamCalls[1].prompt;
    expect(shape(prompt2)).toEqual([
      "user:text",
      "assistant:tool-call",
      "tool:tool-result",
      "user:text",
    ]);
    expect(textOf(prompt2)).toContain("<canvas>ctx</canvas>");
    expect(textOf(prompt2)).toContain("node n1 content");
    expect(textOf(prompt2)).toContain("STEER: use the table instead");

    // La réponse du step 2 est sauvée dans l'order du steer.
    const after = await t.action(async (ctx) => listSorted(ctx, threadId));
    expect(after[after.length - 1]).toMatchObject({
      order: 1,
      stepOrder: 1,
      message: { role: "assistant" },
    });
  });

  test("R20 — sans tool result, la lib retire le tool call du contexte", async () => {
    const t = setup();
    const model = recordingModel({
      contentSteps: [[TOOL_CALL], [{ type: "text", text: "again" }]],
    });
    const agent = new Agent(components.agent, { name: "spike", languageModel: model });
    const { threadId, promptMessageId } = await t.action(async (ctx) => {
      const threadId = await createThread(ctx, components.agent, {});
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId,
        prompt: "hi",
      });
      return { threadId, promptMessageId: messageId };
    });
    for (let i = 0; i < 2; i++) {
      await t.action(async (ctx) => {
        const r = await agent.streamText(
          ctx,
          { threadId },
          { promptMessageId, tools, stopWhen: stepCountIs(1) },
        );
        await r.consumeStream();
      });
    }
    // Le step 2 ne voit pas l'appel orphelin : le modèle pourrait le refaire.
    expect(shape(model.doStreamCalls[1].prompt)).toEqual(["user:text"]);
  });

  test("R13 — un message sauvé hors de l'order du run est invisible", async () => {
    const t = setup();
    const model = recordingModel({
      contentSteps: [[TOOL_CALL], [{ type: "text", text: "ok" }]],
    });
    const agent = new Agent(components.agent, { name: "spike", languageModel: model });
    const { threadId, promptMessageId } = await t.action(async (ctx) => {
      const threadId = await createThread(ctx, components.agent, {});
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId,
        prompt: "hi",
      });
      return { threadId, promptMessageId: messageId };
    });
    await t.action(async (ctx) => {
      const r = await agent.streamText(
        ctx,
        { threadId },
        { promptMessageId, tools, stopWhen: stepCountIs(1) },
      );
      await r.consumeStream();
    });
    await t.run(async (ctx) => {
      await saveMessages(ctx, components.agent, {
        threadId,
        promptMessageId,
        messages: [toolResultMessage("r")],
      });
      // Sans promptMessageId : nouvel order.
      await saveMessage(ctx, components.agent, {
        threadId,
        prompt: "LATE STEER",
      });
    });
    await t.action(async (ctx) => {
      const r = await agent.streamText(
        ctx,
        { threadId },
        { promptMessageId, tools, stopWhen: stepCountIs(1) },
      );
      await r.consumeStream();
    });
    expect(textOf(model.doStreamCalls[1].prompt)).not.toContain("LATE STEER");
  });
});
