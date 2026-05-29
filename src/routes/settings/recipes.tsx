import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/recipes")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/settings/recipes"!</div>;
}
