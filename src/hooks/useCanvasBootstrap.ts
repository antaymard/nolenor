import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import useRichQuery from "@/components/utils/useRichQuery";
import { useMarkThreadReviewed } from "@/hooks/useOpenNoleThread";
import { useCanvasStore } from "@/stores/canvasStore";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useNoleStore } from "@/stores/noleStore";
import { useTemplatesStore } from "@/stores/templatesStore";
import { useWindowsStore } from "@/stores/windowsStore";

/**
 * Charge un canvas et synchronise les stores globaux qui en dépendent.
 *
 * Partagé par la surface desktop (`CanvasContent`) et le shell mobile : les deux
 * ont besoin exactement des mêmes données (canvas, nodeDatas, templates) et du
 * même nettoyage au changement de canvas. Le rendu des erreurs reste au point
 * d'appel — le desktop propose un CTA de connexion que le mobile n'a pas.
 */
export function useCanvasBootstrap(
  canvasId: Id<"canvases">,
  { isAuthenticated }: { isAuthenticated: boolean },
) {
  const setNodeDatas = useNodeDataStore((state) => state.setNodeDatas);
  const clearNodeDatas = useNodeDataStore((state) => state.clear);
  const setCanvas = useCanvasStore((state) => state.setCanvas);
  const upsertTemplates = useTemplatesStore((state) => state.upsertTemplates);
  const setMyTemplateIds = useTemplatesStore((state) => state.setMyTemplateIds);
  const setOwnedTemplateIds = useTemplatesStore(
    (state) => state.setOwnedTemplateIds,
  );
  const clearTemplates = useTemplatesStore((state) => state.clear);
  const lastCanvasSnapshotRef = useRef<string | null>(null);

  // Cleanup stores on canvas switch. Doit rester le premier effet du hook :
  // React exécute les effets dans l'ordre de déclaration, et les effets de sync
  // ci-dessous doivent écrire *après* ce nettoyage.
  useEffect(() => {
    useWindowsStore.getState().closeAllWindows();
    useCanvasStore.getState().resetSync();
    // La conversation Nolë désignée depuis l'extérieur (dock d'activité,
    // threads associés d'un node) appartient à *ce* canvas. Le nettoyage vit
    // ici et non dans `useNoleChat` : le cycle de vie d'un hook de chat est
    // celui du panneau, qui se monte et se démonte à chaque ouverture — s'y
    // accrocher effaçait la sélection à l'instant même où on l'ouvrait.
    useNoleStore.getState().setActiveThreadId(null);
    setCanvas(null);
    clearNodeDatas();
    clearTemplates();
    lastCanvasSnapshotRef.current = null;
  }, [canvasId, clearNodeDatas, clearTemplates, setCanvas]);

  // Ouverture d'une conversation désignée par l'URL (`?thread=`) : c'est par là
  // qu'arrivent les tâches en attente de la home, qui ne peut pas écrire dans le
  // store d'un canvas qu'elle n'a pas encore ouvert.
  //
  // Déclaré après le nettoyage ci-dessus, et c'est ce qui le fait marcher :
  // React joue les effets dans l'ordre de déclaration, donc la remise à zéro de
  // `activeThreadId` passe d'abord, et la désignation ensuite.
  const navigate = useNavigate();
  const markReviewed = useMarkThreadReviewed();
  const threadParam = useSearch({
    strict: false,
    select: (search) => (search as { thread?: string }).thread,
  });

  useEffect(() => {
    if (!threadParam) return;

    useNoleStore.getState().setActiveThreadId(threadParam);
    useNoleStore.getState().setPanelLayout("expanded");
    // Ouvrir, c'est revoir — même règle qu'au dock (cf. `useOpenNoleThread`) :
    // la tâche ne doit pas rester en attente sur la home une fois consultée.
    markReviewed(threadParam);

    // Le param est consommé : on l'efface pour qu'il ne rouvre pas la
    // conversation au moindre retour arrière, et pour qu'une URL copiée depuis
    // la barre d'adresse pointe le canvas, pas une conversation d'hier.
    // `replace` : la désignation n'est pas une étape de navigation.
    void navigate({
      to: ".",
      replace: true,
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        thread: undefined,
      }),
    });
  }, [threadParam, markReviewed, navigate]);

  // Fetch canvas
  const {
    isError: isCanvasError,
    data: canvas,
    error: canvasError,
  } = useRichQuery(api.canvases.readCanvas, {
    canvasId,
  });

  // Fetch nodeDatas for this canvas
  const {
    isError: isNodeDatasError,
    data: nodeDatas,
    error: nodeDatasError,
  } = useRichQuery(
    api.nodeDatas.listByCanvasId,
    canvasId ? { canvasId } : "skip",
  );

  // Custom node templates : ceux référencés par le canvas (viewers de
  // canvases partagés inclus) + ceux du user (menu d'ajout, nouveaux nodes).
  // Mergés dans templatesStore pour des sélecteurs granulaires par node.
  //
  // `useRichQuery` et pas `useQuery` : cette query exige le même accès canvas
  // que `readCanvas`, donc elle échoue en même temps (canvas supprimé, droits
  // révoqués). Un `useQuery` throw alors *pendant le render* et fait tomber
  // toute la route sur l'errorComponent du routeur, avant que l'appelant ait pu
  // rendre son écran d'erreur avec sa sortie de secours. Ici on absorbe :
  // `isCanvasError` porte déjà le diagnostic.
  const { data: canvasTemplates } = useRichQuery(
    api.nodeTemplates.listForCanvas,
    canvasId ? { canvasId } : "skip",
  );
  const myTemplates = useQuery(
    api.nodeTemplates.listMine,
    isAuthenticated ? { includeArchived: true } : "skip",
  );

  useEffect(() => {
    if (canvasTemplates) upsertTemplates(canvasTemplates);
  }, [canvasTemplates, upsertTemplates]);

  useEffect(() => {
    if (!myTemplates) return;
    upsertTemplates(myTemplates);
    // Les archivés sont bien chargés (leurs instances vivantes doivent rendre)
    // mais ne sont pas proposables : le menu d'ajout lit `myTemplateIds`, pas
    // la map. L'ordre est celui du serveur (tri par nom).
    setMyTemplateIds(
      myTemplates
        .filter((template) => template.archivedAt === undefined)
        .map((template) => template._id),
    );
    // Propriété : archivés inclus — un template archivé reste éditable, il
    // n'est simplement plus proposé à l'ajout.
    setOwnedTemplateIds(myTemplates.map((template) => template._id));
  }, [myTemplates, upsertTemplates, setMyTemplateIds, setOwnedTemplateIds]);

  // ======= Put canvas in store, if it changes (besides nodes and edges)
  // Keep only non-flow fields in canvas store (no nodes/edges)
  const canvasForStore = useMemo(() => {
    if (!canvas) {
      return null;
    }

    const canvasWithoutFlowData = { ...canvas };
    delete canvasWithoutFlowData.nodes;
    delete canvasWithoutFlowData.edges;

    return canvasWithoutFlowData;
  }, [canvas]);
  // Sync convex canvas -> zustand canvas store without pointless store updates
  useEffect(() => {
    if (!canvasForStore) {
      return;
    }

    const nextSnapshot = JSON.stringify(canvasForStore);
    if (lastCanvasSnapshotRef.current === nextSnapshot) {
      return;
    }

    lastCanvasSnapshotRef.current = nextSnapshot;
    setCanvas(canvasForStore);
  }, [canvasForStore, setCanvas]);
  // ======

  // Sync convex nodeDatas -> zustand store
  useEffect(() => {
    if (nodeDatas) {
      setNodeDatas(nodeDatas);
    }
  }, [nodeDatas, setNodeDatas]);

  useEffect(() => {
    if (isNodeDatasError) {
      clearNodeDatas();
    }
  }, [clearNodeDatas, isNodeDatasError]);

  // Sync document title
  useEffect(() => {
    if (canvas?.name) {
      document.title = canvas.name;
    }
  }, [canvas?.name]);

  return {
    canvas,
    isCanvasError,
    canvasError,
    isNodeDatasError,
    nodeDatasError,
  };
}
