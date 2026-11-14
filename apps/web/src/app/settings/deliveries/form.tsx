"use client";
// Your Delivery Preferences, email and Away dates (spec 0006, ticket #95). The core lets a person set only their own.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setPreference } from "@/app/connector-actions";
import { setEmailReminders } from "@/app/settings-actions";
import { AwayDates } from "@/app/team/screen";
import { CONNECTORS, CONNECTOR_IDS, type ConnectorId, type PreferenceKind } from "@ziffr/core/connectors/index";

const KINDS: { id: PreferenceKind; label: string }[] = [
  { id: "question", label: "Questions" },
  { id: "task", label: "Tasks" },
  { id: "reminder", label: "Reminders" },
  { id: "update", label: "Replies and updates" },
];

type Pref = { kind: string; connector: string };

/** Your own Delivery Preferences, the switch for email, and your Away dates. `email` says whether Ziffr sends email. */
export function DeliveriesForm({ viewer, mine, team, optedOut, away, email }: { viewer: string; mine: Pref[]; team: Pref[]; optedOut: boolean; away: { starts: string; ends: string } | null; email: boolean }) {
  const [pending, start] = useTransition();
  const [stopped, setStopped] = useState(optedOut);
  const teamFor = (k: PreferenceKind) => (team.find((p) => p.kind === k)?.connector ?? "email") as ConnectorId;
  return (
    <div className="max-w-xl space-y-8">
      <section aria-labelledby="where-heading" className="space-y-3">
        <div>
          <h2 id="where-heading" className="font-medium">Where you get what</h2>
          <p className="text-sm text-muted-foreground">The team default covers what you leave open. Whoever asks can pick another way for one message.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((k) => (
            <label key={k.id} className="block text-sm font-medium">
              {k.label}
              <select
                defaultValue={mine.find((p) => p.kind === k.id)?.connector ?? ""}
                disabled={pending}
                onChange={(e) => start(async () => { try { await setPreference(viewer, k.id, (e.target.value || null) as ConnectorId | null); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: (err as Error).message }); } })}
                className="mt-1 block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 font-normal"
              >
                <option value="">Team default ({CONNECTORS[teamFor(k.id)].label})</option>
                {CONNECTOR_IDS.map((c) => <option key={c} value={c}>{CONNECTORS[c].label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section aria-labelledby="email-heading" className="space-y-2 border-t border-border pt-6">
        <h2 id="email-heading" className="font-medium">Requests for numbers by email</h2>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={!stopped}
            disabled={pending || (!email && !stopped)}
            onChange={(e) => { const on = e.target.checked; start(async () => { try { await setEmailReminders(on); setStopped(!on); toast.success(on ? "You get them by email again" : "Stopped by email"); } catch (err) { toast.error("Not saved", { description: (err as Error).message }); } }); }}
            className="mt-0.5 size-4 accent-[var(--color-ink)]"
          />
          <span>
            Send me Prompts and reminders by email in this workspace
            <span className="block text-muted-foreground">Questions, tasks and replies keep coming. When you stop, the owners of the Metrics you submit to are told once.</span>
          </span>
        </label>
        {!email && <p className="text-sm text-muted-foreground">This Ziffr sends no email{stopped ? "; you stopped it before." : "."}</p>}
      </section>

      <section aria-labelledby="away-heading" className="space-y-2 border-t border-border pt-6">
        <h2 id="away-heading" className="font-medium">Away</h2>
        <p className="text-sm text-muted-foreground">While you are away, Prompts meant for you go to your Stand-in.</p>
        <AwayDates userId={viewer} current={away ?? undefined} can />
      </section>
    </div>
  );
}
