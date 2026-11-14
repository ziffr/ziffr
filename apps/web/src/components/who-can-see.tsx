"use client";
// "Who can see this" (GLOSSARY: Share, Group): everyone with access and why; the owner also answers requests.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { decideAccess, requestAccess, whoCanSee } from "@/app/access-actions";
import type { ObjectType } from "@/lib/access";
import type { Profile } from "@ziffr/core/types";

type Data = Awaited<ReturnType<typeof whoCanSee>>;

/** A "Who can see this" button that opens the dialog. */
export function WhoCanSee({ type, id, people }: { type: ObjectType; id: number; people: Profile[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "outline" })}><Eye aria-hidden /> Who can see this</button>
      {open && <WhoCanSeeDialog type={type} id={id} people={people} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The "Who can see this" dialog on its own, for menus that open it; it loads when it opens. */
export function WhoCanSeeDialog({ type, id, people, onClose }: { type: ObjectType; id: number; people: Profile[]; onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const name = (pid: string) => people.find((p) => p.id === pid)?.name ?? pid;
  const load = () => whoCanSee(type, id).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when opened
  return (
    <>
      {(
        <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle>Who can see this</DialogTitle>
            <DialogDescription>Everyone with access, and why.</DialogDescription>
            {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
              <div className="space-y-4 text-sm">
                {data.requests.length > 0 && (
                  <div className="rounded-[var(--radius-input)] border border-[var(--color-accent-2)] p-3">
                    <div className="mb-2 font-medium">Asking for access</div>
                    <ul className="space-y-2">
                      {data.requests.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2">
                          <span className="flex-1">{name(r.requester_id)}</span>
                          <Button size="sm" disabled={pending} onClick={() => start(async () => { await decideAccess(r.id, true); toast.success(`${name(r.requester_id)} can see it now`); await load(); router.refresh(); })}>Grant as Viewer</Button>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await decideAccess(r.id, false); await load(); })}>Decline</Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ul className="space-y-2">
                  {data.people.map((p) => (
                    <li key={p.person} className="flex gap-3">
                      <span className="w-28 shrink-0 font-medium">{name(p.person)}</span>
                      <span className={p.how.length ? "" : "text-muted-foreground"}>{p.how.length ? p.how.join("; ") : "No access"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Shown where someone opens something not shared with them. */
export function RequestAccess({ type, id, owner }: { type: ObjectType; id: number; owner: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  return done ? <p className="mt-3 text-sm">{done}</p> : (
    <Button className="mt-3" disabled={pending} onClick={() => start(async () => setDone(await requestAccess(type, id)))}><KeyRound aria-hidden /> Ask {owner} for access</Button>
  );
}
