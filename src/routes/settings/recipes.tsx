import { createFileRoute } from "@tanstack/react-router";
import RecipesSettingsPage from "@/components/settings/pages/RecipesSettingsPage";
import { guardDevOnlySettingsRoute } from "@/lib/featureFlags";

export const Route = createFileRoute("/settings/recipes")({
  beforeLoad: guardDevOnlySettingsRoute,
  component: RecipesSettingsPage,
});
