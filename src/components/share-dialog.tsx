"use client";
import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { setGroupShare, setShare } from "@/app/canvas-actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import type { Group, Profile, Share } from "@/lib/types";

/** GLOSSARY: Share. Dashboards can be shared as Viewer or Editor; metrics as Viewer. */
export function ShareDialog({ objectType, objectId, name, ownerId, people, shares, groups = [] }: { objectType: "metric" | "dashboard"; objectId: number; name: string; ownerId: string; people: Profile[]; shares: Share[]; groups?: Group[] }) {
  const [pending, start] = useTransition();
  const others = people.filter((p) => p.id !== ownerId);
  const initial = (id: string) => shares.find((s) => s.object_type === objectType && s.object_id === objectId && s.user_id === id)?.role ?? "";
  const [roles, setRoles] = useState<Record<string, string>>(() => Object.fromEntries(people.map((p) => [p.id, initial(p.id)])));
  const roleOf = (id: string) => roles[id] ?? "";
  const [groupRoles, setGroupRoles] = useState<Record<number, string>>(() => Object.fromEntries(groups.map((g) => [g.id, shares.find((s) => s.object_type === objectType && s.object_id === objectId && s.group_id === g.id)?.role ?? ""])));
  const n = others.filter((p) => roleOf(p.id)).length + groups.filter((g) => groupRoles[g.id]).length;
  const select = "h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";
  return (
    <Dialog>
      <DialogTrigger className={buttonVariants({ variant: "outline" })}>
        <Share2 aria-hidden /> Share{n ? <span className="fig text-muted-foreground">{n}</span> : null}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share “{name}”</DialogTitle>
          <DialogDescription>
            {objectType === "dashboard"
              ? "Viewers can look, inspect history and ask questions. Editors can also arrange widgets. Everyone you share with can see the metrics on this dashboard."
              : "People you share with can see this metric and use it on their own dashboards and analyses. Only you can change its description."}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {others.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full text-xs font-medium text-white" style={{ background: p.color }}>{p.name[0]}</span>
              <span className="flex-1">{p.name}<span className="block text-xs text-muted-foreground">{p.role}</span></span>
              <select
                disabled={pending}
                value={roleOf(p.id)}
                onChange={(e) => {
                  const v = e.target.value;
                  setRoles((r) => ({ ...r, [p.id]: v }));
                  start(() => setShare(objectType, objectId, p.id, (v || null) as never));
                }}
                className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm"
              >
                <option value="">No access</option>
                <option value="viewer">Viewer</option>
                {objectType === "dashboard" && <option value="editor">Editor</option>}
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
                  <span className="flex-1">{g.name}<span className="block text-xs text-muted-foreground">{g.members.map((id) => people.find((p) => p.id === id)?.name.split(" ")[0]).filter(Boolean).join(", ")}</span></span>
                  <select
                    disabled={pending}
                    aria-label={`Access for ${g.name}`}
                    value={groupRoles[g.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGroupRoles((r) => ({ ...r, [g.id]: v }));
                      start(() => setGroupShare(objectType, objectId, g.id, (v || null) as never));
                    }}
                    className={select}
                  >
                    <option value="">No access</option>
                    <option value="viewer">Viewer</option>
                    {objectType === "dashboard" && <option value="editor">Editor</option>}
                  </select>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
