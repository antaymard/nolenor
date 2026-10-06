import type { UIMessage } from "@convex-dev/agent/react";
import type { IconType } from "react-icons";
import type { TextPart as TextPartType } from "@/types/domain/message.types";
import {
  extractToolNodeIds,
  getToolExplanation,
  getToolPartErrorText,
  isRecord,
  readSoftToolError,
  type ToolPartState,
} from "../messageParsing";
import {
  getToolMeta,
  WRITE_CATEGORIES,
  type ToolCategory,
} from "./toolMeta";

type Part = NonNullable<UIMessage["parts"]>[number];

/**
 * `stopped` : l'appel n'a jamais rendu de résultat alors que le message est
 * clos (tour annulé, action tombée). Ni un succès ni une vraie erreur du tool.
 */
export type StepStatus = "running" | "done" | "error" | "stopped";

export type ToolStep = {
  kind: "tool";
  key: string;
  name: string;
  toolCallId?: string;
  state: ToolPartState;
  status: StepStatus;
  category: ToolCategory;
  /** `explanation` du modèle, ou le libellé de repli du tool. */
  label: string;
  input: unknown;
  output: unknown;
  error?: string;
  nodeIds: string[];
};

export type ReasoningStep = {
  kind: "reasoning";
  key: string;
  status: StepStatus;
  text: string;
};

export type ActivityStep = ToolStep | ReasoningStep;

export type AskedQuestion = {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multiSelect: boolean;
};

/** Ce que l'utilisateur a répondu, tel que le modèle l'a reçu. */
export type QuestionResult =
  | { kind: "answers"; answers: { question: string; selected: string[] }[] }
  | { kind: "text"; answer: string }
  | { kind: "declined" };

export type QuestionBlock = {
  kind: "question";
  key: string;
  questions: AskedQuestion[];
  /** `null` tant que l'utilisateur n'a pas répondu. */
  result: QuestionResult | null;
};

export type MessageBlock =
  | { kind: "text"; key: string; part: TextPartType }
  | { kind: "activity"; key: string; steps: ActivityStep[] }
  | QuestionBlock;

/** Le tool du kernel par lequel Nolë pose une question (cf. convex/harness/kernelTools.ts). */
const ASK_USER = "ask_user";

function readOptions(value: unknown): AskedQuestion["options"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (typeof option === "string") return [{ label: option }];
    if (isRecord(option) && typeof option.label === "string") {
      return [
        {
          label: option.label,
          ...(typeof option.description === "string"
            ? { description: option.description }
            : {}),
        },
      ];
    }
    return [];
  });
}

function readQuestion(value: unknown): AskedQuestion | null {
  if (!isRecord(value) || typeof value.question !== "string") return null;
  return {
    question: value.question,
    ...(typeof value.header === "string" ? { header: value.header } : {}),
    options: readOptions(value.options),
    multiSelect: value.multiSelect === true,
  };
}

function readQuestionResult(output: unknown): QuestionResult {
  // Sortie JSON du tool, avec ou sans son enveloppe `{ type, value }`.
  const value =
    isRecord(output) && "value" in output && "type" in output
      ? output.value
      : output;
  if (typeof value === "string") return { kind: "text", answer: value };
  if (isRecord(value)) {
    if (value.declined === true) return { kind: "declined" };
    if (typeof value.answer === "string") {
      return { kind: "text", answer: value.answer };
    }
    if (Array.isArray(value.answers)) {
      return {
        kind: "answers",
        answers: value.answers.flatMap((answer) =>
          isRecord(answer) && typeof answer.question === "string"
            ? [
                {
                  question: answer.question,
                  selected: Array.isArray(answer.selected)
                    ? answer.selected.filter(
                        (label): label is string => typeof label === "string",
                      )
                    : [],
                },
              ]
            : [],
        ),
      };
    }
  }
  return { kind: "text", answer: "" };
}

