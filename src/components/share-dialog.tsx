"use client";
import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { setShare } from "@/app/canvas-actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import type { Profile, Share } from "@/lib/types";

/** GLOSSARY: Share. Dashboards can be shared as Viewer or Editor; metrics as Viewer. */
export function ShareDialog({ objectType, objectId, name, ownerId, people, shares }: { objectType: "metric" | "dashboard"; objectId: number; name: string; ownerId: string; people: Profile[]; shares: Share[] }) {
  const [pending, start] = useTransition();
  const others = people.filter((p) => p.id !== ownerId);
  const initial = (id: string) => shares.find((s) => s.object_type === objectType && s.object_id === objectId && s.user_id === id)?.role ?? "";
  const [roles, setRoles] = useState<Record<string, string>>(() => Object.fromEntries(people.map((p) => [p.id, initial(p.id)])));
  const roleOf = (id: string) => roles[id] ?? "";
  const n = others.filter((p) => roleOf(p.id)).length;
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
      </DialogContent>
    </Dialog>
  );
}
