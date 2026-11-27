// Where a submitter's next Prompt goes and why (GLOSSARY: Prompt, Delivery Preference), one line under their name on the
// Metric page's Who submits. Shows nothing but the way, the reason and, for the person themselves, the link that fixes it.
import Link from "next/link";
import type { RouteView } from "@ziffr/core/prompt-route";

/** The line: "Next request: by Slack", or "Can't reach: link Slack" with the fix link. */
export function NextPrompt({ view }: { view: RouteView }) {
  return (
    <p className={`basis-full text-xs ${view.ok ? "text-muted-foreground" : "text-destructive"}`}>
      {view.ok ? "Next request: " : ""}{view.text}{view.ok && view.why ? `. ${view.why}` : ""}
      {!view.ok && view.why ? <span className="block text-muted-foreground">{view.why}</span> : null}
      {view.fix && <> <Link href={view.fix.href} className="underline">{view.fix.label}</Link></>}
      {view.stopped && <span className="block text-destructive">{view.stopped}</span>}
    </p>
  );
}
