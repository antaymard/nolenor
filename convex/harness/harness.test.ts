/// <reference types="vite/client" />
// Harness : kernel (phase 1), messages pendant un run (phase 2), retry et
// changement de modèle (phase 3a), deltas `<system_update>` (phase 3b),
// tools différés et halo des nodes écrits (phase 3c), compaction (phase 4),
// sous-agents (phase 5a).
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
  toUIMessages,
  saveMessage,
  saveMessages,
  type MessageDoc,
} from "@convex-dev/agent";
import type { LanguageModelV3Content, LanguageModelV3Prompt } from "@ai-sdk/provider";
import { APICallError, tool } from "ai";
import { z } from "zod";
import { api, components, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { registerProfile } from "./profiles";
import { isRetryableGenerationError } from "./errors";
import { abortRun, setRunModel, startRun, submitToThread } from "./tasks";
import { assembleRunContext, findCut } from "./transcript";
import type { ContextSection, Memory, Profile, StepWindow } from "./types";



type RecordingModel = ReturnType<typeof mockModel> & {
  doStreamCalls: { prompt: LanguageModelV3Prompt }[];
  doGenerateCalls: { prompt: LanguageModelV3Prompt; toolChoice?: unknown }[];
};

const V3_USAGE = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

// ── Profil de test ─────────────────────────────────────────────────────────

let model: RecordingModel;
let writeExecutions = 0;
// Ce que le profil de test rend comme delta et comme souvenirs, par step.
let stepSections: (window: StepWindow) => ContextSection[] = () => [];
let recalled: (window: StepWindow) => Memory[] = () => [];
let stepContextCalls = 0;
// Seuil de compaction du profil de test, en part de sa fenêtre (1 = jamais
// atteint par les 3 tokens en entrée du modèle factice).
let compactionRatio = 1;

/**
 * Le mockModel du composant émet son usage dans l'ancien format plat, que
 * l'AI SDK v6 ne lit plus : on le réécrit au format LanguageModelV3, celui que
 * renvoie OpenRouter (3 tokens en entrée, 10 en sortie par appel).
 */
function setModel(
  steps: LanguageModelV3Content[][],
  /** Appels (par rang) qui échouent en plein stream, avec leur erreur. */
  failures: Record<number, string> = {},
) {
  const mock = mockModel({ contentSteps: steps }) as RecordingModel;
  const doStream = mock.doStream.bind(mock);
  let calls = 0;
  mock.doStream = async (options) => {
    const failure = failures[calls++];
    if (failure !== undefined) {
      mock.doStreamCalls.push(options);
      return { stream: failingStream(failure) };
    }
    const result = await doStream(options);
    return { ...result, stream: result.stream.pipeThrough(withV3Usage()) };
  };
  const doGenerate = mock.doGenerate.bind(mock);
  mock.doGenerate = async (options) => ({
    ...(await doGenerate(options)),
    usage: V3_USAGE,
  });
  model = mock;
}

function withV3Usage() {
  return new TransformStream({
    transform(part, controller) {
      controller.enqueue(
        part.type === "finish" ? { ...part, usage: V3_USAGE } : part,
      );
    },
  });
}

/**
 * Un modèle qui répond selon son prompt : quand plusieurs runs tournent en
 * parallèle (parent et sous-agent), l'ordre des appels n'est pas fixé.
 */
function setResponder(respond: (prompt: string) => LanguageModelV3Content[]) {
  setModel([[text("unused")]]);
  const base = model;
  base.doStream = async (options) => {
    base.doStreamCalls.push(options);
    const once = mockModel({
      contentSteps: [respond(JSON.stringify(options.prompt))],
    });
    const result = await once.doStream(options);
    return { ...result, stream: result.stream.pipeThrough(withV3Usage()) };
  };
}

/** Un stream qui commence à répondre, puis reçoit une erreur du provider. */
function failingStream(error: string) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "t" });
      controller.enqueue({ type: "text-delta", id: "t", delta: "Partial " });
      controller.enqueue({ type: "error", error: { message: error } });
      controller.close();
    },
  });
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
        rare: tool({
          description: "A rarely needed tool. Does rare things.",
          inputSchema: z.object({ explanation: z.string() }),
          execute: async () => "rare done",
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
    deferredTools: ["rare"],
    async stepContext(_ctx, _run, window) {
      stepContextCalls++;
      return stepSections(window);
    },
    memory: {
      async recall(_ctx, _run, window) {
        return recalled(window);
      },
    },
    compaction: {
      contextWindow: () => 1_000_000,
      get thresholdRatio() {
        return compactionRatio;
      },
      instructions: "SUMMARY FORMAT",
      async trackedState() {
        return "<nodes>tracked</nodes>";
      },
    },
  };
}

