// The Try it page of a Trial Workspace (spec 0021, ticket 6; GLOSSARY: Trial Workspace, Connector, Source): one card
// per way in or out of Ziffr with whether it is real, simulated or off here, why, its limit and how to try it, ticked
// once a value really came by it. What a trial never does closes the page. States come from the core's
// whatWorksHere, so this page says what the queue does; ticks are counts only (waysTried).
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { WayLine } from "@/components/way-state";
import { trialEndsAt } from "@ziffr/core/trials";
import { trialGuidePending } from "@ziffr/core/trial-guide";
import { waysTried, whatWorksHere, type Way } from "@ziffr/core/what-works-here";
import { reachedWords, trialUsage } from "@ziffr/core/trial-usage";
import { EndTrialButton } from "@/components/end-trial-button";

const FEEDS_GUIDE = "https://github.com/ziffr/ziffr/blob/main/docs/guides/feeds.md#from-n8n-zapier-or-any-http-client";

/** How to try each way, in a sentence and a link. */
const STEPS: Partial<Record<Way, { how: string; link?: { href: string; label: string } }>> = {
  email: { how: "Open a Metric you submit, such as Sign-ups, and press Ask me now. The request arrives at the address you signed in with; answer by its form link.", link: { href: "/metrics", label: "Metrics" } },
  "email-replies": { how: "Reply to that email with just a number. It is recorded for the period the email asked about." },
  slack: { how: "Connect your Slack workspace with Add to Slack, choose Slack for Reminders under Who gets what, where, and press Ask me now. Answer in the message's thread.", link: { href: "/connectors", label: "Connectors" } },
  telegram: { how: "Turn Telegram on and press Connect Telegram, choose Telegram for Reminders, and press Ask me now. Answer by replying to the message.", link: { href: "/connectors", label: "Connectors" } },
  "web-form": { how: "Every request has a personal form link that works without signing in. Open one from an email, or from the Outbox.", link: { href: "/connectors/outbox", label: "Outbox" } },
  api: { how: "Make an Access Key with Submit values and send a value: POST /api/v1/metrics/{slug}/observations with {\"value\": 42}.", link: { href: "/settings/keys", label: "Access Keys" } },
  mcp: { how: "Make an Access Key, add the MCP Server to Claude Code or Claude Desktop with the line on the Connected assistants page, and ask it to record a value.", link: { href: "/settings/assistants", label: "Connected assistants" } },
  feeds: { how: "Make a Feed and a Feed Key, choose the Feed on a Metric, and send values from a script or an n8n automation.", link: { href: "/settings/feeds", label: "Feeds" } },
};

/** What a trial never does, said once so nobody waits for it. */
const NEVER = [
  "Reach a Contact: messages to Contacts, and to people who have not accepted their invitation, stay in the Outbox.",
  "Invite more people than its limit allows, or by a link: colleagues are invited by email, within the numbers above.",
  "Run past its last day: then it closes, and a week later it is deleted with everything in it.",
  "Move to another Ziffr. You can download its Metrics and values before it ends.",
  "Send WhatsApp messages or open tickets.",
];

/** The page; only in a Trial Workspace, for its Owner. */
export default async function TryItPage() {
  if (await isDemo()) redirect("/");
  const actor = await currentActor();
  const ends = await trialEndsAt(actor.workspaceId);
  if (!ends) redirect("/");
  // Until the Trial Guide is finished or skipped, it is where a new trial starts (ticket 193).
  if (await trialGuidePending(actor)) redirect("/try/start");
  const [ways, tried] = await Promise.all([whatWorksHere(actor), waysTried(actor)]);
  const usage = await trialUsage(actor);
  const done = ways.filter((w) => tried[w.way]).length;
  return (
    <>
      <PageHeader title="Try it" sub={`How values and messages travel in your trial, and how to try each way. ${done} of ${ways.filter((w) => w.state === "real").length} real ways tried so far.`} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {ways.map((w) => {
          const step = STEPS[w.way] ?? { how: "" };
          const ok = tried[w.way];
          return (
            <li key={w.way} className="stock rounded-[var(--radius-card)] p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                {ok ? <CheckCircle2 aria-label="Tried" className="size-4 text-[var(--color-success)]" /> : <Circle aria-label="Not tried yet" className="size-4 text-muted-foreground" />}
                {w.label}
              </div>
              <WayLine way={w} className="mt-1" />
              {/* Steps only for what really works here: otherwise the reason above says enough. */}
              {w.state === "real" && <p className="mt-2">{step.how}</p>}
              {w.state === "real" && step.link && <Link href={step.link.href} className="mt-2 inline-block text-xs underline">Go to {step.link.label}</Link>}
              {w.state === "real" && w.way === "feeds" && <a href={FEEDS_GUIDE} className="ml-3 mt-2 inline-block text-xs underline">The Feeds guide, with a ready n8n automation</a>}
            </li>
          );
        })}
      </ul>
      {usage && (
        <section aria-labelledby="limits-h" className="mt-8 max-w-prose text-sm">
          <h2 id="limits-h" className="text-[length:var(--text-lg)]">Your trial&rsquo;s limits</h2>
          <ul className="mt-2 space-y-1">
            {usage.map((r) => (
              <li key={r.key}>
                {r.words}{reachedWords(r) && <span className="text-muted-foreground"> {reachedWords(r)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="never-h" className="mt-8 max-w-prose text-sm">
        <h2 id="never-h" className="text-[length:var(--text-lg)]">What a trial never does</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          {NEVER.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <p className="mt-3 text-muted-foreground">Your trial ends on {ends.toISOString().slice(0, 10)}. A week later it is deleted with everything in it. <a href="/try/download" className="underline">Download your values</a> to keep them, or end it now.</p>
        <div className="mt-3"><EndTrialButton /></div>
      </section>
    </>
  );
}
