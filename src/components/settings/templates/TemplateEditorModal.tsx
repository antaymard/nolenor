import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { useTemplateEditor } from "@/hooks/useTemplateEditor";
import { useCanvasStore } from "@/stores/canvasStore";
import TemplateEditor from "./TemplateEditor";

// Hôte de l'éditeur de template, monté une seule fois à la racine : il
// s'ouvre depuis les settings comme depuis un clic droit sur un custom node
// du canvas, pilote par le param de recherche `?template=`.
//
// C'est LUI qui possède la fermeture, pas l'éditeur — d'où le onDirtyChange
// remonté : quatre chemins mènent à la sortie (bouton X, Échap, clic
// extérieur, bouton Retour du navigateur) et tous doivent passer par la même
// garde, sans quoi un draft entier disparaît en silence.

export default function TemplateEditorModal() {
  const {
    editingTemplateId,
    isCreating,
    closeTemplateEditor,
    replaceTemplateId,
  } = useTemplateEditor();

  const [isDirty, setIsDirtyState] = useState(false);
  const [closeRequested, setCloseRequested] = useState(false);

  // Miroir en ref de `isDirty`. Indispensable, et pas une optimisation :
  // `shouldBlockFn` est consulté par le routeur au moment de la navigation,
  // avec l'état capturé au dernier rendu. Fermer après « Discard » revient à
  // naviguer pour retirer le param — le blocker voyait encore `isDirty` à
  // true et bloquait notre PROPRE fermeture, laissant l'overlay collé.
  // La ref est remise à false de façon synchrone avant de naviguer.
  const dirtyRef = useRef(false);
  const setIsDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setIsDirtyState(dirty);
  }, []);

  // Bouton Retour / navigation : le seul chemin qu'on ne peut pas
  // intercepter depuis la modale, puisque l'URL change avant nous. On bloque
  // la navigation qui retire le param, et on la reprend ou l'annule depuis la
  // même confirmation que les trois autres chemins.
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) =>
      dirtyRef.current && !(next.search as { template?: string }).template,
    withResolver: true,
    enableBeforeUnload: () => dirtyRef.current,
  });
  const blockedByHistory = blocker.status === "blocked";

  const requestClose = useCallback(() => {
    if (isDirty) setCloseRequested(true);
    else closeTemplateEditor();
  }, [isDirty, closeTemplateEditor]);

  const discardAndClose = useCallback(() => {
    setCloseRequested(false);
    setIsDirty(false);
    if (blockedByHistory) blocker.proceed?.();
    else closeTemplateEditor();
  }, [blockedByHistory, blocker, closeTemplateEditor, setIsDirty]);

  const keepEditing = useCallback(() => {
    setCloseRequested(false);
    if (blockedByHistory) blocker.reset?.();
  }, [blockedByHistory, blocker]);

  if (!editingTemplateId) return null;

  return (
    <>
      <CanvasFocusGuard />
      <Dialog
        open
        onOpenChange={(open) => {
          // Ne se déclenche que pour le bouton X : Échap et clic extérieur
          // sont interceptés ci-dessous avant d'arriver ici.
          if (!open) requestClose();
        }}
      >
        <DialogContent
          // La croix native ferme sans passer par la garde. On la remplace
          // par la nôtre — toujours affichée, jamais conditionnée à l'état
          // sale : une croix qui apparaît et disparaît en tapant serait plus
          // déroutante que l'absence de croix.
          showCloseButton={false}
          // `sm:max-w-none` et pas `max-w-none` : le défaut de
          // DialogContent est `sm:max-w-lg`, une variante responsive qu'une
          // classe de base ne peut pas écraser (elle gagne au-dessus de sm).
          className="flex h-[92vh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden p-1 sm:max-w-none rounded-[18px] border-0"
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            requestClose();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
            requestClose();
          }}
        >
          <div className="border rounded-[14px] h-full w-full border-slate-200">
          {/* HIDDEN */}
          <DialogTitle className="sr-only">Edit custom node type</DialogTitle>
          <DialogDescription className="sr-only">
            Design the fields and layouts of a custom node type.
          </DialogDescription>

          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 rounded-sm p-1 opacity-60 transition-opacity hover:bg-black/5 hover:opacity-100"
          >
            <X className="size-4" />
          </button>

          {/* `pr-12` réserve la place de la croix : sans ça elle se pose sur
              le bouton Save de l'en-tête de l'éditeur. */}

            <EditorBody
              templateId={isCreating ? null : (editingTemplateId as Id<"nodeTemplates">)}
              onCreated={replaceTemplateId}
              onDirtyChange={setIsDirty}
            />

        </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={closeRequested || blockedByHistory}
        onOpenChange={(open) => {
          if (!open) keepEditing();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This template has unsaved changes. Closing now will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Pas de « sauvegarder et fermer » : le save peut échouer à la
                validation, et fermer sur un échec silencieux serait pire que
                de renvoyer l'utilisateur au bouton Save. */}
            <AlertDialogCancel onClick={keepEditing}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={discardAndClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Tant que la modale est ouverte, le canvas ne doit plus recevoir le clavier :
// sans ça, Mod+D en tapant le nom d'un template duplique un node derrière.
// Composant dédié plutôt qu'un effet dans le parent — il n'est monté que
// pendant l'ouverture, donc l'effet n'a aucune condition à porter.
function CanvasFocusGuard() {
  useEffect(() => {
    const previous = useCanvasStore.getState().focus;
    useCanvasStore.getState().setFocus("modal");
    // Restaure la valeur PRÉCÉDENTE et non "canvas" en dur : une window
    // d'édition richtext peut très bien être ouverte derrière la modale.
    return () => useCanvasStore.getState().setFocus(previous);
  }, []);
  return null;
}

// Logique d'affichage en fonction du template => vide, forbidden, inexistant...
function EditorBody({
  templateId,
  onCreated,
  onDirtyChange,
}: {
  templateId: Id<"nodeTemplates"> | null;
  onCreated: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const template = useQuery(
    api.nodeTemplates.getOneThatIsMine,
    templateId ? { templateId } : "skip",
  );

  if (!templateId) {
    return (
      <TemplateEditor
        key="new"
        onCreated={onCreated}
        onDirtyChange={onDirtyChange}
      />
    );
  }

  if (template === undefined) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-gray-500 italic">
        Loading…
      </p>
    );
  }

  if (template === null) {
    // Un seul message pour « supprimé » et « pas à toi » : la query ne les
    // distingue pas, volontairement (cf. getOwnedTemplate).
    return (
      <p className="flex h-full items-center justify-center text-sm text-gray-500">
        This template doesn’t exist, or belongs to someone else.
      </p>
    );
  }

  return (
    <TemplateEditor
      key={template._id}
      template={template}
      onDirtyChange={onDirtyChange}
    />
  );
}
