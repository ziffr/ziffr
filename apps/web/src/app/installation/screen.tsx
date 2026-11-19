"use client";
// The Installation settings page (spec 0025; GLOSSARY: Installation Settings, Installation Admin): one section per
// thing the Installation talks to, its Installation Admins and what was changed. It gets no secret value from the
// server, only whether one is set and at most its last four characters; the core checks every change again.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/relative-time";
import { addInstallationAdmin, removeInstallationAdmin, saveInstallationSettings, sendTestEmail } from "@/app/installation-actions";
import type { InstallationAdminRow, InstallationEvent } from "@ziffr/core/installation-admins";
import type { InstallationSettingsView, SectionView, SettingView } from "@ziffr/core/installation-settings";

/** The words the page uses for each kind of event of the Installation's audit. */
const EVENT_WORDS: Record<string, string> = {
  "installation.claimed": "claimed the Installation with the setup code",
  "installation_admin.added": "made an Installation Admin:",
  "installation_admin.removed": "removed the Installation Admin",
  "setting.set": "set",
  "setting.removed": "removed",
  "setting.test_email": "sent a test email with",
};

type Result = { error: string } | { ok: true; message?: string };

/** Runs an action and says how it went; true when it worked. */
async function report(p: Promise<Result>, done: string): Promise<boolean> {
  const r = await p;
  if ("error" in r) { toast.error("Not done", { description: r.error }); return false; }
  toast.success(r.message ?? done);
  return true;
}

/** A word for how a section stands, never a coloured dot alone. */
function Standing({ section }: { section: SectionView }) {
  const word = section.working ? "Working" : section.ready ? "Not set up" : "Set on the server for now";
  return <span className={section.working ? "pressed text-xs" : "inline-flex items-center rounded-[var(--radius-input)] border border-[var(--color-rule-2)] px-1.5 text-xs text-[var(--color-ink-2)]"}>{word}</span>;
}

