import { useLayoutEffect, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  HandGrab,
  Mouse,
  MousePointerClick,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLoadingScreenStore } from "@/stores/loadingScreenStore";
import { parseTip, type Gesture, type TipPart } from "./loadingTips";

/**
 * L'écran de chargement : le logo, une barre de progression, et une astuce
 * dessous, sur fond plein. Le markup du logo et de la barre est celui du
 * splash d'`index.html` (classes `.loading-screen*` d'index.css) : les écrans
 * successifs d'un même chargement — splash, `BootLoader`, puis ceux du canvas
 * — se remplacent sans que rien ne bouge.
 *
 * Astuce et progression viennent de `loadingScreenStore`, partagé par tous.
 *
 * `enter` : ce qui s'anime à l'arrivée. Un écran qui en remplace un autre
 * n'anime rien (on le voit déjà) ; `"tip"` pour `BootLoader`, qui reprend le
 * splash mais y ajoute l'astuce.
 *
 * `visible` à faux : la barre finit sa course, l'écran s'efface, puis plus
 * rien.
 */
export default function LoadingScreen({
  visible,
  enter,
  className,
  style,
  onHidden,
}: {
  visible: boolean;
  enter?: "all" | "tip";
  className?: string;
  style?: CSSProperties;
  onHidden?: () => void;
}) {
  const tip = useLoadingScreenStore((state) => state.tip);
  const progress = useLoadingScreenStore((state) => state.progress);
  const [isGone, setIsGone] = useState(!visible);
  // Figé au montage : un écran déjà affiché ne rejoue pas son entrée.
  const [entrance] = useState(() =>
    useLoadingScreenStore.getState().mountedScreens > 0
      ? "none"
      : (enter ?? "all"),
  );

  useLayoutEffect(() => {
    if (isGone) return;
    const { screenMounted, screenUnmounted } = useLoadingScreenStore.getState();
    screenMounted();
    return screenUnmounted;
  }, [isGone]);

  if (isGone) return null;

  return (
    <div
      className={cn(
        "loading-screen",
        !visible && "pointer-events-none opacity-0",
        className,
      )}
      style={style}
      onTransitionEnd={(event) => {
        if (visible || event.target !== event.currentTarget) return;
        setIsGone(true);
        onHidden?.();
      }}
      role="status"
      aria-live="polite"
      aria-busy={visible}
    >
      <div
        className={cn(
          "loading-screen__center",
          entrance === "all" && "animate-appear",
        )}
      >
        <img src="/favicon.svg" alt="" className="loading-screen__logo" />
        <div
          className="loading-screen__track"
          role="progressbar"
          aria-label="Loading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="loading-screen__fill"
            style={{ "--progress": progress } as CSSProperties}
          />
        </div>
        <p
          className={cn(
            "absolute top-full left-1/2 mt-9 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2",
            "text-center text-[15px] leading-8 font-semibold text-slate-700",
            entrance !== "none" && "animate-appear",
          )}
          style={entrance === "tip" ? { animationDelay: "120ms" } : undefined}
        >
          {parseTip(tip).map((part, index) => (
            <TipPartView key={index} part={part} />
          ))}
        </p>
      </div>
    </div>
  );
}

const GESTURE_VIEWS: Record<Gesture, { icon: LucideIcon; label: string }> = {
  click: { icon: MousePointerClick, label: "Click" },
  "right-click": { icon: Mouse, label: "Right-click" },
  "double-click": { icon: MousePointerClick, label: "Double-click" },
  drag: { icon: HandGrab, label: "Drag" },
};

/**
 * Une touche se lit comme une touche (capuchon bordé, ombre du bas), un geste
 * comme une pastille pleine avec son icône : les deux restent distincts d'un
 * coup d'œil.
 */
const CHIP_BASE =
  "mx-0.5 inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-md px-1.5 align-middle text-[13px] leading-none font-bold text-slate-800";
const KEY_CLASS = cn(
  CHIP_BASE,
  "border border-slate-300 bg-surface shadow-[0_1.5px_0_var(--color-slate-300)]",
);
const GESTURE_CLASS = cn(CHIP_BASE, "border border-transparent bg-slate-100 pr-2");

function TipPartView({ part }: { part: TipPart }) {
  if (part.kind === "key") {
    return <kbd className={cn(KEY_CLASS, "font-sans")}>{part.text}</kbd>;
  }
  if (part.kind === "gesture") {
    const { icon: Icon, label } = GESTURE_VIEWS[part.gesture];
    return (
      <span className={GESTURE_CLASS}>
        <Icon className="size-3.5 text-brand" strokeWidth={2.25} aria-hidden />
        {label}
      </span>
    );
  }
  // Les liants (flèche, plus, point médian) s'effacent derrière les gestes et
  // les effets, qui portent le sens.
  return (
    <>
      {part.text.split(/(→|·| \+ )/).map((chunk, index) => {
        if (chunk === "→") {
          return (
            <ArrowRight
              key={index}
              className="mx-0.5 inline size-4 align-[-3px] text-slate-400"
              strokeWidth={2.25}
              aria-label="then"
            />
          );
        }
        if (chunk === "·" || chunk === " + ") {
          return (
            <span key={index} className="text-slate-400">
              {chunk}
            </span>
          );
        }
        return <span key={index}>{chunk}</span>;
      })}
    </>
  );
}
