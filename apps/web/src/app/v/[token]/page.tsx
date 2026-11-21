import type { Metadata } from "next";
import { openViewLink } from "@/lib/view-links";
import { isNotAnOpen } from "@/lib/count-view";
import { PresentDashboard } from "@/components/present-dashboard";
import { PublicSlideshow } from "./slideshow";
import { DashboardReader } from "@/components/dashboard-reader";
import { formatDate } from "@ziffr/core/format";
import { themeLook } from "@ziffr/core/theme-look";
import { themeFor } from "@ziffr/core/themes";
import { BrandBar } from "@/components/brand-bar";

// A View Link (GLOSSARY: View Link): no login, no viewer, nothing to act on. Never cached or indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ziffr", robots: { index: false, follow: false } };

export default async function ViewLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const view = await openViewLink((await params).token, { count: !(await isNotAnOpen()) });
  if (!view) {
    return (
      <div className="mx-auto mt-24 max-w-md p-6 text-center text-sm">
        <p className="font-medium">This link does not work any more</p>
        <p className="mt-1 text-muted-foreground">It may have expired or been revoked. Ask whoever sent it for a new one.</p>
      </div>
    );
  }
  // A Snapshot says which period it keeps (spec 0013); anything else when its numbers are from.
  // The frame says whose numbers these are, in the dashboard's own Theme (ticket #542): its logo and accent, and the Workspace's name.
  const look = themeLook(themeFor(view.data.themes, view.themeId), view.workspaceName ?? "");
  const note = view.snapshot ? `Snapshot of ${view.snapshot.label}, taken ${formatDate(view.snapshot.takenAt)}` : view.asOf ? `Numbers as of ${formatDate(view.asOf)}` : "";
  // A dashboard with an introduction was written to be read, and so is a Snapshot: they open in the Read view, top to
  // bottom, with only the cards and their numbers (spec 0013). Frozen links from when stories were their own thing keep theirs.
  const intro = view.intro || view.story?.intro || "";
  if (view.type === "dashboard" && (intro || view.snapshot)) return <div className="px-4 py-10"><BrandBar look={look} footer className="mx-auto mb-8 max-w-3xl" /><DashboardReader dashboard={{ id: view.id, name: view.name, intro, theme_id: view.themeId }} widgets={view.widgets ?? []} data={view.data} readOnly />{note && <p className="mx-auto mt-10 max-w-3xl text-xs text-muted-foreground">{note}</p>}</div>;
  if (view.type === "deck") return <PublicSlideshow deck={{ id: view.id, name: view.name, document: view.document, theme_id: view.themeId, footer: view.footer ?? null }} data={view.data} note={note} />;
  return (
    <PresentDashboard
      dashboard={{ id: view.id, name: view.name, owner_id: "", theme_id: view.themeId, role: "viewer", intro: "" }}
      data={view.data}
      widgets={view.widgets ?? []}
      start={0}
      publicNote={note}
      brand={look}
    />
  );
}
