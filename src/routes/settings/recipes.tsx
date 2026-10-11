import { createFileRoute } from "@tanstack/react-router";
import RecipesSettingsPage from "@/components/settings/pages/RecipesSettingsPage";

export const Route = createFileRoute("/settings/recipes")({
  component: RecipesSettingsPage,
});