registerProfile({
  ...testProfile("test", 25),
  subagents: { profile: "test-worker" },
});
// Le sous-agent : son brief tient lieu de prompt.
registerProfile({
  ...testProfile("test-worker", 10),
  async prepareRun(_ctx, _run, input) {
    return {
      systemPrompt: "WORKER SYSTEM PROMPT",
      llmPrompt: (input as { brief: string }).brief,
    };
  },
});
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

/** Comme `nole.saveMessage` : ouvre un run, ou part en file si un run tourne. */
async function submit(
  t: T,
  seed: Awaited<ReturnType<typeof seedThread>>,
  prompt: string,
  model?: string,
) {
  return t.run(async (ctx) =>
    submitToThread(ctx, {
      threadId: seed.threadId,
      userId: seed.userId,
      canvasId: seed.canvasId,
      profile: { name: "test", agentName: "Tester", maxGenerationsPerRun: 25 },
      prompt,
      content: `<ctx/>\n<user_message>\n${prompt}\n</user_message>`,
      input: { userPrompt: prompt },
      model,
    }),
  );
}

async function submissions(t: T, threadId: string) {
  return t.run(async (ctx) =>
    ctx.db
      .query("submissions")
      .filter((q) => q.eq(q.field("threadId"), threadId))
      .collect(),
  );
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
  stepSections = () => [];
  recalled = () => [];
  stepContextCalls = 0;
  compactionRatio = 1;
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

    // Une seule action pour les deux tools du round.
    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const toolActions = scheduled.filter((job) => job.name.startsWith("harness/tool"));
    expect(toolActions.map((job) => job.name)).toEqual(["harness/tool:runRound"]);
    expect(toolActions[0].args[0]).toMatchObject({ taskIds: expect.any(Array) });
    expect((toolActions[0].args[0] as { taskIds: string[] }).taskIds).toHaveLength(2);
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
        maxTokens: 0,
      }),
    );
    // Budget épuisé : le run entier (1 + 140 messages), aucun historique.
    expect(context).toHaveLength(141);
    expect(context[0]).toMatchObject({ role: "user", content: "LLM PROMPT" });
    expect(context[1].role).toBe("assistant");
    expect(context[140].role).toBe("tool");
  });

  test("historique : entier sans budget, coupé par le budget, le run toujours gardé", async () => {
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
    const assemble = (maxTokens?: number) =>
      t.action(async (ctx) =>
        assembleRunContext(ctx, {
          threadId: seed.threadId,
          promptMessageId: runMessageId,
          runMessageId,
          llmPrompt: "LLM PROMPT",
          maxTokens,
        }),
      );
    const full = await assemble();
    expect(full).toHaveLength(151);
    expect(full[0]).toMatchObject({ role: "user", content: "old 0" });
    const bounded = await assemble(0);
    expect(bounded).toEqual([{ role: "user", content: "LLM PROMPT" }]);
  });
});

