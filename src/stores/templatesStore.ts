import { useCallback } from "react";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { Doc, Id } from "@/../convex/_generated/dataModel";

// Templates de custom nodes résolus pour la session canvas courante
// (merge de listForCanvas + listMine, syncés depuis la route canvas).
// Map + sélecteurs granulaires, miroir de nodeDataStore : éditer le
// template T ne re-rend que les nodes qui l'utilisent. Ne JAMAIS mettre
// l'objet template dans les data React Flow (casserait areNodePropsEqual).

interface TemplatesStore {
  templates: Map<Id<"nodeTemplates">, Doc<"nodeTemplates">>;
  // Templates proposables dans le menu d'ajout, dans l'ordre d'affichage.
  // Liste d'ids séparée, et non un filtre sur `templates`, parce que celle-ci
  // contient aussi les templates d'AUTRES users (canvas partagé, résolus par
  // listForCanvas) et les archivés (leurs instances vivantes doivent
  // continuer de rendre) — deux choses que le menu ne doit pas proposer.
  // L'appartenance vient de listMine, donc tranchée par le serveur : rien à
  // recalculer côté client, et pas besoin de connaître l'id du user.
  myTemplateIds: Id<"nodeTemplates">[];
  upsertTemplates: (templates: Doc<"nodeTemplates">[]) => void;
  setMyTemplateIds: (ids: Id<"nodeTemplates">[]) => void;
  clear: () => void;
}

export const useTemplatesStore = create<TemplatesStore>()(
  devtools(
    (set) => ({
      templates: new Map(),
      myTemplateIds: [],

      // Merge par updatedAt : les docs inchangés gardent leur référence
      // (les sélecteurs ne re-rendent pas). Pas de retrait : les templates
      // sont soft-deleted (archivés), jamais supprimés ; le clear() au
      // changement de canvas suffit.
      upsertTemplates: (templates) => {
        set((state) => {
          let changed = false;
          const newMap = new Map(state.templates);
          for (const template of templates) {
            const existing = newMap.get(template._id);
            if (!existing || existing.updatedAt !== template.updatedAt) {
              newMap.set(template._id, template);
              changed = true;
            }
          }
          return changed ? { templates: newMap } : state;
        });
      },

      // Compare avant d'écrire : la query source se réabonne à chaque écriture
      // de template, et remplacer le tableau par un équivalent re-rendrait le
      // menu d'ajout pour rien (useMyTemplates dérive de cette référence).
      setMyTemplateIds: (ids) => {
        set((state) => {
          const unchanged =
            state.myTemplateIds.length === ids.length &&
            state.myTemplateIds.every((id, i) => id === ids[i]);
          return unchanged ? state : { myTemplateIds: ids };
        });
      },

      clear: () => set({ templates: new Map(), myTemplateIds: [] }),
    }),
    { name: "templates-store" },
  ),
);

/** Template par id — re-render uniquement quand CE template change. */
export function useTemplate(
  templateId: string | undefined,
): Doc<"nodeTemplates"> | undefined {
  return useTemplatesStore(
    useCallback(
      (state) =>
        templateId
          ? state.templates.get(templateId as Id<"nodeTemplates">)
          : undefined,
      [templateId],
    ),
  );
}

/**
 * Templates proposables dans le menu d'ajout de node, prêts au premier rendu.
 * La route canvas est déjà abonnée à listMine : le menu lit ce cache au lieu
 * d'ouvrir sa propre subscription, sinon chaque ouverture repartait d'un état
 * de chargement et la liste apparaissait APRÈS que le menu ait été mesuré et
 * positionné (cf. ContextMenuWrapper) — donc hors de l'écran.
 */
export function useMyTemplates(): Doc<"nodeTemplates">[] {
  return useTemplatesStore(
    useShallow((state) =>
      state.myTemplateIds
        .map((id) => state.templates.get(id))
        .filter((template): template is Doc<"nodeTemplates"> => !!template),
    ),
  );
}

/** undefined = template pas (encore) résolu. */
export function useTemplateHasWindow(
  templateId: string | undefined,
): boolean | undefined {
  return useTemplatesStore(
    useCallback(
      (state) => {
        if (!templateId) return undefined;
        const template = state.templates.get(
          templateId as Id<"nodeTemplates">,
        );
        return template ? template.windowLayout !== undefined : undefined;
      },
      [templateId],
    ),
  );
}
