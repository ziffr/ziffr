"use client";
// The workspace's clock on the Team page (spec 0005, ticket #84; GLOSSARY: Workflow): the time zone its days are
// counted in and the hour its Workflows run each morning. Owners and Admins change it; others see it.
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setWorkspaceClock } from "@/app/team-actions";

const field = "rounded-[var(--radius-input)] border border-border bg-background px-2 py-1.5 text-sm";

/** The time zone and run hour, with a form for those who may change them. */
export function WorkspaceClock({ timeZone, runHour, canEdit }: { timeZone: string; runHour: number; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [zone, setZone] = useState(timeZone);
  const [hour, setHour] = useState(runHour);
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
        <p className="text-sm text-muted-foreground">Which day it is for this team, and the hour its Workflows ask, remind and escalate each morning.</p>
      </div>
      {canEdit ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => { try { await setWorkspaceClock({ timeZone: zone, runHour: hour }); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: (err as Error).message }); } }); }}>
          <label className="text-xs text-muted-foreground">Time zone
            <select value={zone} onChange={(e) => setZone(e.target.value)} className={`${field} mt-1 block`}>{(zones.includes(zone) ? zones : [zone, ...zones]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select>
          </label>
          <label className="text-xs text-muted-foreground">Workflows run at
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={`${field} mt-1 block`}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
          </label>
          <Button type="submit" variant="outline" disabled={pending || (zone === timeZone && hour === runHour)}>Save</Button>
        </form>
      ) : (
        <p className="text-sm">{timeZone.replace(/_/g, " ")}, Workflows run at {hh(runHour)}.</p>
      )}
    </section>
  );
}
