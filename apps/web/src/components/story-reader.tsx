"use client";
// A story as people read it (spec 0010, ticket #148; GLOSSARY: Story, Finding): its title, its introduction, then its
// Findings one below the other, readable on any screen. Its owner and Editors press Edit to change the words, add,
// move and remove Findings; a Finding's own words and charts are changed in its ⋯ menu, as on a dashboard. Through a
// View Link it is shown read-only: the cards and their numbers, nothing that calls the server.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Presentation, Trash2 } from "lucide-react";
import { makeDeck } from "@/app/convert-actions";
import { WidgetFrame } from "@/components/widget-frame";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeScope } from "@/components/theme-scope";
import { useConfirm } from "@/components/confirm-dialog";
import { addFinding, moveFinding, saveStoryText } from "@/app/story-actions";
import { removeWidget } from "@/app/canvas-actions";
import { themeFor } from "@ziffr/core/themes";
import { ObjectToolbar } from "@/components/object-toolbar";
import type { CanvasData, Group, Share, Widget } from "@ziffr/core/types";

type Story = { id: number; name: string; intro: string; theme_id: number | null };
/** What the toolbar needs: Share and View Links for the owner, "Who can see this" and Versions for everyone. */
type Sharing = { owner: boolean; ownerId: string; shares: Share[]; groups: Group[]; reveals: Record<string, string[]>; canCreate: boolean };

/** How tall a Finding is drawn: its place's height in rows, as on a dashboard. */
const height = (w: Widget) => Math.max(8, w.h) * 44;

/** The story, read top to bottom; `editable` for its owner and Editors, `readOnly` through a View Link. `sharing`
 * fills its toolbar (left out through a View Link). */
export function StoryReader(props: { story: Story; widgets: Widget[]; data: CanvasData; editable?: boolean; readOnly?: boolean; sharing?: Sharing }) {
  // Through a View Link nothing calls the server: the page sent every series its Findings draw.
  if (props.readOnly) return <Reader {...props} />;
  return <Editable {...props} />;
}

function Editable(props: { story: Story; widgets: Widget[]; data: CanvasData; editable?: boolean; readOnly?: boolean; sharing?: Sharing }) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><Reader {...props} data={data} /></SeriesProvider>;
}

function Reader({ story, widgets, data, editable = false, readOnly = false, sharing }: { story: Story; widgets: Widget[]; data: CanvasData; editable?: boolean; readOnly?: boolean; sharing?: Sharing }) {
  const [editing, setEditing] = useState(editable && widgets.length === 0);
  const [name, setName] = useState(story.name);
  const [intro, setIntro] = useState(story.intro);
  const [metric, setMetric] = useState<number | "">("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await f(); if (ok) toast.success(ok); router.refresh(); } catch (err) { toast.error("Not done", { description: (err as Error).message }); }
  });
  const changing = editable && editing && !readOnly;
  const textChanged = name !== story.name || intro !== story.intro;

  return (
    <article className="mx-auto max-w-3xl">
      {dialog}
      <header className="mb-8">
        {changing ? (
          <div className="space-y-2">
            <Input aria-label="Title" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="h-12 text-[length:var(--text-2xl)] font-semibold" />
            <Textarea aria-label="Introduction" value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={4000} rows={3} placeholder="What this story tells, in a sentence or two." />
            {textChanged && <Button size="sm" disabled={pending} onClick={() => run(() => saveStoryText(story.id, { name, intro }), "Saved")}>Save title and introduction</Button>}
          </div>
        ) : (
          <>
            <h1 className="text-[length:var(--text-3xl,2rem)] leading-tight">{story.name}</h1>
            {story.intro && <p className="mt-3 text-lg whitespace-pre-line text-muted-foreground">{story.intro}</p>}
          </>
        )}
        {!readOnly && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {sharing && <ObjectToolbar type="dashboard" id={story.id} people={data.people} share={sharing.owner ? { name: story.name, ownerId: sharing.ownerId, shares: sharing.shares, groups: sharing.groups, reveals: sharing.reveals } : null} viewLinks={sharing.owner} menu={sharing.canCreate ? [{ label: "Make a deck", icon: <Presentation aria-hidden />, onSelect: () => start(() => makeDeck(story.id)) }] : undefined} />}
            {editable && (
              <Button variant={editing ? "default" : "outline"} onClick={() => setEditing(!editing)} aria-pressed={editing}>
                {editing ? <><Check aria-hidden /> Done</> : <><Pencil aria-hidden /> Edit</>}
              </Button>
            )}
          </div>
        )}
      </header>

      <ThemeScope theme={themeFor(data.themes, story.theme_id)} className="space-y-8">
        {widgets.length === 0 && (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm text-muted-foreground">
            {changing ? "Add a first Finding below: pick the Metric it is about, then give it its headline in its ⋯ menu." : "This story has no Findings yet."}
          </p>
        )}
        {widgets.map((w, i) => (
          <section key={w.id} aria-label={`Finding ${i + 1}`} className="relative">
            {changing && (
              <div className="mb-2 flex items-center justify-end gap-1">
                <span className="mr-auto text-xs text-muted-foreground">Finding {i + 1} of {widgets.length}. Its words and charts are in its ⋯ menu.</span>
                <Button size="sm" variant="ghost" disabled={pending || i === 0} aria-label="Move up" onClick={() => run(() => moveFinding(story.id, w.id, -1))}><ArrowUp aria-hidden /></Button>
                <Button size="sm" variant="ghost" disabled={pending || i === widgets.length - 1} aria-label="Move down" onClick={() => run(() => moveFinding(story.id, w.id, 1))}><ArrowDown aria-hidden /></Button>
                <Button size="sm" variant="ghost" disabled={pending} aria-label="Remove this Finding" onClick={async () => { if (await confirm({ title: "Remove this Finding?", description: "It goes from the story; the Metric and its values stay. The story's history keeps it.", confirmLabel: "Remove Finding" })) run(() => removeWidget(w.id), "Removed"); }}><Trash2 aria-hidden /></Button>
              </div>
            )}
            <div style={{ height: height(w) }}>
              <WidgetFrame widget={w} data={data} targets={[]} editable={changing} readOnly={readOnly} />
            </div>
          </section>
        ))}
      </ThemeScope>

      {changing && (
        <div className="mt-8 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4">
          <select aria-label="Metric of the new Finding" value={metric} onChange={(e) => setMetric(e.target.value ? Number(e.target.value) : "")} className="h-9 min-w-56 flex-1 rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm">
            <option value="">Pick a Metric for a new Finding…</option>
            {data.metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <Button disabled={pending || metric === ""} onClick={() => run(async () => { await addFinding(story.id, Number(metric)); setMetric(""); }, "Finding added")}><Plus aria-hidden /> Add Finding</Button>
        </div>
      )}
    </article>
  );
}