describe("phase 2 — messages pendant un run", () => {
  test("thread au repos : le message ouvre un run", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[text("Hi")]]);
    const result = await submit(t, seed, "Hello");
    expect(result.queued).toBe(false);
    await drain(t);
    expect(roles(await transcript(t, seed.threadId))).toEqual([
      "user:text",
      "assistant:text",
    ]);
    expect(await submissions(t, seed.threadId)).toHaveLength(0);
  });

  test("steer pendant les tools : placé au step suivant, vu par le modèle", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("echo", { text: "a" })], [text("Took the steer")]]);
    await submit(t, seed, "First");
    await runOneLayer(t); // génération 1 ; le round de tools est planifié

    const steer = await submit(t, seed, "Use the table instead");
    expect(steer.queued).toBe(true);
    await drain(t);

    const docs = await transcript(t, seed.threadId);
    expect(roles(docs)).toEqual([
      "user:text",
      "assistant:tool-call",
      "tool:tool-result",
      "user:text",
      "assistant:text",
    ]);
    // Le steer ouvre un nouvel order ; la réponse est sauvée dans le sien.
    expect(docs[3].order).toBe(docs[0].order + 1);
    expect(docs[4].order).toBe(docs[3].order);
    // Le modèle voit le tool result PUIS le steer, avec son contexte.
    const seen = promptText(1);
    expect(seen.indexOf("echo:a")).toBeLessThan(seen.indexOf("Use the table instead"));
    expect(seen).toContain("<ctx/>");
    // Toujours le contexte d'ouverture du run.
    expect(seen).toContain("<canvas_context/>");

    const [submission] = await submissions(t, seed.threadId);
    expect(submission).toMatchObject({ status: "placed", messageId: docs[3]._id });
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
  });

  test("plusieurs steers : placés ensemble, dans l'ordre", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("echo", { text: "a" })], [text("ok")]]);
    await submit(t, seed, "First");
    await runOneLayer(t);
    await submit(t, seed, "Steer one");
    await submit(t, seed, "Steer two");
    await drain(t);

    const seen = promptText(1);
    expect(seen.indexOf("Steer one")).toBeLessThan(seen.indexOf("Steer two"));
    expect(model.doStreamCalls).toHaveLength(2);
  });

  test("steer arrivé trop tard (réponse finale) : il ouvre le run suivant", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[text("Answer to the follow-up")]]);
    const first = await submit(t, seed, "First");
    if (first.queued) throw new Error("expected a run");

    // La génération 1 démarre (claim), puis un message arrive pendant qu'elle
    // écrit sa réponse finale.
    const generation = (await tasksOf(t, first.messageId))[0];
    const claim = await t.mutation(internal.harness.tasks.claimGeneration, {
      taskId: generation._id,
    });
    const late = await submit(t, seed, "One more thing");
    expect(late.queued).toBe(true);
    await t.mutation(internal.harness.tasks.completeGeneration, {
      taskId: generation._id,
      attempt: claim!.attempt,
      toolCalls: [],
      invalidToolCalls: 0,
    });
    await drain(t);

    const [submission] = await submissions(t, seed.threadId);
    expect(submission.status).toBe("placed");
    // Un second run, ouvert par le message en file (texte brut, contexte via
    // le llmPrompt de ce run).
    const secondRun = await tasksOf(t, submission.messageId!);
    expect(secondRun.map((x) => [x.kind, x.status])).toEqual([
      ["generation", "completed"],
    ]);
    expect(promptText(0)).toContain("<canvas_context/>");
    expect(promptText(0)).toContain("One more thing");
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
  });

  test("stop : les messages en file sont retirés", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("write")], [text("never")]]);
    await submit(t, seed, "First");
    await runOneLayer(t);
    await submit(t, seed, "Queued");

    await t.run(async (ctx) => {
      await abortRun(ctx, seed.threadId);
    });
    await drain(t);

    const [submission] = await submissions(t, seed.threadId);
    expect(submission.status).toBe("withdrawn");
    expect(model.doStreamCalls).toHaveLength(1);
    expect((await threadRow(t, seed.threadId))?.run).toBeUndefined();
  });

  test("retrait par l'utilisateur avant placement : jamais vu par le modèle", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("echo", { text: "a" })], [text("ok")]]);
    await submit(t, seed, "First");
    await runOneLayer(t);
    const queued = await submit(t, seed, "Never mind");
    if (!queued.queued) throw new Error("expected a queued submission");

    const asUser = t.withIdentity({ subject: `${seed.userId}|session` });
    expect(
      await asUser.query(api.harness.ingress.listQueuedSubmissions, {
        threadId: seed.threadId,
      }),
    ).toMatchObject([{ prompt: "Never mind" }]);
    expect(
      await asUser.mutation(api.harness.ingress.withdrawSubmission, {
        submissionId: queued.submissionId,
      }),
    ).toEqual({ withdrawn: true });
    await drain(t);

    expect(promptText(1)).not.toContain("Never mind");
    const [submission] = await submissions(t, seed.threadId);
    expect(submission.status).toBe("withdrawn");
  });
});

