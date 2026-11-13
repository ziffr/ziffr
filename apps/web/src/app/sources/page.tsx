import Link from "next/link";
import { FileInput } from "lucide-react";
import { db } from "@/lib/db";
import { getMetrics, getProfiles } from "@/lib/data";
import { viewerId } from "@/lib/viewer";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Simulator } from "./simulator";
import type { IntakeEntry, Prompt } from "@ziffr/core/types";

export default async function SourcesPage() {
  const [profiles, metrics, viewer, { data: prompts }, { data: log }, { data: tokens }] = await Promise.all([
    getProfiles(),
    getMetrics(),
    viewerId(),
    db.from("prompts").select("*").order("sent_at"),
    db.from("intake_log").select("*").order("at"),
    db.from("tokens").select("*"),
  ]);
  const metricNames = Object.fromEntries(metrics.map((m) => [m.id, m.name]));
  const peopleById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const forms = (tokens ?? []).filter((t) => metrics.find((m) => m.id === t.metric_id)?.sources.includes("web_form"));
  const by = (s: string) => ({
    prompts: ((prompts ?? []) as Prompt[]).filter((p) => p.source === s),
    log: ((log ?? []) as IntakeEntry[]).filter((l) => l.source === s),
  });

  return (
    <>
      <PageHeader
        title="Sources"
        sub="Where Observations come from. Slack and Mail are simulated here, but every message goes through the real intake: sender → Token → Submission Rule."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Simulator source="slack" {...by("slack")} profiles={profiles} viewer={viewer} metricNames={metricNames} />
        <Simulator source="mail" {...by("mail")} profiles={profiles} viewer={viewer} metricNames={metricNames} />
      </div>
      <section className="mt-6 stock rounded-[var(--radius-card)] p-5">
        <h2 className="mb-1 flex items-center gap-2 font-medium"><FileInput className="size-4" /> Web form <span className="text-xs font-normal text-muted-foreground">(real)</span></h2>
        <p className="mb-3 text-sm text-muted-foreground">Each Submitter has a personal link per metric. The link is the Token, so no login is needed.</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((t) => (
            <li key={t.id}>
              <Link href={`/submit/${t.code}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
                <span className="font-medium">{metricNames[t.metric_id]}</span>
                <Person p={peopleById[t.submitter_id]} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
