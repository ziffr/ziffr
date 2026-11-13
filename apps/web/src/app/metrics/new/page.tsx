import Link from "next/link";
import { ArrowLeft, BookOpen, PenLine } from "lucide-react";
import { db } from "@/lib/db";
import { getProfiles } from "@/lib/data";
import { viewerId } from "@/lib/viewer";
import { createMetric } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PERIOD_LABEL, POLARITY_LABEL, RULE_LABEL, SOURCE_LABEL, targetText } from "@/lib/format";
import type { CatalogMetric, MetricDescription, Period, Polarity, SourceId, SubmissionRule } from "@/lib/types";
import { SOURCES } from "@/sources";

const RULE_HINT: Record<SubmissionRule, string> = {
  reject: "The first value for a period is final.",
  overwrite: "Good for snapshots: the latest report wins.",
  add: "Good for counts reported in pieces (“3 deals”, then “2 more”).",
  keep_both: "Good for repeated measurements, e.g. weight twice a day.",
};

const BLANK: MetricDescription = {
  name: "",
  aggregation: "sum",
  description: "",
  unit: "",
  format: "number",
  decimals: 0,
  period: "month",
  submission_rule: "overwrite",
  polarity: "higher",
  target_min: null,
  target_max: null,
  sources: ["web_form"],
};

const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";

