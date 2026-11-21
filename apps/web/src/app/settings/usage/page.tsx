// Usage in the workspace settings (spec 0031, ticket #364; GLOSSARY: Usage, View Count): what could be tidied, for
// Owners and Admins only. Counts and names of what they see, never who looked; nothing is archived by itself.
import Link from "next/link";
import { Forbidden } from "@ziffr/core/actor";
import { workspaceUsage, type UsageItem } from "@ziffr/core/usage-report";
import { retentionToParam, retentionWords } from "@ziffr/core/retention-words";
import { PageHeader } from "@/components/page-header";
import { isDemo } from "@/lib/auth";
import { currentActor } from "@/lib/viewer";
import { ArchiveSuggestions } from "./form";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** One list: the name as a link, the reason beside it. */
function List({ title, empty, items, href }: { title: string; empty: string; items: UsageItem[]; href: (i: UsageItem) => string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-baseline gap-3 px-3 py-2">
              <Link href={href(i)} className="font-medium underline-offset-2 hover:underline">{i.name}</Link>
              <span className="ml-auto text-xs text-muted-foreground">{i.why}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function UsagePage() {
  const [actor, demo] = await Promise.all([currentActor(), isDemo()]);
  const sub = "What could be tidied up. Counts only: Ziffr never records who looked.";
  if (demo) return (<><PageHeader title="Usage" sub={sub} /><p className="text-sm text-muted-foreground">The demo counts nothing, so it has no Usage.</p></>);
  let u;
  try {
    u = await workspaceUsage(actor);
  } catch (e) {
    if (!(e instanceof Forbidden)) throw e;
    return (<><PageHeader title="Usage" sub={sub} /><p className="text-sm text-muted-foreground">Owners and Admins see Usage.</p></>);
  }
  const metricHref = (i: { slug?: string }) => `/metrics/${i.slug}`;
  return (
    <>
      <PageHeader title="Usage" sub={sub} />
      <div className="max-w-3xl space-y-8">
        {u.countingSince ? (
          <p className="text-sm text-[var(--color-ink-2)]">
            Counting since {day(u.countingSince)}.{u.fillsInOn ? ` Ziffr suggests nothing before ${u.unusedDays} days of counting: the lists of what is not opened fill in on ${day(u.fillsInOn)}.` : ""}
          </p>
        ) : <p className="text-sm text-[var(--color-ink-2)]">Ziffr has not counted anything yet. The lists of what is not opened fill in {u.unusedDays} days after it starts.</p>}

        <List title={`Dashboards not opened for ${u.unusedDays} days`} empty={u.fillsInOn || !u.countingSince ? `Nothing is listed until ${u.unusedDays} days have been counted.` : "Every dashboard was opened."} items={u.notOpened.dashboards} href={(i) => `/dashboards/${i.id}`} />
        <List title={`Decks not opened for ${u.unusedDays} days`} empty={u.fillsInOn || !u.countingSince ? `Nothing is listed until ${u.unusedDays} days have been counted.` : "Every deck was opened."} items={u.notOpened.decks} href={(i) => `/decks/${i.id}`} />
        <section className="space-y-3">
          <List title={`Metrics not opened for ${u.unusedDays} days`} empty={u.fillsInOn || !u.countingSince ? `Nothing is listed until ${u.unusedDays} days have been counted.` : "Every Metric was opened, or is on a dashboard or deck that was."} items={u.notOpened.metrics} href={metricHref} />
          {u.suggested.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Archive these {u.suggested.length} Metric{u.suggested.length === 1 ? "" : "s"}?</h3>
              <p className="text-sm text-muted-foreground">Archived Metrics keep their values and history and can be brought back. Nothing is archived unless you do it here.</p>
              <ArchiveSuggestions items={u.suggested.map(({ id, name, why }) => ({ id, name, why }))} />
            </div>
          )}
          {u.kept.length > 0 && (
            <div className="space-y-1 text-sm">
              <h3 className="font-semibold">Not suggested, still depended on</h3>
              <ul className="text-muted-foreground">{u.kept.map((k) => <li key={k.id}><Link href={`/metrics/${u.notOpened.metrics.find((m) => m.id === k.id)?.slug}`} className="underline underline-offset-2">{k.name}</Link>: {k.because}</li>)}</ul>
            </div>
          )}
        </section>
        {u.retentionSuggestions.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Metrics that could keep less</h2>
            <p className="text-sm text-muted-foreground">Many old values and nobody opened them for {u.unusedDays} days. <strong className="font-medium">Set a Retention</strong> opens the Metric&rsquo;s page with the suggestion filled in and what it would do in counts. Nothing is set, condensed or deleted until you turn it on there.</p>
            <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
              {u.retentionSuggestions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
                  <Link href={`/metrics/${r.slug}`} className="font-medium underline-offset-2 hover:underline">{r.name}</Link>
                  <span className="text-xs text-muted-foreground">{r.why}; {retentionWords(r.suggestion)}</span>
                  <Link href={`/metrics/${r.slug}?tab=settings&suggest=${retentionToParam(r.suggestion)}#retention`} className="ml-auto text-sm underline underline-offset-2">Set a Retention</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {u.readByProgram.length > 0 && <List title="Only read by a program" empty="" items={u.readByProgram} href={metricHref} />}
        <List title="Metrics without values" empty="Every Metric has recent values." items={u.noValues} href={metricHref} />
        {u.projectionOnly.length > 0 && <List title="Metrics with only a Projection" empty="" items={u.projectionOnly} href={metricHref} />}

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Submitters without values</h2>
          <p className="text-sm text-muted-foreground">Asked for Metrics, and no value from them in 90 days.</p>
          {u.submitters.length === 0 ? <p className="text-sm text-muted-foreground">Everyone asked has sent values.</p> : (
            <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
              {u.submitters.map((s) => (
                <li key={s.id} className="px-3 py-2">
                  <span className="font-medium">{s.name}</span> <span className="text-xs text-muted-foreground">{s.kind === "feed" ? "Feed" : s.kind === "contact" ? "Contact" : "Member"}</span>
                  <div className="text-xs text-muted-foreground">
                    {s.metrics.map((m, i) => <span key={m.id}>{i > 0 ? ", " : ""}<Link href={`/metrics/${m.slug}`} className="underline underline-offset-2">{m.name}</Link> (owned by {m.owner})</span>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Most looked at, last 30 days</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {([["Dashboards", u.mostLooked.dashboards.map((d) => ({ ...d, href: `/dashboards/${d.id}` }))], ["Metrics", u.mostLooked.metrics.map((m) => ({ ...m, href: `/metrics/${m.slug}` }))]] as const).map(([label, rows]) => (
              <div key={label}>
                <h3 className="mb-1 text-sm font-semibold">{label}</h3>
                {rows.length === 0 ? <p className="text-sm text-muted-foreground">None opened yet.</p> : (
                  <ol className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
                    {rows.map((r) => <li key={r.id} className="flex gap-3 px-3 py-2"><Link href={r.href} className="font-medium underline-offset-2 hover:underline">{r.name}</Link><span className="ml-auto text-xs text-muted-foreground">{r.views} open{r.views === 1 ? "" : "s"}</span></li>)}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
