"use client";
// Workspace → Connectors → Who gets what (GLOSSARY: Delivery Preference): which Connector each person gets each kind of
// message on, and the team default. Everyone chooses for themselves; Owners and Admins set the team default.
import { isActionError } from "@/lib/action-error";
import { useTransition } from "react";
import { toast } from "sonner";
import { setPreference } from "@/app/connector-actions";
import { CONNECTORS, CONNECTOR_IDS, type ConnectorId, type PreferenceKind } from "@ziffr/core/connectors/index";
import type { Profile } from "@ziffr/core/types";

export type PrefRow = { user_id: string | null; kind: PreferenceKind; connector: ConnectorId };

const KINDS: { id: PreferenceKind; label: string }[] = [
  { id: "question", label: "Questions" },
  { id: "task", label: "Tasks" },
  { id: "reminder", label: "Reminders" },
  { id: "update", label: "Replies and updates" },
];

/** The table of who gets what, where. */
export function Preferences({ viewer, isOwner, people, prefs }: { viewer: string; isOwner: boolean; people: Profile[]; prefs: PrefRow[] }) {
  const [pending, start] = useTransition();
  const pref = (user: string | null, kind: PreferenceKind) => prefs.find((p) => p.user_id === user && p.kind === kind)?.connector ?? null;
  return (
  <section aria-labelledby="p-h">
    <h2 id="p-h" className="text-[length:var(--text-lg)]">Who gets what, where</h2>
    <p className="mt-1 mb-3 max-w-prose text-sm text-muted-foreground">Everyone chooses for themselves; the team default covers the rest. Replies about a question or task stay where it started, so a ticket collects its comments. Whoever asks can pick another way for one message.</p>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Person</th>
            {KINDS.map((k) => <th key={k.id} className="py-2 pr-3 font-medium">{k.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {[{ id: null as string | null, label: "Team default", can: isOwner }, ...people.filter((p) => !p.contact).map((p) => ({ id: p.id as string | null, label: p.name, can: p.id === viewer }))].map((row) => (
            <tr key={row.id ?? "team"} className="border-t border-border">
              <th scope="row" className="py-2 pr-3 text-left font-medium">{row.label}{row.id === viewer && <span className="font-normal text-muted-foreground">, you</span>}</th>
              {KINDS.map((k) => (
                <td key={k.id} className="py-2 pr-3">
                  <select
                    aria-label={`${k.label} for ${row.label}`}
                    disabled={!row.can || pending}
                    value={pref(row.id, k.id) ?? ""}
                    onChange={(e) => start(async () => { const r = await setPreference(row.id, k.id, (e.target.value || null) as ConnectorId | null); if (isActionError(r)) toast.error("Not saved", { description: r.error }); })}
                    className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 disabled:opacity-70"
                  >
                    {row.id !== null && <option value="">Team default ({CONNECTORS[pref(null, k.id) ?? "email"].label})</option>}
                    {CONNECTOR_IDS.map((c) => <option key={c} value={c}>{CONNECTORS[c].label}</option>)}
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
  );
}
