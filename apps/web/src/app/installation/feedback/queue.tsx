"use client";
// The review queue's table (spec 0049, ticket #919; GLOSSARY: Feedback): one row per waiting feedback with Approve,
// Edit and approve, and Reject with a required reason. The core checks who may and what is valid; this only sends it.
// The words are people's and are shown as text only.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveFeedbackAction, rejectFeedbackAction } from "@/app/installation-feedback-actions";

/** One waiting feedback as the queue gets it: no person, no Workspace. */
type Item = { id: string; kind: string; words: string; route: string | null; appVersion: string | null; createdAt: string };
type Mode = "edit" | "reject" | null;

/** The queue: a table of what waits, or a line saying nothing does. */
export function ReviewQueue({ items }: { items: Item[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing is waiting for review.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">Feedback waiting for review, oldest first</caption>
        <thead className="text-xs text-muted-foreground">
          <tr><th scope="col" className="py-2 pr-3">Kind</th><th scope="col" className="py-2 pr-3">Words</th><th scope="col" className="py-2 pr-3">Page</th><th scope="col" className="py-2 pr-3">Version</th><th scope="col" className="py-2 pr-3">Sent</th><th scope="col" className="py-2"><span className="sr-only">Decide</span></th></tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-rule-2)]">
          {items.map((item) => <Row key={item.id} item={item} />)}
        </tbody>
      </table>
    </div>
  );
}

function Row({ item }: { item: Item }) {
  const [mode, setMode] = useState<Mode>(null);
  const [words, setWords] = useState(item.words);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function send(call: () => Promise<{ error: string } | { ok: true } | undefined>, done: string) {
    start(async () => {
      const r = await call();
      if (r && "error" in r) { setError(r.error); return; }
      toast.success(done);
      router.refresh();
    });
  }
  const cancel = () => { setMode(null); setError(null); };

  return (
    <tr className="align-top">
      <td className="py-3 pr-3 whitespace-nowrap">{item.kind}</td>
      <td className="py-3 pr-3 max-w-[36ch]">
        {mode === "edit" ? (
          <Textarea aria-label="Words, edited" value={words} onChange={(e) => { setWords(e.target.value); setError(null); }} maxLength={2000} rows={4} />
        ) : (
          <span className="whitespace-pre-wrap break-words">{item.words}</span>
        )}
        {mode === "reject" && (
          <label className="mt-2 block text-xs text-muted-foreground">Reason (the person reads it)
            <Textarea value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} maxLength={500} rows={2} className="mt-1 text-foreground" />
          </label>
        )}
        {error && <span role="alert" className="mt-2 block text-sm text-destructive">{error}</span>}
      </td>
      <td className="py-3 pr-3 font-mono text-xs break-all">{item.route ?? "—"}</td>
      <td className="py-3 pr-3 whitespace-nowrap">{item.appVersion ?? "—"}</td>
      <td className="py-3 pr-3 whitespace-nowrap">{item.createdAt.slice(0, 10)}</td>
      <td className="py-3">
        <div className="flex flex-wrap justify-end gap-2">
          {mode === null && (
            <>
              <Button size="sm" disabled={pending} onClick={() => send(() => approveFeedbackAction(item.id), "Approved. It will be filed.")}>Approve</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("edit")}>Edit</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("reject")}>Reject</Button>
            </>
          )}
          {mode === "edit" && (
            <>
              <Button size="sm" disabled={pending || words.trim() === ""} onClick={() => send(() => approveFeedbackAction(item.id, words), "Edited and approved. The person is told.")}>Approve edited words</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={cancel}>Cancel</Button>
            </>
          )}
          {mode === "reject" && (
            <>
              <Button size="sm" variant="destructive" disabled={pending || reason.trim() === ""} onClick={() => send(() => rejectFeedbackAction(item.id, reason), "Rejected. The person is told why.")}>Reject with this reason</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={cancel}>Cancel</Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
