"use client";
// The questions of a picked Method, in words (GLOSSARY: Slot, Method; spec 0041, ticket 16): which Metric is the one to explain, which
// might move it, the day it started, the value wanted. Each Slot starts filled from the canvas; each setting has its range and a hint
// and takes nothing the Method cannot use. The Metrics to choose from are the canvas Metrics the core gave for this person.
// What is typed here is only a request: the core reads it again, with its limits, on the server.
import type { CanvasMetric, EntryView } from "@ziffr/core/analysis-picker";
import type { SettingDef, SlotDef } from "@ziffr/core/method-picker";
import { questionFor, type Picked } from "@ziffr/core/method-picker-names";

const FIELD = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";

/** What the person has chosen so far: the Metrics of each Slot, and each setting as typed. */
export type Answers = { slots: Record<string, number[]>; settings: Record<string, string> };

/** The Method's question in the words of the Metrics chosen so far (the generic words where a Slot is empty). */
export function titleOf(e: EntryView, a: Answers, canvas: CanvasMetric[]): string {
  const nm = (slot: string) => canvas.find((m) => m.id === a.slots[slot]?.[0])?.name;
  const picked: Picked = { metric: nm("metric"), first: nm("first"), second: nm("second"), held: (a.slots.held ?? []).flatMap((id) => canvas.find((m) => m.id === id)?.name ?? []), metrics: (a.slots.metrics ?? []).flatMap((id) => canvas.find((m) => m.id === id)?.name ?? []), goal: a.settings.goal, by: a.settings.by, percent: a.settings.percent };
  return questionFor(e.id, picked, e.generic);
}

/** The starting answers of a Method: its Slots filled from the canvas, its settings at their defaults. */
export function startAnswers(e: EntryView): Answers {
  const settings: Record<string, string> = {};
  for (const s of e.settings) if (s.kind === "whole" && s.default !== null) settings[s.id] = String(s.default);
  return { slots: Object.fromEntries(Object.entries(e.defaults).map(([k, v]) => [k, [...v]])), settings };
}

/** A Metric is chosen once for a Method: choosing it for one Slot takes it out of the others. */
function chooseFor(answers: Answers, slot: string, ids: number[]): Answers {
  const slots = Object.fromEntries(Object.entries(answers.slots).map(([k, v]) => [k, k === slot ? ids : v.filter((i) => !ids.includes(i))]));
  return { ...answers, slots };
}

function SlotQuestion({ slot, canvas, chosen, onChange }: { slot: SlotDef; canvas: CanvasMetric[]; chosen: number[]; onChange: (ids: number[]) => void }) {
  if (slot.many) {
    return (
      <fieldset className="text-xs text-muted-foreground">
        <legend className="mb-1">{slot.question} <span>(up to {slot.many.max})</span></legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {canvas.map((m) => (
            <label key={m.id} className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={chosen.includes(m.id)}
                onChange={(ev) => onChange(ev.target.checked ? [...chosen, m.id] : chosen.filter((i) => i !== m.id))}
              />
              <span dir="auto" className="break-words">{m.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="block text-xs text-muted-foreground">{slot.question}
      <select value={chosen[0] ?? ""} onChange={(ev) => onChange(ev.target.value === "" ? [] : [Number(ev.target.value)])} className={`mt-1 ${FIELD}`}>
        <option value="">{slot.optional ? "None" : "Choose a Metric"}</option>
        {canvas.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </label>
  );
}

function SettingQuestion({ def, value, onChange }: { def: SettingDef; value: string; onChange: (v: string) => void }) {
  const label = <>{def.question}{(def.kind === "whole" || !def.required) && <span> (optional)</span>}</>;
  return (
    <label className="block text-xs text-muted-foreground">{label}
      {def.kind === "date" ? (
        <input type="date" lang="en-GB" min="1970-01-01" max="2100-12-31" value={value} onChange={(ev) => onChange(ev.target.value)} className={`mt-1 ${FIELD}`} />
      ) : def.kind === "whole" ? (
        <input type="number" inputMode="numeric" min={def.min} max={def.max} step={1} value={value} onChange={(ev) => onChange(ev.target.value)} className={`mt-1 ${FIELD}`} />
      ) : (
        <input type="text" inputMode="decimal" autoComplete="off" value={value} onChange={(ev) => onChange(ev.target.value)} className={`mt-1 ${FIELD}`} />
      )}
      <span className="mt-0.5 block">{def.hint}{def.kind === "whole" && ` From ${def.min} to ${def.max}.`}</span>
    </label>
  );
}

/** The questions of one Method with a Run button. */
export function AskForm({ entry, title, canvas, answers, onChange, onRun, pending }: { entry: EntryView; title: string; canvas: CanvasMetric[]; answers: Answers; onChange: (a: Answers) => void; onRun: () => void; pending: boolean }) {
  return (
    <form
      aria-label={title}
      className="mt-3 space-y-3 border-t border-[var(--color-rule-2)] pt-3"
      onSubmit={(ev) => { ev.preventDefault(); onRun(); }}
    >
      {/* The row above already names the question; the title is repeated only when the chosen Metrics have changed it. */}
      {title !== entry.name && <h4 className="text-sm font-medium">{title}</h4>}
      <div className="grid gap-3">
        {entry.slots.map((s) => (
          <SlotQuestion key={s.id} slot={s} canvas={s.many ? canvas.filter((m) => !Object.entries(answers.slots).some(([k, v]) => k !== s.id && v.includes(m.id))) : canvas} chosen={answers.slots[s.id] ?? []} onChange={(ids) => onChange(chooseFor(answers, s.id, ids))} />
        ))}
        {entry.settings.map((d) => (
          <SettingQuestion key={d.id} def={d} value={answers.settings[d.id] ?? ""} onChange={(v) => onChange({ ...answers, settings: { ...answers.settings, [d.id]: v } })} />
        ))}
      </div>
      <button type="submit" disabled={pending} className="stock min-h-9 rounded-[var(--radius-stock)] px-3 text-sm disabled:opacity-50">{pending ? "Working it out…" : "Work it out"}</button>
    </form>
  );
}
