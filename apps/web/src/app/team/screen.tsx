"use client";
// GLOSSARY: Contact, Away. Contacts (people without a login) and the Away dates of a person, shared with Your Deliveries.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addContact, removeContact } from "@/app/team-actions";
import { setAway } from "@/app/workflow-actions";
import type { Profile } from "@ziffr/core/types";
import { useConfirm } from "@/components/confirm-dialog";

/** People without a login who submit values by Slack, email or their form link (GLOSSARY: Contact). */
export function Contacts({ contacts, canEdit }: { contacts: Profile[]; canEdit: boolean }) {
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
    <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <input type="date" lang="en-GB" aria-label="Away from" value={starts} disabled={!can || pending} onChange={(e) => { setStarts(e.target.value); if (ends && e.target.value) save(e.target.value, ends); }} className={field} />
      to
      <input type="date" lang="en-GB" aria-label="Away until" value={ends} min={starts || undefined} disabled={!can || pending} onChange={(e) => { setEnds(e.target.value); if (starts && e.target.value) save(starts, e.target.value); }} className={field} />
      {can && (starts || ends) && <button type="button" onClick={() => { setStarts(""); setEnds(""); save("", ""); }} className="underline">Clear</button>}
    </span>
  );
}
