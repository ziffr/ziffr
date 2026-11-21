"use client";
// The workspace's clock in the workspace settings (spec 0005 #84, moved by spec 0006; GLOSSARY: Workflow): the time zone its days are
// counted in and the hour its Workflows run each morning. Owners and Admins change it; others see it.
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { setWorkspaceClock } from "@/app/team-actions";

const field = "rounded-[var(--radius-input)] border border-border bg-background px-2 py-1.5 text-sm";

/** The time zone and run hour, with a form for those who may change them. */
export function WorkspaceClock({ timeZone, runHour, weekStart, canEdit }: { timeZone: string; runHour: number; weekStart: 0 | 1; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [zone, setZone] = useState(timeZone);
  const [hour, setHour] = useState(runHour);
  const [first, setFirst] = useState<0 | 1>(weekStart);
  // The zones this browser knows; the server checks the one picked again.
  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return ["UTC", ...all.filter((z) => z !== "UTC")];
  }, []);
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <section aria-labelledby="clock-heading" className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="clock-heading" className="font-medium">Workspace time</h2>
        <p className="text-sm text-muted-foreground">Which day it is for this team, the hour its Workflows ask, remind and escalate each morning, and the first day of the week in the Schedule.</p>
      </div>
      {canEdit ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => { try { unwrap(await setWorkspaceClock({ timeZone: zone, runHour: hour, weekStart: first })); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: shown(err) }); } }); }}>
          <label className="text-xs text-muted-foreground">Time zone
            <select value={zone} onChange={(e) => setZone(e.target.value)} className={`${field} mt-1 block`}>{(zones.includes(zone) ? zones : [zone, ...zones]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select>
          </label>
          <label className="text-xs text-muted-foreground">Workflows run at
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={`${field} mt-1 block`}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
          </label>
          <label className="text-xs text-muted-foreground">Week starts on
            <select value={first} onChange={(e) => setFirst(Number(e.target.value) === 0 ? 0 : 1)} className={`${field} mt-1 block`}><option value={1}>Monday</option><option value={0}>Sunday</option></select>
          </label>
          <Button type="submit" variant="outline" disabled={pending || (zone === timeZone && hour === runHour && first === weekStart)}>Save</Button>
        </form>
      ) : (
        <p className="text-sm">{timeZone.replace(/_/g, " ")}, Workflows run at {hh(runHour)}, weeks start on {weekStart === 0 ? "Sunday" : "Monday"}.</p>
      )}
    </section>
  );
}
