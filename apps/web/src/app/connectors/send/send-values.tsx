"use client";
// The picker and the examples of Connectors → Send values: a Metric of the person's, which kind of key, which language, and
// a copy button. All text comes from lib/connect-examples (pure); the page sends nothing and holds no key.
import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { examplesFor, endpointOf, type ExampleRoute } from "@/lib/connect-examples";

const field = "h-8 rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";

const ANSWERS: [string, string][] = [
  ["200 / 201", "Taken. A Feed answers 200 with one result per item (look at each: recorded, awaiting_approval, locked or refused with a code); a person's key answers 201 for one value."],
  ["400", "The request is wrong: not JSON, a value that is not a number, a slug or a period that is not one. Nothing was recorded, and the message names the field."],
  ["401 / 403", "No key, a wrong, ended or revoked key (401); the wrong kind of key for this address (403)."],
  ["409", "The same Idempotency-Key was used with another body, or its first call is still running."],
  ["422 / refused", "The Metric's rules refused the value: a second value for a period it rejects, a period that is not a period's first day or is in the future, a locked period."],
  ["429", "Too many values or calls. Retry-After says in how many seconds to try again."],
];

/** The picker and the examples. */
export function SendValues({ address, metrics, canFeed, demo }: { address: string; metrics: { slug: string; name: string }[]; canFeed: boolean; demo: boolean }) {
  const [slug, setSlug] = useState(metrics[0]?.slug ?? "");
  const [route, setRoute] = useState<ExampleRoute>(canFeed ? "feed" : "person");
  const [which, setWhich] = useState("curl");
  const examples = useMemo(() => examplesFor({ address, route, slug }), [address, route, slug]);
  const shown = examples.find((e) => e.id === which) ?? examples[0];
  const copy = () => { void navigator.clipboard?.writeText(shown.text).then(() => toast.success("Copied"), () => toast.error("Not copied", { description: "Select it and copy by hand." })); };
  return (
    <section className="stock space-y-4 rounded-[var(--radius-card)] p-5">
      <div>
        <h2 className="font-medium">Send a value from a program</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {route === "feed"
            ? "A Feed Key sends for a system (a CRM, a shop, a script on a server): up to 500 values in one call, for the Metrics its Feed submits to."
            : "An Access Key sends as you, for one Metric at a time, with the scope “Submit values”. You must be one of the Metric’s Submitters."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2"><span className="text-xs font-medium">Metric</span>
          <select className={field} value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Metric">
            {metrics.length === 0 && <option value="">your-metric-slug</option>}
            {metrics.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>
        </label>
        {canFeed && (
          <label className="flex items-center gap-2"><span className="text-xs font-medium">Key</span>
            <select className={field} value={route} onChange={(e) => setRoute(e.target.value as ExampleRoute)} aria-label="Kind of key">
              <option value="feed">Feed Key (a system)</option>
              <option value="person">Access Key (me)</option>
            </select>
          </label>
        )}
      </div>
      {metrics.length === 0 && <p className="text-sm text-muted-foreground">No Metric of yours takes values from a program yet. Turn the API on as a Source on a Metric (its Description tab), and it appears here.</p>}
      <div role="tablist" aria-label="Language" className="flex flex-wrap gap-1">
        {examples.map((e) => <Button key={e.id} role="tab" aria-selected={e.id === shown.id} size="sm" variant={e.id === shown.id ? "default" : "outline"} onClick={() => setWhich(e.id)}>{e.label}</Button>)}
      </div>
      <div className="relative">
        <pre className="overflow-x-auto rounded-[var(--radius-input)] bg-muted p-3 text-xs leading-relaxed" tabIndex={0}><code>{shown.text}</code></pre>
        <Button size="sm" variant="outline" className="absolute right-2 top-2" onClick={copy}><Copy aria-hidden /> Copy</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The address is this Ziffr&rsquo;s own: <code className="fig break-all">{endpointOf(address, route, slug)}</code>. Replace the key placeholder with a key you made{demo ? " (the demo has no keys: nothing sent here is recorded)" : ""}; keep it in a secret store, never in code you share. Leave out <code>period</code> for the current period, or send a period&rsquo;s first day (<code>2026-10-01</code>) for an earlier one. The <code>Idempotency-Key</code> makes a retry safe: the same key with the same body records nothing twice.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">What the answers mean</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
          {ANSWERS.map(([code, words]) => (<div key={code} className="contents"><dt className="font-mono text-xs">{code}</dt><dd className="text-muted-foreground">{words}</dd></div>))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Every code and what to do about it: the Feeds guide, &ldquo;When something goes wrong&rdquo;.</p>
      </details>
    </section>
  );
}
