import PageHeader from "@/components/app-shell/PageHeader";
import MemoriesPanel from "@/components/settings/memories/MemoriesPanel";

export default function MemoriesSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Agent Memory"
        subtitle="What Nolë remembers about you and your canvases. One line is one memory — empty lines are ignored."
      />

      <div className="mt-6 rounded-2xl bg-slate-50 p-3">
        <MemoriesPanel />
      </div>
    </div>
  );
}