describe("phase 3a — retry et changement de modèle", () => {
  async function generations(t: T, runMessageId: string) {
    return (await tasksOf(t, runMessageId))
      .filter((task) => task.kind === "generation")
      .sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  }

  test("erreur passagère en plein stream : rejouée après backoff, le run aboutit", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[text("All done")]], { 0: "Provider returned 502 Bad Gateway" });
    const runMessageId = await send(t, seed, "Hello");

    await runOneLayer(t);
    const [waiting] = await generations(t, runMessageId);
    expect(waiting).toMatchObject({ status: "pending", attempt: 1 });
    expect(waiting.error).toContain("502");
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("running");

    vi.advanceTimersByTime(2000);
    await drain(t);

    const [generation] = await generations(t, runMessageId);
    expect(generation).toMatchObject({ status: "completed", attempt: 2 });
    expect(model.doStreamCalls).toHaveLength(2);
    // La tentative ratée n'entre pas dans le contexte de la suivante.
    expect(promptText(1)).not.toContain("Partial");
    const docs = await transcript(t, seed.threadId);
    const ui = toUIMessages(docs);
    const last = ui[ui.length - 1];
    expect(last).toMatchObject({ role: "assistant", status: "success" });
    expect(last.text).toBe("All done");
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
  });

  test("erreur non passagère : échec immédiat, sans retry", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[text("Never")]], { 0: "This model's maximum context length is exceeded" });
    await send(t, seed, "Hello");
    await drain(t);

    expect(model.doStreamCalls).toHaveLength(1);
    const row = await threadRow(t, seed.threadId);
    expect(row?.runStatus).toBe("error");
    expect(row?.run).toBeUndefined();
  });

  test("erreur passagère répétée : abandon après 3 tentatives", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[text("Never")]], {
      0: "429 rate limit",
      1: "429 rate limit",
      2: "429 rate limit",
    });
    const runMessageId = await send(t, seed, "Hello");
    await runOneLayer(t);
    vi.advanceTimersByTime(2000);
    await runOneLayer(t);
    vi.advanceTimersByTime(8000);
    await drain(t);

    expect(model.doStreamCalls).toHaveLength(3);
    const [generation] = await generations(t, runMessageId);
    expect(generation).toMatchObject({ status: "failed", attempt: 3 });
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("error");
  });

  test("modèle changé pendant le run : pris à la génération suivante", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("echo", { text: "a" })], [text("Done")]]);
    const result = await submit(t, seed, "First", "model-a");
    if (result.queued) throw new Error("expected a run start");
    await runOneLayer(t);

    expect(
      await t.run((ctx) => setRunModel(ctx, seed.threadId, "model-b")),
    ).toBe(true);
    await drain(t);

    const [first, second] = await generations(t, result.messageId);
    expect(first.model).toBe("model-a");
    expect(second.model).toBe("model-b");
    // Au repos, rien à changer : le modèle part avec le prochain message.
    expect(
      await t.run((ctx) => setRunModel(ctx, seed.threadId, "model-c")),
    ).toBe(false);
  });

  test("un steer porte son modèle : la génération qui le place le prend", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("echo", { text: "a" })], [text("Done")]]);
    const result = await submit(t, seed, "First", "model-a");
    if (result.queued) throw new Error("expected a run start");
    await runOneLayer(t);
    await submit(t, seed, "Switch", "model-b");
    await drain(t);

    const [, second] = await generations(t, result.messageId);
    expect(second.model).toBe("model-b");
  });

  test("classement des erreurs", () => {
    const apiError = (statusCode: number) =>
      new APICallError({
        message: "failed",
        url: "https://openrouter.ai",
        requestBodyValues: {},
        statusCode,
      });
    expect(isRetryableGenerationError(apiError(429))).toBe(true);
    expect(isRetryableGenerationError(apiError(503))).toBe(true);
    expect(isRetryableGenerationError(apiError(400))).toBe(false);
    expect(isRetryableGenerationError(apiError(401))).toBe(false);
    expect(isRetryableGenerationError(new Error("fetch failed"))).toBe(true);
    expect(
      isRetryableGenerationError({ error: { code: 502, message: "Upstream error" } }),
    ).toBe(true);
    expect(isRetryableGenerationError(new Error("Invalid tool schema"))).toBe(false);
  });
});

