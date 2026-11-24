// GLOSSARY: Placeholder. The list of words that fill themselves in, shown under any field whose text may use them
// (a Finding's words, a widget's title in a Snapshot), so every editor says the same.
import { PLACEHOLDERS } from "@ziffr/core/placeholders";

/** The Placeholders a text may use, folded away until wanted; `about` says whose other Metrics `{metric 2}` means. */
export function PlaceholderHints({ about = "the widget" }: { about?: string }) {
  return (
    <details className="rounded-[var(--radius-input)] border border-border p-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">Words that fill themselves in</summary>
      <ul className="mt-1.5 space-y-0.5">
        {PLACEHOLDERS.map((p) => <li key={p.key}><code className="fig text-foreground">{`{${p.key}}`}</code> {p.hint}</li>)}
      </ul>
      <p className="mt-1.5">Add a number for another metric of {about}, such as {"{metric 2}"}.</p>
    </details>
  );
}
