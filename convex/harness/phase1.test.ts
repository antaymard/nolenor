/// <reference types="vite/client" />
// Phase 1 — kernel de la harness : générations et tools en tâches durables.
//
// Un profil de test remplace Nolë : modèle factice (mockModel du composant)
// et trois tools jouets — `echo` (lecture, replay safe), `boom` (lève) et
// `write` (effet de bord, replay unsafe, compte ses exécutions).
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import agentTest from "@convex-dev/agent/test";
import {
  Agent,
  createThread,
  listMessages,
  mockModel,
  saveMessage,
  saveMessages,
  type MessageDoc,
} from "@convex-dev/agent";
import type { LanguageModelV3Content, LanguageModelV3Prompt } from "@ai-sdk/provider";
import { tool } from "ai";
import { z } from "zod";
import { components, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { registerProfile } from "./profiles";
import { abortRun, startRun } from "./tasks";
import { assembleRunContext } from "./transcript";
import type { Profile } from "./types";



type RecordingModel = ReturnType<typeof mockModel> & {
  doStreamCalls: { prompt: LanguageModelV3Prompt }[];
};

// ── Profil de test ─────────────────────────────────────────────────────────

let model: RecordingModel;
let writeExecutions = 0;

/**
 * Le mockModel du composant émet son usage dans l'ancien format plat, que
 * l'AI SDK v6 ne lit plus : on le réécrit au format LanguageModelV3, celui que
 * renvoie OpenRouter (3 tokens en entrée, 10 en sortie par appel).
 */
function setModel(steps: LanguageModelV3Content[][]) {
  const mock = mockModel({ contentSteps: steps }) as RecordingModel;
  const doStream = mock.doStream.bind(mock);
  mock.doStream = async (options) => {
    const result = await doStream(options);
    const stream = result.stream.pipeThrough(
      new TransformStream({
        transform(part, controller) {
          controller.enqueue(
            part.type === "finish"
              ? {
                  ...part,
                  usage: {
                    inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
                    outputTokens: { total: 10, text: 10, reasoning: 0 },
                  },
                }
              : part,
          );
        },
      }),
    );
    return { ...result, stream };
  };
  model = mock;
}

function testProfile(name: string, maxGenerationsPerRun: number): Profile {
  return {
    name,
    agentName: "Tester",
    maxGenerationsPerRun,
    async prepareRun(_ctx, _run, input) {
      const { userPrompt } = input as { userPrompt: string };
      return {
        systemPrompt: "SYSTEM PROMPT",
        llmPrompt: `<canvas_context/>\n${userPrompt}`,
      };
    },
    agent() {
      return new Agent(components.agent, { name: "Tester", languageModel: model });
    },
    tools() {
      return {
        echo: tool({
          description: "Echo",
          inputSchema: z.object({ explanation: z.string(), text: z.string() }),
          execute: async ({ text }) => `echo:${text}`,
        }),
        boom: tool({
          description: "Fails",
          inputSchema: z.object({ explanation: z.string() }),
          execute: async (): Promise<string> => {
            throw new Error("Kaboom");
          },
        }),
        write: tool({
          description: "Side effect",
          inputSchema: z.object({ explanation: z.string() }),
          execute: async () => {
            writeExecutions++;
            return "written";
          },
        }),
      };
    },
    replay(toolName) {
      return toolName === "echo" ? "safe" : "unsafe";
    },
  };
}

registerProfile(testProfile("test", 25));
registerProfile(testProfile("test-max2", 2));

// ── Helpers ────────────────────────────────────────────────────────────────

let callSeq = 0;
function call(toolName: string, args: Record<string, unknown> = {}) {
  callSeq++;
  return {
    type: "tool-call" as const,
    toolCallId: `call_${callSeq}`,
    toolName,
    input: JSON.stringify({ explanation: `Running ${toolName}`, ...args }),
  };
}
const text = (value: string) => ({ type: "text" as const, text: value });

function setup() {
  const t = convexTest(schema, modules);
  agentTest.register(t, "agent");
  return t;
}
type T = ReturnType<typeof setup>;

async function seedThread(t: T) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: userId,
      name: "Canvas",
      updatedAt: Date.now(),
    });
    const threadId = await createThread(ctx, components.agent, { userId });
    await ctx.db.insert("threadMetadata", {
      threadId,
      userId,
      canvasId,
      totalUsageUsd: 0,
      agentName: "Tester",
    });
    return { userId, canvasId, threadId };
  });
}

