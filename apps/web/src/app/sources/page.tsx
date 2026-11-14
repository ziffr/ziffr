import Link from "next/link";
import { FileInput } from "lucide-react";
import { getMetrics, getProfiles } from "@/lib/data";
import { currentActor } from "@/lib/viewer";
import { sourcesView } from "@ziffr/core/page-data";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Simulator } from "./simulator";
import { DemoControls } from "@/components/demo-controls";
import { isDemo } from "@/lib/auth";
import type { IntakeEntry, Prompt } from "@ziffr/core/types";

export default async function SourcesPage() {
  const actor = await currentActor();
  const viewer = actor.personId;
  const [profiles, metrics, { prompts, log, tokens }, demo] = await Promise.all([getProfiles(), getMetrics(), sourcesView(actor), isDemo()]);
  const metricNames = Object.fromEntries(metrics.map((m) => [m.id, m.name]));
  const peopleById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  // Token codes open submission forms: the core passes only the viewer's own (all of them in the demo).
  const forms = tokens.filter((t) => metrics.find((m) => m.id === t.metric_id)?.sources.includes("web_form"));
  const by = (s: string) => ({
    prompts: ((prompts ?? []) as Prompt[]).filter((p) => p.source === s),
    log: ((log ?? []) as IntakeEntry[]).filter((l) => l.source === s),
  });

  return (
    <>
      <PageHeader
        title="Sources"
        sub="Where values come from: a reply in Slack or by mail, a personal form link, or a program through the API. Ziffr checks who sent each one and whether they may submit it."
      />
      {demo && (
        <DemoControls className="mb-6" hint="Slack and Mail are played here: send a message as anyone. It goes through the same checks as a real one, so you can see a value accepted, rejected or added up.">
          <div className="grid gap-6 lg:grid-cols-2">
            <Simulator source="slack" {...by("slack")} profiles={profiles} viewer={viewer} metricNames={metricNames} />
            <Simulator source="mail" {...by("mail")} profiles={profiles} viewer={viewer} metricNames={metricNames} />
          </div>
        </DemoControls>
      )}
      <section className="stock rounded-[var(--radius-card)] p-5">
        <h2 className="mb-1 flex items-center gap-2 font-medium"><FileInput className="size-4" /> Form links</h2>
        <p className="mb-3 text-sm text-muted-foreground">Everyone who submits a metric has a personal form link for it. The link itself is the permission, so nobody needs to sign in.</p>
        {forms.length === 0 && <p className="text-sm text-muted-foreground">No form links for you yet. A metric gets them when its owner picks the web form as a source and names who submits.</p>}
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
