"use client";
// Retention (GLOSSARY: Retention, Condensed Value; spec 0033, ticket #381): the setting for one Metric and for the
// Workspace's default, the preview of what it would do in counts, and the confirmation before anything is turned on.
// Nothing here changes a value: a confirmed Retention waits 7 days that can be used to cancel it. The core checks who
// may set it and the counts again on the server.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isActionError, UNEXPECTED, type ActionError } from "@/lib/action-error";
import { applyRetentionToAll, cancelMetricRetention, previewRetention, previewRetentionForAll, setMetricRetention, setWorkspaceRetention } from "@/app/retention-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CANNOT_CONDENSE, MIN_KEEP_MONTHS, canCondense, condensesInto, type CondenseInto, type Retention } from "@ziffr/core/retention-rules";
import { DELETE_WORD, dayWords, needsConfirmation, retentionWords } from "@ziffr/core/retention-words";
import type { RetentionPreview, WorkspaceRetentionPreview } from "@ziffr/core/retention-setting";
import type { Aggregation, Period } from "@ziffr/core/types";

const field = "mt-1 block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm font-normal disabled:opacity-70";
const YEARS = [2, 3, 5, 7, 10];
const ALL_SPANS: CondenseInto[] = ["week", "month", "quarter", "year"];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the person picks: how long, and what then. `keep` is "other" or the years; `then` is none, condense or delete. */
type Draft = { then: "none" | "condense" | "delete"; keep: string; other: string; into: CondenseInto };

const draftOf = (r: Retention | null, into: CondenseInto): Draft => {
  if (!r) return { then: "none", keep: "36", other: "", into };
  const years = r.keep_months / 12;
  const listed = Number.isInteger(years) && YEARS.includes(years);
  return { then: r.then, keep: listed ? String(r.keep_months) : "other", other: listed ? "" : String(r.keep_months), into: r.then === "condense" ? r.into : into };
};

/** The setting a draft stands for, as it is sent: null for none; months that are not a whole number are sent as typed
 * so the core says why, never guessed. */
function settingOf(d: Draft): Retention | null {
  if (d.then === "none") return null;
  const keep_months = d.keep === "other" ? Number(d.other) : Number(d.keep);
  return d.then === "delete" ? { keep_months, then: "delete" } : { keep_months, then: "condense", into: d.into };
}

/** The fields: keep for how long, then keep as it is, condense or delete. A Metric that cannot be condensed says why. */
function Fields({ draft, set, spans, condensable, disabled }: { draft: Draft; set: (d: Draft) => void; spans: CondenseInto[]; condensable: boolean; disabled: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Keep values for
        <select value={draft.keep} disabled={disabled || draft.then === "none"} onChange={(e) => set({ ...draft, keep: e.target.value })} className={field}>
          {YEARS.map((y) => <option key={y} value={y * 12}>{y} years</option>)}
          <option value="other">Other, in months</option>
        </select>
        {draft.keep === "other" && <input type="number" min={MIN_KEEP_MONTHS} step={1} value={draft.other} disabled={disabled} onChange={(e) => set({ ...draft, other: e.target.value })} aria-label="Months to keep values" className={field} />}
      </label>
      <label className="text-sm font-medium">Then
        <select value={draft.then} disabled={disabled} onChange={(e) => set({ ...draft, then: e.target.value as Draft["then"] })} className={field}>
          <option value="none">Nothing: keep every value</option>
          <option value="condense" disabled={!condensable}>Condense into longer periods</option>
          <option value="delete">Delete</option>
        </select>
      </label>
      {draft.then === "condense" && (
        <label className="text-sm font-medium">Condense into
          <select value={draft.into} disabled={disabled} onChange={(e) => set({ ...draft, into: e.target.value as CondenseInto })} className={field}>
            {spans.map((s) => <option key={s} value={s}>{s}s</option>)}
          </select>
        </label>
      )}
      <p className="text-xs text-muted-foreground sm:col-span-2">
        At least {MIN_KEEP_MONTHS} months, so a comparison with last year always has its whole span.
        {!condensable && <> {CANNOT_CONDENSE}</>}
      </p>
    </div>
  );
}

/** Runs server actions for a form: a refusal or an unexpected failure is toasted with the title, and `done` gets the answer. */
function useRunner() {
  const [busy, start] = useTransition();
  const run = <T,>(call: () => Promise<T | ActionError>, failed: string, done: (r: T) => void) => start(async () => {
    try {
      const r = await call();
      if (isActionError(r)) toast.error(failed, { description: r.error });
      else done(r);
    } catch {
      toast.error(failed, { description: UNEXPECTED });
    }
  });
  return { busy, run };
}

