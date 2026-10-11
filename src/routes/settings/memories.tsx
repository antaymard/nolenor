import { createFileRoute } from "@tanstack/react-router";
import MemoriesSettingsPage from "@/components/settings/pages/MemoriesSettingsPage";

export const Route = createFileRoute("/settings/memories")({
  component: MemoriesSettingsPage,
});
