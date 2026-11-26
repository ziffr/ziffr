"use client";
// One Snapshot as people read and write it (spec 0013, ticket #175; GLOSSARY: Snapshot, Finding, Version). A band
// says which period it is, when and by whom it was taken, and whether it is still a draft; the dashboard reads top to
// bottom below it, drawn from the values it kept, without calling the server for more. The dashboard's owner and
// Editors write its words (introduction, each widget's title and a Finding's kicker, headline, subline, footnote and
// source) and show it; its owner deletes it. Its numbers, charts and layout never change.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { ArrowRight, Camera, Check, Eye, FilePlus2, Link2, Pencil, Presentation, Trash2 } from "lucide-react";
import { deleteSnapshot, editSnapshotWords, showSnapshot } from "@/app/snapshot-actions";
import { MakeDeckDialog } from "@/components/make-deck-dialog";
import { AddToDeckDialog } from "@/components/add-to-deck-dialog";
import { useShowViewLinks } from "@/components/view-links";
import { DashboardReader } from "@/components/dashboard-reader";
import { useConfirm } from "@/components/confirm-dialog";
import { VersionsSheet } from "@/components/versions-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlaceholderHints } from "@/components/placeholder-hints";
import { formatDate, formatValue } from "@ziffr/core/format";
import { TEMPLATES } from "@ziffr/core/widget-templates";
import type { OpenSnapshot, SnapshotWords, WidgetWords, WordKey } from "@ziffr/core/snapshots";
import type { Profile, Widget } from "@ziffr/core/types";
import { periodLabel } from "@ziffr/core/periods";

/** The words a Finding carries, in the order they are read; other widgets only have a title. */
const FINDING_WORDS: { key: WordKey; label: string }[] = [
  { key: "kicker", label: "Kicker" }, { key: "headline", label: "Headline" }, { key: "subline", label: "Subline" },
  { key: "footnote", label: "Footnote" }, { key: "source", label: "Source" },
];

/** A widget's words as they are now. */
function wordsOf(w: Widget): WidgetWords {
  const s = (w.settings ?? {}) as Record<string, unknown>;
  const out: WidgetWords = w.title ? { title: w.title } : {};
  for (const { key } of FINDING_WORDS) if (typeof s[key] === "string" && s[key]) out[key] = s[key] as string;
  return out;
}

/** The Snapshot page. `takenBy` is the name of whoever took it; `canCreate` may put it on a deck (spec 0061);
 * `viewLinks` for the dashboard's owner, who may make View Links to it once it is shown. */
export function SnapshotScreen({ snapshot: s, people, takenBy, canCreate = false, viewLinks = false }: { snapshot: OpenSnapshot; people: Profile[]; takenBy: string; canCreate?: boolean; viewLinks?: boolean }) {
  const router = useRouter();
  const [writing, setWriting] = useState(false);
  const [deck, setDeck] = useState<"make" | "add" | null>(null);
  const showLinks = useShowViewLinks();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => {
    try { unwrap(await f()); if (ok) toast.success(ok); router.refresh(); } catch (err) {
      if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
      toast.error("Not done", { description: shown(err) });
    }
  });

  return (
    <div className="mx-auto max-w-3xl">
      {dialog}
      <div role="note" className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-[var(--muted)] px-4 py-3 text-sm">
        <Camera aria-hidden className="size-4 text-muted-foreground" />
        <span className="font-medium">{s.label}</span>
        <span className="text-muted-foreground">taken {formatDate(s.takenAt)} by {s.automatic ? "Ziffr for " : ""}{takenBy}</span>
        {!s.shownAt && <span className="rounded-[var(--radius-input)] bg-card px-1.5 text-xs">Draft: only the dashboard&rsquo;s owner and Editors see it</span>}
        {s.shownAt && s.wordsChangedAt && <span className="text-xs text-muted-foreground">Words changed after it was shown, last on {formatDate(s.wordsChangedAt)}</span>}
        <Link href={`/dashboards/${s.dashboardId}`} className="ml-auto flex items-center gap-1">See it live <ArrowRight aria-hidden className="size-3.5" /></Link>
        {s.hiddenParts > 0 && <p className="w-full text-xs text-muted-foreground">{s.hiddenParts === 1 ? "One part is" : `${s.hiddenParts} parts are`} not shown: {s.hiddenParts === 1 ? "it draws" : "they draw"} Metrics you may not see.</p>}
        {s.corrections.length > 0 && <Corrections snapshot={s} />}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {s.canWrite && (
          <Button variant={writing ? "default" : "outline"} onClick={() => setWriting(!writing)} aria-pressed={writing}>
            {writing ? <><Check aria-hidden /> Done</> : <><Pencil aria-hidden /> Write</>}
          </Button>
        )}
        {s.canWrite && !s.shownAt && (
          <Button disabled={pending} onClick={() => run(() => showSnapshot(s.id), `${s.label} is shown to everyone who may open the dashboard`)}><Eye aria-hidden /> Show to everyone with access</Button>
        )}
        {canCreate && <Button variant="outline" onClick={() => setDeck("make")}><Presentation aria-hidden /> Make a deck…</Button>}
        {canCreate && s.shownAt && <Button variant="outline" onClick={() => setDeck("add")}><FilePlus2 aria-hidden /> Add to a deck…</Button>}
        {deck === "make" && <MakeDeckDialog source={{ dashboardId: s.dashboardId, snapshot: { id: s.id, label: s.label, shown: Boolean(s.shownAt) } }} onClose={() => setDeck(null)} />}
        {deck === "add" && <AddToDeckDialog snapshotId={s.id} open onOpenChange={(o) => { if (!o) setDeck(null); }} />}
        {viewLinks && <Button variant="outline" onClick={() => showLinks("dashboard", s.dashboardId, { id: s.id, label: s.label })}><Link2 aria-hidden /> View link</Button>}
        <VersionsSheet type="snapshot" id={s.id} people={people} />
        {s.canDelete && (
          <Button variant="outline" disabled={pending} onClick={async () => {
            if (await confirm({ title: `Delete the Snapshot of ${s.label}?`, description: "Its numbers and words go for good. The dashboard and its values stay.", confirmLabel: "Delete Snapshot" })) run(() => deleteSnapshot(s.id, s.dashboardId));
          }}><Trash2 aria-hidden /> Delete</Button>
        )}
      </div>

      {writing ? <Words snapshot={s} pending={pending} onSave={(w) => run(() => editSnapshotWords(s.id, w), "Saved")} /> : (
        <>
          <h1 className="text-[length:var(--text-3xl,2rem)] leading-tight">{s.name}</h1>
          <div className="mt-3">
            <DashboardReader dashboard={{ id: s.dashboardId, name: s.name, intro: s.intro, theme_id: s.themeId }} widgets={s.widgets} data={s.data} readOnly header={false} />
          </div>
        </>
      )}
    </div>
  );
}

