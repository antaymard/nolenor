import type { ReactNode } from "react";
import { BorderBeam } from "border-beam";
import { ThinkingOrb } from "thinking-orbs";
import { X } from "lucide-react";
import { TbAlertCircle, TbAlertTriangle, TbCheck } from "react-icons/tb";
import {
  useResolvedRunStatus,
  useRunDuration,
} from "@/hooks/useThreadRunStatus";
import type { PendingThread, ResolvedRunStatus } from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";
import TaskNodePills from "./TaskNodePills";

/** Rayon du bloc, partagé avec le halo pour que les deux arrondis coïncident. */
const CARD_RADIUS_PX = 12;

/**
 * Le bloc est blanc quel que soit son état, et seule sa bordure se teinte.
 *
 * Un fond coloré était l'idée de départ ; à l'écran il noyait le halo, qui est
 * de la même famille de violets, et rendait un dock de trois blocs très
 * bruyant. Le blanc est aussi ce qui fait exister le halo — c'est déjà pourquoi
 * `ComposerShell` pose une carte blanche sous le sien. L'état se lit à
 * l'indicateur, à gauche, où l'œil va d'abord.
 */
const CARD_BORDER: Record<ResolvedRunStatus, string> = {
  running: "border-violet-200",
  idle: "border-emerald-200",
  error: "border-red-200",
  aborted: "border-amber-200",
  stale: "border-amber-200",
};

/**
 * Une tâche Nolë, en un bloc. Le même au dock et sur le canvas.
 *
 * Trois zones : l'indicateur à gauche, deux lignes de texte au centre, la durée
 * à droite. La ligne du haut dit **où** — les nodes travaillés, cliquables —, et
 * celle du bas **quoi** : l'action que l'agent vient d'annoncer. Sur le canvas
 * la ligne de nodes disparaît, le bloc étant déjà ancré sous eux ; c'est la
 * seule différence entre les deux surfaces.
 *
 * Le vocabulaire visuel est celui de la conversation, à dessein : le halo animé
 * de l'input (`ComposerShell`) pendant que ça tourne, l'orbe de
 * `ChatStatusOverlay` comme indicateur, son check vert à l'arrivée. Une tâche
 * qui travaille loin du panneau doit se reconnaître au même coup d'œil que
 * celle qu'on regarde dedans.
 */
export default function TaskCard({
  thread,
  showNodes = false,
  onOpen,
  onReview,
}: {
  thread: PendingThread;
  /** Le dock montre les nodes ; le canvas non, il est posé dessus. */
  showNodes?: boolean;
  onOpen: (threadId: string) => void;
  /** Le dock seul : accuser réception sans ouvrir. */
  onReview?: (threadId: string) => void;
}) {
  const status = useResolvedRunStatus(thread);
  const isRunning = status === "running";
  const duration = useRunDuration(thread, isRunning);

  const nodes = showNodes ? thread.touchedNodes : [];
  const title = thread.title || "Nolë";
  const activity = thread.lastActivity?.text;

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
        "min-h-[46px] bg-white text-left text-slate-700",
        // Le halo, quand il est là, rogne l'ombre d'un enfant : elle passe sur
        // son wrapper (cf. `ComposerShell`), pas ici.
        !isRunning && "shadow-sm",
        CARD_BORDER[status],
      )}
    >
      <TaskStatusIndicator status={status} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {nodes.length > 0 ? (
          <TaskNodePills touchedNodes={nodes} />
        ) : (
          <span className="truncate text-xs font-medium text-slate-800">
            {title}
          </span>
        )}
        {/* Rien à dire tant qu'aucun tool n'a parlé : la ligne disparaît plutôt
            que d'afficher un vide, et `min-h` tient la hauteur du bloc. */}
        {activity ? (
          <span className="truncate text-[11px] text-slate-500">{activity}</span>
        ) : null}
      </div>

      <TaskCardAside
        duration={duration}
        // Un tour en cours n'est pas revuable : il n'est pas fini, et le serveur
        // refuserait de toute façon.
        onReview={
          onReview && !isRunning ? () => onReview(thread.threadId) : undefined
        }
      />
    </div>
  );

  return (
    // L'animation d'entrée vit ici, à l'extérieur du halo conditionnel : sans
    // ça elle se rejouerait à l'instant où la tâche se conclut et où le bloc
    // change d'enveloppe.
    <div className="animate-in fade-in slide-in-from-bottom-2 shrink-0 duration-200">
      {isRunning ? (
        // Réglages repris tels quels de `ComposerShell` — c'est le même halo
        // que celui de l'input, pas une variante. Enveloppe conditionnelle et
        // non `active={false}` : une tâche finie ne porte aucune animation
        // dormante.
        <BorderBeam
          size="pulse-inner"
          colorVariant="ocean"
          theme="light"
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
      <ThinkingOrb
        state="working"
        size={20}
        aria-hidden
        className="shrink-0"
      />
    );
  }

  return (
    <IndicatorSlot>
      {status === "error" ? (
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
