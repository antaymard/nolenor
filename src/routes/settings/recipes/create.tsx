import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/recipes/create")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <h1 className="text-xl font-bold">New recipe</h1>
    </div>
  );
}
