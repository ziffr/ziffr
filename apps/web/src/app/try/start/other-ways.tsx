"use client";
// Other ways to send numbers, at the end of the Trial Guide (ticket 193; GLOSSARY: Trial Guide, MCP Server, Feed,
// Feed Key, Test Metric): the ways in that need no asking. An AI assistant connects through the MCP Server at this
// Ziffr's /mcp; a program such as n8n sends values with a Feed Key the guide makes through the core. The secret is
// held only in this component's state, shown once, and never stored by the page.
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, Download, KeyRound } from "lucide-react";
import { N8N_WORKFLOW_FILE, n8nFeedWorkflow } from "@ziffr/core/n8n-workflow";
import type { GuideFeedKey, GuideFeedKeyResult } from "@ziffr/core/trial-guide";
import { Button } from "@/components/ui/button";
import { makeN8nKey } from "./actions";

/** A line of text to copy, with its button. */
function CopyLine({ text, label }: { text: string; label: string }) {
  // A failed copy never repeats the text in a toast: for a key that would be the secret once more.
  const copy = () => navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copied`), () => toast.error("Copying did not work: select the text instead."));
  return (
    <div className="mt-2 flex items-start gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-[var(--radius-input)] border border-border bg-muted/40 px-2 py-1.5 text-xs">{text}</code>
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}><Copy /> Copy</Button>
    </div>
  );
}

/** The ready n8n workflow with this Ziffr's address, the Metric and the key just made, built here in the browser from
 * what the card already shows: nothing new is fetched or stored. */
function N8nWorkflow({ siteUrl, metricSlug, feedKey }: { siteUrl: string; metricSlug: string; feedKey: string }) {
  const json = JSON.stringify(n8nFeedWorkflow({ siteUrl, metricSlug, feedKey }), null, 2);
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: N8N_WORKFLOW_FILE });
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = () => navigator.clipboard?.writeText(json).then(() => toast.success("Workflow copied"), () => toast.error("Copying did not work: download it instead."));
  return (
    <div className="mt-4">
      <p className="font-medium">A ready n8n workflow</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={download}><Download /> Download the n8n workflow</Button>
        <Button type="button" variant="outline" size="sm" onClick={copy}><Copy /> Copy it</Button>
      </div>
      <p className="mt-2">In n8n: open a new workflow, press Ctrl/Cmd+V or ⋯ → Import from file, then Execute workflow. The number appears in Ziffr.</p>
      <p className="mt-1 text-xs text-muted-foreground">The key sits in the request&apos;s header so it works at once. For real use, keep it in an n8n credential (Header Auth) instead.</p>
    </div>
  );
}

/** The two cards: an AI assistant (only where this Ziffr serves /mcp) and a program with a Feed Key. */
export function OtherWays({ siteUrl, mcpUrl, metric, feedKey }: {
  siteUrl: string;
  mcpUrl: string | null;
  metric: { name: string; slug: string };
  feedKey: GuideFeedKey | null;
}) {
  const [key, setKey] = useState<GuideFeedKey | null>(feedKey);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const make = (replace: boolean) => start(async () => {
    const r: GuideFeedKeyResult | { error: string } = await makeN8nKey(replace);
    if ("error" in r) { toast.error(r.error); return; }
    setKey(r.key);
    if (r.made) setSecret(r.secret);
    else toast.message("A key for n8n already works. Its secret was shown only once; replace it to see a new one.");
  });

  const endpoint = `${siteUrl}/api/v1/feed/observations`;
  const shown = secret ?? "<your key>";
  const body = JSON.stringify({ items: [{ metric: metric.slug, value: 3 }] });
  // The key comes from a variable, so it stays out of the shell's history and the process list.
  const exportKey = `export ZIFFR_KEY='${shown}'`;
  const curl = `curl -X POST ${endpoint} -H "Authorization: Bearer $ZIFFR_KEY" -H "Content-Type: application/json" -d '${body}'`;
  const question = `How many ${metric.name.toLowerCase()} did I record this week?`;

  return (
    <section aria-labelledby="other-ways-h" className="mt-8">
      <h2 id="other-ways-h" className="text-[length:var(--text-lg)]">Other ways to send numbers</h2>
      <p className="mt-1 text-sm text-muted-foreground">These need no asking: an assistant or a program sends the values itself.</p>
      <ul className="mt-4 space-y-3">
        {mcpUrl && (
          <li className="stock rounded-[var(--radius-card)] p-4 text-sm">
            <h3 className="font-semibold">Claude or another AI assistant</h3>
            <p className="mt-1 text-muted-foreground">Connect it to Ziffr with this address:</p>
            <CopyLine text={mcpUrl} label="Address" />
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              <li>In Claude.ai, open Settings, then Connectors, then Add custom connector, and paste the address.</li>
              <li>Press Connect. On Ziffr&apos;s page pick this workspace (tick Submit values if Claude should record numbers too), then press Connect.</li>
              <li>Ask Claude: &ldquo;{question}&rdquo;</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">A trial can have one connected assistant at a time. <Link href="/settings/assistants" className="underline">Connected assistants</Link></p>
          </li>
        )}
        <li className="stock rounded-[var(--radius-card)] p-4 text-sm">
          <h3 className="font-semibold">A program such as n8n</h3>
          <p className="mt-1 text-muted-foreground">
            A Feed sends values for {metric.name} with a Feed Key. The key works until your trial ends.
          </p>
          {!key && <Button className="mt-3" variant="outline" onClick={() => make(false)} disabled={pending}><KeyRound /> Make a key for n8n</Button>}
          {key && !secret && (
            <div className="mt-3">
              <p>A key for n8n works (<code className="text-xs">zk_{key.prefix}_…</code>, until {key.expiresOn}). Its secret was shown once, when it was made.</p>
              <Button className="mt-2" variant="outline" onClick={() => make(true)} disabled={pending}><KeyRound /> Replace the key</Button>
              <p className="mt-1 text-xs text-muted-foreground">Replacing stops the old key at once.</p>
            </div>
          )}
          {secret && (
            <div className="mt-3">
              <p className="font-medium">Your Feed Key, shown this once. Copy it now:</p>
              <CopyLine text={secret} label="Key" />
              <N8nWorkflow siteUrl={siteUrl} metricSlug={metric.slug} feedKey={secret} />
            </div>
          )}
          {key && (
            <>
              <p className="mt-4 font-medium">In n8n, an HTTP Request node:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>Method POST, URL <code className="text-xs">{endpoint}</code></li>
                <li>Authentication: Header Auth, name <code className="text-xs">Authorization</code>, value <code className="text-xs">Bearer {shown}</code></li>
                <li>Body (JSON): <code className="text-xs">{body}</code></li>
              </ul>
              <p className="mt-3 font-medium">Or try it at once in a terminal: set the key, then send a value.</p>
              <CopyLine text={exportKey} label="Line" />
              <CopyLine text={curl} label="Command" />
            </>
          )}
        </li>
      </ul>
    </section>
  );
}
