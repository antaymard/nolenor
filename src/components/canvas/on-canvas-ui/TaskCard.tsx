import { useRef, useState, type ReactNode } from "react";
import { BorderBeam } from "border-beam";
import { ThinkingOrb } from "thinking-orbs";
import { X } from "lucide-react";
import {
  TbAlertCircle,
  TbAlertTriangle,
  TbCheck,
  TbMessageQuestion,
} from "react-icons/tb";
import {
  useResolvedRunStatus,
  useRunDuration,
} from "@/hooks/useThreadRunStatus";
import {
  RUN_STATUS_BORDER,
  type PendingTask,
  type ResolvedRunStatus,
} from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";
import TaskNodePills from "./TaskNodePills";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/shadcn/popover";
import { QuestionCard } from "@/components/canvas/nole-panel/message/QuestionCard";
import { readAskedQuestions } from "@/components/canvas/nole-panel/message/activity/activityModel";
import { useResolvedTheme } from "@/lib/theme";

/** Rayon du bloc, partagé avec le halo pour que les deux arrondis coïncident. */
const CARD_RADIUS_PX = 15;

/**
 * Une tâche Nolë, en un bloc, au dock d'activité.
 *
 * Trois zones : l'indicateur à gauche, deux lignes de texte au centre, la durée
 * à droite. La ligne du haut dit **où** — les nodes travaillés, cliquables —, et
 * celle du bas **quoi** : l'action que l'agent vient d'annoncer.
 *
 * Le vocabulaire visuel est celui de la conversation, à dessein : le halo animé
 * de l'input (`ComposerShell`) pendant que ça tourne, l'orbe de
 * `ChatStatusOverlay` comme indicateur, son check vert à l'arrivée. Une tâche
 * qui travaille loin du panneau doit se reconnaître au même coup d'œil que
 * celle qu'on regarde dedans.
 */
