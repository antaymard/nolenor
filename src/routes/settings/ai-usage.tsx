import { createFileRoute } from "@tanstack/react-router";
import AiUsageSettingsPage from "@/components/settings/pages/AiUsageSettingsPage";

export const Route = createFileRoute("/settings/ai-usage")({
  component: AiUsageSettingsPage,
});
