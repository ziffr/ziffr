import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, PenLine } from "lucide-react";
import { metricCatalog } from "@ziffr/core/page-data";
import { metricDraftFrom, type MetricDraft } from "@ziffr/core/metrics";
import { Forbidden } from "@ziffr/core/actor";
import { getNumberStyle, getProfiles, getAttainmentMethod } from "@/lib/data";
import { moneyUnit } from "@ziffr/core/units";
import { AttainmentMethodField } from "../attainment-method-field";
import { UnitFields } from "../unit-fields";
import { currentActor, viewerId } from "@/lib/viewer";
import { createMetric } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { POLARITY_LABEL, RULE_LABEL } from "@ziffr/core/format";
import type { CatalogMetric, MetricDescription, Period, Polarity, SourceId, SubmissionRule } from "@ziffr/core/types";
import { SOURCES } from "@/sources";
import { isDemo } from "@/lib/auth";
import { CatalogBrowser } from "./catalog-browser";
import { workspaceProfile } from "@ziffr/core/workspace-settings";
import { INDUSTRY_LABEL } from "@ziffr/core/workspace-profile";
import { PERIOD_LABEL } from "@ziffr/core/periods";

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
  unit_position: "after",
  format: "number",
  decimals: 0,
  period: "month",
  submission_rule: "overwrite",
  polarity: "higher",
  target_min: null,
  target_max: null,
  sources: ["web_form", "mail", "slack", "telegram", "api"],
  attainment_method: null,
};

const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";

