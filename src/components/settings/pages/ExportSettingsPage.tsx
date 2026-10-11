import PageHeader from "@/components/app-shell/PageHeader";
import ExportPanel from "@/components/settings/export/ExportPanel";

export default function ExportSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Export my data"
        subtitle="Download your canvases as a ZIP archive: one readable Markdown file per node, with the raw JSON next to it so nothing is lost. Images, PDFs and audio files are not bundled in — the archive references them by URL."
      />

      <div className="mt-6 rounded-2xl bg-slate-50 p-3">
        <ExportPanel />
      </div>
    </div>
  );
}
