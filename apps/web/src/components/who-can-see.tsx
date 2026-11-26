"use client";
// "Who can see this" (GLOSSARY: Share, Group, Slide-over): a side panel with everyone with access and why; the owner also answers requests.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { useSlideOver } from "@/components/slide-over-host";
import { Button } from "@/components/ui/button";
import { decideAccess, requestAccess, whoCanSee } from "@/app/access-actions";
import type { ObjectType } from "@/lib/access";
import type { Profile } from "@ziffr/core/types";

type Data = Awaited<ReturnType<typeof whoCanSee>>;

/** Opens "Who can see this" in the side panel (a Slide-over); the panel loads the list when it opens, so it is current. Returns the function a menu entry calls. */
export function useShowWhoCanSee(people: Profile[]) {
  const panel = useSlideOver();
  return (type: ObjectType, id: number) => panel.open({ short: true, title: "Who can see this", description: "Everyone with access, and why.", content: <WhoCanSeeBody type={type} id={id} people={people} /> });
}

/** The panel's content: nothing here is sent that the person may not see, `whoCanSee` decides it on the server. */
function WhoCanSeeBody({ type, id, people }: { type: ObjectType; id: number; people: Profile[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  // Someone this viewer is not shown (peopleFor) reads as "Someone", never as their id.
  const name = (pid: string) => people.find((p) => p.id === pid)?.name ?? "Someone";
  const load = () => whoCanSee(type, id).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when opened
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4 text-sm">
      {data.owner === "" && <p className="text-muted-foreground">How this is shared with you.</p>}
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
