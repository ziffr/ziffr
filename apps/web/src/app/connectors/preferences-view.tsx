"use client";
// Workspace → Connectors → Who gets what (GLOSSARY: Delivery Preference): which Connector each person gets each kind of
// message on, and the team default. Everyone chooses for themselves; Owners and Admins set the team default.
import { isActionError } from "@/lib/action-error";
import { useTransition } from "react";
import { toast } from "sonner";
import { setPreference } from "@/app/connector-actions";
import { CONNECTORS, CONNECTOR_IDS, type ConnectorId, type PreferenceKind } from "@ziffr/core/connectors/index";
import type { Profile } from "@ziffr/core/types";
import { PromptWays } from "./prompt-ways";

export type PrefRow = { user_id: string | null; kind: PreferenceKind; connector: ConnectorId };

const KINDS: { id: PreferenceKind; label: string }[] = [
  { id: "question", label: "Questions" },
  { id: "task", label: "Tasks" },
  { id: "reminder", label: "Prompts and reminders" },
  { id: "update", label: "Replies and updates" },
];

/** The table of who gets what, where. */
export function Preferences({ viewer, isOwner, people, prefs }: { viewer: string; isOwner: boolean; people: Profile[]; prefs: PrefRow[] }) {
  const [pending, start] = useTransition();
  const pref = (user: string | null, kind: PreferenceKind) => prefs.find((p) => p.user_id === user && p.kind === kind)?.connector ?? null;
  // Prompts go by every way in a person's list, in order (prefs arrive in their order).
  const list = (user: string | null, kind: PreferenceKind) => prefs.filter((p) => p.user_id === user && p.kind === kind).map((p) => p.connector);
  const save = (user: string | null, kind: PreferenceKind, next: ConnectorId | ConnectorId[] | null) => start(async () => { const r = await setPreference(user, kind, next); if (isActionError(r)) toast.error("Not saved", { description: r.error }); });
  return (
  <section aria-labelledby="p-h">
    <h2 id="p-h" className="text-[length:var(--text-lg)]">Who gets what, where</h2>
    <p className="mt-1 mb-3 max-w-prose text-sm text-muted-foreground">Everyone chooses how Ziffr reaches them; the team default covers the rest. A request for a value can go up to three ways at once, such as Slack and email: the first answer counts, and reminders go the first way only. Replies stay where a question or task started. Whoever asks can pick another way for one message.</p>
    <div className="overflow-x-auto">
      {/* On a phone each person is a card, with a labelled choice under their name for each kind of message. */}
      <table className="w-full text-sm max-sm:block sm:min-w-[40rem]">
        <thead className="max-sm:sr-only">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Person</th>
            {KINDS.map((k) => <th key={k.id} className="py-2 pr-3 font-medium">{k.label}</th>)}
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {[{ id: null as string | null, label: "Team default", can: isOwner }, ...people.filter((p) => !p.contact).map((p) => ({ id: p.id as string | null, label: p.name, can: p.id === viewer }))].map((row) => (
            <tr key={row.id ?? "team"} className="border-t border-border max-sm:block max-sm:py-2">
              <th scope="row" className="py-2 pr-3 text-left font-medium max-sm:block max-sm:pb-0">{row.label}{row.id === viewer && <span className="font-normal text-muted-foreground">, you</span>}</th>
              {KINDS.map((k) => (
                <td key={k.id} className="py-2 pr-3 max-sm:block max-sm:pr-0 max-sm:pb-0">
                  <span aria-hidden className="mb-1 block text-xs text-muted-foreground sm:hidden">{k.label}</span>
                  {k.id === "reminder" ? (
                    <PromptWays list={list(row.id, k.id)} teamDefault={list(null, k.id)} team={row.id === null} disabled={!row.can || pending} label={`${k.label} for ${row.label}`} onChange={(next) => save(row.id, k.id, next)} />
                  ) : (
                  <select
                    aria-label={`${k.label} for ${row.label}`}
                    disabled={!row.can || pending}
                    value={pref(row.id, k.id) ?? ""}
                    onChange={(e) => save(row.id, k.id, (e.target.value || null) as ConnectorId | null)}
                    className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 disabled:opacity-70"
                  >
                    {row.id !== null && <option value="">Team default ({CONNECTORS[pref(null, k.id) ?? "email"].label})</option>}
                    {CONNECTOR_IDS.map((c) => <option key={c} value={c}>{CONNECTORS[c].label}</option>)}
                  </select>
                  )}
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
