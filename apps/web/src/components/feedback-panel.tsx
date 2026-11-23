"use client";
// Feedback (spec 0049, ticket #916; GLOSSARY: Feedback, Slide-over): the form in the side panel and "My feedback" under
// it. Hosted Ziffr only (the user menu shows the entry only there; the core refuses anywhere else). The form says what
// is true now: the words are kept, will be reviewed, and will be public on GitHub; the person's name and Workspace data
// are never sent, and Ziffr adds only the page route and the app version. Sending and listing go through the server
// actions, which call the core; the route is the page the person is on, cut down again by the core.
import { useEffect, useState, useTransition } from "react";
import { myFeedback, sendFeedback } from "@/app/feedback-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isActionError } from "@/lib/action-error";
import { FEEDBACK_KINDS, FEEDBACK_WORDS_MAX, type FeedbackKind, type FeedbackStatus } from "@ziffr/core/feedback-rules";
import type { MyFeedback } from "@ziffr/core/feedback";
import { formatDate } from "@ziffr/core/format";

// The kinds, in the words a person would use.
const KIND_WORDS: Record<FeedbackKind, { label: string; hint: string }> = {
  problem: { label: "A problem", hint: "Something is wrong or confusing" },
  idea: { label: "An idea", hint: "Something that would help" },
  question: { label: "A question", hint: "Something you could not find out" },
};

// The statuses as a person reads them.
const STATUS_WORDS: Record<FeedbackStatus, string> = { waiting_for_review: "Waiting for review", open: "Open", answered: "Answered", closed: "Closed" };

const FIRST_WORDS = 90;
const firstWords = (words: string) => { const one = words.replace(/\s+/g, " ").trim(); return one.length > FIRST_WORDS ? `${one.slice(0, FIRST_WORDS).trimEnd()}…` : one; };

type Mine = { state: "loading" } | { state: "failed"; words: string } | { state: "ready"; rows: MyFeedback[] };

/** The form and the list. `route` is the page the person was on when they opened it. */
export function FeedbackPanel({ route }: { route: string }) {
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [words, setWords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const [mine, setMine] = useState<Mine>({ state: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    myFeedback().then((r) => live && setMine(isActionError(r) ? { state: "failed", words: r.error } : { state: "ready", rows: r })).catch(() => live && setMine({ state: "failed", words: "The list did not load. Close this and try again." }));
    return () => { live = false; };
  }, [reload]);

  const left = FEEDBACK_WORDS_MAX - words.length;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // The same checks as the server's, so the person is told before anything is sent; the server checks again.
    if (!kind) return setError("Choose what kind of feedback this is.");
    if (words.trim() === "") return setError("Write what you want to tell us.");
    if (words.length > FEEDBACK_WORDS_MAX) return setError(`Keep it under ${FEEDBACK_WORDS_MAX} characters.`);
    setError(null);
    start(async () => {
      try {
        const r = await sendFeedback({ kind, words, route });
        if (isActionError(r)) return setError(r.error);
        setSent(true); setWords(""); setKind(null); setReload((n) => n + 1);
      } catch {
        setError("Your feedback could not be sent. Please try again.");
      }
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
      {sent ? (
        <div role="status" className="flex flex-col items-start gap-2 text-sm">
          <p className="font-medium">Thank you.</p>
          <p>It is saved and waiting to be filed. You will see what happens to it under My feedback.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setSent(false)}>Send more feedback</Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">What is it?</legend>
            {FEEDBACK_KINDS.map((k) => (
              <label key={k} className="flex cursor-pointer items-start gap-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
                <input type="radio" name="feedback-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-0.5 accent-[var(--color-ink)]" />
                <span><span className="font-medium">{KIND_WORDS[k].label}</span> <span className="text-muted-foreground">{KIND_WORDS[k].hint}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="feedback-words" className="text-sm font-medium">Your words</label>
            <Textarea id="feedback-words" value={words} onChange={(e) => setWords(e.target.value)} rows={6} aria-describedby="feedback-notice feedback-count" aria-invalid={error ? true : undefined} />
            <p id="feedback-count" className={left < 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"} aria-live="polite">
              <span className="fig">{words.length}</span> of <span className="fig">{FEEDBACK_WORDS_MAX}</span> characters
            </p>
          </div>
          <p id="feedback-notice" className="rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
            Your words will be public on GitHub. Your name and your Workspace&apos;s data are never sent. Ziffr adds only the page you are on and the version of the app. Do not write anything private.
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-fit">{pending ? "Sending…" : "Send feedback"}</Button>
        </form>
      )}

      <section aria-labelledby="my-feedback">
        <h3 id="my-feedback" className="mb-2 text-sm font-medium">My feedback</h3>
        {mine.state === "loading" && <p className="text-sm text-muted-foreground" aria-live="polite">Loading…</p>}
        {mine.state === "failed" && <p className="text-sm">{mine.words}</p>}
        {mine.state === "ready" && mine.rows.length === 0 && <p className="text-sm text-muted-foreground">You have not sent any feedback yet.</p>}
        {mine.state === "ready" && mine.rows.length > 0 && (
          <ul className="divide-y divide-border">
            {mine.rows.map((f) => (
              <li key={f.id} className="py-2.5 text-sm">
                <span className="block">{firstWords(f.words)}</span>
                <span className="block text-xs text-muted-foreground">{KIND_WORDS[f.kind].label}, {STATUS_WORDS[f.status].toLowerCase()}, sent {formatDate(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
