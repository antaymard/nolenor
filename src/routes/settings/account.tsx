import { createFileRoute } from "@tanstack/react-router";
import AccountSettingsPage from "@/components/settings/pages/AccountSettingsPage";

export const Route = createFileRoute("/settings/account")({
  component: AccountSettingsPage,
});