/** The whole page: the sections in a side list, the Installation Admins, each section, and the latest changes. */
export function InstallationScreen({ view, admins, events }: { view: InstallationSettingsView; admins: InstallationAdminRow[]; events: InstallationEvent[] }) {
  return (
    <div className="grid gap-8 md:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="Sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1 md:sticky md:top-20 md:flex-col">
          <li><a href="#admins" className="flex min-h-9 items-center whitespace-nowrap rounded-[var(--radius-input)] px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">Installation Admins</a></li>
          {view.sections.map((s) => (
            <li key={s.id}><a href={`#${s.id}`} className="flex min-h-9 items-center whitespace-nowrap rounded-[var(--radius-input)] px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{s.title}</a></li>
          ))}
          <li><a href="#changes" className="flex min-h-9 items-center whitespace-nowrap rounded-[var(--radius-input)] px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">Changes</a></li>
        </ul>
      </nav>
      <div className="min-w-0 space-y-12">
        <AdminsSection admins={admins} />
        {view.sections.map((s) => <Section key={s.id} section={s} canSeal={view.canSeal} />)}
        <section id="changes" aria-labelledby="changes-heading" className="scroll-mt-20 space-y-3">
          <h2 id="changes-heading" className="text-lg font-medium">Changes</h2>
          <p className="text-sm text-muted-foreground">Who changed what here, by the setting&apos;s name. Values are never recorded.</p>
          {events.length ? (
            <ul className="divide-y divide-border text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex flex-wrap gap-x-2 py-2">
                  <span className="font-medium">{e.actorName}</span>
                  <span>{EVENT_WORDS[e.kind] ?? e.kind}</span>
                  {e.subject && <span className={e.kind.startsWith("setting.") ? "font-mono text-xs leading-5" : ""}>{e.subject}</span>}
                  <RelativeTime at={e.at} className="ml-auto text-muted-foreground" />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm">Nothing yet.</p>}
        </section>
      </div>
    </div>
  );
}

/** The Installation Admins: who they are, adding one by address, removing one added here. */
function AdminsSection({ admins }: { admins: InstallationAdminRow[] }) {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const removable = admins.filter((a) => a.from === "page").length;
  const serverNamed = admins.some((a) => a.from === "server");
  return (
    <section id="admins" aria-labelledby="admins-heading" className="scroll-mt-20 space-y-3">
      <h2 id="admins-heading" className="text-lg font-medium">Installation Admins</h2>
      <p className="max-w-[62ch] text-sm text-muted-foreground">They run this Ziffr: they see this page and change what it talks to. Being one shows no Workspace&apos;s data; Owners of Workspaces are not Installation Admins by being Owners.</p>
      <ul className="divide-y divide-border rounded-[var(--radius-card,0.5rem)] border border-border text-sm">
        {admins.map((a) => (
          <li key={`${a.from}-${a.personId ?? a.email}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="font-medium">{a.name}{a.you && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
            {a.email && a.email !== a.name && <span className="text-muted-foreground">{a.email}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{a.from === "server" ? "Named on the server" : a.addedAt ? <>Added <RelativeTime at={a.addedAt} /></> : null}</span>
            {a.from === "page" && a.personId && (
              <Button
                type="button" size="sm" variant="outline"
                disabled={pending || (removable <= 1 && !serverNamed)}
                title={removable <= 1 && !serverNamed ? "The last Installation Admin stays. Add another one first." : undefined}
                onClick={() => {
                  if (a.you && !window.confirm("Remove yourself? You will no longer see this page.")) return;
                  start(async () => { if (await report(removeInstallationAdmin(a.personId!), `${a.name} is no Installation Admin any more.`)) router.refresh(); });
                }}
              >Remove</Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => { if (await report(addInstallationAdmin(email), "Added.")) { setEmail(""); router.refresh(); } });
        }}
      >
        <label className="min-w-0 flex-1 text-xs text-muted-foreground">Add someone who has signed in here, by their email address
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className="mt-1" />
        </label>
        <Button type="submit" variant="outline" disabled={pending || !email.trim()}>Add</Button>
      </form>
    </section>
  );
}

/** One section: what it is for, how it stands, and its form when the page can set it up yet. */
function Section({ section, canSeal }: { section: SectionView; canSeal: boolean }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${section.id}-heading`} className="text-lg font-medium">{section.title}</h2>
        <Standing section={section} />
      </div>
      <p className="max-w-[62ch] text-sm text-muted-foreground">{section.purpose}</p>
      {section.ready
        ? <SectionForm section={section} canSeal={canSeal} />
        : <p className="max-w-[62ch] text-sm">This page cannot set it up yet. Until it can, it is set in the server&apos;s environment, as the self-hosting guide says.</p>}
    </section>
  );
}

/** The form of a section: each setting with where its value comes from. A secret field starts empty; left empty, the
 * saved secret stays. Only changed fields are sent. */
function SectionForm({ section, canSeal }: { section: SectionView; canSeal: boolean }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const changes = Object.fromEntries(Object.entries(draft).filter(([name, v]) => {
    const s = section.settings.find((x) => x.name === name)!;
    return v.trim() !== "" && (s.secret || v.trim() !== (s.value ?? ""));
  }));
  const save = (values: Record<string, string | null>, done: string) => start(async () => {
    if (await report(saveInstallationSettings(section.id, values), done)) { setDraft({}); router.refresh(); }
  });
  return (
    <div className="space-y-4">
      {!canSeal && section.settings.some((s) => s.secret) && (
        <p role="status" className="max-w-[62ch] text-sm">This server has no ZIFFR_SECRETS_KEY, so secret settings cannot be saved here. Docker makes one on first start; elsewhere, set it on the server.</p>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); if (Object.keys(changes).length) save(changes, "Saved. It works from now on, without a restart."); }}
      >
        {section.settings.map((s) => (
          <Field key={s.name} setting={s} value={draft[s.name] ?? (s.secret ? "" : s.value ?? "")} disabled={pending} onChange={(v) => setDraft((d) => ({ ...d, [s.name]: v }))}
            onRemove={() => { if (window.confirm(`Remove ${s.label} from this page?`)) save({ [s.name]: null }, `${s.label} removed.`); }} />
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !Object.keys(changes).length}>Save</Button>
          {section.id === "mail" && (
            <Button type="button" variant="outline" disabled={pending || !section.working || Object.keys(changes).length > 0}
              title={Object.keys(changes).length ? "Save first" : undefined}
              onClick={() => start(async () => { await report(sendTestEmail(), "Sent."); router.refresh(); })}>
              Send a test email to yourself
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/** One setting: its label, where its value comes from, and a field unless the server sets it. */
function Field({ setting: s, value, disabled, onChange, onRemove }: { setting: SettingView; value: string; disabled: boolean; onChange: (v: string) => void; onRemove: () => void }) {
  const id = `setting-${s.name}`;
  const from = s.source === "server" ? "Set on the server; it wins over this page. Change it there."
    : s.source === "page" ? (s.secret ? `Saved here${s.hint ? `, ends in …${s.hint}` : ""}. Type a new one to replace it.` : "Saved here.")
      : s.source === "default" ? "Not set: the Installation's default is used." : "Not set.";
  return (
    <div className="max-w-xl space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{s.label} <span className="font-mono text-xs font-normal text-muted-foreground">{s.name}</span></label>
      <p className="text-xs text-muted-foreground">{s.help}</p>
      {s.source === "server" ? (
        <p id={id} className="rounded-[var(--radius-input)] border border-dashed border-border px-2 py-1.5 text-sm">{s.secret ? "Set on the server" : s.value}</p>
      ) : (
        <div className="flex gap-2">
          <Input id={id} type={s.secret ? "password" : "text"} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={1000}
            autoComplete={s.secret ? "new-password" : "off"} spellCheck={false} placeholder={s.secret && s.source === "page" ? "Saved: leave empty to keep it" : s.placeholder} />
          {s.source === "page" && <Button type="button" variant="outline" disabled={disabled} onClick={onRemove}>Remove</Button>}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{from}{s.unreadable ? " The saved value no longer opens with this server's ZIFFR_SECRETS_KEY: save it again." : ""}</p>
    </div>
  );
}
