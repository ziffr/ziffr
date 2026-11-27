// Health (spec 0066; GLOSSARY: Installation Health, Installation Admin): the release this server runs, the messages
// that wait or failed and when each background job last recorded a run, for Installation Admins only. Counts and times
// from what Ziffr records anyway; nothing is asked of any other server.
import Link from "next/link";
import { installationHealth, SENDING_LATE_MINUTES } from "@ziffr/core/installation-health";
import { installationSettingsView } from "@ziffr/core/installation-settings";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { panelPageActor, ziffrVersion } from "@/lib/installation";
import { PanelBadge } from "../panel-list";
import { PanelNav } from "../panel-nav";

const CHANNEL: Record<string, string> = { email: "Email", slack: "Slack", telegram: "Telegram" };
// The settings that say whether messages can leave at all.
const CONNECTIONS = ["mail", "telegram", "slack"];
const LINK = "underline underline-offset-2 max-md:-my-3 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center";

export default async function HealthPage() {
  const actor = await panelPageActor("/installation/health");
  const [health, view] = await Promise.all([installationHealth(actor), installationSettingsView(actor)]);
  const version = ziffrVersion();
  return (
    <>
      <PageHeader title="Health" sub="Whether this Ziffr does its own work: counts and times from what it records, nothing of any Workspace. Only Installation Admins see this page." />
      <PanelNav current="health" />
      <div className="max-w-2xl space-y-10 text-sm">
        <section aria-labelledby="release-heading" className="space-y-2">
          <h2 id="release-heading" className="text-lg font-medium">Release</h2>
          <p>{version ? `This is Ziffr ${version}.` : "This build has no release number."}</p>
          <p className="text-muted-foreground">Ziffr does not look for newer releases, so none is known here. They are listed on <a href="https://github.com/ziffr/ziffr/releases" target="_blank" rel="noopener noreferrer" className={LINK}>GitHub</a>.</p>
        </section>
        <section aria-labelledby="messages-heading" className="space-y-3">
          <h2 id="messages-heading" className="text-lg font-medium">Messages</h2>
          <ul className="space-y-1">
            {view.sections.filter((s) => CONNECTIONS.includes(s.id)).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/installation#${s.id}`} className={LINK}>{s.title}</Link>
                <PanelBadge>{s.working ? "Working" : "Not set up or not working"}</PanelBadge>
              </li>
            ))}
          </ul>
          <p>
            {health.waiting === 0 ? "No message is waiting to be sent." : <><span className="fig">{health.waiting.toLocaleString("en-US")}</span> {health.waiting === 1 ? "message is" : "messages are"} waiting to be sent{health.waitingSince && <>, the oldest due <RelativeTime at={health.waitingSince} /></>}.</>}
          </p>
          {health.late && <p role="status" className="font-medium text-destructive">Warning: a message has been due for more than {SENDING_LATE_MINUTES} minutes. Check that the clock runs and that the connection works.</p>}
          {health.failed.length ? (
            <div className="overflow-x-auto">
              <table className="w-full max-w-md text-left">
                <caption className="mb-1 text-left text-muted-foreground">Messages that failed for good, by channel</caption>
                <thead><tr className="border-b border-border"><th scope="col" className="py-1 pr-3 font-medium">Channel</th><th scope="col" className="py-1 pr-3 text-right font-medium">Last 24 hours</th><th scope="col" className="py-1 text-right font-medium">Last 7 days</th></tr></thead>
                <tbody>
                  {health.failed.map((f) => (
                    <tr key={f.channel} className="border-b border-border"><th scope="row" className="py-1 pr-3 font-normal">{CHANNEL[f.channel] ?? f.channel}</th><td className="fig py-1 pr-3 text-right">{f.day.toLocaleString("en-US")}</td><td className="fig py-1 text-right">{f.week.toLocaleString("en-US")}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>No message failed in the last 7 days.</p>}
        </section>
        <section aria-labelledby="jobs-heading" className="space-y-3">
          <h2 id="jobs-heading" className="text-lg font-medium">Background jobs</h2>
          <p className="max-w-[62ch] text-muted-foreground">A job with nothing to do records nothing, so an old time is not a fault by itself. Trial clean-up, unused Workspaces and the monthly usage email record no run of their own.</p>
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border">
            {health.jobs.map((j) => (
              <li key={j.id} className="space-y-1 p-3">
                <p className="font-medium">{j.name}</p>
                <p>{j.at ? <>Last recorded <RelativeTime at={j.at} /></> : j.day ? `Last recorded day: ${j.day}` : "Nothing recorded yet"}</p>
                <p className="text-xs text-muted-foreground">{j.every}. The time is {j.recorded}.{j.failed !== null ? ` Failed runs in the last 7 days: ${j.failed}.` : ""}</p>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">How far Workspaces are encrypted is under <Link href="/installation#encryption" className={LINK}>Encryption of Workspaces</Link>.</p>
        </section>
      </div>
    </>
  );
}
