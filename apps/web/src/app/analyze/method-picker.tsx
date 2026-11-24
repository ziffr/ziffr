"use client";
// The methods panel's body (GLOSSARY: Analysis Canvas, Method, Takeaway; spec 0041, ticket 16; the owner's words of 2026-11-24): the
// list of Methods grouped by what a person wants to know and fitted to the Metrics on the canvas, as headings only. Choosing a title
// opens it in place with what it is, when to use it and the fields for its Slots and settings, and runs it through the Takeaway layer
// in the core, the same code the Recipes use, so the minimums, ranges, strength words and footers are the same. The answer is handed to
// the page (`onResult`), which shows it under the canvas; it is not drawn here. Everything is asked of the core through server actions:
// the list names only Metrics this person sees.
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { EntryView, PickerList } from "@ziffr/core/analysis-picker";
import { pickerList, pickerRun } from "@/app/picker-actions";
import { AskForm, startAnswers, titleOf, type Answers } from "./picker-ask";
import { PickerGroups } from "./picker-list";
import type { Done, ResultItem } from "./results";

/** The names of the Metrics the answers name, once each, in the order of the Slots. */
function namesOf(answers: Answers, list: PickerList): string[] {
  const ids = [...new Set(Object.values(answers.slots).flat())];
  return ids.flatMap((id) => list.canvas.find((m) => m.id === id)?.name ?? []);
}

// The fields of the open Method, with Work it out. The answer goes to the page.
function Open({ entry, list, onResult }: { entry: EntryView; list: PickerList; onResult: (r: Omit<ResultItem, "key">) => void }) {
  const [answers, setAnswers] = useState<Answers>(() => startAnswers(entry));
  const [message, setMessage] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [pending, start] = useTransition();
  const asked = useRef(0);
  const title = titleOf(entry, answers, list.canvas);
  const run = () => start(async () => {
    const n = ++asked.current;
    const res = await pickerRun({ entry: entry.id, slots: answers.slots, settings: answers.settings });
    // An answer for fields that have been changed since is not shown.
    if (n !== asked.current) return;
    setMessage(res.ok ? null : res.message);
    setShown(res.ok);
    if (res.ok) onResult({ entry, title, about: namesOf(answers, list), done: res as Done });
  });
  return (
    <>
      <AskForm entry={entry} title={title} canvas={list.canvas} answers={answers} onChange={(a) => { asked.current++; setAnswers(a); setMessage(null); setShown(false); }} onRun={run} pending={pending} />
      {message && <p role="alert" className="mt-2 text-xs text-destructive">{message}</p>}
      {shown && <p role="status" className="mt-2 text-xs text-muted-foreground">The answer is under the canvas.</p>}
    </>
  );
}

/** The body of the methods panel: the list of Methods for the Metrics on the canvas (`ids`), and the fields of the one chosen (`openEntry` starts it open). */
export function MethodPicker({ ids, explains = null, writes = false, openEntry = null, onResult }: { ids: number[]; explains?: number | null; /** Owner or Admin: shows the way into the Playground at the end of the list. */ writes?: boolean; openEntry?: EntryView["id"] | null; onResult: (r: Omit<ResultItem, "key">) => void }) {
  const [list, setList] = useState<(PickerList & { key: string }) | null>(null);
  const [openId, setOpenId] = useState<EntryView["id"] | null>(openEntry);
  const [failed, setFailed] = useState(false);
  const asked = useRef(0);
  const key = `${ids.join(",")}:${explains ?? ""}`;
  // The list is asked again when the canvas changes; an older answer that arrives late is dropped.
  useEffect(() => {
    const n = ++asked.current;
    pickerList(ids, explains).then((l) => { if (n === asked.current) { setList({ ...l, key }); setFailed(false); } }, () => { if (n === asked.current) setFailed(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the canvas
  }, [key]);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Pick the question you want answered. What fits the Metrics on the canvas comes first; a question that does not fit stays here, greyed, with the reason.</p>
      {failed && <p role="alert" className="text-xs text-destructive">The list could not be loaded. Try again in a moment.</p>}
      {list?.notice && <p role="note" className="text-xs text-muted-foreground">{list.notice}</p>}
      {!list && !failed && <p className="text-xs text-muted-foreground">Loading the list…</p>}
      {list && <PickerGroups list={list} openId={openId} onPick={(id) => setOpenId((cur) => (cur === id ? null : id))} ask={(e) => <Open key={`${e.id}:${list.key}`} entry={e} list={list} onResult={onResult} />} />}
      {/* Only those who may add a Method to the Workspace are shown the way to write one: for everyone else there is no link. */}
      {writes && <p className="border-t border-[var(--color-rule-2)] pt-3 text-xs text-muted-foreground">Can&rsquo;t find the question you want? <Link href="/settings/library/playground" className="text-primary underline-offset-4 hover:underline">Write your own method</Link></p>}
    </div>
  );
}
