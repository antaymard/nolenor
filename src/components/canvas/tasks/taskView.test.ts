import { describe, expect, test } from "vitest";
import type { PendingTask } from "@/lib/threadRunStatus";
import { EMPTY_TASK_DISMISS_MS, resolveTaskView } from "./taskView";

const NOW = 1_000_000_000;

function task(overrides: Partial<PendingTask> = {}): PendingTask {
  return {
    runId: "run" as PendingTask["runId"],
    threadId: "thread",
    title: "Pricing",
    request: "Make a pricing table",
    attachedNodes: [],
    runStatus: "idle",
    runStartedAt: NOW - 60_000,
    runEndedAt: NOW - 1000,
    touchedNodes: [],
    lastActivity: null,
    lastRunError: null,
    pendingQuestions: null,
    outcome: {
      canvas: false,
      answer: null,
      answerText: null,
      needsUser: false,
      pending: 0,
      failed: false,
    },
    ...overrides,
  };
}

const node = {
  nodeDataId: "nd" as PendingTask["touchedNodes"][number]["nodeDataId"],
  kind: "created" as const,
  at: NOW,
};

describe("resolveTaskView", () => {
  test("en cours : compacte, l'action en cours, pas de croix", () => {
    const view = resolveTaskView(
      task({
        runStatus: "running",
        runEndedAt: null,
        lastActivity: { text: "Reading 3 nodes", at: NOW },
      }));
    expect(view).toMatchObject({
      status: "running",
      emphasis: "compact",
      body: { kind: "activity", text: "Reading 3 nodes" },
      dismissible: false,
    });
  });

  test("une question l'emporte et réclame l'attention", () => {
    const view = resolveTaskView(
      task({
        runStatus: "waiting",
        runEndedAt: null,
        pendingQuestions: [{ question: "Which format?" }],
        outcome: { ...task().outcome, needsUser: true, canvas: true },
        touchedNodes: [node],
      }));
    expect(view.emphasis).toBe("attention");
    expect(view.body).toMatchObject({
      kind: "question",
      questions: [{ question: "Which format?" }],
    });
    expect(view.dismissible).toBe(false);
    expect(view.nodes).toHaveLength(1);
  });

  test("échec partiel : l'erreur et les nodes déjà touchés, avec Retry", () => {
    const view = resolveTaskView(
      task({
        runStatus: "error",
        lastRunError: "Provider error",
        touchedNodes: [node],
        outcome: { ...task().outcome, failed: true, canvas: true },
      }));
    expect(view).toMatchObject({
      emphasis: "attention",
      body: {
        kind: "error",
        message: "Provider error",
        partial: true,
        retryable: true,
      },
    });
    expect(view.nodes).toHaveLength(1);
  });

  test("arrêtée par l'utilisateur : compacte, relançable", () => {
    const view = resolveTaskView(task({ runStatus: "aborted" }));
    expect(view).toMatchObject({
      emphasis: "compact",
      body: { kind: "error", message: "Stopped before finishing.", retryable: true },
    });
  });

  test("une réponse qui compte : dépliée, avec les nodes en pied", () => {
    const view = resolveTaskView(
      task({
        touchedNodes: [node],
        outcome: {
          ...task().outcome,
          answer: true,
          answerText: "The key point is X.",
          canvas: true,
        },
      }));
    expect(view).toMatchObject({
      emphasis: "expanded",
      body: { kind: "answer", text: "The key point is X." },
    });
    expect(view.nodes).toHaveLength(1);
  });

  test("action sur le canvas seule : compacte, l'intérêt est dans les nodes", () => {
    const view = resolveTaskView(
      task({
        touchedNodes: [node],
        outcome: { ...task().outcome, answer: false, canvas: true },
      }));
    expect(view).toMatchObject({ emphasis: "compact", body: null, autoDismissMs: null });
  });

  test("rien à montrer : s'écarte d'elle-même ; pas tant que le juge n'a pas parlé", () => {
    expect(
      resolveTaskView(task({ outcome: { ...task().outcome, answer: false } }))
        .autoDismissMs,
    ).toBe(EMPTY_TASK_DISMISS_MS);
    expect(resolveTaskView(task()).autoDismissMs).toBeNull();
    // Du travail en fond à attendre : elle reste.
    expect(
      resolveTaskView(
        task({ outcome: { ...task().outcome, answer: false, pending: 1 } })).autoDismissMs,
    ).toBeNull();
  });
});
