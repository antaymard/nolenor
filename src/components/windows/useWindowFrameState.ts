import { useCallback, useEffect, useMemo, useState } from "react";
import { useWindowsStore } from "@/stores/windowsStore";
import type { SaveHandler } from "./WindowFrameContext";

export type SaveState = "idle" | "saving" | "saved";

/**
 * L'état d'une fenêtre de node : brouillon non sauvegardé, handler de sauvegarde
 * et de rafraîchissement publiés par le body via `WindowFrameContext`.
 *
 * Partagé par le chrome desktop (`WindowFrame`) et le plein écran mobile
 * (`MobileNodeOverlay`) : seuls les boutons diffèrent, pas la mécanique.
 */
export function useWindowFrameState(xyNodeId: string) {
  const [isDirty, setDirty] = useState(false);
  const [saveHandler, setSaveHandler] = useState<SaveHandler | null>(null);
  const [refreshHandler, setRefreshHandler] = useState<(() => void) | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const addDirtyNode = useWindowsStore((s) => s.addDirtyNode);
  const removeDirtyNode = useWindowsStore((s) => s.removeDirtyNode);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timeoutId = window.setTimeout(() => setSaveState("idle"), 1500);
    return () => window.clearTimeout(timeoutId);
  }, [saveState]);

  const handleSave = useCallback(async () => {
    if (!saveHandler || !isDirty || isSaving) return;

    setIsSaving(true);
    setSaveState("saving");
    try {
      const success = await saveHandler();
      setSaveState(success === false ? "idle" : "saved");
    } catch {
      setSaveState("idle");
    } finally {
      setIsSaving(false);
    }
  }, [isDirty, isSaving, saveHandler]);

  useEffect(() => {
    if (isDirty) {
      addDirtyNode(xyNodeId);
    } else {
      removeDirtyNode(xyNodeId);
    }
    return () => removeDirtyNode(xyNodeId);
  }, [isDirty, xyNodeId, addDirtyNode, removeDirtyNode]);

  const contextValue = useMemo(
    () => ({
      setDirty: (dirty: boolean) => {
        setDirty(dirty);
        if (dirty) setSaveState("idle");
      },
      setSaveHandler: (fn: SaveHandler | null) => setSaveHandler(() => fn),
      setRefreshHandler: (fn: (() => void) | null) =>
        setRefreshHandler(() => fn),
    }),
    [],
  );

  return {
    isDirty,
    isSaving,
    saveState,
    saveHandler,
    refreshHandler,
    handleSave,
    contextValue,
  };
}
