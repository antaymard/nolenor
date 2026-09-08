import { createFileRoute, redirect } from "@tanstack/react-router";

// `/settings` n'a pas de page à lui : la colonne de droite était vide, et deux
// entrées de la sidebar pointaient dessus. On atterrit sur la page Account,
// en conservant le `state` (notamment `from`, la page d'origine pour la croix).
export const Route = createFileRoute("/settings/")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/settings/account", state: location.state });
  },
});