function toQuestionBlock(part: Part, index: number): QuestionBlock {
  const record = part as unknown as Record<string, unknown>;
  const input = isRecord(record.input) ? record.input : {};
  // Une question seule (première version du tool) ou une liste.
  const questions = (
    Array.isArray(input.questions) ? input.questions : [input]
  ).flatMap((question) => readQuestion(question) ?? []);
  return {
    kind: "question",
    key:
      typeof record.toolCallId === "string"
        ? record.toolCallId
        : `question-${index}`,
    questions,
    result:
      record.state === "output-available"
        ? readQuestionResult(record.output)
        : null,
  };
}

function isToolPart(part: Part): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

function readToolName(part: Part): string {
  if (part.type === "dynamic-tool" && isRecord(part)) {
    return typeof part.toolName === "string" ? part.toolName : "tool";
  }
  return part.type.replace(/^tool-/, "");
}

function toToolStep(part: Part, index: number, isLive: boolean): ToolStep {
  const record = part as unknown as Record<string, unknown>;
  const name = readToolName(part);
  const state = (
    typeof record.state === "string" ? record.state : "input-streaming"
  ) as ToolPartState;
  const input = record.input;
  const output = record.output;

  let status: StepStatus;
  let error = getToolPartErrorText(part, state);
  if (state === "output-error" || state === "output-denied") {
    status = "error";
    if (state === "output-denied") error ??= "Denied.";
  } else if (state === "output-available") {
    const softError = readSoftToolError(output);
    status = softError ? "error" : "done";
    error ??= softError;
  } else {
    status = isLive ? "running" : "stopped";
  }

  const meta = getToolMeta(name);
  const toolCallId =
    typeof record.toolCallId === "string" ? record.toolCallId : undefined;

  return {
    kind: "tool",
    key: toolCallId ?? `tool-${index}`,
    name,
    toolCallId,
    state,
    status,
    category: meta.category,
    label: getToolExplanation(input) ?? meta.label,
    input,
    output,
    error,
    nodeIds: extractToolNodeIds(name, input, output),
  };
}

/**
 * Replie les parts d'un message assistant en blocs affichables : chaque suite
 * de parts « d'activité » (tools, raisonnement) devient UN bloc, le texte
 * reste entre eux. Dix tool calls d'affilée donnent donc une ligne, pas dix
 * cartes.
 *
 * Les parts sans rendu (`step-start`, texte encore vide, sources…) ne coupent
 * pas une suite : sinon le `step-start` de chaque étape du modèle éclaterait le
 * bloc à chaque tool.
 *
 * Clés : l'index de la première part du bloc, stable quand le bloc grossit en
 * streaming — le bloc garde son état (déplié ou non) d'un rendu à l'autre.
 */
export function groupMessageParts(
  parts: readonly Part[],
  isLive: boolean,
): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let current: Extract<MessageBlock, { kind: "activity" }> | null = null;

  const pushStep = (step: ActivityStep, index: number) => {
    if (!current) {
      current = { kind: "activity", key: `activity-${index}`, steps: [] };
      blocks.push(current);
    }
    current.steps.push(step);
  };

  parts.forEach((part, index) => {
    if (part.type === "text") {
      const textPart = part as TextPartType;
      if (!textPart.text?.trim()) return;
      current = null;
      blocks.push({ kind: "text", key: `text-${index}`, part: textPart });
      return;
    }

    if (part.type === "reasoning") {
      const isStreaming = isLive && part.state === "streaming";
      if (!part.text?.trim() && !isStreaming) return;
      pushStep(
        {
          kind: "reasoning",
          key: `reasoning-${index}`,
          status: isStreaming ? "running" : "done",
          text: part.text ?? "",
        },
        index,
      );
      return;
    }

    if (isToolPart(part) && readToolName(part) === ASK_USER) {
      // Une question coupe la suite d'activité : c'est une carte à part.
      current = null;
      blocks.push(toQuestionBlock(part, index));
      return;
    }

    if (isToolPart(part)) {
      pushStep(toToolStep(part, index, isLive), index);
    }
  });

  return blocks;
}

export type ActivitySummary = {
  /** « Read 3 nodes, edited 2 nodes, searched the web ». */
  text: string;
  toolCount: number;
  errorCount: number;
  /** Nodes créés ou modifiés, dédoublonnés, dans l'ordre d'apparition. */
  touchedNodeIds: string[];
  /** Icônes distinctes des tools, pour la pile de gauche. */
  icons: IconType[];
};