/** Values the Snapshot kept that were corrected or removed since (#177): the Snapshot keeps its own, and says what
 * the value is now, in words and on hover. The core lists only Metrics the reader sees now. */
function Corrections({ snapshot: s }: { snapshot: OpenSnapshot }) {
  const metric = (id: number) => s.data.metrics.find((m) => m.id === id);
  return (
    <div className="w-full border-t border-[var(--color-rule-2)] pt-2">
      <p className="text-xs font-medium">Corrected since this Snapshot was taken; it keeps the values it had:</p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {s.corrections.map((c) => {
          const m = metric(c.metricId);
          if (!m) return null;
          const now = c.now === null ? "removed since" : `now ${formatValue(m, c.now, s.data.numberStyle)}`;
          return (
            <li key={`${c.metricId}:${c.period}`} title={`${m.name}, ${periodLabel(c.period, m.period, s.data.yearStart)}: ${formatValue(m, c.was, s.data.numberStyle)} here, ${now}`}>
              {m.name}, {periodLabel(c.period, m.period, s.data.yearStart)}: <span className="font-medium text-foreground">{formatValue(m, c.was, s.data.numberStyle)}</span> ({now})
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The words of a Snapshot to write: its introduction, then each widget's title and a Finding's words. */
function Words({ snapshot: s, pending, onSave }: { snapshot: OpenSnapshot; pending: boolean; onSave: (w: SnapshotWords) => void }) {
  const ordered = [...s.widgets].sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);
  const [intro, setIntro] = useState(s.intro);
  const [words, setWords] = useState<Record<string, WidgetWords>>(() => Object.fromEntries(ordered.map((w) => [String(w.id), wordsOf(w)])));
  const set = (id: number, key: WordKey, value: string) => setWords((all) => ({ ...all, [id]: { ...all[id], [key]: value } }));
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); onSave({ intro, widgets: words }); }}>
      <p className="text-sm text-muted-foreground">Only the words change. The numbers, charts and layout stay as they were for {s.label}; empty fields fall back to what the data says.</p>
      <label className="block space-y-1 text-sm"><span className="font-medium">Introduction</span>
        <Textarea value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={4000} rows={3} placeholder="What happened in this period, in a sentence or two." />
      </label>
      {ordered.map((w, i) => {
        const finding = TEMPLATES[w.template]?.kind === "story";
        const own = words[String(w.id)] ?? {};
        return (
          <fieldset key={w.id} className="space-y-2 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] p-4">
            <legend className="px-1 text-sm font-medium">Part {i + 1}{finding ? ": a Finding" : ""}</legend>
            {!finding && <Input aria-label={`Title of part ${i + 1}`} value={own.title ?? ""} onChange={(e) => set(w.id, "title", e.target.value)} maxLength={600} placeholder="Title" />}
            {finding && FINDING_WORDS.map(({ key, label }) => (
              <label key={key} className="block space-y-1 text-sm"><span className="text-muted-foreground">{label}</span>
                {key === "headline" || key === "subline" || key === "footnote"
                  ? <Textarea value={own[key] ?? ""} onChange={(e) => set(w.id, key, e.target.value)} maxLength={600} rows={key === "headline" ? 2 : 2} />
                  : <Input value={own[key] ?? ""} onChange={(e) => set(w.id, key, e.target.value)} maxLength={600} />}
              </label>
            ))}
          </fieldset>
        );
      })}
      <PlaceholderHints />
      <Button type="submit" disabled={pending}>Save words</Button>
    </form>
  );
}
