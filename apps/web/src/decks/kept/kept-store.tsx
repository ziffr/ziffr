"use client";
// The kept numbers of a deck's slides while it is on screen or being exported (spec 0061; GLOSSARY: Snapshot Part,
// Slide, Deck): which shapes keep numbers, what the core answered for this viewer, and asking it again when a slide
// draws something new.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { computed, useEditor, useValue, type Computed, type Editor, type TLShapeId } from "tldraw";
import { isActionError, type ActionError } from "@/lib/action-error";
import { keptRequests, keptShapes, type KeptRequest, type KeptShape } from "@ziffr/core/snapshot-parts";
import { asksAll, type Kept } from "./kept-drawing";

/** What the core answered for the deck on screen. */
export const KeptNumbers = createContext<Kept | null>(null);

// tldraw renders shapes for image export in a separate React tree, outside the provider: the answer is parked here too.
let exportKept: Kept | null = null;
/** Parks the answer for shapes drawn outside the page's React tree. */
export const setDeckExportKept = (kept: Kept | null) => (exportKept = kept);

/** The answer a shape draws from. */
export const useKept = () => useContext(KeptNumbers) ?? exportKept;

/** The shapes of the page, read as a deck's stored document is. */
const documentOf = (editor: Editor) => ({ store: Object.fromEntries(editor.getCurrentPageShapes().map((s) => [s.id, s])) });

const cache = new WeakMap<Editor, Computed<Map<string, KeptShape>>>();

/** The editor's shapes that keep numbers, by shape id; worked out once per change, however many shapes ask. */
export function keptOf(editor: Editor): Map<string, KeptShape> {
  let found = cache.get(editor);
  if (!found) {
    found = computed("kept shapes", () => new Map(keptShapes(documentOf(editor)).map((s) => [s.id, s])));
    cache.set(editor, found);
  }
  return found.get();
}

/** Whether, and what, one shape keeps. */
export function useKeptShape(id: TLShapeId): KeptShape | undefined {
  const editor = useEditor();
  return useValue("kept shape", () => keptOf(editor).get(id), [editor, id]);
}

/** What the editor's deck asks of its Snapshots, in an order that does not change with the order of its shapes. */
const requestsOf = (editor: Editor) => keptRequests(documentOf(editor))
  .map((r) => ({ snapshotId: r.snapshotId, parts: [...r.parts].sort((a, b) => a - b), metricIds: [...r.metricIds].sort((a, b) => a - b) }))
  .sort((a, b) => a.snapshotId - b.snapshotId);

/** Asks the core for kept numbers: the deck's server action, handed in by the editor. */
type Read = (requests: KeptRequest[]) => Promise<Kept["read"] | ActionError>;

/** The deck editor's kept numbers: what the page sent, asked again when the slides draw something it has not answered.
 * `refresh` asks anew, for an export, and answers what it got. */
export function useDeckKept(editor: Editor | null, initial: Kept, ask: Read): { kept: Kept; refresh: () => Promise<Kept> } {
  const [kept, setKept] = useState(initial);
  const latest = useRef(kept);
  latest.current = kept;
  const wanted = useValue("kept requests", () => (editor ? JSON.stringify(requestsOf(editor)) : null), [editor]);
  // The latest ask wins: an answer that comes back after a newer ask went out does not replace what is on screen.
  const turn = useRef(0);
  const refresh = useCallback(async (): Promise<Kept> => {
    if (!editor) return latest.current;
    const asked = requestsOf(editor);
    if (!asked.length) return latest.current;
    const mine = ++turn.current;
    const read = await ask(asked).catch(() => null);
    const next: Kept = read && !isActionError(read) ? { asked, read } : { ...latest.current, failed: true };
    if (mine === turn.current) {
      latest.current = next;
      setKept(next);
    }
    return next;
  }, [editor, ask]);
  useEffect(() => {
    if (wanted !== null && !asksAll(latest.current, JSON.parse(wanted))) void refresh();
  }, [wanted, refresh]);
  return { kept, refresh };
}
