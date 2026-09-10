import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { TbCircleChevronRight, TbDirections , TbMaximize, TbPencil, TbArrowUp } from "react-icons/tb";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { useFramingMatch, useGoToFraming } from "@/hooks/useViewportFraming";
import { readFraming } from "@/lib/canvasViewportFraming";
import { useWindowsStore } from "@/stores/windowsStore";
import { colors } from "@/components/ui/styles";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import NodeFrame from "../NodeFrame";
import type { XyNodeProps, colorsEnum } from "@/types/domain";

// Affichage réactif (même patron que `LinkNode` compact/preview) : une ligne
// avec ellipse par défaut, visuel étendu (texte multi-lignes + bouton de
// navigation en bas à droite) quand la hauteur du node augmente.
const EXPANDED_MIN_HEIGHT = 70;
const MIN_WIDTH = 120;

/**
 * Un repère de navigation : il porte un cadrage de canvas et un bouton qui y
 * ramène la vue. Remplace les slideshows et les hotspots, qui vivaient tous
 * deux en tableaux sur le document `canvases`.
 *
 * Affichage réactif : une ligne (icône + titre ellipsé + bouton) par défaut,
 * texte multi-lignes + bouton « Navigate to location » en bas à droite quand
 * le node est agrandi en hauteur.
 *
 * Le titre ne s'édite en place qu'à la création (`autoEdit`, Enter = saved).
 * Ensuite, renommer passe par le stylo de la toolbar (popover), comme le
 * titre d'`AppNode` — et le double-clic ouvre la fenêtre (handler générique
 * de `NodeFrame`), au lieu de rouvrir l'édition.
 */
