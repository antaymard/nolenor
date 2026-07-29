import { useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

// Ouverture de l'éditeur de template, portée par un param de recherche
// (`?template=<id>` ou `?template=new`) plutôt que par un store : la modale
// survit ainsi à un rechargement, le bouton Retour la ferme, et un lien vers
// un template précis se partage.
//
// Seul endroit qui connaît le nom du param — le schéma est déclaré sur la
// route racine (cf. __root.tsx) pour que ça marche depuis le canvas comme
// depuis les settings, sans dupliquer la déclaration.

const NEW_TEMPLATE = "new";

function useTemplateEditor() {
  const navigate = useNavigate();
  // `strict: false` : ce hook est appelé depuis des routes différentes
  // (canvas, settings), le param vient de la racine dans tous les cas.
  const template = useSearch({
    strict: false,
    select: (search) => (search as { template?: string }).template,
  });

  const openTemplateEditor = useCallback(
    (templateId: string) => {
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          template: templateId,
        }),
      });
    },
    [navigate],
  );

  const closeTemplateEditor = useCallback(() => {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        template: undefined,
      }),
    });
  }, [navigate]);

  // `replace` : après une création, on échange `new` contre l'id réel sans
  // empiler une entrée d'historique — sinon un Retour rouvrirait l'éditeur
  // sur un « nouveau template » alors qu'il vient d'être créé.
  const replaceTemplateId = useCallback(
    (templateId: string) => {
      void navigate({
        to: ".",
        replace: true,
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          template: templateId,
        }),
      });
    },
    [navigate],
  );

  return {
    editingTemplateId: template,
    isCreating: template === NEW_TEMPLATE,
    openTemplateEditor,
    openTemplateCreator: () => openTemplateEditor(NEW_TEMPLATE),
    closeTemplateEditor,
    replaceTemplateId,
  };
}

export { useTemplateEditor, NEW_TEMPLATE };
