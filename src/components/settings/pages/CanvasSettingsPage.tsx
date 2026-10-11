import PageHeader from "@/components/app-shell/PageHeader";
import CanvasBackgroundPanel from "@/components/settings/canvas/CanvasBackgroundPanel";
import CanvasPeekButton from "@/components/settings/canvas/CanvasPeekButton";
import type { SettingsPageProps } from "../settingsSections";

/** L'apparence du canvas depuis lequel les réglages sont ouverts. */
export default function CanvasSettingsPage({ canvasId }: SettingsPageProps) {
  return (
    <div>
      <PageHeader
        title="Canvas"
        subtitle="Icon, color, cover image and background of this canvas, shared with everyone who can see it. Only its owner can edit them."
        action={canvasId ? <CanvasPeekButton /> : undefined}
      />

      <div className="mt-6 rounded-2xl bg-slate-50 p-3">
        {canvasId ? (
          <CanvasBackgroundPanel canvasId={canvasId} />
        ) : (
          <p className="p-2 text-sm text-slate-500">
            Open the settings from a canvas to change its appearance.
          </p>
        )}
      </div>
    </div>
  );
}
