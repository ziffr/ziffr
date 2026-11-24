"use client";
// A Metric's Tags (GLOSSARY: Tag; spec 0038): its owner and its Editors type words and take them off. The Workspace's Tags the
// person sees are offered as they type; a new word is accepted as it is (a Guest only uses Tags they see, and the core says
// so). The core normalises, limits and checks every word; this only collects them. Tags are text, never markup.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { addTags, removeTag } from "@/app/tag-actions";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { TAGS_PER_METRIC } from "@ziffr/pack/tag-names";

/** The chips with a remove button each, and a field to add words (separated by commas, or Enter). `suggestions` are the Tags
 * the person sees, so nothing is offered that they could not already see through a Metric. */
export function TagsEditor({ metricId, tags, suggestions, guest }: { metricId: number; tags: string[]; suggestions: string[]; guest: boolean }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const have = new Set(tags.map((t) => t.toLowerCase()));
  const offered = suggestions.filter((s) => !have.has(s.toLowerCase()));
  const add = () => {
    const words = text.split(",").map((w) => w.trim()).filter(Boolean);
    if (!words.length) return;
    start(async () => {
      try {
        const r = await addTags(metricId, words);
        if (isActionError(r)) { toast.error("Not saved", { description: r.error }); return; }
        setText("");
        router.refresh();
      } catch {
        toast.error("Not saved", { description: UNEXPECTED });
      }
    });
  };
  const remove = (name: string) => start(async () => {
    try {
      const r = await removeTag(metricId, name);
      if (isActionError(r)) { toast.error("Not removed", { description: r.error }); return; }
      router.refresh();
    } catch {
      toast.error("Not removed", { description: UNEXPECTED });
    }
  });
  const full = tags.length >= TAGS_PER_METRIC;
  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li key={t} className="flex items-center gap-1 rounded-full border border-border bg-muted py-0.5 pl-2.5 pr-1 text-xs">
              <span className="max-w-[12rem] truncate">{t}</span>
              <button type="button" aria-label={`Remove the Tag ${t}`} disabled={pending} onClick={() => remove(t)} className="rounded-full p-0.5 text-muted-foreground hover:bg-[var(--color-paper-2)]"><X className="size-3" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="sr-only" htmlFor={`tag-input-${metricId}`}>Add a Tag</label>
        <input
          id={`tag-input-${metricId}`} value={text} onChange={(e) => setText(e.target.value)} list={`tag-offers-${metricId}`} maxLength={200} disabled={full}
          placeholder={full ? `At most ${TAGS_PER_METRIC} Tags` : guest ? "Pick one of the Tags you can see" : "Type a word, then Enter"}
          className="h-8 w-32 sm:w-56 rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm"
        />
        <datalist id={`tag-offers-${metricId}`}>{offered.map((s) => <option key={s} value={s} />)}</datalist>
        <Button type="submit" size="sm" variant="outline" disabled={pending || !text.trim() || full}>Add</Button>
      </form>
    </div>
  );
}
