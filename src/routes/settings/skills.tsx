import { createFileRoute } from "@tanstack/react-router";
import SkillsSettingsPage from "@/components/settings/pages/SkillsSettingsPage";

export const Route = createFileRoute("/settings/skills")({
  component: SkillsSettingsPage,
});