function MarkerTitle({
  title,
  rename,
  onEditEnd,
  startInEditMode,
  inlineDisabled,
  isTitleEmpty,
  singleLine,
  className,
}: {
  title: string;
  rename: (nextTitle: string) => void;
  onEditEnd: () => void;
  startInEditMode: boolean;
  inlineDisabled: boolean;
  isTitleEmpty: boolean;
  singleLine?: boolean;
  className?: string;
}) {
  // Titre jamais nommé : le placeholder `muted/50` d'InlineEditableText est
  // quasi invisible sur le canvas — placeholder lisible (même
  // `text-muted-foreground` que `NodeEmptyState`) + rappel pencil, le
  // renommage passant par la toolbar une fois la création terminée.
  if (isTitleEmpty) {
    return (
      <span className="flex min-w-0 flex-1 select-none items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate italic">Untitled marker</span>
        <span
          className="flex shrink-0 items-center gap-0.5"
          title="Rename with the pencil toolbar"
        >
          <TbPencil size={12} />
          <TbArrowUp size={12} />
        </span>
      </span>
    );
  }
  return (
    <InlineEditableText
      value={title}
      onSave={rename}
      onEditEnd={onEditEnd}
      as="span"
      className={className}
      placeholder="Untitled marker"
      startInEditMode={startInEditMode}
      disabled={inlineDisabled}
      singleLine={singleLine}
    />
  );
}
function ViewportNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const goToFraming = useGoToFraming();
  const openWindow = useWindowsStore((s) => s.openWindow);
  const { updateNodeDataValues } = useUpdateNodeDataValues();

  // Sélecteur booléen : seuls les deux nodes concernés par un changement
  // re-rendent, pas tous les repères du canvas. Même patron que `TitleNode` —
  // et surtout pas un initialiseur `useState`, que StrictMode invoque deux fois
  // et qui perdrait le signal au second passage.
  const shouldAutoEdit = useNodeEditorStore(
    (state) => state.editingNodeId === xyNode.id,
  );
  const [startInEditMode, setStartInEditMode] = useState(false);
  useEffect(() => {
    if (!shouldAutoEdit) return;
    // Consommé aussitôt : le signal ne vaut que pour ce montage, sinon revenir
    // sur le canvas rouvrirait l'édition.
    useNodeEditorStore.getState().setEditingNodeId(null);
    setStartInEditMode(true);
  }, [shouldAutoEdit]);

  // L'édition en place ne vaut que pour le nommage à la création : dès que
  // cette session se termine (Enter, Echap, blur), l'inline se désactive et
  // le double-clic retombe sur l'ouverture de la fenêtre.
  const [creationEditDone, setCreationEditDone] = useState(false);
  const inlineDisabled = !startInEditMode || creationEditDone;

  const [inputTitle, setInputTitle] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // `values.view` est stable tant que le nodeData ne change pas : le sélecteur
  // de `useFramingMatch` n'est donc pas recréé à chaque render.
  const view = values?.view;
  const framing = useMemo(() => readFraming(view), [view]);
  const match = useFramingMatch(framing);

  const title = typeof values?.title === "string" ? values.title : "";
  // Titre jamais nommé : le placeholder `muted/50` d'InlineEditableText est
  // quasi invisible sur le canvas — on affiche un placeholder lisible avec
  // le même CTA pencil que les autres nodes (renommage via la toolbar).
  // Déclaré après `title`, pas plus haut : le lire avant son initialisation
  // lève `Cannot access 'title' before initialization` et casse la page.
  const isTitleEmpty = !title.trim() && inlineDisabled;

  const nodeColor = colors[(xyNode.data?.color as colorsEnum) || "default"];

  // Piloté par la hauteur réelle : `areNodePropsEqual` compare width/height,
  // donc le basculement compact/étendu se fait en direct pendant le resize.
  const isExpanded = (xyNode.height ?? 33) >= EXPANDED_MIN_HEIGHT;

  const rename = useCallback(
    (nextTitle: string) => {
      if (!nodeDataId) return;
      void updateNodeDataValues({
        nodeDataId,
        values: { title: nextTitle.trim() },
      });
    },
    [nodeDataId, updateNodeDataValues],
  );

  const handleGoTo = useCallback(() => {
    if (framing) goToFraming(framing);
  }, [framing, goToFraming]);

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "viewport" });
  }, [nodeDataId, openWindow, xyNode.id]);

  const handleSaveTitle = useCallback(() => {
    rename(inputTitle);
    setIsPopoverOpen(false);
    setInputTitle("");
  }, [rename, inputTitle]);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      setIsPopoverOpen(open);
      if (open) {
        setInputTitle(title);
      }
    },
    [title],
  );

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <Button
          size="icon"
          variant="outline"
          disabled={!nodeDataId}
          onClick={handleOpenWindow}
          title="Open the markers list"
        >
          <TbMaximize />
        </Button>
        <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" title="Edit marker title">
              <TbPencil />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-2">
              <Input
                onDoubleClick={(e) => e.stopPropagation()}
                type="text"
                placeholder="Untitled marker"
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                }}
              />
              <Button onClick={handleSaveTitle} size="sm">
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode} minWidth={MIN_WIDTH} minHeight={33}>
        {isExpanded ? (
          <div className="flex h-full w-full min-w-0 flex-col gap-1 overflow-hidden p-2">
            <div className="flex min-h-0 min-w-0 flex-1 items-start gap-2 overflow-hidden">
              <TbDirections
                size={18}
                className="mt-0.5 shrink-0"
                title={
                  match === "here"
                    ? "View is on this marker"
                    : match === "near"
                      ? "View is close to this marker"
                      : undefined
                }
              />
              <span
                className="block min-h-0 min-w-0 flex-1 overflow-hidden"
                title={title || undefined}
                // Pendant le nommage à la création, un double-clic (ex.
                // sélection d'un mot) ne doit pas ouvrir la fenêtre
                // par-dessus la saisie.
                onDoubleClick={(event) => {
                  if (!inlineDisabled) event.stopPropagation();
                }}
              >
                <MarkerTitle
                  title={title}
                  rename={rename}
                  onEditEnd={() => setCreationEditDone(true)}
                  startInEditMode={startInEditMode}
                  inlineDisabled={inlineDisabled}
                  isTitleEmpty={isTitleEmpty}
                  className="min-w-0"
                />
              </span>
            </div>
            <div className="flex shrink-0 items-center justify-end">
              <Button
                size="sm"
                variant="ghost"
                // `nodrag` : sans lui le mousedown démarre un drag du node au
                // lieu d'armer le clic. `stopPropagation` sur le dblclick :
                // deux clics rapides ne doivent pas ouvrir la fenêtre
                // par-dessus la navigation (cf. le handler générique de
                // NodeFrame).
                className={`nodrag shrink-0 ${nodeColor.hoverBg}`}
                disabled={!framing}
                onClick={handleGoTo}
                onDoubleClick={(event) => event.stopPropagation()}
                title="Go to this marker"
                aria-label={`Go to marker ${title || "untitled"}`}
              >
                Navigate to location
                <TbCircleChevronRight
                  size={16}
                  className={`${nodeColor.textColor}`}
                />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full min-w-0 items-center gap-2 overflow-hidden px-2">
            <TbDirections
              size={18}
              className="shrink-0"
              title={
                match === "here"
                  ? "View is on this marker"
                  : match === "near"
                    ? "View is close to this marker"
                    : undefined
              }
            />
            <span
              className="block min-w-0 flex-1 overflow-hidden"
              title={title || undefined}
              // Pendant le nommage à la création, un double-clic (ex. sélection
              // d'un mot) ne doit pas ouvrir la fenêtre par-dessus la saisie.
              onDoubleClick={(event) => {
                if (!inlineDisabled) event.stopPropagation();
              }}
            >
              <MarkerTitle
                title={title}
                rename={rename}
                onEditEnd={() => setCreationEditDone(true)}
                startInEditMode={startInEditMode}
                inlineDisabled={inlineDisabled}
                isTitleEmpty={isTitleEmpty}
                singleLine
                className="min-w-0 w-full"
              />
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              // `nodrag` : sans lui le mousedown démarre un drag du node au lieu
              // d'armer le clic. `stopPropagation` sur le dblclick : deux clics
              // rapides ne doivent pas ouvrir la fenêtre par-dessus la
              // navigation (cf. le handler générique de NodeFrame).
              className={`nodrag h-6 shrink-0 px-2 ${nodeColor.hoverBg}`}
              disabled={!framing}
              onClick={handleGoTo}
              onDoubleClick={(event) => event.stopPropagation()}
              title="Go to this marker"
              aria-label={`Go to marker ${title || "untitled"}`}
            >
              <TbCircleChevronRight size={18} className={`${nodeColor.textColor}`} />
            </Button>
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(ViewportNode, areNodePropsEqual);
