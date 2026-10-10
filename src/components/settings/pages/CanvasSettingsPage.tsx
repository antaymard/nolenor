import PageHeader from "@/components/app-shell/PageHeader";
import CanvasBackgroundPanel from "@/components/settings/canvas/CanvasBackgroundPanel";
import type { SettingsPageProps } from "../settingsSections";

export default function CanvasSettingsPage({ canvasId }: SettingsPageProps) {
  return (
    <div>
      <PageHeader
        title="Canvas"
        subtitle="Icon, color, cover image and background, shared with everyone who can see the canvas. Only canvases you own can be edited."
      />

      <div className="mt-6 rounded-2xl bg-slate-50 p-3">
        <CanvasBackgroundPanel initialCanvasId={canvasId} />
      </div>
    </div>
  );
}