export default async function NewMetricPage({ searchParams }: { searchParams: Promise<{ catalog?: string; scratch?: string }> }) {
  const sp = await searchParams;
  const { data: catalog } = await db.from("catalog_metrics").select("*").order("category").order("id");
  const items = (catalog ?? []) as CatalogMetric[];
  const picked = sp.catalog ? items.find((c) => c.id === Number(sp.catalog)) : undefined;

  if (!picked && !sp.scratch) {
    const groups = Object.entries(Object.groupBy(items, (c) => c.category));
    return (
      <>
        <PageHeader title="New metric" sub="Start from the Metric Catalog, or describe one from scratch. You can change everything afterwards." />
        <Link href="/metrics/new?scratch=1" className="mb-8 flex items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 hover:bg-muted/40">
          <PenLine className="size-5 text-muted-foreground" />
          <div>
            <div className="font-medium">Start from scratch</div>
            <div className="text-xs text-muted-foreground">Describe every dimension yourself.</div>
          </div>
        </Link>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><BookOpen className="size-4" /> Metric Catalog</h2>
        <div className="space-y-6">
          {groups.map(([cat, list]) => (
            <section key={cat}>
              <h3 className="mb-2 text-sm font-medium tracking-normal text-muted-foreground">{cat}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list!.map((c) => (
                  <Link key={c.id} href={`/metrics/new?catalog=${c.id}`} className="stock rounded-[var(--radius-card)] p-4 transition-[transform,box-shadow] hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)]">
                    <div className="font-medium">{c.name}</div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[var(--color-ink-2)]">
                      <span className="rounded bg-muted px-1.5 py-0.5">{PERIOD_LABEL[c.period]}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5">{POLARITY_LABEL[c.polarity]}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5">Target {targetText({ ...c, target_min: c.target_min === null ? null : Number(c.target_min), target_max: c.target_max === null ? null : Number(c.target_max) })}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </>
    );
  }

  const d: MetricDescription = picked ?? BLANK;
  const [people, viewer] = await Promise.all([getProfiles(), viewerId()]);
  return (
    <>
      <Link href="/metrics/new" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Catalog</Link>
      <PageHeader
        title={picked ? `New metric from “${picked.name}”` : "New metric"}
        sub={picked ? "Copied from the Metric Catalog. It’s your metric now: change anything, it won’t follow later catalog changes." : "Describe the metric before anyone can report values for it."}
      />
      <form action={createMetric} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <input type="hidden" name="from_catalog_id" value={picked?.id ?? ""} />
        <div className="space-y-6">
          <Section title="What is it?">
            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Name" className="sm:col-span-2"><Input name="name" required defaultValue={d.name} placeholder="e.g. Customer satisfaction" /></F>
              <F label="Description" className="sm:col-span-2"><Textarea name="description" defaultValue={d.description} rows={2} placeholder="What exactly is counted, and what isn’t?" /></F>
              <F label="Format">
                <select name="format" defaultValue={d.format} className={field}>
                  <option value="number">Number</option>
                  <option value="currency">Currency (€)</option>
                  <option value="percent">Percent</option>
                </select>
              </F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Unit"><Input name="unit" defaultValue={d.unit} placeholder="kg, deals…" /></F>
                <F label="Decimals"><Input name="decimals" type="number" min={0} max={4} defaultValue={d.decimals} /></F>
              </div>
            </div>
          </Section>

          <Section title="How do values arrive?">
            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Period" hint="One Observation per period.">
                <select name="period" defaultValue={d.period} className={field}>
                  {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
                </select>
              </F>
              <F label="Submission Rule" hint="What a second value for the same period does.">
                <select name="submission_rule" defaultValue={d.submission_rule} className={field}>
                  {(Object.keys(RULE_LABEL) as SubmissionRule[]).map((r) => <option key={r} value={r}>{RULE_LABEL[r]}: {RULE_HINT[r]}</option>)}
                </select>
              </F>
              <F label="Aggregation" hint="How values combine into a longer period, for QoQ or YoY." className="sm:col-span-2">
                <select name="aggregation" defaultValue={d.aggregation} className={field}>
                  <option value="sum">Sum: counts and amounts, such as revenue or deals</option>
                  <option value="average">Average: levels, such as a score or a delivery time</option>
                  <option value="last">Last value: stocks, such as a balance or headcount</option>
                  <option value="none">Does not combine: rates and ratios</option>
                </select>
              </F>
              <F label="Sources" className="sm:col-span-2">
                <div className="flex flex-wrap gap-4">
                  {SOURCES.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="sources" value={s.id} defaultChecked={(d.sources as SourceId[]).includes(s.id)} className="size-4 accent-primary" />
                      {SOURCE_LABEL[s.id]} {s.simulated && <span className="text-xs text-muted-foreground">(simulated)</span>}
                    </label>
                  ))}
                </div>
              </F>
              <F label="Submitters" hint="Each gets a Token for this metric, plus a first Prompt on a chat or mail Source." className="sm:col-span-2">
                <div className="flex flex-wrap gap-4">
                  {people.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="submitters" value={p.id} defaultChecked={p.id === "anna"} className="size-4 accent-primary" />
                      <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                      {p.name.split(" ")[0]} <span className="text-xs text-muted-foreground">{p.role}</span>
                    </label>
                  ))}
                </div>
              </F>
            </div>
          </Section>

          <Section title="Target and polarity">
            <div className="grid gap-4 sm:grid-cols-3">
              <F label="Polarity">
                <select name="polarity" defaultValue={d.polarity} className={field}>
                  {(Object.keys(POLARITY_LABEL) as Polarity[]).map((p) => <option key={p} value={p}>{POLARITY_LABEL[p]}</option>)}
                </select>
              </F>
              <F label="Target from"><Input name="target_min" type="number" step="any" defaultValue={d.target_min ?? ""} /></F>
              <F label="Target to"><Input name="target_max" type="number" step="any" defaultValue={d.target_max ?? ""} /></F>
            </div>
          </Section>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="stock rounded-[var(--radius-card)] p-4 text-sm">
            <div className="font-medium">Owner</div>
            <p className="mt-1 text-muted-foreground">You ({people.find((p) => p.id === viewer)?.name}). The owner keeps the description up to date and accepts Corrections.</p>
          </div>
          <Button type="submit" size="lg" className="w-full">Create metric</Button>
          <Link href="/metrics" className={buttonVariants({ variant: "ghost", className: "w-full" })}>Cancel</Link>
        </aside>
      </form>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="stock rounded-[var(--radius-card)] p-5">
      <h2 className="mb-4 font-medium">{title}</h2>
      {children}
    </section>
  );
}

function F({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
