import { useCallback, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { TbAlertCircle, TbCheck, TbUpload } from "react-icons/tb";
import { useCanvasContentIngest } from "@/hooks/useCanvasContentIngest";
import { useFlowPosition } from "@/hooks/useCanvasPointerPosition";
import { useOnboardingIngestStore } from "@/stores/onboardingIngestStore";
import { cn } from "@/lib/utils";

/**
 * Réserve écran pour le panel Nolë ouvert + marge : les nodes naissent à
 * gauche de la zone masquée, visibles dès la fermeture de la modale.
 */
const PANEL_RESERVE_PX = 420;
/** Recentrage approximatif du futur cluster dans la zone visible (heuristique,
 * la grille de `createNodesFromFiles` s'étend en +x/+y depuis l'origine). */
const CLUSTER_OFFSET_X_PX = 300;
const CLUSTER_OFFSET_Y_PX = 150;
/** Chaque drop supplémentaire décale son origine : sans ça, deux drops
 * successifs empileraient exactement leurs grilles. */
const EXTRA_DROP_SHIFT_PX = 360;

/**
 * Zone de dépôt de la modale d'onboarding : les fichiers lâchés ici créent de
 * vrais nodes sur le canvas, en arrière-plan, pendant que la modale reste
 * ouverte (cf. `useOnboardingIngestStore` + `useEmptyCanvasOnboarding`).
 *
 * Doit rester sous un `ReactFlowProvider` (c'est le cas sur les deux shells,
 * cf. `$canvasId.tsx` et `MobileCanvas.tsx`) : l'origine des nodes est
 * calculée depuis le viewport.
 *
 * Anti double-création : le handler canvas (`useCanvasDropHandler`) écoute au
 * niveau `window` derrière la modale — `preventDefault` (+ `stopPropagation`)
 * sur `drop`/`dragover` le désarme pour les événements traités ici (il
 * respecte `defaultPrevented`).
 */
export default function OnboardingDropzone() {
  const { createNodesFromFiles, createNodeFromText } =
    useCanvasContentIngest();
  const { getViewportCenter } = useFlowPosition();
  const { getViewport } = useReactFlow();

  const active = useOnboardingIngestStore((state) => state.active);
  const hasSession = useOnboardingIngestStore((state) => state.hasSession);
  const total = useOnboardingIngestStore((state) => state.total);
  const done = useOnboardingIngestStore((state) => state.done);
  const currentLabel = useOnboardingIngestStore(
    (state) => state.currentLabel,
  );
  const currentPercent = useOnboardingIngestStore(
    (state) => state.currentPercent,
  );
  const failed = useOnboardingIngestStore((state) => state.failed);

  const [isOver, setIsOver] = useState(false);
  // `dragenter`/`dragleave` se déclenchent à chaque frontière entre enfants :
  // on compte pour ne retomber qu'en sortant réellement de la zone.
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Centre du viewport, décalé à gauche du futur panel Nolë — en unités flow
  // (divisé par le zoom), pas en pixels écran.
  const getOrigin = useCallback(() => {
    const { dropCount } = useOnboardingIngestStore.getState();
    const { zoom } = getViewport();
    const center = getViewportCenter();
    return {
      x: center.x - (PANEL_RESERVE_PX + CLUSTER_OFFSET_X_PX) / zoom,
      y:
        center.y -
        CLUSTER_OFFSET_Y_PX / zoom +
        (dropCount * EXTRA_DROP_SHIFT_PX) / zoom,
    };
  }, [getViewport, getViewportCenter]);

  const ingestFiles = useCallback(
    (files: File[]) => {
      const store = useOnboardingIngestStore.getState();
      // Un drop à la fois : la grille part d'une origine fixe, deux sessions
      // parallèles se marcheraient dessus (le décalage ne vaut qu'entre
      // sessions successives).
      if (store.active || files.length === 0) return;
      const sessionId = store.start(files.length);
      void createNodesFromFiles(files, getOrigin(), {
        silent: true,
        onProgress: (progress) => {
          useOnboardingIngestStore
            .getState()
            .reportProgress(
              sessionId,
              progress.done,
              progress.total,
              progress.currentLabel,
              progress.currentPercent,
            );
        },
      }).then(
        ({ failed: failedCount }) =>
          useOnboardingIngestStore.getState().finish(sessionId, failedCount),
        () =>
          useOnboardingIngestStore
            .getState()
            .finish(sessionId, files.length),
      );
    },
    [createNodesFromFiles, getOrigin],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth.current = 0;
      setIsOver(false);

      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) {
        ingestFiles(files);
        return;
      }
      // Lien glissé depuis la barre d'adresse : pas de fichiers, juste une
      // URL en texte — même fabrique que le drop canvas.
      const text =
        event.dataTransfer?.getData("text/uri-list") ||
        event.dataTransfer?.getData("text/plain") ||
        "";
      const firstLine =
        text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith("#")) ?? "";
      if (firstLine) {
        void createNodeFromText(firstLine, getOrigin());
      }
    },
    [ingestFiles, createNodeFromText, getOrigin],
  );

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setIsOver(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsOver(false);
      }}
      onDragOver={(event) => {
        // Sans ce preventDefault, `drop` ne se déclenche jamais.
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
      className={cn(
        "mt-12 flex items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors",
        isOver
          ? "border-blue-600 bg-blue-100 text-blue-700"
          : "border-blue-500 bg-blue-50 text-blue-500 hover:bg-blue-100",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          ingestFiles(Array.from(event.target.files ?? []));
          // Permet de re-sélectionner les mêmes fichiers ensuite.
          event.target.value = "";
        }}
      />
      {active ? (
        <div className="flex w-full flex-col gap-2 text-blue-700">
          <p className="text-sm font-medium">
            Ajout de {done}/{total} fichier{total > 1 ? "s" : ""}…
          </p>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-blue-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(currentPercent)}
          >
            <div
              className="h-full rounded-full bg-blue-600 transition-[width]"
              style={{ width: `${Math.min(100, Math.max(0, currentPercent))}%` }}
            />
          </div>
          {currentLabel && (
            <p className="truncate text-xs text-blue-500">{currentLabel}</p>
          )}
        </div>
      ) : hasSession ? (
        <div className="flex flex-col items-center gap-1.5 text-blue-700">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {failed > 0 ? (
              <>
                <TbAlertCircle size={16} />
                {total - failed}/{total} fichiers prêts
                {failed > 1 ? "s" : ""} ({failed} échec{failed > 1 ? "s" : ""})
              </>
            ) : (
              <>
                <TbCheck size={16} />
                {total} fichier{total > 1 ? "s" : ""} prêt
                {total > 1 ? "s" : ""} sur le canvas
              </>
            )}
          </p>
          <p className="text-xs text-blue-500">
            D'autres fichiers ? Déposez-les ici ou{" "}
            <button
              type="button"
              className="underline hover:text-blue-700"
              onClick={() => inputRef.current?.click()}
            >
              parcourez
            </button>
            .
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <TbUpload size={20} />
          <p className="text-sm font-medium">
            Drop files here (PDF, images, audio, links, .csv, .md, .txt)
          </p>
          <p className="text-xs opacity-80">
            ou{" "}
            <button
              type="button"
              className="underline hover:text-blue-700"
              onClick={() => inputRef.current?.click()}
            >
              parcourez vos fichiers
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
