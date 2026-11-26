"use client";
// The lines of one Repeat in Set up from this Pack (spec 0058, #1181; GLOSSARY: Repeat, Position): a name for each,
// such as a salesperson or a site, typed or pasted, and the people of the Repeat's Positions for each line. A name is
// never filled in from a person's name by itself.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PositionField } from "./setup-positions";
import { addedLines, type LineRow } from "./setup-defaults";
import type { PackSetupPlan } from "@ziffr/core/pack-setup-plan";

const field = "h-8 w-full min-w-0 rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";

/** The lines of one Repeat, with a way to add one, paste several and take one away; `one` asks for exactly one line,
 * as when adding to what was set up. */
export function RepeatLines({ repeat, rows, onChange, plan, chosen, one = false }: {
  one?: boolean; repeat: { key: string; name: string; max: number }; rows: LineRow[]; onChange: (rows: LineRow[]) => void;
  plan: PackSetupPlan | null; chosen: (row: LineRow, position: string) => string[];
}) {
  const [pasted, setPasted] = useState("");
  const positions = (plan?.positions ?? []).filter((p) => p.repeat === repeat.key);
  const set = (id: number, patch: Partial<LineRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const full = rows.length >= repeat.max;
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium">{one ? `The new ${repeat.name}` : `List each ${repeat.name}`}</legend>
      <p className="text-xs text-muted-foreground">{one ? "It gets" : "Each line gets"} its own Metrics. Its name appears in their names, read by everyone who sees them, Guests included.{one ? "" : ` At most ${repeat.max} lines.`}</p>
      <ol className="space-y-2">
        {rows.map((row, i) => {
          const called = row.name.trim() || `line ${i + 1}`;
          return (
            <li key={row.id} className="space-y-1.5 rounded-[var(--radius-input)] border border-input p-2">
              <div className="flex items-center gap-2">
                <input className={field} value={row.name} maxLength={60} placeholder={`Name of the ${repeat.name}`} aria-label={`Name of ${repeat.name} line ${i + 1}`}
                  onChange={(e) => set(row.id, { name: e.target.value })}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (one || !text.includes("\n")) return;
                    // A column pasted into a name becomes its own lines.
                    e.preventDefault();
                    onChange(addedLines(rows.filter((r) => r.id !== row.id || r.name.trim()), text, repeat.max));
                  }} />
                {!one && <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${called}`} onClick={() => onChange(rows.filter((r) => r.id !== row.id))}><Trash2 aria-hidden /></Button>}
              </div>
              {plan && positions.map((p) => (
                <PositionField key={p.key} position={p} people={plan.people} of={called} chosen={chosen(row, p.key)} onChange={(ids) => set(row.id, { fills: { ...row.fills, [p.key]: ids } })} />
              ))}
            </li>
          );
        })}
      </ol>
      {!one && (
        <>
          <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => onChange([...rows, { id: Math.max(0, ...rows.map((r) => r.id)) + 1, name: "", fills: {} }])}><Plus aria-hidden /> Add a line</Button>
          <details className="text-xs">
            <summary className="cursor-pointer">Paste a list of names</summary>
            <div className="mt-1 space-y-1.5">
              <textarea className="min-h-24 w-full rounded-[var(--radius-input)] border border-input bg-transparent p-2 text-sm" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label={`Names of several ${repeat.name} lines, one on each line`} placeholder="One name on each line" />
              <Button type="button" variant="outline" size="sm" disabled={!pasted.trim() || full} onClick={() => { onChange(addedLines(rows.filter((r) => r.name.trim() || Object.values(r.fills).some((x) => x.length)), pasted, repeat.max)); setPasted(""); }}>Add these lines</Button>
            </div>
          </details>
        </>
      )}
    </fieldset>
  );
}
