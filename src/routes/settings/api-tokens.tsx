import { createFileRoute } from "@tanstack/react-router";
import ApiTokensSettingsPage from "@/components/settings/pages/ApiTokensSettingsPage";

export const Route = createFileRoute("/settings/api-tokens")({
  component: ApiTokensSettingsPage,
});
