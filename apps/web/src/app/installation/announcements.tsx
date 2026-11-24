"use client";
// GLOSSARY: Announcement, Installation Admin. The Announcements section of the Installation settings page (spec 0054):
// the list, and a side panel (docs/guides/side-panel.md) to add or change one, with a preview of the line as the shell
// shows it. Deleting asks first, in a small confirmation. The server checks the Installation Admin and every field
// again; this only shows what the core's refusals say. Times are typed and shown in the browser's time zone.
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AnnouncementWords } from "@/components/announcement-line";
import { useConfirm } from "@/components/confirm-dialog";
import { useSlideOver } from "@/components/slide-over-host";
import { createInstallationAnnouncement, deleteInstallationAnnouncement, setInstallationAnnouncementActive, updateInstallationAnnouncement } from "@/app/installation-actions";
import { ANNOUNCEMENT_LABEL_MAX, ANNOUNCEMENT_TEXT_MAX, ANNOUNCEMENT_URL_MAX, INSTALLATION_ANNOUNCEMENTS_ACTIVE_MAX, type AnnouncementAudience, type AnnouncementLevel } from "@ziffr/core/announcement-rules";
import type { InstallationAnnouncementRow } from "@ziffr/core/installation-announcements";
import { RelativeTime } from "@/components/relative-time";
import { fromLocalInput, STATE_WORDS, toLocalInput, windowWords } from "./announcement-form";

type Result = { error: string } | { ok: true; message?: string };

/** The browser's time zone, known only after the first draw (the server draws in UTC), so page and server agree. */
function useZone(): string {
  const [zone, setZone] = useState("UTC");
  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); }, []);
  return zone;
}

const short = (text: string) => ([...text].length > 40 ? `${[...text].slice(0, 40).join("")}…` : text);

