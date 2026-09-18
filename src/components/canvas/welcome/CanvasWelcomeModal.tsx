import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Kbd, KbdGroup } from "@/components/shadcn/kbd";
import { useIsTouchFirst } from "@/hooks/useTabletMode";
import { hasSeenWelcome, markWelcomeSeen } from "@/lib/welcomeStorage";
import {
  ContextMenuIllustration,
  NavigationIllustration,
  OpenNodeIllustration,
} from "./WelcomeIllustrations";

/**
 * L'accueil d'une première visite sur un canvas : trois gestes en step-by-step,
 * puis on sort.
 *
 * Sur le canvas et pas sur une route dédiée : ces gestes ne s'apprennent que
 * devant l'objet qu'ils manipulent. Le drapeau vit dans le `localStorage`
 * (cf. `lib/welcomeStorage`), donc un visiteur non connecté sur un canvas
 * partagé y a droit aussi — c'est même lui qui en a le plus besoin.
 *
 * Monté à deux endroits, un par implémentation de canvas : `CanvasContent`
 * (routes/canvas/$canvasId.tsx) et `MobileCanvasShell`
 * (components/mobile/MobileCanvas.tsx), chaque fois APRÈS le garde de
 * chargement — s'ouvrir par-dessus un spinner n'accueille personne.
 */

type Step = {
  key: string;
  illustration: ReactNode;
  title: string;
  body: ReactNode;
  hint?: ReactNode;
};

/**
 * Les gestes souris, tels que `CanvasFlow` les câble réellement :
 * `panOnDrag={[1]}` (bouton du milieu), zoom sur Ctrl/Meta + molette
 * (cf. `useNoWheelUnlessZoom`), et les quatre menus contextuels.
 */
function pointerSteps(): Step[] {
  return [
    {
      key: "navigate",
      illustration: <NavigationIllustration touch={false} />,
      title: "Move around",
      body: (
        <>
          Hold the <strong>middle mouse button</strong> and drag to pan. Hold{" "}
          <strong>Ctrl</strong> and scroll to zoom. On a trackpad, two fingers
          pan.
        </>
      ),
      hint: (
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <span className="text-muted-foreground">+</span>
          <Kbd>scroll</Kbd>
        </KbdGroup>
      ),
    },
    {
      key: "open",
      illustration: <OpenNodeIllustration touch={false} />,
      title: "Open a node",
      body: (
        <>
          <strong>Double-click</strong> a node to open it in a window. Select it
          to reveal its toolbar, then hit the pencil to edit in place.
        </>
      ),
      hint: (
        <KbdGroup>
          <Kbd>Double-click</Kbd>
        </KbdGroup>
      ),
    },
    {
      key: "menu",
      illustration: <ContextMenuIllustration touch={false} />,
      title: "Right-click for the rest",
      body: (
        <>
          <strong>Right-click the canvas</strong> to add a node.{" "}
          <strong>Right-click a node or a link</strong> to recolor, duplicate or
          delete it.
        </>
      ),
      hint: (
        <KbdGroup>
          <Kbd>Right-click</Kbd>
        </KbdGroup>
      ),
    },
  ];
}

/**
 * Au doigt, trois gestes différents. Surtout : pas d'appui long — iOS n'émet
 * pas `contextmenu`, donc la barre du bas est le seul chemin pour ajouter,
 * dupliquer ou supprimer (cf. le commentaire de `MobileCanvasToolbar`).
 */
function touchSteps(): Step[] {
  return [
    {
      key: "navigate",
      illustration: <NavigationIllustration touch />,
      title: "Move around",
      body: (
        <>
          Drag <strong>one finger</strong> to pan. <strong>Pinch</strong> to
          zoom.
        </>
      ),
    },
    {
      key: "open",
      illustration: <OpenNodeIllustration touch />,
      title: "Open a node",
      body: (
        <>
          <strong>Double-tap</strong> a node to open it full screen.
        </>
      ),
    },
    {
      key: "menu",
      illustration: <ContextMenuIllustration touch />,
      title: "Add and edit",
      body: (
        <>
          Tap <strong>+</strong> in the bottom bar to add a node. Select a node
          to duplicate or delete it from that same bar.
        </>
      ),
    },
  ];
}