async function send(
  t: T,
  seed: Awaited<ReturnType<typeof seedThread>>,
  prompt: string,
  profile = "test",
) {
  return t.run(async (ctx) => {
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: seed.threadId,
      userId: seed.userId,
      prompt,
    });
    const max = profile === "test-max2" ? 2 : 25;
    await startRun(ctx, {
      threadId: seed.threadId,
      userId: seed.userId,
      canvasId: seed.canvasId,
      startMessageId: messageId,
      profile: { name: profile, agentName: "Tester", maxGenerationsPerRun: max },
      input: { userPrompt: prompt },
    });
    return messageId;
  });
}

/**
 * Exécute les fonctions planifiées jusqu'à épuisement, en avançant le temps par
 * petits pas : `vi.runAllTimers()` déclencherait aussi le timeout de stream que
 * le composant planifie à plusieurs minutes, et couperait le stream en cours.
 */
async function drain(t: T) {
  await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(10));
}

/** Exécute une seule couche de fonctions planifiées (ex. la génération seule). */
async function runOneLayer(t: T) {
  vi.advanceTimersByTime(10);
  await t.finishInProgressScheduledFunctions();
}

async function transcript(t: T, threadId: string): Promise<MessageDoc[]> {
  return t.action(async (ctx) => {
    const page = await listMessages(ctx, components.agent, {
      threadId,
      paginationOpts: { cursor: null, numItems: 200 },
      excludeToolMessages: false,
    });
    return [...page.page].sort(
      (a, b) => a.order - b.order || a.stepOrder - b.stepOrder,
    );
  });
}

function roles(docs: MessageDoc[]) {
  return docs.map((d) => {
    const content = d.message?.content;
    const parts = Array.isArray(content)
      ? content.map((c) => c.type).join("+")
      : "text";
    return `${d.message?.role}:${parts}`;
  });
}

async function tasksOf(t: T, runMessageId: string) {
  return t.run(async (ctx) =>
    ctx.db
      .query("agentTasks")
      .filter((q) => q.eq(q.field("runMessageId"), runMessageId))
      .collect(),
  );
}

async function threadRow(t: T, threadId: string) {
  return t.run(async (ctx) =>
    ctx.db
      .query("threadMetadata")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .unique(),
  );
}

