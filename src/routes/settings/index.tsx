import { createFileRoute, redirect } from "@tanstack/react-router";

// `/settings` n'a pas de page à lui : la colonne de droite était vide, et deux
// entrées de la sidebar pointaient dessus. On atterrit sur la page Account.
export const Route = createFileRoute("/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/account" });
  },
});
