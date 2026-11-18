// View Designs under Analyze (spec 0024; GLOSSARY: View Design): the built-in designs and the Workspace's own, each
// to export as a starting point. Owners and Admins add designs from a file and remove them; everyone else sees them.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { listViewDesigns } from "@ziffr/core/view-designs";
import { numberStyleOf } from "@ziffr/core/workspace-settings";
import { PageHeader } from "@/components/page-header";
import { DesignsScreen } from "./screen";

export default async function DesignsPage() {
  const actor = await currentActor();
  const [designs, demo, numberStyle] = await Promise.all([listViewDesigns(actor), isDemo(), numberStyleOf(actor.workspaceId)]);
  const manages = !demo && (actor.role === "owner" || actor.role === "admin");
  return (
    <>
      <PageHeader title="View Designs" sub="Views written as files. Export one as a starting point, change it, and bring it back. A design holds no code: Ziffr checks it and draws it with its own renderer." />
      <DesignsScreen designs={designs.map((d) => ({ id: d.id, name: d.name, body: d.body }))} manages={manages} demo={demo} viewer={actor.personId} numberStyle={numberStyle} />
    </>
  );
}
