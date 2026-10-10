import { createFileRoute } from "@tanstack/react-router";
import ExportSettingsPage from "@/components/settings/pages/ExportSettingsPage";

export const Route = createFileRoute("/settings/export")({
  component: ExportSettingsPage,
});