export default async function NewMetricPage({ searchParams }: { searchParams: Promise<{ catalog?: string; scratch?: string; copy?: string }> }) {
  const sp = await searchParams;
  const items = (await metricCatalog()) as CatalogMetric[];
  const picked = sp.catalog ? items.find((c) => c.id === Number(sp.catalog)) : undefined;
  // A duplicate starts from a Metric the person sees; the core refuses Guests and Metrics hidden from them.
  const copy = sp.copy ? await draftOrNull(Number(sp.copy)) : null;
  if (sp.copy && !copy) notFound();

  if (!picked && !sp.scratch && !copy) {
    // The Workspace Profile's industry and segment suggest Metrics; only these two keys go to the browser.
    const [profile, numberStyle] = await Promise.all([workspaceProfile(await currentActor()), getNumberStyle()]);
    const fit = profile.industry ? { industry: profile.industry, segment: profile.segment, label: INDUSTRY_LABEL[profile.industry] } : null;
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
        <CatalogBrowser items={items} fit={fit} money={moneyUnit(profile.currency)} numberStyle={numberStyle} />
      </>
    );
  }

  // A new Metric takes values every way Ziffr knows (web form, email, Slack), so each submitter can use what suits
  // them; a duplicate keeps its original's. The owner can narrow it here or later on the Metric's Settings tab.
  const [people, viewer, demo, profile, numberStyle, attainmentMethod] = await Promise.all([getProfiles(), viewerId(), isDemo(), workspaceProfile(await currentActor()), getNumberStyle(), getAttainmentMethod()]);
  // A new money Metric starts with the unit of the Workspace Profile's currency (spec 0022), one from the catalog too.
  const money = moneyUnit(profile.currency);
  const d: MetricDescription = copy ?? (picked ? { ...picked, ...(picked.format === "currency" ? money : {}), sources: BLANK.sources, attainment_method: null } : BLANK);
  return (
    <>
      {copy
        ? <Link href={`/metrics`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Metrics</Link>
        : <Link href="/metrics/new" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Catalog</Link>}
      <PageHeader
        title={copy ? `Duplicate “${copy.original}”` : picked ? `New metric from “${picked.name}”` : "New metric"}
        sub={copy
          ? "A new metric of yours with the same description. Values, Shares, Target Series and history stay with the original."
          : picked ? "Copied from the Metric Catalog. It’s your metric now: change anything, it won’t follow later catalog changes." : "Describe the metric before anyone can report values for it."}
      />
      <form action={createMetric} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <input type="hidden" name="from_catalog_id" value={copy ? "" : picked?.id ?? ""} />
        <input type="hidden" name="duplicate_of" value={copy?.duplicateOf ?? ""} />
        <div className="space-y-6">
          <Section title="What is it?">
            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Name" className="sm:col-span-2"><Input name="name" required defaultValue={d.name} placeholder="e.g. Customer satisfaction" /></F>
              <F label="Description" className="sm:col-span-2"><Textarea name="description" defaultValue={d.description} rows={2} placeholder="What exactly is counted, and what isn’t?" /></F>
              <UnitFields format={d.format} unit={d.unit} unitPosition={d.unit_position} decimals={d.decimals} money={money} numberStyle={numberStyle} maxDecimals={4} idPrefix="new" />
            </div>
          </Section>

          <Section title="How do values arrive?">
            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Period" hint="One value per period.">
                <select name="period" defaultValue={d.period} className={field}>
                  {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
                </select>
              </F>
              <F label="A second value for the same period" hint="What happens when one arrives.">
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
                      {s.label} {s.simulated && demo && <span className="text-xs text-muted-foreground">(played in the demo)</span>}
                    </label>
                  ))}
                </div>
              </F>
              <F label="Who submits" hint="Each gets a personal form link for this metric, and a first request for the value by chat or mail." className="sm:col-span-2">
                <div className="flex flex-wrap gap-4">
                  {people.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="submitters" value={p.id} defaultChecked={copy ? copy.submitters.includes(p.id) : p.id === "anna"} className="size-4 accent-primary" />
                      <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                      {p.name.split(" ")[0]} <span className="text-xs text-muted-foreground">{p.role}</span>
                    </label>
                  ))}
                </div>
              </F>
              {copy?.workflow && (
                <F label="Workflow" hint="The path its values take each period, as for the original." className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="workflow_id" value={copy.workflow.id} defaultChecked className="size-4 accent-primary" />
                    {copy.workflow.name}
                  </label>
                </F>
              )}
            </div>
          </Section>

          <Section title="Target">
            <div className="grid gap-4 sm:grid-cols-3">
              <F label="Which way is good">
                <select name="polarity" defaultValue={d.polarity} className={field}>
                  {(Object.keys(POLARITY_LABEL) as Polarity[]).map((p) => <option key={p} value={p}>{POLARITY_LABEL[p]}</option>)}
                </select>
              </F>
              <F label="Target from"><Input name="target_min" type="number" step="any" defaultValue={d.target_min ?? ""} /></F>
              <F label="Target to"><Input name="target_max" type="number" step="any" defaultValue={d.target_max ?? ""} /></F>
              <AttainmentMethodField id="new-attainment" value={d.attainment_method} workspaceMethod={attainmentMethod} className="sm:col-span-3" />
            </div>
          </Section>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="stock rounded-[var(--radius-card)] p-4 text-sm">
            <div className="font-medium">Owner</div>
            <p className="mt-1 text-muted-foreground">You ({people.find((p) => p.id === viewer)?.name}). The owner keeps the description up to date and accepts corrections to its values.</p>
          </div>
          <Button type="submit" size="lg" className="w-full">{copy ? "Create duplicate" : "Create metric"}</Button>
          <Link href="/metrics" className={buttonVariants({ variant: "ghost", className: "w-full" })}>Cancel</Link>
        </aside>
      </form>
    </>
  );
}

/** The prefilled duplicate, or null when the person may not duplicate that Metric. */
async function draftOrNull(id: number): Promise<MetricDraft | null> {
  if (!Number.isInteger(id)) return null;
  try {
    return await metricDraftFrom(await currentActor(), id);
  } catch (e) {
    if (e instanceof Forbidden) return null;
    throw e;
  }
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
