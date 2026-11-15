// The stories list (spec 0010, ticket #148; GLOSSARY: Story): every story the person may open, theirs first, then
// those shared with them. The core decides what is listed.
import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { getProfileMap } from "@/lib/data";
import { currentActor } from "@/lib/viewer";
import { visibleStories } from "@ziffr/core/stories";
import { can } from "@ziffr/core/actor";
import { newStory } from "@/app/story-actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DashboardAccess } from "@/lib/access";

export default async function StoriesPage() {
  const actor = await currentActor();
  const [stories, people] = await Promise.all([visibleStories(actor), getProfileMap()]);
  const mine = stories.filter((s) => s.role === "owner");
  const shared = stories.filter((s) => s.role !== "owner");
  const card = (s: DashboardAccess) => (
    <li key={s.id}>
      <Link href={`/stories/${s.id}`} className="stock flex items-start gap-3 rounded-[var(--radius-card)] p-4 no-underline transition-[transform,box-shadow] hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)]">
        <BookOpenText aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{s.name}</div>
          {s.intro && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{s.intro}</p>}
          <div className="mt-1 text-xs text-muted-foreground">{s.role === "owner" ? "Yours" : `From ${people[s.owner_id]?.name ?? "someone"}, you ${s.role === "editor" ? "can edit it" : "can read it"}`}</div>
        </div>
      </Link>
    </li>
  );
  return (
    <>
      <PageHeader title="Stories" sub="Explain what happened and why: findings in order, each with its numbers and a few sentences, to read on any screen or send as a link.">
        {can(actor, "create") && (
          <form action={newStory} className="flex gap-2">
            <Input name="name" required maxLength={120} placeholder="Title of the new story" aria-label="Title of the new story" className="w-60" />
            <Button type="submit">New story</Button>
          </form>
        )}
      </PageHeader>
      {!stories.length ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center">
          <BookOpenText aria-hidden className="mx-auto mb-3 size-7 text-muted-foreground" />
          <p className="font-medium">No stories yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Title one above, or make one from a dashboard with Make a story in its ⋯ menu.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {mine.length > 0 && <section><h2 className="mb-3 text-sm font-medium text-muted-foreground">Mine</h2><ul className="grid gap-3 sm:grid-cols-2">{mine.map(card)}</ul></section>}
          {shared.length > 0 && <section><h2 className="mb-3 text-sm font-medium text-muted-foreground">Shared with me</h2><ul className="grid gap-3 sm:grid-cols-2">{shared.map(card)}</ul></section>}
        </div>
      )}
    </>
  );
}
