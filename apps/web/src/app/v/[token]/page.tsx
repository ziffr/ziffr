import type { Metadata } from "next";
import { openViewLink } from "@/lib/view-links";
import { PresentDashboard } from "@/components/present-dashboard";
import { PublicSlideshow } from "./slideshow";
import { StoryReader } from "@/components/story-reader";
import { formatDate } from "@ziffr/core/format";

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
  const note = view.asOf ? `Numbers as of ${formatDate(view.asOf)}` : "";
  // A story reads top to bottom, as in Ziffr, with only its cards and their numbers.
  if (view.story) return <div className="px-4 py-10"><StoryReader story={{ id: view.id, name: view.name, intro: view.story.intro, theme_id: view.themeId }} widgets={view.widgets ?? []} data={view.data} readOnly />{note && <p className="mx-auto mt-10 max-w-3xl text-xs text-muted-foreground">{note}</p>}</div>;
  if (view.type === "deck") return <PublicSlideshow deck={{ id: view.id, name: view.name, document: view.document, theme_id: view.themeId, footer: view.footer ?? null }} data={view.data} note={note} />;
  return (
    <PresentDashboard
      dashboard={{ id: view.id, name: view.name, owner_id: "", theme_id: view.themeId, role: "viewer", kind: "dashboard", intro: "" }}
      data={view.data}
      widgets={view.widgets ?? []}
      start={0}
      publicNote={note}
    />
  );
}
