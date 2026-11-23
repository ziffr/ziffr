// Connectors → Send values (spec 0043, ticket 8; GLOSSARY: Feed, Feed Key, Access Key, MCP Server): the one place every member
// finds workable ways to put values on their Metrics from a program or another system: a command to copy for a Metric of
// theirs, the n8n templates, the assistant, and what the answers mean. Nothing here holds a key; the page says where one is made.
import Link from "next/link";
import { currentActor } from "@/lib/viewer";
import { sendableMetrics } from "@ziffr/core/send-values-options";
import { isDemo } from "@/lib/auth";
import { SITE_URL } from "@/lib/sign-in";
import { mcpAddress } from "@/lib/remote-mcp";
import { SendValues } from "./send-values";

export default async function SendValuesPage() {
  const actor = await currentActor();
  const [options, demo] = await Promise.all([sendableMetrics(actor), isDemo()]);
  const canFeed = actor.role === "owner" || actor.role === "admin";
  // Only Metrics this person sees that take values from a program (decided by the core), for a Feed Key and for their own key.
  const mcp = mcpAddress();
  return (
    <div className="space-y-8">
      <p className="max-w-prose text-sm text-muted-foreground">
        A program or an automation puts a value on a Metric with one call. Pick a Metric, copy the example, and put your key where it says. Ziffr checks every value as it checks any other: the Metric&rsquo;s Submission Rule, Approval of Unusual Values and Locks.
      </p>
      <SendValues address={SITE_URL} metrics={options} canFeed={canFeed} demo={demo} />
      <section className="stock rounded-[var(--radius-card)] p-5 text-sm">
        <h2 className="mb-2 font-medium">Other ways to connect</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          <li><strong>n8n, ready made.</strong> {canFeed ? <>On a Metric, open <em>Who submits</em> and choose <em>Fill from n8n</em>: you get a ready workflow for one of the systems Ziffr has a template for, with this Ziffr&rsquo;s address already in it.</> : <>Ask an Owner or Admin: on a Metric&rsquo;s <em>Who submits</em>, <em>Fill from n8n</em> gives a ready workflow for one of the systems Ziffr has a template for, with this Ziffr&rsquo;s address in it.</>}</li>
          <li><strong>An AI assistant.</strong> {mcp ? <>Add Ziffr&rsquo;s MCP Server at <code className="fig break-all">{mcp}</code>, or</> : <>Connect it, and</>} ask it to record a number. <Link href="/settings/assistants" className="underline">Connected assistants</Link> shows how.</li>
          <li><strong>{canFeed ? "Keys." : "Your key."}</strong> {canFeed ? <>A system sends with a Feed Key (<Link href="/settings/feeds" className="underline">Settings → Feeds</Link>), a person&rsquo;s script with an Access Key (<Link href="/settings/keys" className="underline">Settings → API keys</Link>, scope &ldquo;Submit values&rdquo;).</> : <>Make an Access Key with the scope &ldquo;Submit values&rdquo; under <Link href="/settings/keys" className="underline">Settings → API keys</Link>. It sends as you, for the Metrics you submit to.</>}</li>
          <li><strong>Check what happened.</strong> {canFeed ? <><Link href="/settings/feeds" className="underline">Settings → Feeds</Link> lists each key&rsquo;s recent calls and what was refused.</> : <>A Metric&rsquo;s History says who sent each value and through which Source.</>}</li>
        </ul>
      </section>
    </div>
  );
}
