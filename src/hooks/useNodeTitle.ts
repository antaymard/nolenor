import { useCallback } from "react";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplate } from "@/stores/templatesStore";
import type { Id } from "@/../convex/_generated/dataModel";
import { getNodeDataTitle } from "@/components/utils/nodeDataDisplayUtils";

export function useNodeDataTitle(
  nodeDataId: Id<"nodeDatas"> | undefined,
): string | undefined {
  // Souscription au seul templateId, séparée de celle au titre : il ne change
  // pas après la création du node, donc ce sélecteur ne déclenche jamais de
  // rendu — il ne sert qu'à alimenter useTemplate.
  const templateId = useNodeDataStore(
    useCallback(
      (state) =>
        nodeDataId ? state.nodeDatas.get(nodeDataId)?.templateId : undefined,
      [nodeDataId],
    ),
  );

  // Custom : le titre exact vient du template (titleFieldId, fallback nom du
  // template). Vraie souscription et non un getState() : renommer un template
  // ou changer son titleFieldId doit rafraîchir le titre en direct, y compris
  // là où rien d'autre ne dépend du template (pastilles de fenêtres
  // minimisées, résultats de recherche). undefined pour les prébuilts.
  const template = useTemplate(templateId);

  // Le sélecteur renvoie la CHAÎNE, pas le doc : une édition de values qui ne
  // change pas le titre ne re-rend aucun de ses afficheurs. Le template fait
  // partie des deps, donc un template modifié recalcule bien le titre.
  return useNodeDataStore(
    useCallback(
      (state) => {
        if (!nodeDataId) return undefined;
        const nodeData = state.nodeDatas.get(nodeDataId);
        if (!nodeData) return undefined;
        return getNodeDataTitle(nodeData, template ?? null);
      },
      [nodeDataId, template],
    ),
  );
}