describe("phase 3b — deltas <system_update>", () => {
  const countOf = (haystack: string, needle: string) =>
    haystack.split(needle).length - 1;

  test("placé avant la réponse de son step, puis oublié au run suivant", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([
      [call("echo", { text: "a" })],
      [call("echo", { text: "b" })],
      [text("Done")],
      [text("Second run")],
    ]);
    stepSections = (window) =>
      window.since === null
        ? []
        : [{ tag: "canvas_changes", content: `change-${window.step}` }];

    const runMessageId = await send(t, seed, "First");
    await drain(t);

    // Step 1 : rien (le message d'ouverture porte déjà le contexte).
    expect(promptText(0)).not.toContain("system_update");
    // Step 2 : le delta en queue, après le résultat du round.
    const second = promptText(1);
    expect(second.indexOf("change-2")).toBeGreaterThan(second.indexOf("echo:a"));
    // Step 3 : le delta du step 2 reste à sa place, le nouveau en queue.
    const third = promptText(2);
    expect(third.indexOf("change-2")).toBeLessThan(third.indexOf("echo:b"));
    expect(third.indexOf("change-3")).toBeGreaterThan(third.indexOf("echo:b"));
    expect(countOf(third, "<system_update>")).toBe(2);

    const step2 = (await tasksOf(t, runMessageId)).find(
      (task) => task.kind === "generation" && task.step === 2,
    );
    expect(step2?.systemUpdate).toContain("<canvas_changes>");
    // Rien dans le transcript : l'UI n'a rien à filtrer.
    expect(JSON.stringify(await transcript(t, seed.threadId))).not.toContain(
      "system_update",
    );

    // Run suivant : les deltas du précédent n'existent plus pour le modèle.
    await send(t, seed, "Again");
    await drain(t);
    expect(promptText(3)).not.toContain("change-");
  });

  test("mémoire : jamais deux fois le même souvenir dans un run, injections loguées", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("echo", { text: "a" })], [text("Done")]]);
    recalled = (window) =>
      window.step === 1
        ? [
            { id: "m1", content: "memory-one", score: 0.9 },
            { id: "m2", content: "memory-two", score: 0.7 },
          ]
        : [
            { id: "m2", content: "memory-two", score: 0.8 },
            { id: "m3", content: "memory-three" },
          ];

    const runMessageId = await send(t, seed, "First");
    await drain(t);

    expect(promptText(0)).toContain("memory-one");
    const second = promptText(1);
    expect(countOf(second, "memory-two")).toBe(1);
    expect(second.indexOf("memory-three")).toBeGreaterThan(second.indexOf("echo:a"));

    const generations = (await tasksOf(t, runMessageId))
      .filter((task) => task.kind === "generation")
      .sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
    expect(generations.map((g) => g.memories)).toEqual([
      [
        { id: "m1", score: 0.9 },
        { id: "m2", score: 0.7 },
      ],
      [{ id: "m3" }],
    ]);
  });

  test("génération rejouée : le même delta, calculé une seule fois", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([[call("echo", { text: "a" })], [text("Done")]], {
      1: "503 Service Unavailable",
    });
    stepSections = (window) =>
      window.since === null
        ? []
        : [{ tag: "canvas_changes", content: `computed-${stepContextCalls}` }];

    await send(t, seed, "First");
    await runOneLayer(t); // step 1
    await runOneLayer(t); // round de tools → step 2 planifié
    await runOneLayer(t); // step 2, tentative 1 : échoue
    vi.advanceTimersByTime(2000);
    await drain(t);

    expect(model.doStreamCalls).toHaveLength(3);
    expect(stepContextCalls).toBe(2);
    expect(promptText(1)).toContain("computed-2");
    expect(promptText(2)).toContain("computed-2");
  });

  test("changements du canvas pendant le run : ceux des autres, pas ceux du run", async () => {
    const t = setup();
    const seed = await seedThread(t);
    const runMessageId = "run-message";
    const at = 1_000_000;
    await t.run(async (ctx) => {
      const node = async (id: string, updatedAt: number) => {
        const nodeDataId = await ctx.db.insert("nodeDatas", {
          canvasId: seed.canvasId,
          type: "title",
          updatedAt,
          values: { text: id },
        });
        await ctx.db.insert("nodes", {
          id,
          nodeDataId,
          canvasId: seed.canvasId,
          type: "title",
          position: { x: 0, y: 0 },
          width: 100,
          height: 40,
        });
        return nodeDataId;
      };
      await node("before", at - 10);
      await node("byUser", at + 10);
      await node("writtenByRun", at + 20);
      const created = await node("createdByRun", at + 30);
      await node("after", at + 500);

      const base = {
        profile: "test",
        threadId: seed.threadId,
        canvasId: seed.canvasId,
        userId: seed.userId,
        runMessageId,
        status: "completed" as const,
        attempt: 1,
      };
      const generationId = await ctx.db.insert("agentTasks", {
        ...base,
        kind: "generation",
        step: 1,
      });
      await ctx.db.insert("agentTasks", {
        ...base,
        kind: "tool",
        ownerTaskId: generationId,
        toolName: "write",
        replay: "unsafe",
        input: { nodeId: "writtenByRun" },
      });
      const row = await ctx.db
        .query("threadMetadata")
        .withIndex("by_threadId", (q) => q.eq("threadId", seed.threadId))
        .unique();
      await ctx.db.patch("threadMetadata", row!._id, {
        touchedNodes: [
          { nodeDataId: created, kind: "created", at: Date.now() + 1000 },
        ],
      });
    });

    const changes = await t.query(
      internal.ia.helpers.canvasChangesDuringRun.canvasChangesDuringRun,
      {
        canvasId: seed.canvasId,
        threadId: seed.threadId,
        runMessageId,
        since: at,
        until: at + 100,
      },
    );
    expect(changes.nodes.map((node) => node.id)).toEqual(["byUser"]);
  });
});

