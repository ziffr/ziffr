"use client";
// The Tags page's list (GLOSSARY: Tag; spec 0038): each Tag with its Metric count as a link to the filtered Metrics list, and for
// Owners and Admins rename, merge and delete. The core checks who may and every word; deleting says what it touches, asked
// from the core, with "and any you cannot" only when Metrics out of the person's sight carry the Tag, and nothing more.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/confirm-dialog";
import { deleteTag, mergeTags, renameTag, tagImpact } from "@/app/tag-actions";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { tagFilterHref } from "@/lib/tag-filter";

type Row = { id: string; name: string; metrics: number };
const count = (n: number) => `${n} Metric${n === 1 ? "" : "s"}`;

/** The list; `keeper` shows the buttons (the core refuses anyone else again). */
export function TagsList({ tags, keeper }: { tags: Row[]; keeper: boolean }) {
  const [editing, setEditing] = useState<{ id: string; mode: "rename" | "merge" } | null>(null);
  const [text, setText] = useState("");
  const [into, setInto] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const run = (work: () => Promise<unknown>, done: string) => start(async () => {
    try {
      const r = await work();
      if (isActionError(r)) { toast.error("Not changed", { description: r.error }); return; }
      toast.success(done);
      setEditing(null);
      router.refresh();
    } catch {
      toast.error("Not changed", { description: UNEXPECTED });
    }
  });
  const remove = (t: Row) => start(async () => {
    try {
      const i = await tagImpact(t.id);
      if (isActionError(i)) { toast.error("Not deleted", { description: i.error }); return; }
      const ok = await confirm({
        title: `Delete the Tag “${i.name}”?`,
        description: `This removes the Tag from ${count(i.metrics)} you can see${i.hidden ? " and any you cannot" : ""}. The Metrics themselves stay.`,
        confirmLabel: "Delete Tag",
      });
      if (!ok) return;
      const r = await deleteTag(t.id);
      if (isActionError(r)) { toast.error("Not deleted", { description: r.error }); return; }
      toast.success("Tag deleted");
      router.refresh();
    } catch {
      toast.error("Not deleted", { description: UNEXPECTED });
    }
  });
  return (
    <>
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
        {tags.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
            <span className="min-w-0 max-w-[16rem] truncate font-medium">{t.name}</span>
            <Link href={tagFilterHref([t.name])} className="text-xs text-muted-foreground underline-offset-2 hover:underline">{count(t.metrics)}</Link>
            {keeper && editing?.id !== t.id && (
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing({ id: t.id, mode: "rename" }); setText(t.name); }}>Rename</Button>
                {tags.length > 1 && <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing({ id: t.id, mode: "merge" }); setInto(""); }}>Merge into…</Button>}
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(t)}>Delete</Button>
              </span>
            )}
            {keeper && editing?.id === t.id && editing.mode === "rename" && (
              <form className="ml-auto flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => renameTag(t.id, text), "Tag renamed"); }}>
                <Input aria-label={`New name for ${t.name}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={64} className="h-8 w-48" />
                <Button type="submit" size="sm" disabled={pending || !text.trim()}>Save</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </form>
            )}
            {keeper && editing?.id === t.id && editing.mode === "merge" && (
              <form className="ml-auto flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => mergeTags(t.id, into), `Merged into the other Tag`); }}>
                <select aria-label={`Merge ${t.name} into`} value={into} onChange={(e) => setInto(e.target.value)} className="h-8 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
                  <option value="">Choose a Tag</option>
                  {tags.filter((o) => o.id !== t.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <Button type="submit" size="sm" disabled={pending || !into}>Merge</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {dialog}
    </>
  );
}
