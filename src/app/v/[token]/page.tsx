import type { Metadata } from "next";
import { openViewLink } from "@/lib/view-links";
import { PresentDashboard } from "@/components/present-dashboard";
import { PublicSlideshow } from "./slideshow";

// A View Link (GLOSSARY: View Link): no login, no viewer, nothing to act on. Never cached or indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ziffr", robots: { index: false, follow: false } };

export default async function ViewLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const view = await openViewLink((await params).token);
  if (!view) {
    return (
      <div className="mx-auto mt-24 max-w-md p-6 text-center text-sm">
        <p className="font-medium">This link does not work any more</p>
        <p className="mt-1 text-muted-foreground">It may have expired or been revoked. Ask whoever sent it for a new one.</p>
      </div>
    );
  }
  const note = view.asOf ? `Numbers as of ${new Date(view.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : "";
  if (view.type === "deck") return <PublicSlideshow deck={{ id: view.id, name: view.name, document: view.document, theme_id: view.themeId, footer: view.footer ?? null }} data={view.data} note={note} />;
  return (
    <PresentDashboard
      dashboard={{ id: view.id, name: view.name, owner_id: "", theme_id: view.themeId, role: "viewer" }}
      data={view.data}
      widgets={view.widgets ?? []}
      start={0}
      publicNote={note}
    />
  );
}
