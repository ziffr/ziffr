"use client";
// The Installation settings page (spec 0025; GLOSSARY: Installation Settings, Installation Admin): one section per
// thing the Installation talks to, its Installation Admins and what was changed. It gets no secret value from the
// server, only whether one is set and at most its last four characters; the core checks every change again.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/relative-time";
import { addInstallationAdmin, checkTelegram, makeInboundSecret, removeInstallationAdmin, replyTestStatus, saveInstallationSettings, sendTestEmail, startReplyTest, startTelegramTest, telegramTestStatus } from "@/app/installation-actions";
import type { MxView, ReplyTestStatus } from "@ziffr/core/installation-replies";
import type { TelegramTestStatus } from "@ziffr/core/installation-telegram-test";
import type { InstallationAdminRow, InstallationEvent } from "@ziffr/core/installation-admins";
import type { InstallationSettingsView, SectionView, SettingView, SlackSetupView } from "@ziffr/core/installation-settings";
import type { WorkspaceLimitRow } from "@ziffr/core/workspace-limits-admin";
import { WorkspaceLimits } from "./workspace-limits";

/** The words the page uses for each kind of event of the Installation's audit. */
const EVENT_WORDS: Record<string, string> = {
  "installation.claimed": "claimed the Installation with the setup code",
  "installation_admin.added": "made an Installation Admin:",
  "installation_admin.removed": "removed the Installation Admin",
  "setting.set": "set",
  "setting.removed": "removed",
  "setting.test_email": "sent a test email with",
  "setting.test_telegram": "tested Telegram with",
  "setting.test_replies": "tested replies by email with",
  "workspace.key_destroyed": "destroyed the key of a Workspace it is deleting:",
  "workspace_limit.set": "set the Workspace Limit of",
  "workspace_limit.removed": "gave the default limit back to",
};

type Result = { error: string } | { ok: true; message?: string; warning?: string };

/** Runs an action and says how it went; true when it worked, also when part of it needs attention. */
async function report(p: Promise<Result>, done: string): Promise<boolean> {
  const r = await p;
  if ("error" in r) { toast.error("Not done", { description: r.error }); return false; }
  if (r.warning) toast.warning(r.message ?? done, { description: r.warning, duration: 15_000 });
  else toast.success(r.message ?? done);
  return true;
}

/** A word for how a section stands, never a coloured dot alone. */
function Standing({ section }: { section: SectionView }) {
  // A section with a reason below it (a bot Telegram cannot send answers through, say) is not merely unset.
  // The demo not offered is a choice, not a fault.
  const word = section.working ? "Working" : !section.ready ? "Set on the server for now" : section.id === "demo" ? "Off" : section.detail ? "Not working" : "Not set up";
  return <span className={section.working ? "pressed text-xs" : "inline-flex items-center rounded-[var(--radius-input)] border border-[var(--color-rule-2)] px-1.5 text-xs text-[var(--color-ink-2)]"}>{word}</span>;
}

/** The whole page: the sections in a side list, the Installation Admins, each section, and the latest changes. */
/** What the Replies section shows beside its form: the replies domain's MX records now, and the latest test. */
type RepliesView = { mx: MxView | null; test: ReplyTestStatus };