export default function TaskCard({
  task: thread,
  onOpen,
  onReview,
}: {
  task: PendingTask;
  /** Ouvre la conversation de la tâche. */
  onOpen: (threadId: string) => void;
  /** Le dock seul : accuser réception sans ouvrir. */
  onReview?: (task: PendingTask) => void;
}) {
  const theme = useResolvedTheme();
  const status = useResolvedRunStatus(thread);
  const isRunning = status === "running";
  const duration = useRunDuration(thread, isRunning);

  // Les nodes de CETTE tâche, pas ceux de tout le thread.
  const nodes = thread.touchedNodes;
  // La carte dit ce que tu as demandé ; le thread n'est que son sujet.
  const label = thread.request || thread.title || "Nolë";
  const activity = thread.lastActivity?.text;

  const questions =
    status === "waiting" && thread.pendingQuestions
      ? readAskedQuestions(thread.pendingQuestions)
      : [];
  const [questionOpen, setQuestionOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Le survol passe de la carte à la question sans la refermer : un court
  // délai avant de fermer, annulé dès qu'on entre dans l'une ou l'autre.
  const questionHover =
    questions.length > 0
      ? {
          onMouseEnter: () => {
            if (closeTimer.current) clearTimeout(closeTimer.current);
            setQuestionOpen(true);
          },
          onMouseLeave: () => {
            closeTimer.current = setTimeout(() => setQuestionOpen(false), 200);
          },
        }
      : {};

  const card = (
    <div
      // `div` et non `button` : le bloc contient de vrais boutons — les
      // pastilles de nodes, la croix — et les imbriquer est invalide.
      role="button"
      tabIndex={0}
      onClick={() => onOpen(thread.threadId)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(thread.threadId);
      }}
      style={{ borderRadius: CARD_RADIUS_PX }}
      className={cn(
        "group flex w-[272px] cursor-pointer items-center gap-2 border px-2.5 py-1.5",
        "min-h-[46px] bg-surface text-left text-slate-700 ",
        // Le halo, quand il est là, rogne l'ombre d'un enfant : elle passe sur
        // son wrapper (cf. `ComposerShell`), pas ici.
        !isRunning && "shadow-sm",
        // Le bloc est blanc quel que soit son état, et seule sa bordure se
        // teinte. Un fond coloré était l'idée de départ ; à l'écran il noyait le
        // halo, qui est de la même famille de violets, et rendait un dock de
        // trois blocs très bruyant. Le blanc est aussi ce qui fait exister le
        // halo — c'est déjà pourquoi `ComposerShell` pose une carte blanche sous
        // le sien. L'état se lit à l'indicateur, à gauche, où l'œil va d'abord.
        RUN_STATUS_BORDER[status],
      )}
    >
      <TaskStatusIndicator status={status} />

      <div
        className="flex min-w-0 flex-1 flex-col gap-0.5"
        title={thread.title ? `In “${thread.title}”` : undefined}
      >
        <span className="truncate text-xs font-medium text-slate-800">
          {label}
        </span>
        {/* Pendant le run, ce que fait Nolë ; ensuite, ce qu'il a touché. */}
        {!isRunning && nodes.length > 0 ? (
          <TaskNodePills touchedNodes={nodes} />
        ) : null}
        {/* Rien à dire tant qu'aucun tool n'a parlé : la ligne disparaît plutôt
            que d'afficher un vide, et `min-h` tient la hauteur du bloc. */}
        {activity && (isRunning || nodes.length === 0) ? (
          <span className="truncate text-[11px] text-slate-500">
            {activity}
          </span>
        ) : null}
      </div>

      <TaskCardAside
        duration={duration}
        // Un tour en cours n'est pas revuable : il n'est pas fini, et le serveur
        // refuserait de toute façon.
        onReview={
          onReview && !isRunning && status !== "waiting"
            ? () => onReview(thread)
            : undefined
        }
      />
    </div>
  );

  const body = (
    // L'animation d'entrée vit ici, à l'extérieur du halo conditionnel : sans
    // ça elle se rejouerait à l'instant où la tâche se conclut et où le bloc
    // change d'enveloppe.
    <div
      className="animate-in fade-in slide-in-from-bottom-2 shrink-0 duration-200"
      {...questionHover}
    >
      {isRunning ? (
        // Réglages repris tels quels de `ComposerShell` — c'est le même halo
        // que celui de l'input, pas une variante. Enveloppe conditionnelle et
        // non `active={false}` : une tâche finie ne porte aucune animation
        // dormante.
        <BorderBeam
          size="pulse-inner"
          colorVariant="ocean"
          theme={theme}
          active
          strength={0.7}
          hueRange={12}
          borderRadius={CARD_RADIUS_PX}
          className="shadow-sm"
        >
          {card}
        </BorderBeam>
      ) : (
        card
      )}
    </div>
  );

  if (questions.length === 0) return body;

  // Nolë attend une réponse : la question s'ouvre au survol, et on y répond
  // sans ouvrir la conversation.
  return (
    <Popover open={questionOpen}>
      <PopoverAnchor asChild>{body}</PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={6}
        className="w-[380px] border-0 bg-transparent p-0 shadow-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => setQuestionOpen(false)}
        {...questionHover}
      >
        <QuestionCard
          threadId={thread.threadId}
          questions={questions}
          result={null}
          canAnswer
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * L'état de la tâche, à la place qu'occupe l'orbe dans la conversation.
 *
 * L'orbe n'est montée que pendant le run : c'est une animation sur canvas, elle
 * n'a rien à faire sur une tâche conclue qui peut rester des heures au dock.
 */
function TaskStatusIndicator({ status }: { status: ResolvedRunStatus }) {
  if (status === "running") {
    return (
      <ThinkingOrb state="solving" size={20} aria-hidden className="shrink-0" />
    );
  }

  return (
    <IndicatorSlot>
      {status === "waiting" ? (
        <TbMessageQuestion size={16} className="text-violet-600" />
      ) : status === "error" ? (
        <TbAlertCircle size={16} className="text-red-500" />
      ) : status === "stale" || status === "aborted" ? (
        <TbAlertTriangle size={15} className="text-amber-500" />
      ) : (
        <TbCheck size={16} className="text-emerald-600" />
      )}
    </IndicatorSlot>
  );
}

/** Même empreinte que l'orbe, pour que rien ne bouge quand la tâche se conclut. */
function IndicatorSlot({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

/**
 * La durée, et la croix qui vient la remplacer au survol.
 *
 * Les deux partagent le même coin parce qu'elles ne se lisent jamais en même
 * temps : on regarde le temps qui passe, ou on écarte la tâche.
 */
function TaskCardAside({
  duration,
  onReview,
}: {
  duration: string | null;
  onReview?: () => void;
}) {
  return (
    <span className="relative flex min-w-9 shrink-0 items-center justify-end">
      <span
        className={cn(
          "text-[10px] tabular-nums text-slate-400 transition-opacity",
          onReview && "group-hover:opacity-0",
        )}
      >
        {duration}
      </span>
      {onReview ? (
        <button
          type="button"
          aria-label="Marquer comme vu"
          onClick={(event) => {
            event.stopPropagation();
            onReview();
          }}
          className={cn(
            "absolute -right-0.5 flex size-5 items-center justify-center rounded-full",
            "opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10",
          )}
        >
          <X size={12} />
        </button>
      ) : null}
    </span>
  );
}