const promptText = (i: number) => JSON.stringify(model.doStreamCalls[i].prompt);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  writeExecutions = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("phase 1 — kernel", () => {
  test("run complet : génération → tool → génération, transcript et usage", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("echo", { text: "hi" })], [text("All done")]]);

    const runMessageId = await send(t, seed, "Say hi");
    await drain(t);

    expect(roles(await transcript(t, seed.threadId))).toEqual([
      "user:text",
      "assistant:tool-call",
      "tool:tool-result",
      "assistant:text",
    ]);

    // Le 1er appel voit le system prompt et le llmPrompt, pas le texte brut.
    expect(promptText(0)).toContain("SYSTEM PROMPT");
    expect(promptText(0)).toContain("<canvas_context/>");
    // Le 2e appel voit le tool call et son résultat.
    expect(promptText(1)).toContain("echo:hi");
    expect(promptText(1)).toContain("<canvas_context/>");

    const tasks = await tasksOf(t, runMessageId);
    const generations = tasks.filter((x) => x.kind === "generation");
    const tools = tasks.filter((x) => x.kind === "tool");
    expect(generations.map((g) => [g.step, g.status])).toEqual([
      [1, "completed"],
      [2, "completed"],
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      status: "completed",
      toolName: "echo",
      explanation: "Running echo",
    });
    expect(tools[0].resultMessageId).toBeDefined();

    const row = await threadRow(t, seed.threadId);
    expect(row?.run).toBeUndefined();
    expect(row?.runStatus).toBe("idle");
    expect(row?.lastActivity?.text).toBe("Running echo");

    // Usage du run sur le dernier message assistant, sommé sur les 2 appels.
    const metadata = await t.run(async (ctx) =>
      ctx.db.query("messageMetadata").collect(),
    );
    expect(metadata).toHaveLength(1);
    expect(metadata[0].messageId).toBe(generations[1].responseMessageId);
    expect(metadata[0].usage?.totalTokens).toBe(26);
    expect(metadata[0].contextTokens).toBe(13);

    // Prompts du run calculés une fois.
    const prompts = await t.run(async (ctx) => ctx.db.query("runPrompts").collect());
    expect(prompts).toHaveLength(1);
  });

  test("tools parallèles : une seule génération suivante, qui voit les deux résultats", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([
      [call("echo", { text: "a" }), call("echo", { text: "b" })],
      [text("Both")],
    ]);
    const runMessageId = await send(t, seed, "Two");
    await drain(t);

    const tasks = await tasksOf(t, runMessageId);
    expect(tasks.filter((x) => x.kind === "tool")).toHaveLength(2);
    expect(tasks.filter((x) => x.kind === "generation")).toHaveLength(2);
    expect(promptText(1)).toContain("echo:a");
    expect(promptText(1)).toContain("echo:b");
    expect(model.doStreamCalls).toHaveLength(2);
  });

  test("un tool qui lève : le modèle voit l'erreur et le run continue", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("boom")], [text("Recovered")]]);
    const runMessageId = await send(t, seed, "Break");
    await drain(t);

    expect(promptText(1)).toContain("Kaboom");
    const tool = (await tasksOf(t, runMessageId)).find((x) => x.kind === "tool");
    expect(tool).toMatchObject({ status: "failed", error: "Kaboom" });
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
  });

  test("tool call invalide : le modèle voit l'erreur au step suivant", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("does_not_exist")], [text("Corrected")]]);
    const runMessageId = await send(t, seed, "Typo");
    await drain(t);

    expect(model.doStreamCalls).toHaveLength(2);
    // L'erreur écrite par l'AI SDK accompagne l'appel dans le contexte.
    expect(roles(await transcript(t, seed.threadId))).toEqual([
      "user:text",
      "assistant:tool-call",
      "tool:tool-result",
      "assistant:text",
    ]);
    expect(promptText(1)).toContain("does_not_exist");
    const tasks = await tasksOf(t, runMessageId);
    expect(tasks.filter((x) => x.kind === "tool")).toHaveLength(0);
    expect(tasks.filter((x) => x.kind === "generation")).toHaveLength(2);
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
  });

  test("plafond de générations : les tools de la dernière s'exécutent, puis fin", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("echo", { text: "1" })], [call("echo", { text: "2" })], [text("never")]]);
    const runMessageId = await send(t, seed, "Loop", "test-max2");
    await drain(t);

    const tasks = await tasksOf(t, runMessageId);
    expect(tasks.filter((x) => x.kind === "generation")).toHaveLength(2);
    expect(tasks.filter((x) => x.kind === "tool" && x.status === "completed")).toHaveLength(2);
    expect(model.doStreamCalls).toHaveLength(2);
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
  });

  test("abort pendant les tools : plus rien n'enchaîne", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("write")], [text("never")]]);
    const runMessageId = await send(t, seed, "Write");
    await runOneLayer(t); // la génération seule ; le tool est planifié

    await t.run(async (ctx) => {
      expect(await abortRun(ctx, seed.threadId)).toBe(true);
    });
    await drain(t);

    expect(writeExecutions).toBe(0);
    expect(model.doStreamCalls).toHaveLength(1);
    const tasks = await tasksOf(t, runMessageId);
    expect(tasks.map((x) => [x.kind, x.status])).toEqual([
      ["generation", "aborted"],
      ["tool", "aborted"],
    ]);
    const row = await threadRow(t, seed.threadId);
    expect(row?.run).toBeUndefined();
    expect(row?.runStatus).toBe("aborted");
  });

  test("un nouveau message abandonne le run en cours", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("write")], [text("second answer")]]);
    const first = await send(t, seed, "First");
    await runOneLayer(t);
    const second = await send(t, seed, "Second");
    await drain(t);

    expect(writeExecutions).toBe(0);
    const firstTasks = await tasksOf(t, first);
    expect(firstTasks.every((x) => x.status === "aborted")).toBe(true);
    const secondTasks = await tasksOf(t, second);
    expect(secondTasks.map((x) => x.status)).toEqual(["completed"]);
  });

  describe("reprise après crash", () => {
    async function crashDuringTool(toolName: "write" | "echo") {
      const t = setup();
      const seed = await seedThread(t);
      setModel([[call(toolName, { text: "x" })], [text("After recovery")]]);
      const runMessageId = await send(t, seed, "Crash");
      await runOneLayer(t);

      // L'action du tool a claimé (intention enregistrée) puis est morte.
      const toolTask = (await tasksOf(t, runMessageId)).find(
        (x) => x.kind === "tool",
      )!;
      await t.mutation(internal.harness.tasks.claimTool, {
        taskId: toolTask._id,
      });
      await drain(t); // l'action planifiée trouve la tâche déjà prise : rien

      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      await t.mutation(internal.harness.tasks.recoverExpired, {});
      await drain(t);
      return { t, seed, runMessageId, toolTaskId: toolTask._id };
    }

    test("tool unsafe : pas de seconde exécution, le modèle est informé", async () => {
      const { t, seed, runMessageId, toolTaskId } = await crashDuringTool("write");
      expect(writeExecutions).toBe(0);
      const tool = await t.run(async (ctx) => ctx.db.get("agentTasks", toolTaskId));
      expect(tool?.status).toBe("interrupted");
      expect(promptText(1)).toContain("interrupted before it completed");
      expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
      expect(
        (await tasksOf(t, runMessageId)).filter((x) => x.kind === "generation"),
      ).toHaveLength(2);
    });

    test("tool safe : réexécuté", async () => {
      const { t, toolTaskId } = await crashDuringTool("echo");
      const tool = await t.run(async (ctx) => ctx.db.get("agentTasks", toolTaskId));
      expect(tool).toMatchObject({ status: "completed", attempt: 2 });
      expect(promptText(1)).toContain("echo:x");
    });

    test("génération morte : relancée, l'exécution périmée ne peut plus écrire", async () => {
      const t = setup();
      const seed = await seedThread(t);
      setModel([[text("Answer")]]);
      const runMessageId = await send(t, seed, "Hello");

      const generation = (await tasksOf(t, runMessageId))[0];
      const stale = await t.mutation(internal.harness.tasks.claimGeneration, {
        taskId: generation._id,
      });
      await drain(t); // l'action planifiée trouve la tâche prise : rien

      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      await t.mutation(internal.harness.tasks.recoverExpired, {});
      await drain(t);

      // L'exécution d'origine se réveille : son attempt est périmé.
      await t.mutation(internal.harness.tasks.completeGeneration, {
        taskId: generation._id,
        attempt: stale!.attempt,
        toolCalls: [{ toolCallId: "late", toolName: "write", input: {}, replay: "unsafe" }],
        invalidToolCalls: 0,
      });

      const tasks = await tasksOf(t, runMessageId);
      expect(tasks.map((x) => [x.kind, x.status, x.attempt])).toEqual([
        ["generation", "completed", 2],
      ]);
      expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
    });
  });

  test("R14 — run de plus de 100 messages : contexte complet et ordonné", async () => {
    const t = setup();
    const seed = await seedThread(t);
    const runMessageId = await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) {
        await saveMessage(ctx, components.agent, {
          threadId: seed.threadId,
          prompt: `old question ${i}`,
        });
      }
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId: seed.threadId,
        prompt: "run start",
      });
      for (let i = 0; i < 70; i++) {
        await saveMessages(ctx, components.agent, {
          threadId: seed.threadId,
          promptMessageId: messageId,
          messages: [
            {
              role: "assistant",
              content: [
                { type: "tool-call", toolCallId: `c${i}`, toolName: "echo", input: {} },
              ],
            },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: `c${i}`,
                  toolName: "echo",
                  output: { type: "text", value: `r${i}` },
                },
              ],
            },
          ],
        });
      }
      return messageId;
    });

    const context = await t.action(async (ctx) =>
      assembleRunContext(ctx, {
        threadId: seed.threadId,
        promptMessageId: runMessageId,
        runMessageId,
        llmPrompt: "LLM PROMPT",
      }),
    );
    // Le run entier (1 + 140 messages), aucun historique au-delà.
    expect(context).toHaveLength(141);
    expect(context[0]).toMatchObject({ role: "user", content: "LLM PROMPT" });
    expect(context[1].role).toBe("assistant");
    expect(context[140].role).toBe("tool");
  });

  test("run court : la fenêtre reste celle de la lib (100 messages)", async () => {
    const t = setup();
    const seed = await seedThread(t);
    const runMessageId = await t.run(async (ctx) => {
      for (let i = 0; i < 150; i++) {
        await saveMessage(ctx, components.agent, {
          threadId: seed.threadId,
          prompt: `old ${i}`,
        });
      }
      return (
        await saveMessage(ctx, components.agent, {
          threadId: seed.threadId,
          prompt: "run start",
        })
      ).messageId;
    });
    const context = await t.action(async (ctx) =>
      assembleRunContext(ctx, {
        threadId: seed.threadId,
        promptMessageId: runMessageId,
        runMessageId,
        llmPrompt: "LLM PROMPT",
      }),
    );
    expect(context).toHaveLength(100);
    expect(context[99]).toMatchObject({ role: "user", content: "LLM PROMPT" });
  });
});