const plural = (n: number, word: string, pluralWord = `${word}s`) =>
  `${n} ${n === 1 ? word : pluralWord}`;

function describeCategory(
  category: ToolCategory,
  steps: ToolStep[],
  createdNodeIds: ReadonlySet<string>,
): string | null {
  const n = steps.length;
  const uniqueNodes = new Set(steps.flatMap((s) => s.nodeIds)).size;
  switch (category) {
    case "read":
      return uniqueNodes > 0
        ? `read ${plural(uniqueNodes, "node")}`
        : "explored the canvas";
    case "search":
      return n === 1 ? "searched the canvas" : `ran ${n} canvas searches`;
    case "web-search":
      return n === 1 ? "searched the web" : `ran ${n} web searches`;
    case "web-open":
      return `opened ${plural(n, "page")}`;
    case "create":
      return `created ${plural(n, "node")}`;
    case "edit": {
      // Remplir un node qu'on vient de créer n'est pas « modifier » un node :
      // « created 1 node, edited 1 node » compterait deux fois le même.
      const touched = new Set(steps.flatMap((s) => s.nodeIds));
      const edited = [...touched].filter((id) => !createdNodeIds.has(id));
      if (touched.size > 0) {
        return edited.length > 0
          ? `edited ${plural(edited.length, "node")}`
          : null;
      }
      return `made ${plural(n, "edit")}`;
    }
    case "connect":
      return `added ${plural(n, "connection")}`;
    case "memory":
      return "updated memory";
    case "skill":
      return n === 1 ? "loaded a skill" : `loaded ${n} skills`;
    case "agent":
      return n === 1 ? "ran a sub-agent" : `ran ${n} sub-agents`;
    case "other":
      return `used ${plural(n, "tool")}`;
  }
}

export function summarizeActivity(
  steps: readonly ActivityStep[],
  getIcon: (name: string) => IconType,
): ActivitySummary {
  const tools = steps.filter((s): s is ToolStep => s.kind === "tool");
  const succeeded = tools.filter((s) => s.status === "done");
  const errorCount = tools.filter((s) => s.status === "error").length;

  const byCategory = new Map<ToolCategory, ToolStep[]>();
  for (const step of succeeded) {
    const list = byCategory.get(step.category) ?? [];
    list.push(step);
    byCategory.set(step.category, list);
  }

  // Ce que l'agent a changé d'abord : c'est ce que l'utilisateur vient
  // chercher, et c'est ce qui doit survivre à la troncature du résumé.
  const ordered = [...byCategory].sort(
    ([a], [b]) =>
      Number(WRITE_CATEGORIES.has(b)) - Number(WRITE_CATEGORIES.has(a)),
  );
  const createdNodeIds = new Set(
    (byCategory.get("create") ?? []).flatMap((s) => s.nodeIds),
  );
  const chunks = ordered
    .map(([category, list]) => describeCategory(category, list, createdNodeIds))
    .filter((chunk): chunk is string => chunk !== null);

  let text: string;
  if (chunks.length > 0) {
    text = chunks.join(", ");
  } else if (tools.length > 0) {
    text = `tried ${plural(tools.length, "action")}`;
  } else {
    text = "thought";
  }
  text = text.charAt(0).toUpperCase() + text.slice(1);

  const touched = new Set<string>();
  for (const step of succeeded) {
    if (WRITE_CATEGORIES.has(step.category)) {
      step.nodeIds.forEach((id) => touched.add(id));
    }
  }

  // Même ordre que le texte : les icônes d'écriture en tête de pile.
  const icons: IconType[] = [];
  for (const step of [
    ...ordered.flatMap(([, list]) => list),
    ...tools.filter((s) => s.status !== "done"),
  ]) {
    const icon = getIcon(step.name);
    if (!icons.includes(icon)) icons.push(icon);
  }

  return {
    text,
    toolCount: tools.length,
    errorCount,
    touchedNodeIds: [...touched],
    icons,
  };
}