/** The section: what an Announcement is, the list with its actions, and the Add button. */
export function AnnouncementsSection({ rows }: { rows: InstallationAnnouncementRow[] }) {
  const panel = useSlideOver();
  const router = useRouter();
  const zone = useZone();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const on = rows.filter((r) => r.state === "running" || r.state === "scheduled").length;

  const run = (p: Promise<Result>) => start(async () => {
    const r = await p;
    if ("error" in r) toast.error("Not done", { description: r.error });
    else { toast.success(r.message ?? "Done."); router.refresh(); }
  });
  const openForm = (row?: InstallationAnnouncementRow) => panel.open({
    title: row ? "Change the Announcement" : "Add an Announcement",
    description: "One plain line, shown above every screen.",
    content: <AnnouncementForm row={row} />,
  });

  return (
    <section id="announcements" aria-labelledby="announcements-heading" className="scroll-mt-20 space-y-3">
      <h2 id="announcements-heading" className="text-lg font-medium">Announcements</h2>
      <p className="max-w-[62ch] text-sm text-muted-foreground">One plain line above every screen, for a maintenance window or anything else everyone should read. Each person can dismiss it for their visit, unless you make it one that stays. Several that are on show one after the other, a warning first. At most {INSTALLATION_ANNOUNCEMENTS_ACTIVE_MAX} can be on at once ({on} now).</p>
      <div><Button type="button" onClick={() => openForm()}>Add an Announcement</Button></div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-[var(--radius-card,0.5rem)] border border-border">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Announcements, a warning first. Times are in {zone}.</caption>
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Words</th>
                <th scope="col" className="px-3 py-2 font-medium">Level</th>
                <th scope="col" className="px-3 py-2 font-medium">Shown to</th>
                <th scope="col" className="px-3 py-2 font-medium">On the sign-in page</th>
                <th scope="col" className="px-3 py-2 font-medium">Window ({zone})</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border align-top">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[22rem] px-3 py-2">
                    <span className="break-words">{r.text}</span>
                    {r.link && <span className="block text-xs text-muted-foreground">Link: {r.link.label}</span>}
                    {!r.dismissible && <span className="block text-xs text-muted-foreground">Cannot be dismissed</span>}
                    <span className="block text-xs text-muted-foreground">{r.updatedByName ? `Last changed by ${r.updatedByName}, ` : "Changed "}<RelativeTime at={r.updatedAt} /></span>
                  </td>
                  <td className="px-3 py-2">{r.level === "warning" ? "Warning" : "Info"}</td>
                  <td className="px-3 py-2">{r.audience === "demo" ? "The demo only" : "Everyone"}</td>
                  <td className="px-3 py-2">{r.public ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{windowWords(r.startsAt, r.endsAt, zone)}</td>
                  <td className="px-3 py-2"><span className={r.state === "running" ? "pressed text-xs" : "inline-flex items-center rounded-[var(--radius-input)] border border-[var(--color-rule-2)] px-1.5 text-xs text-[var(--color-ink-2)]"}>{STATE_WORDS[r.state]}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button type="button" size="sm" variant="outline" aria-label={`Change: ${short(r.text)}`} onClick={() => openForm(r)}>Change</Button>
                      {r.state !== "ended" && (
                        <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={`${r.state === "off" ? "Switch on" : "Switch off"}: ${short(r.text)}`}
                          onClick={() => run(setInstallationAnnouncementActive(r.id, r.state === "off"))}>{r.state === "off" ? "Switch on" : "Switch off"}</Button>
                      )}
                      <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={`Delete: ${short(r.text)}`}
                        onClick={async () => {
                          if (await confirm({ title: "Delete this Announcement?", description: `"${short(r.text)}" goes for good. To keep it for later, switch it off instead.`, confirmLabel: "Delete" })) run(deleteInstallationAnnouncement(r.id));
                        }}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm">No Announcements yet.</p>}
      {dialog}
    </section>
  );
}

/** The form in the side panel: every field of an Announcement, a live preview, and the core's refusals in words. */
function AnnouncementForm({ row }: { row?: InstallationAnnouncementRow }) {
  const panel = useSlideOver();
  const router = useRouter();
  const zone = useZone();
  const uid = useId();
  const [text, setText] = useState(row?.text ?? "");
  const [href, setHref] = useState(row?.link?.href ?? "");
  const [label, setLabel] = useState(row?.link?.label ?? "");
  const [level, setLevel] = useState<AnnouncementLevel>(row?.level ?? "info");
  const [startsAt, setStartsAt] = useState(toLocalInput(row?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(row?.endsAt ?? null));
  const [audience, setAudience] = useState<AnnouncementAudience>(row?.audience ?? "everyone");
  const [isPublic, setIsPublic] = useState(row?.public ?? false);
  const [dismissible, setDismissible] = useState(row?.dismissible ?? true);
  const [active, setActive] = useState(row?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const left = ANNOUNCEMENT_TEXT_MAX - [...text].length;
  const hasLink = href.trim() !== "" || label.trim() !== "";

  const save = () => start(async () => {
    setError(null);
    const input = {
      text, link: hasLink ? { href: href.trim(), label } : null, level, audience, public: audience === "everyone" && isPublic,
      startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt), dismissible, active,
    };
    const r: Result = await (row ? updateInstallationAnnouncement(row.id, input) : createInstallationAnnouncement(input));
    if ("error" in r) { setError(r.error); return; }
    toast.success(r.message ?? "Saved.");
    router.refresh();
    panel.close();
  });

  return (
    <form className="space-y-4 px-4 pb-6 text-sm" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="space-y-1">
        <label htmlFor={`${uid}-text`} className="block font-medium">Words</label>
        <Textarea id={`${uid}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus required aria-describedby={`${uid}-left`} />
        <p id={`${uid}-left`} className={left < 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{left >= 0 ? `${left} characters left.` : `${-left} characters too many.`} Plain words, no markup.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${uid}-href`} className="block font-medium">Link (optional)</label>
          <Input id={`${uid}-href`} type="url" inputMode="url" value={href} onChange={(e) => setHref(e.target.value)} maxLength={ANNOUNCEMENT_URL_MAX} placeholder="https://" autoComplete="off" spellCheck={false} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-label`} className="block font-medium">Words for the link</label>
          <Input id={`${uid}-label`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={ANNOUNCEMENT_LABEL_MAX} required={hasLink} placeholder="Read more" autoComplete="off" />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">The link must start with https://. It is shown with these words and never opens by itself.</p>
      <div className="space-y-1">
        <label htmlFor={`${uid}-level`} className="block font-medium">Level</label>
        <select id={`${uid}-level`} value={level} onChange={(e) => setLevel(e.target.value as AnnouncementLevel)} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
          <option value="info">Info</option>
          <option value="warning">Warning (shown first)</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${uid}-start`} className="block font-medium">Starts (optional)</label>
          <Input id={`${uid}-start`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-end`} className="block font-medium">Ends (optional)</label>
          <Input id={`${uid}-end`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Times are in your browser&apos;s time zone ({zone}). Without a start it shows at once; without an end it stays until you switch it off.</p>
      <div className="space-y-1">
        <label htmlFor={`${uid}-audience`} className="block font-medium">Shown to</label>
        <select id={`${uid}-audience`} value={audience} onChange={(e) => { setAudience(e.target.value as AnnouncementAudience); if (e.target.value !== "everyone") setIsPublic(false); }} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
          <option value="everyone">Everyone</option>
          <option value="demo">The demo only</option>
        </select>
      </div>
      <div className="space-y-2">
        {audience === "everyone" && (
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /><span>Also show it on the sign-in page, to people who are not signed in</span></label>
        )}
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4" checked={!dismissible} onChange={(e) => setDismissible(!e.target.checked)} /><span>Cannot be dismissed (for a maintenance window that is running)</span></label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Switched on</span></label>
      </div>
      <div className="space-y-1">
        <p className="font-medium" id={`${uid}-preview`}>Preview</p>
        <div role="group" aria-labelledby={`${uid}-preview`} className="flex items-start gap-2 rounded-[var(--radius-input)] border border-dashed border-border px-3 py-2 text-xs">
          <AnnouncementWords a={{ id: "preview", text: text.trim() || "Your words show here.", ...(href.trim() && label.trim() ? { link: { href: href.trim(), label: label.trim() } } : {}) }} />
          <span className="shrink-0 text-muted-foreground">{level === "warning" ? "Warning" : "Info"}{dismissible ? "" : ", stays"}</span>
        </div>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !text.trim()}>{row ? "Save" : "Add"}</Button>
        <Button type="button" variant="outline" onClick={() => panel.close()}>Cancel</Button>
      </div>
    </form>
  );
}
