import Link from "next/link";
import { format } from "date-fns";
import { FileInput } from "lucide-react";
import { getPeopleIn, getProfiles } from "@/lib/data";
import { currentActor } from "@/lib/viewer";
import { sourcesView } from "@ziffr/core/page-data";
import { Person } from "@/components/avatar";
import { Simulator } from "./simulator";
import { DemoControls } from "@/components/demo-controls";
import { isDemo } from "@/lib/auth";
import { visitorsMayChangeDemo } from "@/lib/demo-visit-action";
import type { IntakeEntry, Prompt } from "@ziffr/core/types";

// Connectors → Sources (spec 0021; GLOSSARY: Source, Prompt): where values come from, and in the demo the Slack and Mail
// simulators. A tab of Connectors since #532.
export default async function SourcesPage() {
  const actor = await currentActor();
  const viewer = actor.personId;
  const [shown, { prompts, log, tokens, metrics }, demo, changes] = await Promise.all([getProfiles(), sourcesView(actor), isDemo(), visitorsMayChangeDemo()]);
  // The demo's simulator writes as someone by their Slack handle or address: made-up people, so theirs are shown.
  const profiles = demo ? await getPeopleIn(actor.workspaceId, { contactDetails: true }) : shown;
  const metricNames = Object.fromEntries(metrics.map((m) => [m.id, m.name]));
  const peopleById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  // Token codes open submission forms: the core passes only the viewer's own, also in the demo.
  const forms = tokens.filter((t) => metrics.find((m) => m.id === t.metric_id)?.sources.includes("web_form"));
  const by = (s: string) => ({
    prompts: ((prompts ?? []) as Prompt[]).filter((p) => p.source === s),
    log: ((log ?? []) as IntakeEntry[]).filter((l) => l.source === s),
  });

  return (
    <>
      <p className="mb-6 max-w-prose text-sm text-muted-foreground">Where values come from: a reply in Slack or by mail, a personal form link, or a program through the API. Ziffr checks who sent each one and whether they may submit it.</p>
      {demo && (
        <DemoControls className="mb-6" hint={changes ? "Slack and Mail are played here: send a message as anyone. It goes through the same checks as a real one and is recorded, shared with every visitor until the demo starts fresh. Nothing is sent." : "Slack and Mail are played here: send a message as anyone. It goes through the same checks as a real one, so you can see whether a value would be accepted, rejected or added up. Nothing is saved."}>
          <div className="grid gap-6 lg:grid-cols-2">
            <Simulator source="slack" {...by("slack")} profiles={profiles} viewer={viewer} metricNames={metricNames} changes={changes} />
            <Simulator source="mail" {...by("mail")} profiles={profiles} viewer={viewer} metricNames={metricNames} changes={changes} />
          </div>
        </DemoControls>
      )}
      <WebFormLog log={by("web_form").log} metricNames={metricNames} />
      <section className="stock rounded-[var(--radius-card)] p-5">
        <h2 className="mb-1 flex items-center gap-2 font-medium"><FileInput className="size-4" /> Form links</h2>
        <p className="mb-3 text-sm text-muted-foreground">Everyone who submits a metric has a personal form link for it. The link itself is the permission, so nobody needs to sign in.</p>
        {forms.length === 0 && <p className="text-sm text-muted-foreground">No form links for you yet. A metric gets them when its owner picks the web form as a source and names who submits.</p>}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((t) => (
            <li key={t.id}>
              <Link href={`/submit/${t.code}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
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

/** How many of the latest web form entries the Sources page lists. */
const WEB_FORM_SHOWN = 20;

/** The latest values sent on the web form, by a personal form link or a paste, newest first; a pasted one is marked
 * "pasted", and "pasted as history" when it was recorded as one (spec 0026). Outside the demo the core passes only
 * the person's own. */
function WebFormLog({ log, metricNames }: { log: IntakeEntry[]; metricNames: Record<number, string> }) {
  if (!log.length) return null;
  const latest = [...log].reverse().slice(0, WEB_FORM_SHOWN);
  return (
    <section className="stock mb-6 rounded-[var(--radius-card)] p-5">
      <h2 className="mb-1 font-medium">From the web form</h2>
      <p className="mb-3 text-sm text-muted-foreground">The latest values sent with a personal form link or pasted from a spreadsheet, newest first.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th scope="col" className="pb-2 font-normal">When</th><th scope="col" className="pb-2 font-normal">Metric</th><th scope="col" className="pb-2 font-normal">Sent</th><th scope="col" className="pb-2 font-normal">What happened</th></tr>
          </thead>
          <tbody>
            {latest.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{format(new Date(l.at), "d MMM HH:mm")}</td>
                <td className="py-2 pr-3">{l.metric_id ? (metricNames[l.metric_id] ?? "–") : "–"}</td>
                <td className="py-2 pr-3">
                  <span className="whitespace-pre-wrap">{l.raw}</span>
                  {l.marks?.includes("paste") && <span className="block text-xs text-muted-foreground">{l.marks.includes("import") ? "pasted as history" : "pasted"}</span>}
                </td>
                <td className="py-2 text-xs text-muted-foreground">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
