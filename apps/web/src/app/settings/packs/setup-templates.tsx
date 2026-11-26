"use client";
// The Dashboard and Workflow Templates picked in Set up from this Pack, for the whole set or once for each line of a
// Repeat (GLOSSARY: Dashboard Template, Slot, Workflow Template, Approver, Repeat), and the Slots and Approvers a pick
// still asks for. The core checks every choice again.
import type { PackSetupOptions } from "@ziffr/core/pack-setup";
import { openSlots } from "./setup-defaults";

const field = "h-8 max-w-full rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";

type Dashboard = PackSetupOptions["dashboards"][number];
type Flow = PackSetupOptions["workflows"][number];

/** One dashboard of those offered for a scope, or none, with a Metric to pick for each Slot nothing made here fills. */
export function DashboardPick({ options, of, value, onChange, making, fills, onFill }: {
  options: PackSetupOptions; /** The Repeat whose lines each get one, or null for the whole set. */ of: { key: string; name: string } | null; value: string; onChange: (key: string) => void;
  making: ReadonlySet<string>; fills: Record<string, number>; onFill: (slot: string, metric: number) => void;
}) {
  const offered = options.dashboards.filter((d) => d.repeat === (of?.key ?? null));
  if (!offered.length) return null;
  const template: Dashboard | undefined = offered.find((d) => d.key === value);
  const label = of ? `Dashboard for each ${of.name}` : "Dashboard";
  const open = template ? openSlots(options, template, making) : [];
  return (
    <div className="space-y-1.5">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={field} aria-label={label}>
          <option value="">None</option>
          {offered.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
        </select>
      </label>
      {open.length > 0 && <p className="text-xs text-muted-foreground">These Slots suggest no Metric you make here: fill them with one you have.</p>}
      {open.map(({ slot, index }) => (
        <label key={index} className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-xs">{slot.label}</span>
          <select value={fills[`${template!.key} ${index}`] ?? ""} onChange={(e) => onFill(`${template!.key} ${index}`, Number(e.target.value))} className={field} aria-label={`Slot ${slot.label}${of ? ` of the dashboard for each ${of.name}` : ""}`}>
            <option value="">Pick a Metric…</option>
            {options.metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

/** One Workflow of those offered for a scope, or none, with the Approvers to pick where no Position names them. */
export function WorkflowPick({ options, of, value, onChange, approvers, onApprovers }: {
  options: PackSetupOptions; of: { key: string; name: string } | null; value: string; onChange: (key: string) => void;
  approvers: (flow: Flow) => string[]; onApprovers: (flow: string, ids: string[]) => void;
}) {
  const offered = options.workflows.filter((w) => w.repeat === (of?.key ?? null));
  if (!offered.length) return null;
  const flow = offered.find((w) => w.key === value);
  const label = of ? `Workflow for each ${of.name}` : "Workflow";
  const picked = flow ? approvers(flow) : [];
  return (
    <div className="space-y-1.5">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={field} aria-label={label}>
          <option value="">None</option>
          {offered.map((w) => <option key={w.key} value={w.key}>{w.name}</option>)}
        </select>
      </label>
      {flow && flow.approvers > 0 && <p className="text-xs text-muted-foreground">Its Approve step asks for {flow.approvers === 1 ? "an Approver" : `${flow.approvers} Approvers, in order`}, members of this Workspace.</p>}
      {picked.map((a, i) => {
        const name = `Approver ${i + 1}${of ? ` of the Workflow for each ${of.name}` : ""}`;
        return (
          <label key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-44 text-xs">Approver {i + 1}</span>
            <select value={a} onChange={(e) => onApprovers(flow!.key, picked.map((x, k) => (k === i ? e.target.value : x)))} className={field} aria-label={name}>
              <option value="">Pick a person…</option>
              {options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        );
      })}
    </div>
  );
}
