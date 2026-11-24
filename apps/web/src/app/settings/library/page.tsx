// The Library (spec 0024, ticket #1030; GLOSSARY: View Design, Analysis Recipe, Playground): what the people who build things in the
// Workspace keep here, in one place under Workspace settings: View Designs, Analysis Recipes and the Playground to write one, with the
// ways on to Themes and Packs. Who sees what is as it was on the Analyze page: everyone in the Workspace sees the designs and recipes
// they may see; Owners and Admins add, change and remove, and only they are shown the way into the Playground.
import Link from "next/link";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { listViewDesigns } from "@ziffr/core/view-designs";
import { numberStyleOf } from "@ziffr/core/workspace-settings";
import { PageHeader } from "@/components/page-header";
import { ViewDesignGuideLink } from "@/components/view-design-guide-link";
import { DesignsScreen } from "./designs-screen";
import { RecipesSection } from "./recipes-section";

export default async function LibraryPage() {
  const actor = await currentActor();
  const [designs, demo, numberStyle] = await Promise.all([listViewDesigns(actor), isDemo(), numberStyleOf(actor.workspaceId)]);
  const writes = actor.role === "owner" || actor.role === "admin";
  // Adding and removing a design is never done in the demo, which keeps none.
  const manages = !demo && writes;
  return (
    <>
      <PageHeader title="Library" sub="What you build with: View Designs, Analysis Recipes and the Playground to write them. Placing a design on a dashboard still happens in the widget picker.">
        <ViewDesignGuideLink />
      </PageHeader>
      <div className="space-y-10">
        <section aria-labelledby="library-designs">
          <h2 id="library-designs" className="mb-1 text-base font-medium">View Designs</h2>
          <p className="mb-4 text-sm text-muted-foreground">Views written as files. Export one as a starting point, change it, and bring it back. A design holds no code: Ziffr checks it and draws it with its own renderer.</p>
          <DesignsScreen designs={designs.map((d) => ({ id: d.id, name: d.name, body: d.body }))} manages={manages} demo={demo} viewer={actor.personId} numberStyle={numberStyle} />
        </section>
        <RecipesSection writes={writes} />
        <section aria-labelledby="library-more">
          <h2 id="library-more" className="mb-1 text-base font-medium">Themes and Packs</h2>
          <p className="text-sm text-muted-foreground">Colors and fonts are on the <Link href="/themes" className="underline underline-offset-2 hover:text-foreground">Themes</Link> page. Ready-made designs, recipes and templates come in <Link href="/settings/packs" className="underline underline-offset-2 hover:text-foreground">Packs</Link>.</p>
        </section>
      </div>
    </>
  );
}
