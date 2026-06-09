import { Button } from "@/components/shadcn/button";
import useRichQuery from "@/components/utils/useRichQuery";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/../convex/_generated/api";
import { TbExclamationCircle, TbQuestionMark } from "react-icons/tb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/recipes/")({
  component: RouteComponent,
});

function RouteComponent() {
  const {
    data: recipes,
    isPending,
    isError,
    isSuccess,
  } = useRichQuery(api.recipes.listUserRecipes);
  const navigate = useNavigate();

  if (isPending) return <div>Loading...</div>;
  if (isError) return <div>Error</div>;

  function renderRecipesTable() {
    const _recipes = recipes ?? [];
    return _recipes.map((recipe) => (
      <TableRow key={recipe._id}>
        <TableCell>{recipe.name}</TableCell>
        <TableCell>{recipe._creationTime}</TableCell>
      </TableRow>
    ));
  }

  if (isSuccess)
    return (
      <div>
        {/*Header*/}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-bold">Recipes</h1>
            {/*<i>
              Here you can manage your recipes. Recipes are reusable
              instructions Nolë can use to execute reproductible tasks.
            </i>*/}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon">
              <TbQuestionMark />
            </Button>
            <Button
              onClick={() =>
                navigate({
                  to: "/settings/recipes/edit/$recipeId",
                  params: { recipeId: "new" },
                })
              }
            >
              Create Recipe
            </Button>
          </div>
        </div>

        {/*Body*/}
        <div className="mt-4 bg-slate-50 rounded p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-white">{renderRecipesTable()}</TableBody>
          </Table>
          {recipes.length === 0 && (
            <div className="ml-2 mt-2 flex items-center gap-2">
              <TbExclamationCircle /> No recipes found
            </div>
          )}
        </div>
      </div>
    );
}
