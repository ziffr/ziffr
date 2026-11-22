// A Takeaway as a person reads it (GLOSSARY: Takeaway): the sentence, the cautions above it, what it is based on, the one
// footer line, and Show the numbers for the numbers behind it. The words are the core's (takeaways/); this only lays them
// out, so a Metric page and a dashboard widget say the same thing. A refusal shows its words and nothing else.
import type { ReactNode } from "react";
import type { Takeaway } from "@ziffr/core/takeaways/takeaway";

/** A Takeaway: cautions, the sentence (or the refusal), its basis, the footer, and Show the numbers; `children` go inside Show the numbers. */
export function TakeawayView({ takeaway: t, children }: { takeaway: Takeaway; children?: ReactNode }) {
  if (t.kind === "refusal") return <p className="mt-1 text-sm text-muted-foreground">{t.refusal}</p>;
  return (
    <div className="mt-1 space-y-1 text-sm text-muted-foreground">
      {t.cautions.map((c) => <p key={c} className="text-xs text-[var(--color-warn,inherit)]">{c}</p>)}
      <p className="text-foreground">{t.sentence}</p>
      {t.notes.map((n) => <p key={n} className="text-xs">{n}</p>)}
      {t.basis && <p className="text-xs">{t.basis[0].toUpperCase() + t.basis.slice(1)}.</p>}
      {t.footer && <p className="text-xs">{t.footer}</p>}
      <details className="text-xs">
        <summary className="cursor-pointer">Show the numbers</summary>
        <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
          {t.numbers.map((n) => (
            <div key={n.label} className="contents">
              <dt>{n.label}</dt>
              <dd className="fig">{n.text}</dd>
            </div>
          ))}
        </dl>
        {children}
      </details>
    </div>
  );
}
