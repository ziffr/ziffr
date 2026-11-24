// The Analysis Recipes part of the Library (spec 0024, ticket #1030; GLOSSARY: Analysis Recipe, Playground): the built-in recipes by
// name, and for Owners and Admins the way into the Playground, where a recipe is written and added to the Workspace. Nothing here is
// a person's data: names and descriptions come from the bundled recipe files. Everyone else sees the list and no link.
import Link from "next/link";
import { BUILT_IN_RECIPES, RECIPES } from "@ziffr/core/built-in-recipes";

/** The built-in Analysis Recipes; `writes` (Owner or Admin) adds the link to the Playground, and nobody else is shown a link that would lead nowhere useful. */
export function RecipesSection({ writes }: { writes: boolean }) {
  return (
    <section aria-labelledby="library-recipes">
      <h2 id="library-recipes" className="mb-1 text-base font-medium">Analysis Recipes</h2>
      <p className="mb-3 text-sm text-muted-foreground">An Analysis written as steps of Ziffr&rsquo;s own functions. A View Design carries one and draws its results.</p>
      <ul className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {RECIPES.map((id) => (
          <li key={id} className="stock rounded-[var(--radius-card)] p-3">
            <p className="text-sm font-medium">{BUILT_IN_RECIPES[id].name}</p>
            {BUILT_IN_RECIPES[id].description && <p className="text-xs text-muted-foreground">{BUILT_IN_RECIPES[id].description}</p>}
          </li>
        ))}
      </ul>
      {writes && <p className="text-sm"><Link href="/settings/library/playground" className="text-primary underline-offset-4 hover:underline">Open the Playground</Link> <span className="text-muted-foreground">to write a View Design or an Analysis Recipe and add it to the Workspace.</span></p>}
    </section>
  );
}
