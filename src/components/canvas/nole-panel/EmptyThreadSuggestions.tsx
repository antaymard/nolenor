import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import {
  TbClockHour4,
  TbMapPin,
  TbPhoto,
  TbRocket,
  TbSearch,
  TbTable,
} from "react-icons/tb";
import type { IconType } from "react-icons";
import { CANVAS_COLORS } from "@/../convex/config/colorsConfig";
import type { CanvasColor } from "@/../convex/config/colorsConfig";
import { colors } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import NoleIcon from "@/assets/svg-components/NoleIcon";

type Suggestion = {
  label: string;
  prompt: string;
  icon: IconType;
};

const SUGGESTIONS: Suggestion[] = [
  {
    label: "Research a topic",
    prompt:
      "Search the web for the topic below. Then create a BlockNote node on this canvas containing a concise summary and links to the sources. Topic: [topic]",
    icon: TbSearch,
  },
  {
    label: "Create an image",
    prompt:
      "Create an image node on this canvas and fill in its image-generation prompt based on this idea: [describe the image or invent something if left blank]",
    icon: TbPhoto,
  },
  {
    label: "Create a project tracker",
    prompt:
      "Create a table node titled “Project tracker” with columns Task (text), Due date (date), and Status (select: Not started, In progress, Done). Add three clearly marked example rows. Then create an AppNode connected to the table that displays the number of tasks in each status as a pie chart.",
    icon: TbTable,
  },
  {
    label: "Create a Pomodoro timer",
    prompt:
      "Create an AppNode for a Pomodoro timer with a 25-minute focus session, a 5-minute break, a countdown, and Start, Pause, and Reset controls. Times are saved server-side to persist across refreshes.",
    icon: TbClockHour4,
  },
  {
    label: "Show me images of France",
    prompt:
      "Create five image nodes, one each for Brittany, Paris, Marseille, Annecy, and Bordeaux. Get the images from the web.",
    icon: TbMapPin,
  },
  {
    label: "Prototype an onboarding flow",
    prompt:
      "Create a BlockNote node describing a 3-step onboarding flow for Nolënor. Then create an AppNode prototype of that flow with Back, Next, and Finish controls, and connect it to the spec node.",
    icon: TbRocket,
  },
];

const VISIBLE_COUNT = 3;

type VisibleSuggestion = Suggestion & { color: CanvasColor };

/** Fisher-Yates shuffle, without mutating the source array. */
function pickRandom<T>(items: readonly T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, count);
}

type EmptyThreadSuggestionsProps = {
  /** Pre-fills the composer (the parent passes `setUserInput`). */
  onSelect: (prompt: string) => void;
};

/**
 * Home screen of a blank conversation, before the first message.
 * A random rotation of suggestions, unrelated to the canvas content.
 * Shared between the desktop panel (`ChatContainer`) and the mobile tab.
 */
export default function EmptyThreadSuggestions({
  onSelect,
}: EmptyThreadSuggestionsProps) {
  // Single draw per mount: the composer may re-render on every keystroke
  // without rotating the suggestions under the user's fingers.
  // Each visible suggestion gets its own random non-neutral tone from the
  // shared palette (`convex/config/colorsConfig.ts`).
  const visible: VisibleSuggestion[] = useMemo(() => {
    const picked = pickRandom(SUGGESTIONS, VISIBLE_COUNT);
    const colorPool = pickRandom(CANVAS_COLORS, picked.length);
    return picked.map((suggestion, i) => ({
      ...suggestion,
      color: colorPool[i] ?? "blue",
    }));
  }, []);

  // Same `displayName` as everywhere else (Settings → Account, then provider).
  // `undefined` while loading, `null` for anonymous: both fall back to generic.
  const me = useQuery(api.users.me);
  const firstName = me?.displayName?.trim()?.split(/\s+/)?.[0] || null;

  const greeting = firstName ? `Hello ${firstName}` : "Start talking to Nolë";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-4 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-brand/10 border-2 border-brand">
        <NoleIcon size={20} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-2xl font-semibold text-slate-600">{greeting}</p>
        <p className="text-sm text-slate-400 mb-5">
          Here are a few ideas to get started.
        </p>
      </div>
      <div className="flex w-full max-w-70 flex-col gap-2">
        {visible.map((suggestion) => {
          const tone = colors[suggestion.color];
          const Icon = suggestion.icon;
          return (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => onSelect(suggestion.prompt)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-medium transition-colors",
                tone.frameBorder,
                tone.lightBg,
                tone.textColor,
                tone.hoverBg,
              )}
              title={suggestion.prompt}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-lg text-white",
                  tone.accentBg,
                )}
              >
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {suggestion.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
