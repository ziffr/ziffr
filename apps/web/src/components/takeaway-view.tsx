// A Takeaway as a person reads it (GLOSSARY: Takeaway): the sentence first, then what was done differently, what it is based on,
// the cautions and assumptions, the one footer line (the order of spec 0041, "The Takeaway format"), and Show the numbers for the numbers behind it. The words are the core's (takeaways/); this only lays them
// out, so a Metric page and a dashboard widget say the same thing. A refusal shows its words and nothing else.
import type { ReactNode } from "react";
import type { Takeaway } from "@ziffr/core/takeaways/takeaway";

/** A Takeaway: the sentence (or the refusal), notes, its basis, cautions, assumptions, the footer, and Show the numbers; `children` go inside Show the numbers. */
export function TakeawayView({ takeaway: t, children, id }: { takeaway: Takeaway; children?: ReactNode; /** An id for the words, so a chart above them can be described by them. */ id?: string }) {
  if (t.kind === "refusal") return <p id={id} className="mt-1 widget-text-sm text-muted-foreground">{t.refusal}</p>;
  return (
    <div id={id} className="mt-1 space-y-1 widget-text-sm text-muted-foreground">
      <p className="text-foreground">{t.sentence}</p>
      {t.notes.map((n) => <p key={n} className="widget-text-xs">{n}</p>)}
      {t.basis && <p className="widget-text-xs">{t.basis[0].toUpperCase() + t.basis.slice(1)}.</p>}
      {t.cautions.map((c) => <p key={c} className="widget-text-xs text-[var(--color-warn,inherit)]">{c}</p>)}
      {t.assumptions.map((a) => <p key={a} className="widget-text-xs">{a}</p>)}
      {t.track && <p className="widget-text-xs">{t.track}</p>}
      {t.footer && <p className="widget-text-xs">{t.footer}</p>}
      <details className="widget-text-xs">
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
