import {
  cloneElement,
  isValidElement,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactElement,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/shadcn/alert-dialog";
import { buttonVariants } from "@/components/shadcn/button";
import { X } from "lucide-react";

interface ConfirmableButtonProps {
  title: string;
  text: string;
  onCancel?: () => void;
  onConfirm: () => void;
  children: ReactElement<{ onClick?: MouseEventHandler<HTMLElement> }>;
  shouldConfirm?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  showCloseButton?: boolean;
  autoFocusConfirm?: boolean;
  // Colore le bouton de confirmation en rouge. Pour les actions qui détruisent
  // quelque chose — la couleur fait partie de l'avertissement.
  destructive?: boolean;
}

export default function ConfirmableButton({
  title,
  text,
  onCancel,
  onConfirm,
  children,
  shouldConfirm = true,
  // Défauts en anglais, comme le reste de l'UI. Ils étaient en français, ce
  // qui ne se voyait pas : tous les appels les surchargeaient — sauf
  // VersionHistoryViewer, qui affichait donc « Annuler » au milieu d'un écran
  // anglais.
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  showCloseButton = true,
  autoFocusConfirm = false,
  destructive = false,
}: ConfirmableButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const childWithDirectConfirm = useMemo(() => {
    if (!isValidElement(children) || shouldConfirm) {
      return children;
    }

    const originalOnClick = children.props.onClick;

    return cloneElement(children, {
      onClick: (event) => {
        originalOnClick?.(event);
        if (event.defaultPrevented) return;
        onConfirm();
      },
    });
  }, [children, onConfirm, shouldConfirm]);

  if (!shouldConfirm) {
    return childWithDirectConfirm;
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          if (autoFocusConfirm) {
            e.preventDefault();
            confirmRef.current?.focus();
          }
        }}
      >
        {showCloseButton && (
          <AlertDialogCancel
            className="absolute right-3 top-3 h-7 w-7 p-0"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </AlertDialogCancel>
        )}
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onCancel?.()}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            ref={confirmRef}
            onClick={() => onConfirm()}
            // La variante officielle plutôt qu'une recopie de ses classes :
            // elle porte aussi l'anneau de focus et les nuances sombres, et
            // elle suivra si le thème change.
            className={
              destructive
                ? buttonVariants({ variant: "destructive" })
                : undefined
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
