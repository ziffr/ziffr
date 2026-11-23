"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addContact, createGroup, deleteGroup, removeContact, renameGroup, setMember } from "@/app/team-actions";
import { setAway } from "@/app/workflow-actions";
import type { Group, Profile } from "@ziffr/core/types";
import { BUSINESS_FUNCTION_LABELS, type BusinessFunction } from "@ziffr/pack/business-functions";
import { useConfirm } from "@/components/confirm-dialog";

export function TeamScreen({ people, contacts, groups, canEdit, viewer, away, functions }: { people: Profile[]; contacts: Profile[]; groups: Group[]; canEdit: boolean; viewer: string; away: { user_id: string; starts: string; ends: string }[];
  /** Each member's Business Function: given only to Owners and Admins (null for everyone else, who see no column). */
  functions: { personId: string; function: BusinessFunction }[] | null }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { unwrap(await f()); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  const { confirm, dialog } = useConfirm();

  return (
    <div className="space-y-6">
      {dialog}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Person</th>
              <th className="py-2 pr-3 font-medium">Away</th>
              {functions && <th className="py-2 pr-3 font-medium">Works in</th>}
              {groups.map((g) => (
                <th key={g.id} className="py-2 pr-3 font-medium">
                  {canEdit ? (
                    <span className="flex items-center gap-1">
                      <input
                        aria-label={`Name of ${g.name}`}
                        defaultValue={g.name}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== g.name) run(() => renameGroup(g.id, e.target.value)); }}
                        className="h-8 w-28 rounded-[var(--radius-input)] bg-transparent px-1 font-medium text-foreground hover:bg-muted focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-ring"
                      />
                      <button type="button" aria-label={`Delete ${g.name}`} title="Delete group" disabled={pending} onClick={async () => { if (await confirm({ title: `Delete the group ${g.name}?`, description: "What was shared with it stops being shared, and threads limited to it become readable by everyone.", confirmLabel: "Delete group" })) run(() => deleteGroup(g.id), "Group deleted"); }} className="flex size-7 items-center justify-center rounded-[var(--radius-input)] hover:bg-muted"><Trash2 className="size-3.5" /></button>
                    </span>
                  ) : g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <th scope="row" className="py-2 pr-3 text-left font-medium">{p.name}<span className="block text-xs font-normal text-muted-foreground">{p.role}</span></th>
                <td className="py-2 pr-3"><AwayDates userId={p.id} current={away.find((a) => a.user_id === p.id)} can={canEdit || p.id === viewer} /></td>
                {functions && <td className="py-2 pr-3">{labelFor(functions, p.id)}</td>}
                {groups.map((g) => (
                  <td key={g.id} className="py-2 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`${p.name} in ${g.name}`}
                      checked={g.members.includes(p.id)}
                      disabled={!canEdit || pending}
                      onChange={(e) => run(() => setMember(g.id, p.id, e.target.checked))}
                      className="size-4 accent-[var(--color-ink)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { unwrap(await createGroup(name)); setName(""); }, "Group created"); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group, e.g. Finance" aria-label="New group name" />
          <Button type="submit" variant="outline" disabled={pending || !name.trim()}><Plus aria-hidden /> Add</Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners and admins of the workspace change groups.</p>
      )}
      <Contacts contacts={contacts} canEdit={canEdit} />
    </div>
  );
}

/** One member's Business Function in words, or a dash when they gave none. */
function labelFor(functions: { personId: string; function: BusinessFunction }[], id: string) {
  const f = functions.find((x) => x.personId === id);
  return f ? BUSINESS_FUNCTION_LABELS[f.function] : <span className="text-muted-foreground">–</span>;
}

/** People without a login who submit values by Slack, email or their form link (GLOSSARY: Contact). */
function Contacts({ contacts, canEdit }: { contacts: Profile[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const empty = { name: "", email: "", slackHandle: "", phone: "" };
  const [form, setForm] = useState(empty);
  const run = (f: () => Promise<unknown>, ok: string) => start(async () => { try { unwrap(await f()); toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  const { confirm, dialog } = useConfirm();
  const field = (key: keyof typeof empty, label: string, placeholder: string, type = "text") => (
    <label className="block text-xs text-muted-foreground">
      {label}
      <Input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} className="mt-1" />
    </label>
  );
  return (
    <section aria-labelledby="contacts-heading" className="space-y-3 border-t border-border pt-6">
      {dialog}
      <div>
        <h2 id="contacts-heading" className="font-medium">Contacts</h2>
        <p className="text-sm text-muted-foreground">People without a login, such as a field worker or an outside bookkeeper. They submit values by Slack, email or their form link, and the values are recorded under their name. They see nothing in Ziffr.</p>
      </div>
      {contacts.length ? (
        <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">{[c.email, c.slack_handle, c.phone].filter(Boolean).join(", ")}</span>
              {canEdit && (
                <button type="button" disabled={pending} onClick={async () => { if (await confirm({ title: `Remove ${c.name}?`, description: "Their values stay. Their form link stops working and they can no longer submit values.", confirmLabel: "Remove contact" })) run(() => removeContact(c.id), "Contact removed"); }} className="ml-auto flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Remove ${c.name}`} title="Remove contact">
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No contacts yet.</p>
      )}
      {canEdit && (
        <form className="grid max-w-2xl gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); run(async () => { unwrap(await addContact(form)); setForm(empty); }, "Contact added"); }}>
          {field("name", "Name", "e.g. Cleo Brandt")}
          {field("email", "Email", "cleo@example.com", "email")}
          {field("slackHandle", "Slack handle", "@cleo")}
          {field("phone", "Phone", "+49 151 …", "tel")}
          <Button type="submit" variant="outline" className="sm:col-span-4 sm:justify-self-start" disabled={pending || !form.name.trim()}><Plus aria-hidden /> Add contact</Button>
        </form>
      )}
    </section>
  );
}

/** While someone is away, their Prompts go to their Stand-in (GLOSSARY: Away). */
export function AwayDates({ userId, current, can }: { userId: string; current?: { starts: string; ends: string }; can: boolean }) {
  const [starts, setStarts] = useState(current?.starts ?? "");
  const [ends, setEnds] = useState(current?.ends ?? "");
  const [pending, start] = useTransition();
  const save = (s: string, e: string) => start(async () => { try { unwrap(await setAway(userId, s || null, e || null)); if (s && e) toast.success("Away dates saved"); } catch (err) { toast.error("Not saved", { description: shown(err) }); } });
  const field = "h-8 rounded-[var(--radius-input)] border border-input bg-card px-1.5 text-xs disabled:opacity-60";
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <input type="date" lang="en-GB" aria-label="Away from" value={starts} disabled={!can || pending} onChange={(e) => { setStarts(e.target.value); if (ends && e.target.value) save(e.target.value, ends); }} className={field} />
      to
      <input type="date" lang="en-GB" aria-label="Away until" value={ends} min={starts || undefined} disabled={!can || pending} onChange={(e) => { setEnds(e.target.value); if (starts && e.target.value) save(starts, e.target.value); }} className={field} />
      {can && (starts || ends) && <button type="button" onClick={() => { setStarts(""); setEnds(""); save("", ""); }} className="underline">Clear</button>}
    </span>
  );
}
