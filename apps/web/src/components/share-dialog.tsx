"use client";
import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { setGroupShare, setShare } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Group, Profile, Share } from "@ziffr/core/types";

/** GLOSSARY: Share. Dashboards can be shared as Viewer or Editor; metrics as Viewer. */
export function ShareDialog({ objectType, objectId, name, ownerId, people, shares, groups = [], reveals = {}, primary, more = [] }: { objectType: "metric" | "dashboard" | "deck"; objectId: number; name: string; ownerId: string; people: Profile[]; shares: Share[]; groups?: Group[]; reveals?: Record<string, string[]>; /** The page's main button. */ primary?: boolean; /** Related dialogs offered at the bottom ("Who can see this", "View links"); the share dialog closes first. */ more?: { label: string; icon: React.ReactNode; onClick: () => void }[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  // Contacts have no login: nothing is shared with them.
  const others = people.filter((p) => p.id !== ownerId && !p.contact);
  const initial = (id: string) => shares.find((s) => s.object_type === objectType && s.object_id === objectId && s.user_id === id)?.role ?? "";
  const [roles, setRoles] = useState<Record<string, string>>(() => Object.fromEntries(people.map((p) => [p.id, initial(p.id)])));
  const roleOf = (id: string) => roles[id] ?? "";
  const [groupRoles, setGroupRoles] = useState<Record<number, string>>(() => Object.fromEntries(groups.map((g) => [g.id, shares.find((s) => s.object_type === objectType && s.object_id === objectId && s.group_id === g.id)?.role ?? ""])));
  const n = others.filter((p) => roleOf(p.id)).length + groups.filter((g) => groupRoles[g.id]).length;
  const select = "h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: primary ? "default" : "outline" })}>
        <Share2 aria-hidden /> Share{n ? <span className={cn("fig", primary ? "opacity-80" : "text-muted-foreground")}>{n}</span> : null}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share “{name}”</DialogTitle>
          <DialogDescription>
            {objectType === "dashboard"
              ? "Viewers can look, inspect history and ask questions. Editors can also arrange widgets. Everyone you share with can see the metrics on this dashboard."
              : objectType === "deck"
                ? "Viewers can present it. Editors can also change slides. Everyone you share with can see the metrics on its slides."
                : "People you share with can see this metric and use it on their own dashboards and analyses. Only you can change its description."}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {others.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full text-xs font-medium text-white" style={{ background: p.color }}>{p.name[0]}</span>
              <span className="flex-1">{p.name}<span className="block text-xs text-muted-foreground">{p.role}</span><Reveals names={reveals[p.id]} /></span>
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
                  <span className="flex-1">{g.name}<span className="block text-xs text-muted-foreground">{g.members.map((id) => people.find((p) => p.id === id)?.name.split(" ")[0]).filter(Boolean).join(", ")}</span><Reveals names={reveals[`g${g.id}`]} /></span>
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
        {more.length > 0 && (
          <div className="-mx-4 -mb-4 flex flex-wrap gap-2 rounded-b-xl border-t bg-muted/50 p-3">
            {more.map((m) => (
              <Button key={m.label} type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setTimeout(m.onClick, 0); }}>{m.icon} {m.label}</Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Says what a share shows that was not shared on its own (GLOSSARY: Share). */
function Reveals({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return <span className="block text-xs text-[var(--color-accent-2)]">Also shows {names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ")}</span>;
}