/** One line of the counts, when there is something to say. */
const Line = ({ n, children }: { n: number; children: React.ReactNode }) => (n > 0 ? <li>{children}</li> : null);

/** The preview of one Metric, in words. Counts only: no value is ever shown here. */
function Counts({ p }: { p: RetentionPreview }) {
  if (p.problem) return <p role="status" className="text-sm">{p.problem}</p>;
  const condense = p.setting.then === "condense";
  return (
    <div role="status" className="space-y-2 text-sm">
      {p.periods === 0 ? (
        <p>Nothing would change today: no period is older than the keep time.</p>
      ) : (
        <p className="font-medium">
          {condense ? `${plural(p.periods, "period")} (${plural(p.values, "value")}) would be condensed into ${plural(p.condensedValues, "Condensed Value")}` : `${plural(p.periods, "period")} (${plural(p.values, "value")}) would be deleted`},
          from {dayWords(p.firstPeriod!)} to {dayWords(p.lastPeriod!)}.
        </p>
      )}
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <Line n={p.breakdownRows}>{plural(p.breakdownRows, "Breakdown row")} of those periods go, in both modes.</Line>
        <Line n={p.supersededValues}>{plural(p.supersededValues, "Superseded Value")} (earlier values) go with them.</Line>
        <Line n={p.targets}>{plural(p.targets, "Target")} {condense ? "are folded into the Condensed Values, so Attainment stays" : "go with their periods"}.</Line>
        <Line n={p.projections}>{plural(p.projections, "Projection")} of past periods go: they were never values.</Line>
        <Line n={p.lockedPeriods}>{plural(p.lockedPeriods, "locked period")} {condense ? "are condensed, and the Condensed Value stays locked" : "would be deleted, although they are locked"}.</Line>
        <Line n={p.heldBack}>{plural(p.heldBack, "older period")} stay: open questions, tasks, corrections or approvals still hold them.</Line>
        <Line n={p.uneven}>{plural(p.uneven, "older period")} stay as they are: a longer period would show them differently if condensed.</Line>
        <Line n={p.derivedReaders}>{plural(p.derivedReaders, "Derived Metric")} read this Metric.</Line>
        <Line n={p.snapshots + p.viewLinks}>
          {[p.snapshots ? plural(p.snapshots, "Snapshot") : "", p.viewLinks ? plural(p.viewLinks, "frozen View Link") : ""].filter(Boolean).join(" and ")} already show these periods and keep them
          {p.snapshotNames.length > 0 && <>: {p.snapshotNames.join("; ")}</>}.
        </Line>
      </ul>
      {!condense && p.periods > 0 && <p>Snapshots and decks that already show these values keep them. Delete those first if they must go too.</p>}
    </div>
  );
}

/** The workspace preview: totals, and one line per Metric. */
function AllCounts({ p }: { p: WorkspaceRetentionPreview }) {
  const condense = p.setting.then === "condense";
  return (
    <div role="status" className="space-y-2 text-sm">
      <p className="font-medium">
        {plural(p.applies, "Metric")} would get this Retention{p.totals.periods > 0
          ? `; ${plural(p.totals.periods, "period")} (${plural(p.totals.values, "value")}) would be ${condense ? `condensed into ${plural(p.totals.condensedValues, "Condensed Value")}` : "deleted"}`
          : ", and nothing would change today"}.
      </p>
      {p.skipped.count > 0 && <p className="text-muted-foreground">{plural(p.skipped.count, "Metric")} are left out. {p.skipped.reasons.join(" ")}</p>}
      <ul className="max-h-48 list-disc space-y-1 overflow-auto pl-5 text-muted-foreground">
        {p.metrics.filter((m) => m.periods > 0).map((m) => <li key={m.metricId}>{m.name}: {plural(m.periods, "period")} from {dayWords(m.firstPeriod!)} to {dayWords(m.lastPeriod!)}.</li>)}
      </ul>
      {p.totals.lockedPeriods > 0 && !condense && <p>{plural(p.totals.lockedPeriods, "locked period")} would be deleted.</p>}
      {!condense && p.totals.periods > 0 && <p>Snapshots and decks that already show these values keep them. Delete those first if they must go too.</p>}
    </div>
  );
}

