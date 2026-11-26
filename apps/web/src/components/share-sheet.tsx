"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Share2, UserPlus } from "lucide-react";
import { setGroupShare, setShare } from "@/app/canvas-actions";
import { inviteMember } from "@/app/team-actions";
import { told } from "@/lib/action-toast";
import { useSlideOver } from "@/components/slide-over-host";
import { usePanel } from "@/lib/panel-param";
import { LeftOut, LeftOutNote, useDeckGaps } from "@/components/left-out";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Group, Profile, Share } from "@ziffr/core/types";

/** GLOSSARY: Share, Slide-over. The Share button opens the share panel beside the page (`?panel=share` is its direct URL, and opening that link opens it).
 * Dashboards can be shared as Viewer or Editor; metrics as Viewer. `more` are related panels offered at the bottom ("Who can see this", "View links"):
 * they open on top of this one, which stays one step back. */
export function ShareSheet({ objectType, objectId, name, ownerId, people, shares, groups = [], reveals = {}, canInvite = false, primary, more = [], warning }: { objectType: "metric" | "dashboard" | "deck"; objectId: number; name: string; ownerId: string; people: Profile[]; shares: Share[]; groups?: Group[]; reveals?: Record<string, string[]>; /** May invite people (Owners and Admins, decided in the core): the panel offers to invite someone. Others are told whom to ask. */ canInvite?: boolean; /** Said above the list before anything is shared, such as what an open Total tells. */ warning?: string; /** The page's main button. */ primary?: boolean; /** Related panels offered at the bottom ("Who can see this", "View links"). */ more?: { label: string; icon: React.ReactNode; onClick: () => void }[] }) {
  const panel = useSlideOver();
  const [urlOpen, setUrlOpen] = usePanel("share");
  // Whether the host's panel is the one this button opened, so closing it can take `?panel=share` out of the address.
  const mine = useRef(false);
  const others = people.filter((p) => p.id !== ownerId && !p.contact);
  const n = others.filter((p) => shares.some((s) => s.object_type === objectType && s.object_id === objectId && s.user_id === p.id)).length + groups.filter((g) => shares.some((s) => s.object_type === objectType && s.object_id === objectId && s.group_id === g.id)).length;
  const show = () => {
    mine.current = true;
    setUrlOpen(true);
    panel.open({
      short: true,
      title: `Share \u201c${name}\u201d`,
      description: objectType === "dashboard"
        ? "Viewers can look, inspect history and ask questions. Editors can also arrange widgets. Everyone you share with can see the metrics on this dashboard."
        : objectType === "deck"
          ? "Viewers can present it. Editors can also change slides. Everyone you share with can see the metrics its slides draw live, not the numbers they keep from a Snapshot."
          : "People you share with can see this metric and use it on their own dashboards and analyses. Only you can change its description.",
      content: <ShareBody objectType={objectType} objectId={objectId} ownerId={ownerId} people={people} shares={shares} groups={groups} reveals={reveals} canInvite={canInvite} more={more} warning={warning} />,
    });
  };
  // A link with `?panel=share` opens the panel once the page is up.
  useEffect(() => { if (urlOpen && !mine.current) show(); }, [urlOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the address changes
  // The panel was closed (Escape, Close, another page): the address stops naming it. Only a change from open counts:
  // opened from a link, this runs once more before the host has the panel, and must not take the address away then.
  const wasOpen = useRef(panel.isOpen);
  useEffect(() => {
    if (wasOpen.current && !panel.isOpen && mine.current) { mine.current = false; setUrlOpen(false); }
    wasOpen.current = panel.isOpen;
  }, [panel.isOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- only when it closes
  return (
    <button type="button" onClick={show} className={buttonVariants({ variant: primary ? "default" : "outline" })}>
      <Share2 aria-hidden /> Share{n ? <span className={cn("fig", primary ? "opacity-80" : "text-muted-foreground")}>{n}</span> : null}
    </button>
  );
}

/** The share panel's content: who it is shared with, as a form that saves each change at once. */
function ShareBody({ objectType, objectId, ownerId, people, shares, groups, reveals, canInvite, more, warning }: { objectType: "metric" | "dashboard" | "deck"; objectId: number; ownerId: string; people: Profile[]; shares: Share[]; groups: Group[]; reveals: Record<string, string[]>; canInvite: boolean; more: { label: string; icon: React.ReactNode; onClick: () => void }[]; warning?: string }) {
  const [pending, start] = useTransition();
  // Contacts have no login: nothing is shared with them.
  const others = people.filter((p) => p.id !== ownerId && !p.contact);
  const initial = (id: string) => shares.find((s) => s.object_type === objectType && s.object_id === objectId && s.user_id === id)?.role ?? "";
  const [roles, setRoles] = useState<Record<string, string>>(() => Object.fromEntries(people.map((p) => [p.id, initial(p.id)])));
  const roleOf = (id: string) => roles[id] ?? "";
  const [groupRoles, setGroupRoles] = useState<Record<number, string>>(() => Object.fromEntries(groups.map((g) => [g.id, shares.find((s) => s.object_type === objectType && s.object_id === objectId && s.group_id === g.id)?.role ?? ""])));
  const select = "h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";
  // Said beside each name before anything is shared (spec 0061).
  const gaps = useDeckGaps(objectType === "deck" ? objectId : null);
  return (
    <div className="flex min-h-full flex-col gap-3">
        {warning && <p role="note" className="rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-3 text-sm">{warning}</p>}
        <LeftOutNote gaps={gaps} />
        <ul className="space-y-2">
          {others.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full text-xs font-medium text-white" style={{ background: p.color }}>{p.name[0]}</span>
              <span className="flex-1">{p.name}<span className="block text-xs text-muted-foreground">{p.role}</span><Reveals names={reveals[p.id]} /><LeftOut gaps={gaps?.who[p.id]} /></span>
              <select
                disabled={pending}
                value={roleOf(p.id)}
                onChange={(e) => {
                  const v = e.target.value;
                  setRoles((r) => ({ ...r, [p.id]: v }));
                  start(async () => { told(await setShare(objectType, objectId, p.id, (v || null) as never), "Not shared"); });
                }}
                className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm"
              >
                <option value="">No access</option>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </li>
          ))}
        </ul>
        {groups.length > 0 && (
          <>
            <div className="mt-2 text-xs font-medium text-muted-foreground">Groups, including whoever joins later</div>
            <ul className="space-y-2">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center gap-3 text-sm">
                  <span className="flex size-7 items-center justify-center rounded-full border border-border text-xs font-medium">{g.name[0]}</span>
                  <span className="flex-1">{g.name}<span className="block text-xs text-muted-foreground">{g.members.map((id) => people.find((p) => p.id === id)?.name.split(" ")[0]).filter(Boolean).join(", ")}</span><Reveals names={reveals[`g${g.id}`]} /><LeftOut gaps={gaps?.who[`g${g.id}`]} /></span>
                  <select
                    disabled={pending}
                    aria-label={`Access for ${g.name}`}
                    value={groupRoles[g.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGroupRoles((r) => ({ ...r, [g.id]: v }));
                      start(async () => { told(await setGroupShare(objectType, objectId, g.id, (v || null) as never), "Not shared"); });
                    }}
                    className={select}
                  >
                    <option value="">No access</option>
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </li>
              ))}
            </ul>
          </>
        )}
        <InviteSomeone alone={others.length === 0} canInvite={canInvite} objectType={objectType} />
      {more.length > 0 && (
        <div className="-mx-4 -mb-4 mt-auto flex flex-wrap gap-2 border-t bg-muted/50 p-3">
          {more.map((m) => (
            <Button key={m.label} type="button" variant="ghost" size="sm" onClick={m.onClick}>{m.icon} {m.label}</Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Says what a share shows that was not shared on its own (GLOSSARY: Share). */
function Reveals({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return <span className="block text-xs text-[var(--color-accent-2)]">Also shows {names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ")}</span>;
}

/** For a Workspace with nobody to share with, or anyone not in it yet (GLOSSARY: Invitation, Share): Owners and Admins
 * invite by email through the same call as the Members page, as Member or Guest; they are shared with once they have
 * joined, because an invitation carries no Share. Everyone else is told to ask an Owner or Admin. */
function InviteSomeone({ alone, canInvite, objectType }: { alone: boolean; canInvite: boolean; objectType: "metric" | "dashboard" | "deck" }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "guest">("member");
  const [made, setMade] = useState<{ link: string; emailed: boolean } | null>(null);
  const [pending, start] = useTransition();
  if (!canInvite) {
    return alone ? <p className="text-sm text-muted-foreground">Nobody else is in this workspace yet. Ask an Owner or Admin to invite them{objectType === "metric" ? "." : ", or make a View link to show this to someone outside."}</p> : null;
  }
  if (!open && !made) {
    return <Button type="button" variant={alone ? "default" : "outline"} size="sm" onClick={() => setOpen(true)}><UserPlus aria-hidden /> Invite someone…</Button>;
  }
  return (
    <div className="space-y-2 rounded-[var(--radius-card)] border border-border p-3 text-sm">
      {made ? (
        <>
          <p>{made.emailed ? "Invited by email. You can also send this link yourself:" : "Not emailed. Send this link yourself:"}</p>
          <input readOnly value={made.link} onFocus={(e) => e.target.select()} aria-label="Invitation link" className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 font-mono text-xs" />
          <p className="text-xs text-muted-foreground">Once they have joined, they appear in the list above: share it with them there.</p>
        </>
      ) : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          start(async () => { const r = await inviteMember({ email, role }); if (!told(r, "Not invited")) setMade(r as { link: string; emailed: boolean }); });
        }}>
          <label className="text-xs text-muted-foreground">Email address<Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="mt-1 w-56" /></label>
          <label className="text-xs text-muted-foreground">as<select value={role} onChange={(e) => setRole(e.target.value as "member" | "guest")} className="mt-1 block h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm"><option value="member">Member</option><option value="guest">Guest (sees only what is shared)</option></select></label>
          <Button type="submit" disabled={pending}>Invite</Button>
        </form>
      )}
    </div>
  );
}
