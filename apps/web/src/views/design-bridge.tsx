"use client";
// The `bridge` mark of a View Design (GLOSSARY: View Design, Analysis Recipe; spec 0041, "Marks"): steps from the start of a change
// through each part, going up or down, to its end. It draws only the figures the core hands it (mark-figures.ts, from the bridge Method's
// own table): every number and sign is written there; this file places bars. A part that went down is drawn hanging down, hatched, and written
// with its minus; a part of 0 is drawn as a line and written as 0; a bar is never told apart by colour alone. The words named in the
// recipe's output label and the note on parts with no value in one period are small and muted, apart from the figures.
import type { BridgeFigures } from "@ziffr/core/mark-figures";
import { fitWords } from "./label-fit";

type Drawn = Extract<BridgeFigures, { ok: true }>;

// A bar's position on the value axis, in percent of the chart's height, with 0 always inside it so a start of 0 or a negative level reads true.
function scale(f: Drawn) {
  const ends = f.steps.flatMap((s) => [s.from, s.to]);
  const lo = Math.min(0, ...ends);
  const hi = Math.max(0, ...ends);
  const at = (x: number) => ((x - lo) / (hi - lo || 1)) * 100;
  return { at, zero: at(0) };
}

/** The steps of a recipe's bridge, or the words that say why it cannot be drawn. */
export function DesignBridge({ figures, caption }: { figures: BridgeFigures | undefined; caption?: string }) {
  if (!figures) return <p className="widget-text-xs text-muted-foreground">Nothing to draw yet.</p>;
  if (!figures.ok) return <p className="widget-text-xs text-muted-foreground">{figures.refusal}</p>;
  const { at, zero } = scale(figures);
  // About 6.5 pixels a character in a 400 pixel chart shared by the columns.
  const room = Math.max(4, Math.floor(400 / figures.steps.length / 6.5));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {caption && <p className="widget-text-xs text-muted-foreground">{caption}</p>}
      {/* The whole chart is one picture to a screen reader, which gets every number in one sentence. */}
      <div role="img" aria-label={figures.alt} className="flex min-h-24 flex-1 flex-col">
        <div aria-hidden className="grid h-full min-h-24 gap-[0.4em]" style={{ gridTemplateColumns: `repeat(${figures.steps.length}, minmax(0, 1fr))` }}>
          {figures.steps.map((s, i) => {
            const [a, b] = [at(Math.min(s.from, s.to)), at(Math.max(s.from, s.to))];
            const level = s.kind === "start" || s.kind === "end";
            return (
              <div key={i} className="flex min-h-0 flex-col" data-step={s.kind} data-direction={s.direction}>
                <span className="fig widget-text-xs break-words text-center" title={s.text}>{s.text}</span>
                <div className="relative min-h-0 flex-1">
                  <span className="absolute inset-x-0 border-t border-[var(--color-rule-2)]" style={{ bottom: `${zero}%` }} />
                  <span
                    className="absolute inset-x-[12%] rounded-[2px]"
                    style={{
                      bottom: `${a}%`,
                      height: `${b - a}%`,
                      minHeight: s.kind === "rest" ? "6px" : "2px",
                      // Levels are solid; a rise is solid in the data colour; a fall is hatched, so it reads without the colour; what the parts leave out is an outline.
                      ...(level ? { background: "var(--color-ink)", opacity: 0.8 }
                        : s.kind === "rest" ? { background: "var(--color-muted)", opacity: 0.35, border: "1.5px dashed var(--color-ink)" }
                        : s.direction === "down" ? { background: "repeating-linear-gradient(135deg, var(--color-data) 0 2px, transparent 2px 5px)", border: "1px solid var(--color-data)" }
                        : { background: "var(--color-data)", opacity: 0.85 }),
                    }}
                  />
                </div>
                <span dir="auto" className="widget-text-xs text-center text-muted-foreground" title={s.label}>{fitWords(`${s.label}${s.missing ? " *" : ""}`, room, 3).map((l, k) => <span key={k} className="block whitespace-nowrap">{l}</span>)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {figures.notes.map((n) => <p key={n} className="widget-text-xs text-muted-foreground">* {n}</p>)}
      <p className="widget-text-xs text-muted-foreground">Drawn to scale from 0; a small part is a thin line.</p>
    </div>
  );
}
