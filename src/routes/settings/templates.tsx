import { createFileRoute } from "@tanstack/react-router";
import TemplatesSettingsPage from "@/components/settings/pages/TemplatesSettingsPage";
import { guardDevOnlySettingsRoute } from "@/lib/featureFlags";

export const Route = createFileRoute("/settings/templates")({
  beforeLoad: guardDevOnlySettingsRoute,
  component: TemplatesSettingsPage,
});