describe("phase 3c — tools différés et nodes écrits", () => {
  const toolNames = (i: number) =>
    ((model.doStreamCalls[i] as { tools?: { name: string }[] }).tools ?? []).map(
      (t) => t.name,
    );

  test("load_tools : résolu sans action, le tool est décrit pour le reste du run", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([
      [call("load_tools", { names: ["rare", "nope"] })],
      [call("rare")],
      [text("Done")],
    ]);
    const runMessageId = await send(t, seed, "Use the rare tool");
    await runOneLayer(t); // step 1 : load_tools
    // Résolu dans la transaction : le step 2 est déjà planifié, sans round.
    const tasks = await tasksOf(t, runMessageId);
    expect(tasks.find((task) => task.toolName === "load_tools")?.status).toBe(
      "completed",
    );
    expect(tasks.filter((task) => task.kind === "generation")).toHaveLength(2);
    await drain(t);

    expect(toolNames(0)).toContain("load_tools");
    expect(toolNames(0)).not.toContain("rare");
    expect(JSON.stringify(model.doStreamCalls[0])).toContain(
      "rare: A rarely needed tool.",
    );
    // Le modèle lit ce qui a été chargé, et ce qui ne pouvait pas l'être.
    const second = promptText(1);
    expect(second).toContain("Loaded: rare");
    expect(second).toContain("Not loadable: nope");
    expect(toolNames(1)).toContain("rare");
    expect(toolNames(1)).not.toContain("load_tools");
    expect(promptText(2)).toContain("rare done");
    expect((await threadRow(t, seed.threadId))?.run).toBeUndefined();
  });

  test("listLiveActivity : les nodes écrits par le run en cours", async () => {
    const t = setup();
    const seed = await seedThread(t);
    const runMessageId = "run-message";
    await t.run(async (ctx) => {
      const node = async (id: string) => {
        const nodeDataId = await ctx.db.insert("nodeDatas", {
          canvasId: seed.canvasId,
          type: "title",
          updatedAt: Date.now(),
          values: { text: id },
        });
        await ctx.db.insert("nodes", {
          id,
          nodeDataId,
          canvasId: seed.canvasId,
          type: "title",
          position: { x: 0, y: 0 },
          width: 100,
          height: 40,
        });
        return nodeDataId;
      };
      await node("untouched");
      await node("patched");
      const created = await node("created");
      const base = {
        profile: "test",
        threadId: seed.threadId,
        canvasId: seed.canvasId,
        userId: seed.userId,
        runMessageId,
        attempt: 1,
      };
      const generationId = await ctx.db.insert("agentTasks", {
        ...base,
        kind: "generation",
        status: "waiting",
        step: 1,
      });
      await ctx.db.insert("agentTasks", {
        ...base,
        kind: "tool",
        status: "completed",
        ownerTaskId: generationId,
        toolName: "write",
        replay: "unsafe",
        input: { nodeId: "patched" },
      });
      await ctx.db.insert("agentTasks", {
        ...base,
        kind: "tool",
        status: "running",
        ownerTaskId: generationId,
        toolName: "echo",
        explanation: "Reading",
        replay: "safe",
        input: { nodeIds: ["untouched"] },
      });
      const row = await ctx.db
        .query("threadMetadata")
        .withIndex("by_threadId", (q) => q.eq("threadId", seed.threadId))
        .unique();
      await ctx.db.patch("threadMetadata", row!._id, {
        touchedNodes: [
          { nodeDataId: created, kind: "created", at: Date.now() + 1000 },
        ],
      });
    });

    const asUser = t.withIdentity({ subject: `${seed.userId}|session` });
    const activity = await asUser.query(api.harness.live.listLiveActivity, {
      canvasId: seed.canvasId,
    });
    expect(activity.calls).toMatchObject([
      { toolName: "echo", access: "read", nodeIds: ["untouched"] },
    ]);
    expect(activity.written.map((w) => w.nodeId).sort()).toEqual([
      "created",
      "patched",
    ]);
  });
});