/** The Retention on a Metric's page: what is in force, what waits for its first day, and, for those who may set it, the form. */
export function MetricRetention({ metricId, name, period, aggregation, retention, pending, canSet, status, suggested = null }: {
  metricId: number; name: string; period: Period; aggregation: Aggregation; retention: Retention | null;
  pending: { retention: Retention; starts_on: string; note: string; cancellable: boolean } | null; canSet: boolean;
  /** What the daily job last had to say, for those who may set the Retention. */
  status?: { note: string; stopped: boolean; lastRunOn: string | null } | null;
  /** A setting the Usage page suggested: it starts in the form with its counts shown, and nothing is set by it. */
  suggested?: Retention | null;
}) {
  const router = useRouter();
  const spans = useMemo(() => condensesInto(period), [period]);
  const condensable = canCondense({ aggregation, formula: null });
  const [draft, setDraft] = useState<Draft>(() => draftOf(pending?.retention ?? retention ?? suggested, spans[Math.min(1, spans.length - 1)] ?? "month"));
  const [preview, setPreview] = useState<{ for: string; counts: RetentionPreview } | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const { busy, run } = useRunner();
  const setting = settingOf(draft);
  const key = JSON.stringify(setting);
  const shown = preview && preview.for === key ? preview.counts : null;
  const needs = setting !== null && needsConfirmation(retention, setting);
  const unchanged = key === JSON.stringify(pending?.retention ?? retention);

  const show = () => run(() => previewRetention(metricId, setting), "Not shown", (counts) => setPreview({ for: key, counts }));
  const save = (fingerprint?: string) => run(() => setMetricRetention(metricId, setting, fingerprint, typed), "Not saved", (r) => {
    setOpen(false); setTyped(""); setPreview(null);
    toast.success(r.starts_on ? `It starts on ${dayWords(r.starts_on)}` : "Saved", { description: r.starts_on ? "Until then you can cancel it here. Nothing is changed before." : undefined });
    router.refresh();
  });
  const cancel = () => run(() => cancelMetricRetention(metricId), "Not cancelled", () => {
    toast.success("Cancelled. Nothing was changed.");
    router.refresh();
  });

  // A suggestion from Usage opens with its counts already shown (a read; the person still turns it on, or not).
  useEffect(() => {
    if (suggested && canSet) run(() => previewRetention(metricId, suggested), "Not shown", (counts) => setPreview({ for: key, counts }));
    // Once, for the suggestion the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsName = setting?.then === "delete";
  return (
    <section id="retention" aria-labelledby="retention-heading" className="stock rounded-[var(--radius-card)] p-5 text-sm">
      <h2 id="retention-heading" className="mb-1 font-medium">Retention</h2>
      <p className="mb-3 text-xs text-muted-foreground">How long values are kept, and what then happens to older ones. Nothing is condensed or deleted unless someone turns it on here, after seeing what it would do.</p>
      <p>Now: {retentionWords(retention)}.</p>
      {retention && <p className="text-xs text-muted-foreground">A daily job does it, in small steps, so a first run over many years of values takes several days.{status?.lastRunOn && <> It last looked on {dayWords(status.lastRunOn)}.</>}</p>}
      {status?.note && (
        <p role="status" className="mt-2 rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-3">{status.stopped ? <strong>Stopped. </strong> : null}{status.note}</p>
      )}
      {pending && (
        <div role="status" className="mt-2 rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-3">
          <p className="font-medium">{retentionWords(pending.retention)}</p>
          <p>{pending.note}</p>
          {canSet && pending.cancellable && <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={cancel}>Cancel</Button>}
        </div>
      )}
      {canSet ? (
        <div className="mt-4 space-y-3">
          <Fields draft={draft} set={setDraft} spans={spans} condensable={condensable} disabled={busy} />
          {shown && <Counts p={shown} />}
          <div className="flex flex-wrap gap-2">
            {setting && <Button size="sm" variant="outline" disabled={busy} onClick={show}>Show what it would do</Button>}
            {needs ? (
              <Button size="sm" disabled={busy || !shown || Boolean(shown.problem)} onClick={() => setOpen(true)}>Turn on…</Button>
            ) : (
              <Button size="sm" disabled={busy || unchanged} onClick={() => save()}>Save</Button>
            )}
          </div>
          {needs && !shown && <p className="text-xs text-muted-foreground">Show what it would do first: turning it on needs the numbers in front of you.</p>}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Only Owners, Admins and the Metric&rsquo;s owner set it.</p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>{setting?.then === "delete" ? "Delete old values" : "Condense old values"} of {name}?</DialogTitle>
          {shown && <Counts p={shown} />}
          {setting?.then === "delete" && setting && (
            <p className="text-sm"><a className="underline" href={`/retention-values?metric=${metricId}&keep=${encodeURIComponent(String(setting.keep_months))}&then=delete`} download>Download these values</a> as a CSV before you confirm: what it would delete, with earlier values, Breakdown rows and Targets. Ziffr writes the download in the Audit Log.</p>
          )}
          <p className="text-sm text-muted-foreground">It starts on the 8th day. Until then you, the Metric&rsquo;s owner and anyone who may set it can cancel it, and nothing is changed. The owner and you get a message now and one the day before.</p>
          {needsName && (
            <label className="text-sm font-medium">Type the Metric&rsquo;s name to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className={field} autoComplete="off" />
            </label>
          )}
          <Button disabled={busy || !shown || (needsName && typed.trim() !== name)} onClick={() => save(shown?.fingerprint)}>{busy ? "Saving…" : "Confirm"}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The Workspace's default Retention, copied into every new Metric, and Apply to existing Metrics. Owners set it;
 * Admins read it. */
export function WorkspaceRetention({ retention, canSet }: { retention: Retention | null; canSet: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftOf(retention, "month"));
  const [preview, setPreview] = useState<{ for: string; counts: WorkspaceRetentionPreview } | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const { busy, run } = useRunner();
  const setting = settingOf(draft);
  const key = JSON.stringify(setting);
  const shown = preview && preview.for === key ? preview.counts : null;
  const save = () => run(() => setWorkspaceRetention(setting), "Not saved", () => {
    toast.success("Saved", { description: "It changes no Metric that exists." });
    router.refresh();
  });
  const show = () => run(() => previewRetentionForAll(setting), "Not shown", (counts) => setPreview({ for: key, counts }));
  const apply = () => run(() => applyRetentionToAll(setting, shown?.fingerprint, typed), "Not applied", (r) => {
    setOpen(false); setTyped(""); setPreview(null);
    toast.success(`${plural(r.applied, "Metric")} now wait 7 days`, { description: `${r.changed ? `${plural(r.changed, "Metric")} changed meanwhile and were left out. ` : ""}Each can be cancelled on its own page. Nothing is changed before.` });
    router.refresh();
  });
  const deleting = setting?.then === "delete";
  return (
    <section aria-labelledby="retention-heading" className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="retention-heading" className="font-medium">Retention</h2>
        <p className="text-sm text-muted-foreground">How long Metrics keep their values, and what then happens to older ones. The default is copied into each new Metric when it is made, and then waits 7 days like any Retention; it changes no Metric that exists. Without one, every value is kept.</p>
      </div>
      <p className="text-sm">Default for new Metrics: {retentionWords(retention)}.</p>
      {canSet ? (
        <div className="space-y-3">
          <Fields draft={draft} set={setDraft} spans={ALL_SPANS} condensable disabled={busy} />
          <p className="text-xs text-muted-foreground">A Metric that cannot be condensed, or whose period does not fit, gets no default.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || key === JSON.stringify(retention)} onClick={save}>Save as the default</Button>
            {setting && <Button size="sm" variant="outline" disabled={busy} onClick={show}>Apply to existing Metrics…</Button>}
          </div>
          {shown && (
            <div className="space-y-3 rounded-[var(--radius-input)] border border-[var(--color-rule-2)] p-3">
              <AllCounts p={shown} />
              <Button size="sm" disabled={busy || shown.applies === 0} onClick={() => setOpen(true)}>Turn on for {plural(shown.applies, "Metric")}…</Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Only Owners set it.</p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Apply to {shown ? plural(shown.applies, "Metric") : "existing Metrics"}?</DialogTitle>
          {shown && <AllCounts p={shown} />}
          <p className="text-sm text-muted-foreground">Each Metric starts on the 8th day. Until then it can be cancelled on its own page, and nothing is changed. The owner of each Metric gets a message now and one the day before.</p>
          {deleting && (
            <label className="text-sm font-medium">Type &ldquo;{DELETE_WORD}&rdquo; to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className={field} autoComplete="off" />
            </label>
          )}
          <Button disabled={busy || !shown || (deleting && typed.trim() !== DELETE_WORD)} onClick={apply}>{busy ? "Applying…" : "Confirm"}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
