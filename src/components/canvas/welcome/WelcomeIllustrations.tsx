import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { colors } from "@/components/ui/styles";
import {
  DEFAULT_CANVAS_BACKGROUND,
  previewStyle,
} from "@/lib/canvasBackground";

/**
 * Les trois vignettes animées de la modale d'accueil.
 *
 * Dessinées à la main plutôt qu'exportées d'un outil : elles doivent rester
 * justes quand le produit bouge, et c'est plus facile en réutilisant les mêmes
 * classes que les vrais composants — `colors` et la géométrie de `NodeFrame`
 * pour les mini-nodes, `previewStyle` pour le fond. Un GIF, lui, mentirait en
 * silence à la première refonte.
 *
 * Chaque élément animé est écrit pour que son état AU REPOS soit déjà une image
 * correcte : `prefers-reduced-motion` coupe les animations (cf. index.css) sans
 * rien casser de la lecture.
 */

/** Le fond des vignettes : le canvas par défaut, resserré pour suggérer un dézoom. */
const canvasSurface: CSSProperties = previewStyle({
  ...DEFAULT_CANVAS_BACKGROUND,
  gap: 12,
});

function Frame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      style={canvasSurface}
      className={cn(
        "relative h-[132px] w-full overflow-hidden rounded-lg border border-slate-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Un node en miniature. Reprend la géométrie de `NodeFrame` : même rayon, même
 * doublure interne, mêmes jetons de couleur.
 */
function MiniNode({
  color = "default",
  selected = false,
  className,
  children,
}: {
  color?: keyof typeof colors;
  selected?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const tone = colors[color];
  return (
    <div
      className={cn(
        "flex flex-col rounded-[5px] border p-[3px]",
        tone.nodeBg,
        tone.nodeBorder,
        selected && "ring-2 ring-blue-500/70",
        className,
      )}
    >
      <div className="flex h-full flex-col gap-[3px] rounded-[4px] bg-white/80 p-[4px]">
        {children}
      </div>
    </div>
  );
}

/** Les lignes de texte grisées qui remplissent un node ou une entrée de menu. */
function Bar({ className }: { className?: string }) {
  return <div className={cn("h-[3px] rounded-full bg-slate-300", className)} />;
}

/** Curseur de souris. Un SVG plutôt qu'une icône : il faut la pointe exacte en (0,0). */
function ArrowPointer({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 16"
      className={cn("h-4 w-3 drop-shadow-sm", className)}
      aria-hidden="true"
    >
      <path
        d="M1 1 L1 13 L4.2 10 L6.4 14.6 L8.6 13.6 L6.3 9.2 L10.5 9 Z"
        fill="white"
        stroke="#334155"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Point de contact tactile, l'équivalent du curseur au doigt. */
function TouchPointer({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block size-4 rounded-full border-2 border-slate-500/80 bg-slate-400/40",
        className,
      )}
    />
  );
}

/** Glyphe de souris, molette animée pendant la phase de zoom. */
function MouseGlyph({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-8 w-5 justify-center rounded-full border-2 border-slate-500 bg-white pt-[4px] shadow-sm",
        className,
      )}
    >
      <span className="h-[7px] w-[2px] animate-welcome-wheel rounded-full bg-slate-600 opacity-45" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Navigation                                                       */
/* ------------------------------------------------------------------ */

export function NavigationIllustration({ touch }: { touch: boolean }) {
  return (
    <Frame>
      {/* Le plan entier glisse puis grandit : c'est la vue qui bouge, pas les
          nodes — d'où un seul conteneur transformé. */}
      <div className="absolute inset-0 animate-welcome-pan-zoom">
        <MiniNode color="blue" className="absolute top-[26px] left-[34px] h-[30px] w-[44px]">
          <Bar className="w-full" />
          <Bar className="w-3/5" />
        </MiniNode>
        <MiniNode color="yellow" className="absolute top-[70px] left-[58px] h-[26px] w-[38px]">
          <Bar className="w-4/5" />
        </MiniNode>
        <MiniNode color="default" className="absolute top-[40px] left-[104px] h-[34px] w-[40px]">
          <Bar className="w-full" />
          <Bar className="w-1/2" />
        </MiniNode>
      </div>

      {touch ? (
        <>
          {/* Deux doigts qui suivent le mouvement : pan à un doigt, pincement à deux. */}
          <TouchPointer className="absolute right-[34px] bottom-[26px] animate-welcome-pointer-drag" />
          <TouchPointer className="absolute right-[16px] bottom-[44px] animate-welcome-pointer-drag opacity-60" />
        </>
      ) : (
        <MouseGlyph className="absolute right-[22px] bottom-[22px] animate-welcome-pointer-drag" />
      )}
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Ouvrir un node                                                   */
/* ------------------------------------------------------------------ */

export function OpenNodeIllustration({ touch }: { touch: boolean }) {
  return (
    <Frame>
      <MiniNode
        color="blue"
        selected
        className="absolute top-[20px] left-[28px] h-[36px] w-[52px]"
      >
        <Bar className="w-full" />
        <Bar className="w-2/3" />
      </MiniNode>

      {/* Les ondes de double-clic, centrées sur le node. Invisibles au repos :
          une onde figée ne dirait rien, c'est le mouvement qui porte le sens. */}
      <span className="absolute top-[26px] left-[42px] size-6 animate-welcome-ripple rounded-full border-2 border-blue-500/70 opacity-0" />
      <span
        className="absolute top-[26px] left-[42px] size-6 animate-welcome-ripple rounded-full border-2 border-blue-500/70 opacity-0"
        style={{ animationDelay: "0.22s" }}
      />

      {/* La window qui s'ouvre par-dessus, dans le vocabulaire de `node-appear`.
          Posée en recouvrement du node plutôt qu'à l'autre bout du cadre : la
          vignette garde une composition tenue pendant toute la boucle. */}
      <div className="absolute top-[48px] left-[74px] w-[112px] animate-welcome-window overflow-hidden rounded-md border border-slate-300 bg-white shadow-lg">
        <div className="flex items-center gap-[3px] border-b border-slate-200 bg-slate-50 px-[6px] py-[4px]">
          <span className="size-[5px] rounded-full bg-slate-300" />
          <span className="size-[5px] rounded-full bg-slate-300" />
          <Bar className="ml-[2px] w-[34px]" />
        </div>
        <div className="flex flex-col gap-[4px] p-[6px]">
          <Bar className="w-full" />
          <Bar className="w-5/6" />
          <Bar className="w-2/3" />
        </div>
      </div>

      {touch ? (
        <TouchPointer className="absolute top-[36px] left-[48px] animate-welcome-pointer-tap" />
      ) : (
        <ArrowPointer className="absolute top-[34px] left-[50px] animate-welcome-pointer-tap" />
      )}
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Menu contextuel (souris) / barre d'outils (tactile)              */
/* ------------------------------------------------------------------ */

function MenuRow({
  highlighted = false,
  width,
}: {
  highlighted?: boolean;
  width: string;
}) {
  return (
    <div className="relative flex items-center gap-[5px] rounded-sm px-[5px] py-[3px]">
      {highlighted && (
        <span className="absolute inset-0 animate-welcome-row rounded-sm bg-slate-100" />
      )}
      <span className="relative size-[7px] rounded-[2px] bg-slate-300" />
      <Bar className={cn("relative", width)} />
    </div>
  );
}

export function ContextMenuIllustration({ touch }: { touch: boolean }) {
  if (touch) {
    return (
      <Frame>
        <MiniNode
          color="green"
          selected
          className="absolute top-[16px] left-[30px] h-[32px] w-[46px]"
        >
          <Bar className="w-full" />
          <Bar className="w-1/2" />
        </MiniNode>

        {/* La barre du bas : au doigt, c'est le seul chemin pour ajouter,
            dupliquer ou supprimer (cf. MobileCanvasToolbar). */}
        <div className="absolute bottom-[14px] left-1/2 flex -translate-x-1/2 items-center gap-[6px] rounded-full border border-slate-200 bg-white px-[8px] py-[5px] shadow-md">
          <span className="relative flex size-[15px] items-center justify-center rounded-full">
            <span className="absolute inset-0 animate-welcome-row rounded-full bg-slate-100" />
            <span className="relative text-[12px] leading-none font-medium text-slate-600">
              +
            </span>
          </span>
          <span className="h-[10px] w-px bg-slate-200" />
          <span className="size-[11px] rounded-[3px] bg-slate-300" />
          <span className="size-[11px] rounded-[3px] bg-slate-300" />
        </div>

        <TouchPointer className="absolute bottom-[18px] left-[calc(50%-14px)] animate-welcome-pointer-right" />
      </Frame>
    );
  }

  return (
    <Frame>
      <MiniNode
        color="green"
        className="absolute top-[18px] left-[22px] h-[30px] w-[44px]"
      >
        <Bar className="w-full" />
        <Bar className="w-1/2" />
      </MiniNode>

      <div className="absolute top-[34px] left-[62px] w-[86px] animate-welcome-menu rounded-md border border-slate-200 bg-white py-[4px] shadow-lg">
        <MenuRow width="w-[38px]" />
        <MenuRow width="w-[30px]" highlighted />
        <MenuRow width="w-[42px]" />
        <MenuRow width="w-[26px]" />
      </div>

      <ArrowPointer className="absolute top-[32px] left-[58px] animate-welcome-pointer-right" />
    </Frame>
  );
}