export default function CanvasWelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // `useIsTouchFirst` et pas `useIsTouchDevice` : c'est le signal qui pilote
  // `panWithFinger` dans `CanvasFlow`, donc la copy ne peut pas décrire un
  // geste que l'appareil ne fait pas. Il a en plus un état initial synchrone,
  // là où `useIsTouchDevice` démarre à `false` puis bascule — ce qui ferait
  // clignoter la copy sous les yeux de l'utilisateur.
  const isTouchFirst = useIsTouchFirst();

  // Lu au montage et pas au rendu : `hasSeenWelcome` touche au `localStorage`,
  // qui n'a rien à faire dans le chemin de rendu.
  useEffect(() => {
    if (!hasSeenWelcome()) setIsOpen(true);
  }, []);

  const close = () => {
    markWelcomeSeen();
    setIsOpen(false);
  };

  const steps = isTouchFirst ? touchSteps() : pointerSteps();
  const current = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        showCloseButton={false}
        // On ne sort que par le bouton. Les trois portes habituelles sont
        // fermées pour que le drapeau `localStorage` ne soit jamais posé par
        // un geste involontaire — l'accueil ne se rejoue pas.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        // Colonne flex à hauteur bornée, et c'est le CONTENU qui défile, pas la
        // modale : le bouton est la seule sortie, il ne doit jamais partir sous
        // la ligne de flottaison.
        className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-white/40 p-0 shadow-[0_6px_20px_rgba(15,23,42,0.12)] sm:max-w-md"
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-xl font-bold tracking-tight">Welcome to Nolënor</DialogTitle>
          <DialogDescription>
            Three gestures to get you moving. You'll pick up the rest as you go.
          </DialogDescription>
        </DialogHeader>

        {/* Une étape à la fois. `key` = remontage à chaque step, ce qui relance
            les animations CSS des illustrations. */}
        <div
          key={current.key}
          aria-live="polite"
          className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-6"
        >
          <section className="flex flex-col gap-3">
            {current.illustration}
            <div className="flex flex-col gap-1.5">
              <h3 className="font-medium text-foreground">{current.title}</h3>
              <p className="text-sm text-muted-foreground">{current.body}</p>
              {current.hint ? (
                <div className="pt-0.5">{current.hint}</div>
              ) : null}
            </div>
          </section>
        </div>

        {/* Stepper : dots cliquables + compteur. */}
        <div className="flex items-center justify-center gap-2 pb-2">
          {steps.map((step, i) => (
            <button
              key={step.key}
              type="button"
              onClick={() => setStepIndex(i)}
              aria-label={`Go to step ${i + 1}: ${step.title}`}
              aria-current={i === stepIndex ? "step" : undefined}
              className={
                i === stepIndex
                  ? "h-2 w-6 rounded-full bg-primary transition-all"
                  : "h-2 w-2 rounded-full bg-muted-foreground/30 transition-all hover:bg-muted-foreground/60"
              }
            />
          ))}
        </div>
        <p className="pb-4 text-center text-xs text-muted-foreground">
          Step {stepIndex + 1} of {steps.length}
        </p>

        <DialogFooter className="flex-row justify-between border-t border-slate-200/70 px-6 py-4 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className={stepIndex === 0 ? "invisible" : undefined}
          >
            Back
          </Button>
          {isLast ? (
            <Button onClick={close}>Got it</Button>
          ) : (
            <Button
              onClick={() =>
                setStepIndex((i) => Math.min(steps.length - 1, i + 1))
              }
            >
              Next
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
