import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import useRichQuery from "@/components/utils/useRichQuery";
import { useCanvasStore } from "@/stores/canvasStore";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useNoleStore } from "@/stores/noleStore";
import { useTemplatesStore } from "@/stores/templatesStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { toCanvasEdge, toCanvasNode } from "@/lib/flowNodes";
import {
  clearCanvasDocCache,
  rememberEdgeDocs,
  rememberNodeDataDocs,
  rememberNodeDocs,
} from "@/lib/canvasDocCache";
import { useCanvasHistoryStore } from "@/stores/canvasHistoryStore";

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
    // Le brouillon du composer vit dans le store depuis qu'il ne doit plus
    // re-rendre le chat à chaque frappe : sans ce nettoyage, il suivrait
    // l'utilisateur d'un canvas à l'autre.
    useNoleStore.getState().setUserInput("");
    setCanvas(null);
    clearNodeDatas();
    clearTemplates();
    // La pile d'annulation ne suit pas l'utilisateur d'un canvas à l'autre, et
    // le registre de documents qui sert ses updates optimistes non plus.
    useCanvasHistoryStore.getState().setCanvasId(canvasId);
    clearCanvasDocCache();
    lastCanvasSnapshotRef.current = null;
  }, [canvasId, clearNodeDatas, clearTemplates, setCanvas]);

  // Fetch canvas
  const {
    isError: isCanvasError,
    data: canvas,
    error: canvasError,
  } = useRichQuery(api.canvases.readCanvas, {
    canvasId,
  });

  const { data: tableNodes } = useRichQuery(api.nodes.listFromCanvas, {
    canvasId,
  });

  const flowNodes = useMemo(
    () =>
      tableNodes === undefined ? undefined : tableNodes.map(toCanvasNode),
    [tableNodes],
  );

  // Le registre garde le DERNIER doc serveur connu de chaque élément, y
  // compris après sa disparition de la liste : c'est ce document-là que
  // l'update optimiste d'une restauration doit réinsérer. Alimenté ici, avant
  // `toCanvasNode`/`toCanvasEdge`, qui laissent tomber `_id` et `canvasId`.
  useEffect(() => {
    if (tableNodes) rememberNodeDocs(tableNodes);
  }, [tableNodes]);

  // Edges de la table `edges` : même query séparée que les nodes.
  const { data: tableEdges } = useRichQuery(api.edges.listFromCanvas, {
    canvasId,
  });

  const flowEdges = useMemo(
    () =>
      tableEdges === undefined ? undefined : tableEdges.map(toCanvasEdge),
    [tableEdges],
  );

  useEffect(() => {
    if (tableEdges) rememberEdgeDocs(tableEdges);
  }, [tableEdges]);

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

  // ======= Put canvas in store, if it changes
  const canvasForStore = useMemo(() => {
    if (!canvas) {
      return null;
    }

    // Le doc canvas ne porte plus les flow data : rien à en retirer, on
    // stocke tel quel.
    return { ...canvas };
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
      rememberNodeDataDocs(nodeDatas);
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
    flowNodes,
    flowEdges,
    isCanvasError,
    canvasError,
    isNodeDatasError,
    nodeDatasError,
  };
}
