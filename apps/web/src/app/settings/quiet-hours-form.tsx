"use client";
// Quiet hours (ticket #519; GLOSSARY: Quiet Hours): the hours and days when Ziffr sends no Prompt, reminder or Alert.
// One form for a person's own (with their time zone and a way back to the Workspace's default) and for the Workspace's
// default (Owners and Admins; read in the Workspace's time zone).
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { NEVER_QUIET, WEEKDAYS, neverQuiet, type QuietRule } from "@ziffr/core/quiet-rules";

const field = "rounded-[var(--radius-input)] border border-border bg-background px-2 py-1.5 text-sm";
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
// Monday first, as people read a week; the rule counts Sunday as 0.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** The words for a rule, such as "19:00 to 07:00, and Saturday and Sunday". */
function describeRule(r: QuietRule): string {
  if (neverQuiet(r)) return "no quiet hours";
  const days = ORDER.filter((d) => r.days.includes(d)).map((d) => WEEKDAYS[d]);
  const hours = r.fromHour === r.toHour ? "" : `${hh(r.fromHour)} to ${hh(r.toHour)}`;
  return [hours, days.length ? `all day ${days.join(", ")}` : ""].filter(Boolean).join(", and ");
}

/** The quiet hours form. `rule` is what is saved for the person (`own`) or the Workspace, null while there is none;
 * `inherited` is the Workspace's default a person follows meanwhile; `save` writes a rule, and null clears it. */
export function QuietHoursForm({ rule, inherited, own, canEdit, workspaceTimeZone, save }: { rule: QuietRule | null; inherited: QuietRule | null; own: boolean; canEdit: boolean; workspaceTimeZone: string; save: (r: QuietRule | null) => Promise<unknown> }) {
  const [pending, start] = useTransition();
  const start0 = rule ?? inherited ?? NEVER_QUIET;
  const [from, setFrom] = useState(start0.fromHour);
  const [to, setTo] = useState(start0.toHour);
  const [days, setDays] = useState<number[]>(start0.days);
  const [zone, setZone] = useState<string>(rule?.timeZone ?? "");
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []), []);
  const run = (r: QuietRule | null, done: string) => start(async () => { try { unwrap(await save(r)); toast.success(done); } catch (err) { toast.error("Not saved", { description: shown(err) }); } });
  const current: QuietRule = { fromHour: from, toHour: to, days, timeZone: own ? zone || null : null };
  const allDays = days.length === 7;
  if (!canEdit && own) return <p className="text-sm">Quiet hours can&apos;t be changed in the demo.</p>;
  if (!canEdit) return <p className="text-sm">{rule ? `Quiet hours for everyone who sets none: ${describeRule(rule)}.` : "No quiet hours by default."}</p>;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!allDays) run(current, "Saved"); }}>
      {own && <p className="text-sm">{rule ? "Your own quiet hours." : inherited ? `You follow the Workspace's default: ${describeRule(inherited)}.` : "You have none, and the Workspace has no default."}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">From
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className={`${field} mt-1 block`}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
        </label>
        <label className="text-xs text-muted-foreground">Until
          <select value={to} onChange={(e) => setTo(Number(e.target.value))} className={`${field} mt-1 block`}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
        </label>
        {own && (
          <label className="text-xs text-muted-foreground">Time zone
            <select value={zone} onChange={(e) => setZone(e.target.value)} className={`${field} mt-1 block`}>
              <option value="">Workspace ({workspaceTimeZone.replace(/_/g, " ")})</option>
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </select>
          </label>
        )}
      </div>
      <fieldset>
        <legend className="text-xs text-muted-foreground">Quiet all day on</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {ORDER.map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} className="size-4 accent-[var(--color-ink)]" />
              {WEEKDAYS[d].slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>
      {allDays && <p role="alert" className="text-sm text-destructive">Leave at least one day open, or messages could never be sent.</p>}
      <p className="text-xs text-muted-foreground">From and Until the same hour means no quiet hours at night. {own ? "" : `Read in the Workspace's time zone, ${workspaceTimeZone.replace(/_/g, " ")}.`}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={pending || allDays}>Save</Button>
        {rule !== null && <Button type="button" variant="ghost" disabled={pending} onClick={() => run(null, own ? "Following the Workspace's default" : "Removed")}>{own ? "Use the Workspace's default" : "Remove"}</Button>}
      </div>
    </form>
  );
}