describe("phase 4 — compaction", () => {
  /** Un historique ancien assez gros pour qu'une coupe existe (~24k tokens). */
  async function seedOldHistory(t: T, seed: Awaited<ReturnType<typeof seedThread>>) {
    await t.run(async (ctx) => {
      for (let i = 0; i < 8; i++) {
        await saveMessage(ctx, components.agent, {
          threadId: seed.threadId,
          prompt: `old-${i} ${"x".repeat(12_000)}`,
        });
      }
    });
  }

  async function compactions(t: T, threadId: string) {
    return t.run(async (ctx) =>
      ctx.db
        .query("compactions")
        .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
        .collect(),
    );
  }

  test("fin de run au-delà du seuil : résumé in-cache, le run suivant repart du résumé", async () => {
    const t = setup();
    const seed = await seedThread(t);
    await seedOldHistory(t, seed);
    compactionRatio = 0.000001; // 3 tokens en entrée suffisent
    setModel([[text("Done")], [text("THE SUMMARY")], [text("After")]]);

    await send(t, seed, "Now");
    await drain(t);

    const [row] = await compactions(t, seed.threadId);
    expect(row).toMatchObject({ mode: "inCache", tokensBefore: 3 });
    expect(row.summary).toContain("THE SUMMARY");
    expect(row.summary).toContain("<nodes>tracked</nodes>");
    expect(row.summary).toContain("- old-0 ");
    expect(row.userMessages.length).toBeGreaterThan(0);

    // Le résumé reçoit le contexte exact de la dernière génération (même
    // préfixe : servi depuis le cache), plus la consigne, sans tools.
    const [summaryCall] = model.doGenerateCalls;
    const lastGeneration = model.doStreamCalls[0].prompt;
    expect(JSON.stringify(summaryCall.prompt.slice(0, lastGeneration.length))).toBe(
      JSON.stringify(lastGeneration),
    );
    expect(JSON.stringify(summaryCall.prompt)).toContain("<compaction_request>");
    expect(summaryCall.toolChoice).toEqual({ type: "none" });
    // Rien n'est écrit dans le thread.
    expect(JSON.stringify(await transcript(t, seed.threadId))).not.toContain(
      "THE SUMMARY",
    );

    compactionRatio = 1;
    await send(t, seed, "Next");
    await drain(t);
    const next = promptText(1);
    expect(next).toContain("<conversation_summary>");
    expect(next).toContain("THE SUMMARY");
    // Résumé (le début des messages, recopié) à la place du message entier.
    expect(next).not.toContain(`old-0 ${"x".repeat(1000)}`);
    expect(next).toContain(`old-7 ${"x".repeat(1000)}`);
    expect(next).toContain("Next");
  });

  test("débordement en plein run : résumé sérialisé, puis la génération est rejouée", async () => {
    const t = setup();
    const seed = await seedThread(t);
    await seedOldHistory(t, seed);
    setModel([[text("THE SUMMARY")], [text("Done")]], {
      0: "This model's maximum context length is 1000 tokens",
    });

    const runMessageId = await send(t, seed, "Now");
    await drain(t);

    const [row] = await compactions(t, seed.threadId);
    expect(row.mode).toBe("serialized");
    const summaryPrompt = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(summaryPrompt).toContain("context summarization assistant");
    expect(summaryPrompt).toContain("[User]: old-0");
    // Rejouée sur le contexte compacté : résumé, puis la demande et la suite.
    const retried = promptText(1);
    expect(retried).toContain("<conversation_summary>");
    expect(retried).toContain("<canvas_context/>");
    expect(retried).not.toContain(`old-0 ${"x".repeat(1000)}`);

    const generation = (await tasksOf(t, runMessageId)).find(
      (task) => task.kind === "generation",
    );
    expect(generation).toMatchObject({ status: "completed", attempt: 2 });
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
  });

  test("thread court : seuil atteint mais rien d'assez ancien, pas de compaction", async () => {
    const t = setup();
    const seed = await seedThread(t);
    compactionRatio = 0.000001;
    setModel([[text("Done")]]);
    await send(t, seed, "Hello");
    await drain(t);

    expect(await compactions(t, seed.threadId)).toEqual([]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test("point de coupe : jamais sur un résultat de tool", () => {
    const doc = (id: string, role: "user" | "assistant" | "tool", size: number) =>
      ({
        _id: id,
        order: 0,
        stepOrder: 0,
        message: { role, content: "x".repeat(size) },
      }) as unknown as MessageDoc;
    const docs = [
      doc("a", "user", 40_000),
      doc("b", "assistant", 400),
      doc("c", "tool", 80_000),
      doc("d", "assistant", 400),
    ];
    // Les ~20k derniers tokens commencent sur le résultat `c` : la coupe
    // remonte à son appel.
    expect(findCut(docs, 20_000)?._id).toBe("b");
    expect(findCut(docs.slice(1), 20_000)).toBeNull();
  });
});

describe("phase 5a — sous-agents", () => {
  async function childThreadOf(t: T, parentThreadId: string) {
    return t.run(async (ctx) =>
      (await ctx.db.query("threadMetadata").collect()).find(
        (row) => row.masterThreadId === parentThreadId,
      ),
    );
  }

  test("premier plan : le parent attend, le rapport devient le résultat du tool", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setResponder((prompt) =>
      prompt.includes("WORKER SYSTEM PROMPT")
        ? [text("Child report")]
        : prompt.includes("Child report")
          ? [text("Parent done")]
          : [call("run_subAgent", { instructions: "Summarize the docs" })],
    );

    const runMessageId = await send(t, seed, "Delegate this");
    await drain(t);

    expect(roles(await transcript(t, seed.threadId))).toEqual([
      "user:text",
      "assistant:tool-call",
      "tool:tool-result",
      "assistant:text",
    ]);
    const child = await childThreadOf(t, seed.threadId);
    expect(child).toMatchObject({ runStatus: "idle", canvasId: seed.canvasId });
    expect(child?.run).toBeUndefined();
    const childMessages = await transcript(t, child!.threadId);
    expect(childMessages[0].text).toBe("Summarize the docs");

    const spawn = (await tasksOf(t, runMessageId)).find(
      (task) => task.toolName === "run_subAgent",
    );
    expect(spawn).toMatchObject({
      status: "completed",
      childThreadId: child!.threadId,
    });
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
  });

  test("arrière-plan : le parent continue, le rapport revient en followUp", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setResponder((prompt) =>
      prompt.includes("WORKER SYSTEM PROMPT")
        ? [text("Child report")]
        : prompt.includes("subagent_result")
          ? [text("It found the answer")]
          : prompt.includes("Started in the background")
            ? [text("Working on it in the background")]
            : [call("run_subAgent", { instructions: "Long job", background: true })],
    );

    await send(t, seed, "Do the long job");
    await drain(t);

    const docs = await transcript(t, seed.threadId);
    const followUp = docs.find(
      (doc) => doc.message?.role === "user" && doc.text?.includes("<subagent_result"),
    );
    expect(followUp?.text).toContain("Child report");
    expect(docs[docs.length - 1].text).toBe("It found the answer");
    expect((await threadRow(t, seed.threadId))?.runStatus).toBe("idle");
    expect((await childThreadOf(t, seed.threadId))?.runStatus).toBe("idle");
  });

  test("arrêt du parent : le sous-agent de premier plan s'arrête aussi", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setResponder((prompt) =>
      prompt.includes("WORKER SYSTEM PROMPT")
        ? [text("Child report")]
        : [call("run_subAgent", { instructions: "Slow job" })],
    );
    const runMessageId = await send(t, seed, "Delegate");
    await runOneLayer(t); // génération du parent : le sous-agent est lancé

    expect(await t.run((ctx) => abortRun(ctx, seed.threadId))).toBe(true);
    await drain(t);

    const child = await childThreadOf(t, seed.threadId);
    expect(child?.runStatus).toBe("aborted");
    const spawn = (await tasksOf(t, runMessageId)).find(
      (task) => task.toolName === "run_subAgent",
    );
    expect(spawn?.status).toBe("aborted");
    // Le sous-agent n'a jamais appelé le modèle.
    expect(model.doStreamCalls).toHaveLength(1);
  });

  test("canvas invalide : le modèle reçoit l'erreur, rien n'est lancé", async () => {
    const t = setup();
    const seed = await seedThread(t);
    setModel([
      [call("run_subAgent", { instructions: "Job", canvasId: "not-a-canvas" })],
      [text("Sorry")],
    ]);
    await send(t, seed, "Delegate");
    await drain(t);

    expect(promptText(1)).toContain("is not a valid canvas id");
    expect(await childThreadOf(t, seed.threadId)).toBeFalsy();
  });
});
