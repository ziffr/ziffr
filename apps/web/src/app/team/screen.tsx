"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGroup, deleteGroup, renameGroup, setMember } from "@/app/team-actions";
import { setAway } from "@/app/workflow-actions";
import type { Group, Profile } from "@ziffr/core/types";

export function TeamScreen({ people, groups, canEdit, viewer, away }: { people: Profile[]; groups: Group[]; canEdit: boolean; viewer: string; away: { user_id: string; starts: string; ends: string }[] }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { await f(); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: (err as Error).message }); } });

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Person</th>
              <th className="py-2 pr-3 font-medium">Away</th>
              {groups.map((g) => (
                <th key={g.id} className="py-2 pr-3 font-medium">
                  {canEdit ? (
                    <span className="flex items-center gap-1">
                      <input
                        aria-label={`Name of ${g.name}`}
                        defaultValue={g.name}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== g.name) run(() => renameGroup(g.id, e.target.value)); }}
                        className="h-8 w-28 rounded-[var(--radius-input)] bg-transparent px-1 font-medium text-foreground hover:bg-muted focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-ring"
                      />
                      <button type="button" aria-label={`Delete ${g.name}`} title="Delete group" disabled={pending} onClick={() => { if (confirm(`Delete ${g.name}? What was shared with it stops being shared; threads limited to it become readable by everyone.`)) run(() => deleteGroup(g.id), "Group deleted"); }} className="flex size-7 items-center justify-center rounded-[var(--radius-input)] hover:bg-muted"><Trash2 className="size-3.5" /></button>
                    </span>
                  ) : g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <th scope="row" className="py-2 pr-3 text-left font-medium">{p.name}<span className="block text-xs font-normal text-muted-foreground">{p.role}</span></th>
                <td className="py-2 pr-3"><AwayDates userId={p.id} current={away.find((a) => a.user_id === p.id)} can={canEdit || p.id === viewer} /></td>
                {groups.map((g) => (
                  <td key={g.id} className="py-2 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`${p.name} in ${g.name}`}
                      checked={g.members.includes(p.id)}
                      disabled={!canEdit || pending}
                      onChange={(e) => run(() => setMember(g.id, p.id, e.target.checked))}
                      className="size-4 accent-[var(--color-ink)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await createGroup(name); setName(""); }, "Group created"); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group, e.g. Finance" aria-label="New group name" />
          <Button type="submit" variant="outline" disabled={pending || !name.trim()}><Plus aria-hidden /> Add</Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners and admins of the workspace change groups.</p>
      )}
    </div>
  );
}

/** While someone is away, their Prompts go to their Stand-in (GLOSSARY: Away). */
function AwayDates({ userId, current, can }: { userId: string; current?: { starts: string; ends: string }; can: boolean }) {
  const [starts, setStarts] = useState(current?.starts ?? "");
  const [ends, setEnds] = useState(current?.ends ?? "");
  const [pending, start] = useTransition();
  const save = (s: string, e: string) => start(async () => { try { await setAway(userId, s || null, e || null); if (s && e) toast.success("Away dates saved"); } catch (err) { toast.error("Not saved", { description: (err as Error).message }); } });
  const field = "h-8 rounded-[var(--radius-input)] border border-input bg-card px-1.5 text-xs disabled:opacity-60";
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <input type="date" aria-label="Away from" value={starts} disabled={!can || pending} onChange={(e) => { setStarts(e.target.value); if (ends && e.target.value) save(e.target.value, ends); }} className={field} />
      to
      <input type="date" aria-label="Away until" value={ends} min={starts || undefined} disabled={!can || pending} onChange={(e) => { setEnds(e.target.value); if (starts && e.target.value) save(starts, e.target.value); }} className={field} />
      {can && (starts || ends) && <button type="button" onClick={() => { setStarts(""); setEnds(""); save("", ""); }} className="underline">Clear</button>}
    </span>
  );
}
