import { useCallback } from "react";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Doc, Id } from "@/../convex/_generated/dataModel";

// Templates de custom nodes résolus pour la session canvas courante
// (merge de listForCanvas + listMine, syncés depuis la route canvas).
// Map + sélecteurs granulaires, miroir de nodeDataStore : éditer le
// template T ne re-rend que les nodes qui l'utilisent. Ne JAMAIS mettre
// l'objet template dans les data React Flow (casserait areNodePropsEqual).

interface TemplatesStore {
  templates: Map<Id<"nodeTemplates">, Doc<"nodeTemplates">>;
  upsertTemplates: (templates: Doc<"nodeTemplates">[]) => void;
  clear: () => void;
}

export const useTemplatesStore = create<TemplatesStore>()(
  devtools(
    (set) => ({
      templates: new Map(),

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

      clear: () => set({ templates: new Map() }),
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
