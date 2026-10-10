import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * L'apparence d'un canvas se règle depuis lui, dans la modale des réglages
 * (cf. `SettingsModal`) : la page hors canvas n'a plus rien à proposer.
 */
export const Route = createFileRoute("/settings/canvas")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/account" });
  },
});
