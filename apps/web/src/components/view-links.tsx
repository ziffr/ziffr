"use client";
// View Links (GLOSSARY: View Link, Slide-over): the owner makes a link for someone outside, with an end date, live or frozen.
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { told } from "@/lib/action-toast";
import { Copy } from "lucide-react";
import { useSlideOver } from "@/components/slide-over-host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createViewLink, deletedInLink, emptyInLink, fixListsForLink, listViewLinks, revokeViewLink, setViewLinkNames, shownSnapshots, tagListsToFix } from "@/app/view-link-actions";
import { formatDate } from "@ziffr/core/format";

type Link = Awaited<ReturnType<typeof listViewLinks>>[number];
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** What is said before a link to a Snapshot is made when Metrics it shows were deleted since (spec 0065). */
export function DeletedLeftOut({ names }: { names: string[] }) {
  return (
    <p role="status" className="rounded-[var(--radius-input)] border border-input bg-muted/40 p-2.5 text-xs [overflow-wrap:anywhere]">
      Left out of the link: {names.join(", ")}. A link shows nothing of a deleted Metric, so every widget that draws one stays out. People who sign in still see it in the Snapshot as before.
    </p>
  );
}

/** Opens View Links in the side panel (a Slide-over); the panel loads the links when it opens. Owner only. A
 * dashboard's link shows live numbers or one of its shown Snapshots (spec 0013); `snapshot` picks that one first.
 * `leftOut`: how many parts of a deck a link does not show (spec 0061). */
export function useShowViewLinks() {
  const panel = useSlideOver();
  return (type: "dashboard" | "deck", id: number, snapshot?: { id: number; label: string }, leftOut = 0) => panel.open({
    short: true,
    title: "View links",
    description: `For someone outside the team, such as a board member or an investor. They see this ${type} and nothing else, cannot change or ask anything, and no login is needed.`,
    content: <ViewLinksBody type={type} id={id} snapshot={snapshot} leftOut={leftOut} />,
  });
}

