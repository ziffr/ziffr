"use client";
// Feedback (spec 0049, ticket #916; GLOSSARY: Feedback, Slide-over): the form in the side panel and "My feedback" under
// it. Hosted Ziffr only (the user menu shows the entry only there; the core refuses anywhere else). The form says what
// is true now: the words are kept, will be reviewed, and will be public on GitHub; the person's name and Workspace data
// are never sent, and Ziffr adds only the page route and the app version. Sending and listing go through the server
// actions, which call the core; the route is the page the person is on, cut down again by the core.
import { useEffect, useState, useTransition } from "react";
import { myFeedback, myFeedbackThread, replyToMyFeedback, sendFeedback } from "@/app/feedback-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isActionError } from "@/lib/action-error";
import { FEEDBACK_KINDS, FEEDBACK_WORDS_MAX, type FeedbackKind, type FeedbackStatus } from "@ziffr/core/feedback-rules";
import type { MyFeedback, MyFeedbackThread } from "@ziffr/core/feedback";
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

/** One feedback as a conversation: the person's words, the Ziffr team's answers and their replies, and a reply box while it is open or answered. The team's words are plain text (never a link or markup). */
function Conversation({ id, onBack }: { id: string; onBack: () => void }) {
  const [thread, setThread] = useState<MyFeedbackThread | null | "failed" | undefined>(undefined);
  const [words, setWords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    myFeedbackThread(id).then((r) => live && setThread(isActionError(r) ? "failed" : r)).catch(() => live && setThread("failed"));
    return () => { live = false; };
  }, [id]);

  const back = <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>Back to My feedback</Button>;
  if (thread === undefined) return <div className="flex flex-col gap-3">{back}<p className="text-sm text-muted-foreground" aria-live="polite">Loading…</p></div>;
  if (thread === "failed" || thread === null) return <div className="flex flex-col gap-3">{back}<p className="text-sm">This feedback did not load. Go back and try again.</p></div>;

  const left = FEEDBACK_WORDS_MAX - words.length;
  const canReply = thread.status === "open" || thread.status === "answered";
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (words.trim() === "") return setError("Write your reply first.");
    if (words.length > FEEDBACK_WORDS_MAX) return setError(`Keep it under ${FEEDBACK_WORDS_MAX} characters.`);
    setError(null); setDone(false);
    start(async () => {
      try {
        const r = await replyToMyFeedback({ id, words });
        if (isActionError(r)) return setError(r.error);
        setThread((t) => (t && t !== "failed" ? { ...t, status: t.status === "answered" ? "open" : t.status, messages: [...t.messages, r] } : t));
        setWords(""); setDone(true);
      } catch {
        setError("Your reply could not be sent. Please try again.");
      }
    });
  };
  const bubble = "whitespace-pre-wrap break-words rounded-md border border-border p-2.5 text-sm";
  return (
    <div className="flex flex-col gap-4">
      {back}
      <p className="text-xs text-muted-foreground">{KIND_WORDS[thread.kind].label}, {STATUS_WORDS[thread.status].toLowerCase()}, sent {formatDate(thread.createdAt)}</p>
      <ol className="flex flex-col gap-3" aria-label="Conversation">
        <li><p className="mb-1 text-xs font-medium">You</p><p className={bubble}>{thread.words}</p></li>
        {thread.messages.map((m, i) => (
          <li key={i}>
            <p className="mb-1 text-xs font-medium">{m.fromTeam ? "The Ziffr team" : "You"} <span className="font-normal text-muted-foreground">{formatDate(m.at)}</span></p>
            <p className={m.fromTeam ? `${bubble} bg-muted/40` : bubble}>{m.words}</p>
          </li>
        ))}
      </ol>
      {canReply ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-2">
          <label htmlFor="feedback-reply" className="text-sm font-medium">Your reply</label>
          <Textarea id="feedback-reply" value={words} onChange={(e) => { setWords(e.target.value); setDone(false); }} rows={4} aria-describedby="feedback-reply-count feedback-reply-note" aria-invalid={error ? true : undefined} />
          <p id="feedback-reply-count" className={left < 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"} aria-live="polite"><span className="fig">{words.length}</span> of <span className="fig">{FEEDBACK_WORDS_MAX}</span> characters</p>
          <p id="feedback-reply-note" className="text-xs text-muted-foreground">Your reply is posted on GitHub as a comment from &ldquo;A Ziffr user&rdquo;, without your name. It is public.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {done && <p role="status" className="text-sm">Your reply was saved and will be posted shortly.</p>}
          <Button type="submit" disabled={pending} className="w-fit">{pending ? "Sending…" : "Send reply"}</Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{thread.status === "closed" ? "This feedback is closed, so it takes no more replies." : "It is waiting for review. You can reply once it is open."}</p>
      )}
    </div>
  );
}

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
  const [open, setOpen] = useState<string | null>(null);

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

  if (open) return <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4"><Conversation id={open} onBack={() => { setOpen(null); setReload((n) => n + 1); }} /></div>;
  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
      {sent ? (
        <div role="status" className="flex flex-col items-start gap-2 text-sm">
          <p className="font-medium">Thank you.</p>
          <p>Your feedback was received. Once it is filed, your words are public on GitHub. You will see what happens to it under My feedback.</p>
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
                <button type="button" onClick={() => setOpen(f.id)} className="block w-full rounded-sm text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="block">{firstWords(f.words)}</span>
                  <span className="block text-xs text-muted-foreground">{KIND_WORDS[f.kind].label}, {STATUS_WORDS[f.status].toLowerCase()}, sent {formatDate(f.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
