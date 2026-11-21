"use client";
// View Links (GLOSSARY: View Link): the owner makes a link for someone outside, with an end date, live or frozen.
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { told } from "@/lib/action-toast";
import { Copy, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createViewLink, listViewLinks, revokeViewLink, setViewLinkNames, shownSnapshots } from "@/app/view-link-actions";
import { formatDate } from "@ziffr/core/format";

type Link = Awaited<ReturnType<typeof listViewLinks>>[number];
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** A "View link" button that opens the owner's View Links dialog. */
export function ViewLinks({ type, id }: { type: "dashboard" | "deck"; id: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "outline" })}><Link2 aria-hidden /> View link</button>
      {open && <ViewLinksDialog type={type} id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The View Links dialog on its own, for menus that open it; it loads the links when it opens. Owner only. A
 * dashboard's link shows live numbers or one of its shown Snapshots (spec 0013); `snapshot` picks that one first. */
export function ViewLinksDialog({ type, id, snapshot, onClose }: { type: "dashboard" | "deck"; id: number; snapshot?: { id: number; label: string }; onClose: () => void }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState(inDays(30));
  const [frozen, setFrozen] = useState(false);
  const [snapshots, setSnapshots] = useState<{ id: number; label: string }[]>(snapshot ? [snapshot] : []);
  const [shows, setShows] = useState<string>(snapshot ? String(snapshot.id) : "live");
  const [showNames, setShowNames] = useState(false);
  const [pending, start] = useTransition();
  const load = () => listViewLinks(type, id).then(setLinks);
  const url = (token: string) => `${window.location.origin}/v/${token}`;
  const copy = (token: string) => navigator.clipboard?.writeText(url(token)).then(() => toast.success("Link copied"), () => toast.message(url(token)));
  const today = inDays(0);
  useEffect(() => {
    load();
    if (type === "dashboard") shownSnapshots(id).then(setSnapshots).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when opened
  const input = () => (type === "dashboard" ? { label, expires, frozen: false, snapshotId: shows === "live" ? null : Number(shows), showNames } : { label, expires, frozen, showNames });
  return (
    <>
      {(
        <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle>View links</DialogTitle>
            <DialogDescription>For someone outside the team, such as a board member or an investor. They see this {type} and nothing else, cannot change or ask anything, and no login is needed.</DialogDescription>
            <form
              className="space-y-3 text-sm"
              onSubmit={(e) => { e.preventDefault(); start(async () => { try { const t = unwrap(await createViewLink(type, id, input())); setLabel(""); await load(); copy(t); } catch (err) { toast.error("No link made", { description: shown(err) }); } }); }}
            >
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
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
                <span>Show names<span className="block text-xs text-muted-foreground">Off by default: the link shows no one&rsquo;s name, only &ldquo;Someone&rdquo;. Tick it for an internal link.</span></span>
              </label>
              <Button type="submit" disabled={pending}>Make link and copy it</Button>
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
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