export function InstallationScreen({ view, admins, events, limits, replies }: { view: InstallationSettingsView; admins: InstallationAdminRow[]; events: InstallationEvent[]; limits: WorkspaceLimitRow[]; replies: RepliesView }) {
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
        {view.sections.map((s) => <Section key={s.id} section={s} canSeal={view.canSeal} slack={s.id === "slack" ? view.slack : undefined} siteUrl={view.siteUrl} limits={s.id === "limits" ? limits : undefined} replies={s.id === "replies" ? replies : undefined} />)}
        <section id="changes" aria-labelledby="changes-heading" className="scroll-mt-20 space-y-3">
          <h2 id="changes-heading" className="text-lg font-medium">Changes</h2>
          <p className="text-sm text-muted-foreground">Who changed what here, by the setting&apos;s name. Values are never recorded.</p>
          {events.length ? (
            <ul className="divide-y divide-border text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex flex-wrap gap-x-2 py-2">
                  <span className="font-medium">{e.actorName}</span>
                  <span>{EVENT_WORDS[e.kind] ?? e.kind}</span>
                  {e.subject && <span className={e.kind.startsWith("setting.") || e.kind === "workspace.key_destroyed" ? "font-mono text-xs leading-5" : ""}>{e.subject}</span>}
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

/** One section: what it is for, how it stands, and its form when the page can set it up yet. Slack gets its steps
 * around the form: make the app from the manifest, then what Slack has checked and what comes next. */
function Section({ section, canSeal, slack, siteUrl, limits, replies }: { section: SectionView; canSeal: boolean; slack?: SlackSetupView; siteUrl: string | null; limits?: WorkspaceLimitRow[]; replies?: RepliesView }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${section.id}-heading`} className="text-lg font-medium">{section.title}</h2>
        <Standing section={section} />
      </div>
      <p className="max-w-[62ch] text-sm text-muted-foreground">{section.purpose}</p>
      {section.detail && <p className="text-sm">{section.detail}</p>}
      {slack && <SlackCreateApp slack={slack} siteUrl={siteUrl} />}
      {section.ready
        ? <SectionForm section={section} canSeal={canSeal} />
        : <p className="max-w-[62ch] text-sm">This page cannot set it up yet. Until it can, it is set in the server&apos;s environment, as the self-hosting guide says.</p>}
      {slack && <SlackChecked slack={slack} section={section} />}
      {limits && <WorkspaceLimits rows={limits} />}
      {replies && <RepliesSetup replies={replies} section={section} siteUrl={siteUrl} canSeal={canSeal} />}
    </section>
  );
}

/** Step one for Slack: a button that opens Slack's "Create app" with Ziffr's manifest filled in for this address. */
function SlackCreateApp({ slack, siteUrl }: { slack: SlackSetupView; siteUrl: string | null }) {
  if (!slack.createAppLink) {
    return <p className="max-w-[62ch] text-sm">Slack only talks to an https address. Set ZIFFR_SITE_URL on the server to this Ziffr&apos;s https address{siteUrl ? <> (it is <span className="font-mono text-xs">{siteUrl}</span> now)</> : null}, then make the app here.</p>;
  }
  return (
    <div className="max-w-[62ch] space-y-2 text-sm">
      <p>1. Make the app: Slack opens with Ziffr&apos;s manifest already filled in for this address. Pick the Slack workspace that owns the app, then choose Create.</p>
      <a href={slack.createAppLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>Create the Slack app</a>
      <p>2. On the app&apos;s Basic Information page, under App Credentials, copy the three values into the fields below and save.</p>
    </div>
  );
}

/** Step three for Slack: whether Slack reached the events address with the signing secret saved, and what comes next. */
function SlackChecked({ slack, section }: { slack: SlackSetupView; section: SectionView }) {
  const signing = section.settings.find((x) => x.name === "ZIFFR_SLACK_SIGNING_SECRET");
  if (!signing || signing.source === "none") return null;
  return (
    <div className="max-w-[62ch] space-y-2 text-sm">
      {slack.eventsCheckedAt
        ? <p role="status">Slack has checked the events address: it reached this Ziffr, signed with this signing secret, <RelativeTime at={slack.eventsCheckedAt} />.</p>
        // Numbered only when steps 1 and 2 show above it, which needs an https address.
        : <p role="status">{slack.createAppLink ? "3. " : ""}Slack has not reached the events address with this signing secret yet. In Slack, open the app&apos;s App Manifest page and choose Verify next to the events address, then reload this page. Slack tried once when the app was made, before Ziffr knew the secret.</p>}
      <p className="text-muted-foreground">Slack cannot check the Client ID and Client Secret before a Slack workspace is connected. {section.working ? "Next: an Owner or Admin of a Workspace chooses Add to Slack on its Connectors page; that uses them for the first time." : "Once all three are saved, an Owner or Admin of a Workspace chooses Add to Slack on its Connectors page."}</p>
    </div>
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
          {section.id === "telegram" && section.settings.some((x) => x.source !== "none") && (
            <Button type="button" variant="outline" disabled={pending || Object.keys(changes).length > 0}
              title={Object.keys(changes).length ? "Save first" : undefined}
              onClick={() => start(async () => { await report(checkTelegram(), "Telegram answers."); router.refresh(); })}>
              Check Telegram
            </Button>
          )}
        </div>
        {section.id === "telegram" && section.working && <TelegramTest disabled={pending || Object.keys(changes).length > 0} />}
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
        <p id={id} className="rounded-[var(--radius-input)] border border-dashed border-border px-2 py-1.5 text-sm">{s.secret ? "Set on the server" : s.choices?.find((c) => c.value === s.value)?.label ?? s.value}</p>
      ) : (
        <div className="flex gap-2">
          {s.choices ? (
            <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
              className="h-9 min-w-0 flex-1 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
              <option value="">{s.source === "default" ? "The Installation's default" : "Choose"}</option>
              {s.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          ) : <Input id={id} type={s.secret ? "password" : "text"} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={1000}
            autoComplete={s.secret ? "new-password" : "off"} spellCheck={false} placeholder={s.secret && s.source === "page" ? "Saved: leave empty to keep it" : s.placeholder} />}
          {s.source === "page" && <Button type="button" variant="outline" disabled={disabled} onClick={onRemove}>Remove</Button>}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{from}{s.unreadable ? " The saved value no longer opens with this server's ZIFFR_SECRETS_KEY: save it again." : ""}</p>
    </div>
  );
}

/** What the page says about the latest Telegram test while it waits, and once it is done. */
function testWords(s: TelegramTestStatus): string {
  switch (s.state) {
    case "waiting_start": return "No Start yet: open the link and tap Start in Telegram.";
    case "sent": return "Sent, no answer yet: reply to the bot's message with a number. If your answer does not arrive, Telegram may not reach this Ziffr: try Check Telegram.";
    case "send_failed": return "Telegram got the Start, but Ziffr could not send the test message. Try Check Telegram, then test again.";
    case "expired": return "This test ran out after ten minutes. Start a new one.";
    default: return "";
  }
}

/** Test Telegram: a link that opens the bot with a one-time code, then where the test stands, asked every few
 * seconds while it waits. The test connects nobody to any Workspace. */
function TelegramTest({ disabled }: { disabled: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<TelegramTestStatus | null>(null);
  const [pending, start] = useTransition();
  const waiting = status?.state === "waiting_start" || status?.state === "sent";
  useEffect(() => {
    let on = true;
    telegramTestStatus().then((s) => { if (on && !("error" in s)) setStatus(s); });
    return () => { on = false; };
  }, []);
  useEffect(() => {
    if (!url || !waiting) return;
    const timer = setInterval(() => { telegramTestStatus().then((s) => { if (!("error" in s)) setStatus(s); }); }, 3000);
    return () => clearInterval(timer);
  }, [url, waiting]);
  return (
    <div className="max-w-xl space-y-2 rounded-[var(--radius-input)] border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={disabled || pending}
          onClick={() => start(async () => {
            const r = await startTelegramTest();
            if ("error" in r) { toast.error("Not done", { description: r.error }); return; }
            setUrl(r.url);
            setStatus({ state: "waiting_start", at: new Date().toISOString() });
          })}>
          Test Telegram
        </Button>
        {url && waiting && <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "default" })}>Open the bot in Telegram</a>}
      </div>
      <p className="text-xs text-muted-foreground">Sends you a message from the bot and waits for your reply, so you know Ziffr reaches Telegram and Telegram reaches Ziffr. It connects you to no Workspace.</p>
      {status?.state === "done" && status.at && <p role="status" className="text-sm">Tested <RelativeTime at={status.at} />: message sent, answer received.</p>}
      {url && status && status.state !== "done" && status.state !== "none" && <p role="status" aria-live="polite" className="text-sm">{testWords(status)}</p>}
    </div>
  );
}

/** Replies by email beside its form: where the provider forwards to, the MX record the domain needs and what it has
 * now, a signing secret made here (shown this once, for the forwarder), and the test that waits for a real reply. */
function RepliesSetup({ replies, section, siteUrl, canSeal }: { replies: RepliesView; section: SectionView; siteUrl: string | null; canSeal: boolean }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const secretSetting = section.settings.find((x) => x.name === "ZIFFR_INBOUND_SECRET");
  const domain = section.settings.find((x) => x.name === "ZIFFR_INBOUND_DOMAIN")?.value ?? replies.mx?.domain ?? null;
  return (
    <div className="max-w-[62ch] space-y-3 text-sm">
      <h3 className="font-medium">Setting it up</h3>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Point the MX record of {domain ? <span className="font-mono text-xs">{domain}</span> : "the domain for replies"} at your inbound mail provider, such as Cloudflare Email Routing: <span className="font-mono text-xs">{domain ?? "in.example.com"} MX 10 &lt;the provider&apos;s inbound server&gt;</span>.
          {replies.mx && (replies.mx.records.length
            ? <span className="mt-1 block text-muted-foreground">Found now: <span className="font-mono text-xs">{replies.mx.records.join(", ")}</span></span>
            : <span className="mt-1 block text-muted-foreground">{replies.mx.problem}</span>)}
        </li>
        <li>
          Have the provider forward each message, unchanged and signed with the signing secret, to <span className="font-mono text-xs break-all">{siteUrl ? `${siteUrl.replace(/\/$/, "")}/api/inbound/email` : "<this Ziffr's address>/api/inbound/email"}</span>. The email guide has a forwarder for Cloudflare.
          {secretSetting && secretSetting.source !== "server" && (
            <span className="mt-2 block space-y-2">
              <Button type="button" variant="outline" disabled={pending || !canSeal}
                title={!canSeal ? "Needs ZIFFR_SECRETS_KEY on the server" : undefined}
                onClick={() => {
                  if (secretSetting.source === "page" && !window.confirm("Make a new signing secret? The forwarder must get it: the old one stops working at once.")) return;
                  start(async () => {
                    const r = await makeInboundSecret();
                    if ("error" in r) { toast.error("Not done", { description: r.error }); return; }
                    setSecret(r.secret);
                    router.refresh();
                  });
                }}>
                {secretSetting.source === "page" ? "Make a new signing secret" : "Make a signing secret"}
              </Button>
              {secret && (
                <span role="status" className="block space-y-1">
                  <span className="block">Copy it into the forwarder now; this page does not show it again.</span>
                  <span className="flex gap-2">
                    <Input readOnly value={secret} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="The new signing secret" />
                    <Button type="button" variant="outline" onClick={() => { void navigator.clipboard?.writeText(secret).then(() => toast.success("Copied.")); }}>Copy</Button>
                  </span>
                </span>
              )}
            </span>
          )}
        </li>
        <li>Test it: Ziffr emails you, you reply, and the reply comes back through the provider.</li>
      </ol>
      {section.working ? <ReplyTest initial={replies.test} /> : <p className="text-muted-foreground">The test is offered once mail, the domain and the signing secret are set.</p>}
    </div>
  );
}

/** What the page says about a replies test. */
function replyTestWords(s: ReplyTestStatus): string | null {
  if (s.state === "waiting") return "Sent. Reply to the test email; this page shows the reply when it arrives. If nothing arrives, check the MX record and the forwarder's signing secret.";
  if (s.state === "expired") return "The last test ran out after thirty minutes without a reply. Start a new one.";
  if (s.state !== "received") return null;
  const from = s.fromAdmin ? "from your address" : "but not from the address it went to, so a real reply like it would be refused";
  const vouched = s.vouched ? "Your provider vouched for the sender." : s.vouchingAsked ? "Your provider did not vouch for the sender, so a real reply like it would be refused: check the provider's name (ZIFFR_INBOUND_AUTHSERV_ID)." : "Nobody vouched for the sender: no provider is named to.";
  return `Your reply arrived, signed, ${from}. ${vouched}`;
}

/** The replies test: a button that sends the email, then where it stands, asked every few seconds while it waits. */
function ReplyTest({ initial }: { initial: ReplyTestStatus }) {
  const [status, setStatus] = useState<ReplyTestStatus>(initial);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (status.state !== "waiting") return;
    const timer = setInterval(() => { replyTestStatus().then((s) => { if (!("error" in s)) setStatus(s); }); }, 5000);
    return () => clearInterval(timer);
  }, [status.state]);
  const words = replyTestWords(status);
  return (
    <div className="space-y-2 rounded-[var(--radius-input)] border border-border p-3">
      <Button type="button" variant="outline" disabled={pending}
        onClick={() => start(async () => { if (await report(startReplyTest(), "Sent.")) setStatus({ state: "waiting", at: new Date().toISOString() }); })}>
        Test replies by email
      </Button>
      {words && <p role="status" aria-live="polite">{status.state === "received" && <>Tested <RelativeTime at={status.at} />: </>}{words}</p>}
    </div>
  );
}