function ViewLinksBody({ type, id, snapshot, leftOut }: { type: "dashboard" | "deck"; id: number; snapshot?: { id: number; label: string }; leftOut: number }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState(inDays(30));
  const [frozen, setFrozen] = useState(false);
  const [snapshots, setSnapshots] = useState<{ id: number; label: string }[]>(snapshot ? [snapshot] : []);
  const [shows, setShows] = useState<string>(snapshot ? String(snapshot.id) : "live");
  const [showNames, setShowNames] = useState(false);
  // Widgets that show all Metrics with a Tag: a link shows a list its maker chose, so these are fixed first (spec 0038).
  const [toFix, setToFix] = useState(0);
  // Totals the link would show with no number, said before it is made (spec 0058).
  const [empty, setEmpty] = useState<string[]>([]);
  // Metrics deleted since the picked Snapshot, which a link leaves out, said before it is made (spec 0065).
  const [deleted, setDeleted] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const load = () => listViewLinks(type, id).then(setLinks);
  const url = (token: string) => `${window.location.origin}/v/${token}`;
  const copy = (token: string) => navigator.clipboard?.writeText(url(token)).then(() => toast.success("Link copied"), () => toast.message(url(token)));
  const today = inDays(0);
  useEffect(() => {
    load();
    if (type === "dashboard") { shownSnapshots(id).then(setSnapshots).catch(() => {}); tagListsToFix(id).then(setToFix).catch(() => {}); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when opened
  useEffect(() => {
    let current = true;
    emptyInLink(type, id, shows === "live" ? null : Number(shows)).then((names) => { if (current) setEmpty(names); }).catch(() => {});
    setDeleted([]);
    if (type === "dashboard" && shows !== "live") deletedInLink(id, Number(shows)).then((names) => { if (current) setDeleted(names); }).catch(() => {});
    return () => { current = false; };
  }, [type, id, shows]);
  const input = () => (type === "dashboard" ? { label, expires, frozen: false, snapshotId: shows === "live" ? null : Number(shows), showNames } : { label, expires, frozen, showNames });
  return (
    <>
            <form
              className="space-y-3 text-sm"
              onSubmit={(e) => { e.preventDefault(); start(async () => { try { const t = unwrap(await createViewLink(type, id, input())); setLabel(""); await load(); copy(t); } catch (err) { toast.error("No link made", { description: shown(err) }); } }); }}
            >
              <p className="text-xs text-muted-foreground">Anyone with the link can read it, without signing in, until it ends.</p>
              <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-2">
                <label className="block"><span className="mb-1 block text-xs font-medium">For</span><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Advisory board, Q4" /></label>
                <label className="block"><span className="mb-1 block text-xs font-medium">Works until</span><Input type="date" value={expires} min={today} max={inDays(90)} onChange={(e) => setExpires(e.target.value)} required /></label>
              </div>
              {type === "dashboard" ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">Shows</span>
                  <select aria-label="What the link shows" value={shows} onChange={(e) => setShows(e.target.value)} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm">
                    <option value="live">Live numbers, until the link ends</option>
                    {snapshots.map((s) => <option key={s.id} value={String(s.id)}>Snapshot of {s.label}</option>)}
                  </select>
                  {snapshots.length === 0 && <span className="mt-1 block text-xs text-muted-foreground">To freeze the numbers, take a Snapshot of a period and show it; then pick it here.</span>}
                </label>
              ) : (
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
                  <span>Freeze today&rsquo;s numbers<span className="block text-xs text-muted-foreground">Otherwise it shows live numbers until it ends.</span></span>
                </label>
              )}
              {leftOut > 0 && (
                <p role="status" className="rounded-[var(--radius-input)] border border-input bg-muted/40 p-2.5 text-xs">
                  {leftOut === 1 ? "One part of this deck is" : `${leftOut} parts of this deck are`} left out of View Links: someone with a link sees no Snapshot&rsquo;s numbers. Send them a PDF or PowerPoint file instead.
                </p>
              )}
              {deleted.length > 0 && <DeletedLeftOut names={deleted} />}
              {empty.length > 0 && (
                <p role="status" className="rounded-[var(--radius-input)] border border-input bg-muted/40 p-2.5 text-xs [overflow-wrap:anywhere]">
                  Shown with no number: {empty.join(", ")}. A link shows a Total&rsquo;s numbers only while the Total is open, or where the link shows every Metric it adds up.
                </p>
              )}
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
                <span>Show names<span className="block text-xs text-muted-foreground">Off by default: the link shows no one&rsquo;s name, only &ldquo;Someone&rdquo;. Tick it for an internal link.</span></span>
              </label>
              {type === "dashboard" && shows === "live" && toFix > 0 && (
                <div role="status" className="space-y-2 rounded-[var(--radius-input)] border border-input bg-muted/40 p-2.5 text-xs">
                  <p>{toFix === 1 ? "A widget on this dashboard shows" : `${toFix} widgets on this dashboard show`} all Metrics with a Tag. A link shows a list you chose, so the list is fixed first: each such widget keeps the Metrics you see now and no longer follows the Tag. These Metrics will be shown to everyone this dashboard is shared with.</p>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { if (told(await fixListsForLink(id), "Not fixed")) return; setToFix(0); toast.success("The list is fixed"); })}>Fix the list</Button>
                </div>
              )}
              <Button type="submit" disabled={pending || (type === "dashboard" && shows === "live" && toFix > 0)}>Make link and copy it</Button>
            </form>
            <ul className="mt-2 space-y-2 border-t border-border pt-3 text-sm">
              {!links ? <li className="text-muted-foreground">Loading…</li> : links.length === 0 ? <li className="text-muted-foreground">No links yet.</li> : links.map((l) => {
                const ended = l.revoked || l.expires_at < today;
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className={ended ? "text-muted-foreground line-through" : "font-medium"}>{l.label || "Untitled link"}</span>
                      <span className="block text-xs text-muted-foreground">{l.snapshotLabel ? `Snapshot of ${l.snapshotLabel}` : l.frozen ? "Frozen numbers" : "Live numbers"},{l.revoked ? "revoked" : `until ${formatDate(l.expires_at)}`}{l.showNames ? ", shows names" : ""}</span>
                    </span>
                    {!ended && <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { if (told(await setViewLinkNames(l.id, !l.showNames), "Not changed")) return; await load(); toast.success(l.showNames ? "Names hidden" : "Names shown"); })}>{l.showNames ? "Hide names" : "Show names"}</Button>}
                    {!ended && <Button size="sm" variant="ghost" onClick={() => copy(l.token)}><Copy aria-hidden /> Copy</Button>}
                    {!ended && <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => start(async () => { if (told(await revokeViewLink(l.id), "Not revoked")) return; await load(); toast.success("Link revoked"); })}>Revoke</Button>}
                  </li>
                );
              })}
            </ul>
    </>
  );
}
