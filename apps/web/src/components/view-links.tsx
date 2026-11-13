"use client";
// View Links (GLOSSARY: View Link): the owner makes a link for someone outside, with an end date, live or frozen.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createViewLink, listViewLinks, revokeViewLink } from "@/app/view-link-actions";

type Link = Awaited<ReturnType<typeof listViewLinks>>[number];
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export function ViewLinks({ type, id }: { type: "dashboard" | "deck"; id: number }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState(inDays(30));
  const [frozen, setFrozen] = useState(false);
  const [pending, start] = useTransition();
  const load = () => listViewLinks(type, id).then(setLinks);
  const url = (token: string) => `${window.location.origin}/v/${token}`;
  const copy = (token: string) => navigator.clipboard?.writeText(url(token)).then(() => toast.success("Link copied"), () => toast.message(url(token)));
  const today = inDays(0);
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); load(); }} className={buttonVariants({ variant: "outline" })}><Link2 aria-hidden /> View link</button>
      {open && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpen(false); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle>View links</DialogTitle>
            <DialogDescription>For someone outside the team, such as a board member or an investor. They see this {type} and nothing else, cannot change or ask anything, and no login is needed.</DialogDescription>
            <form
              className="space-y-3 text-sm"
              onSubmit={(e) => { e.preventDefault(); start(async () => { try { const t = await createViewLink(type, id, { label, expires, frozen }); setLabel(""); await load(); copy(t); } catch (err) { toast.error("No link made", { description: (err as Error).message }); } }); }}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-2">
                <label className="block"><span className="mb-1 block text-xs font-medium">For</span><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Advisory board, Q4" /></label>
                <label className="block"><span className="mb-1 block text-xs font-medium">Works until</span><Input type="date" value={expires} min={today} max={inDays(90)} onChange={(e) => setExpires(e.target.value)} required /></label>
              </div>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
                <span>Freeze today&rsquo;s numbers<span className="block text-xs text-muted-foreground">Otherwise it shows live numbers until it ends.</span></span>
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
                      <span className="block text-xs text-muted-foreground">{l.frozen ? "Frozen numbers" : "Live numbers"}, {l.revoked ? "revoked" : `until ${l.expires_at}`}</span>
                    </span>
                    {!ended && <Button size="sm" variant="ghost" onClick={() => copy(l.token)}><Copy aria-hidden /> Copy</Button>}
                    {!ended && <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => start(async () => { await revokeViewLink(l.id); await load(); toast.success("Link revoked"); })}>Revoke</Button>}
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
