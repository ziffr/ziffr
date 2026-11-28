"use client";
// The deck page of a deck Ziffr makes (GLOSSARY: Deck, Slide, Theme; spec 0069): its slides as drawn, and a form to show
// or hide each, write an own headline, type the answers and choose the design, Theme and footer. What a Viewer sees is
// only the presentation, so this page is for the owner and Editors. It sends changes, never a document.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { clearMadeAnswers, footerOfMadeDeck, renameMadeDeck, saveMadeSlides, themeOfMadeDeck } from "@/app/made-deck-actions";
import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { shown, unwrap } from "@/lib/action-error";
import { slideFontsHref } from "@/decks/slides/fonts";
import { SlideView } from "@/decks/slides/slide-view";
import type { DeckDrawing } from "@ziffr/core/deck-drawing/draw-deck";
import type { Theme } from "@ziffr/core/types";
import type { DeckDescription } from "@ziffr/pack/deck-description";

type Props = { id: number; name: string; footer: string | null; themeId: number | null; themes: Theme[]; description: DeckDescription; drawing: DeckDrawing | null; leftOut: number };

const TYPE_WORDS: Record<string, string> = { cover: "Cover", summary: "Summary", chart: "Chart", table: "Table", "gap-table": "Gap table", bridge: "Bridge", mosaic: "Mosaic", "driver-tree": "Driver tree", questions: "Questions", definitions: "Definitions", about: "About" };

/** The deck as an owner or Editor sees it. */
export function MadeDeckPage({ id, name, footer, themeId, themes, description, drawing, leftOut }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [design, setDesign] = useState(description.design);
  const [deckName, setDeckName] = useState(name);
  const [deckFooter, setDeckFooter] = useState(footer ?? "");
  const [edits, setEdits] = useState<Record<string, { hidden: boolean; headline: string; answers: string[] }>>(() => Object.fromEntries(description.slides.map((s) => [s.id, { hidden: s.hidden, headline: s.headline ?? "", answers: s.answers.map((a) => a.text) }])));
  const set = (slideId: string, change: Partial<(typeof edits)[string]>) => setEdits((all) => ({ ...all, [slideId]: { ...all[slideId]!, ...change } }));

  const run = (work: () => Promise<unknown>, done: string) =>
    start(async () => {
      try {
        unwrap(await work());
        toast.success(done);
        router.refresh();
      } catch (err) {
        toast.error("Not saved", { description: shown(err) });
      }
    });

  const save = () =>
    run(async () => {
      const slides = description.slides.flatMap((s) => {
        const e = edits[s.id]!;
        const same = e.hidden === s.hidden && e.headline.trim() === (s.headline ?? "") && e.answers.every((t, i) => t === s.answers[i]!.text);
        return same ? [] : [{ id: s.id, hidden: e.hidden, headline: e.headline.trim() || null, answers: s.answers.map((a, i) => ({ question: a.question, text: e.answers[i] ?? "" })) }];
      });
      const first = await saveMadeSlides(id, { ...(design === description.design ? {} : { design }), slides });
      if (deckName.trim() !== name) unwrap(await renameMadeDeck(id, deckName));
      if (deckFooter.trim() !== (footer ?? "")) unwrap(await footerOfMadeDeck(id, deckFooter));
      return first;
    }, "Saved");

  return (
    <div>
      {drawing && <link rel="stylesheet" href={slideFontsHref(drawing.look.fonts)} />}
      <div className="mb-6 flex flex-wrap items-end gap-3 border-b border-border pb-5">
        <label className="min-w-0 flex-1 basis-60">
          <span className="text-sm text-muted-foreground">Name</span>
          <Input value={deckName} maxLength={120} onChange={(e) => setDeckName(e.target.value)} className="h-11 text-base md:h-9" />
        </label>
        <Link href={`/decks/${id}/present`} className="inline-flex min-h-11 items-center rounded-[var(--radius-input)] bg-primary px-4 text-sm font-medium text-primary-foreground no-underline">Present</Link>
      </div>

      {leftOut > 0 && <p className="mb-4 rounded-[var(--radius-input)] border border-dashed border-[var(--color-rule-2)] p-3 text-sm">{leftOut === 1 ? "1 slide is left out" : `${leftOut} slides are left out`}: it shows a Metric you cannot see.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          <span className="text-muted-foreground">Design</span>
          <select value={design} onChange={(e) => setDesign(e.target.value as typeof design)} className="mt-1 h-11 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-base md:h-9 md:text-sm">
            <option value="band">Band</option>
            <option value="column">Column</option>
          </select>
        </label>
        <div className="text-sm">
          <span className="text-muted-foreground">Theme</span>
          <div className="mt-1"><ThemePicker themes={themes} value={themeId} onChange={(v) => themeOfMadeDeck(id, v).then((r) => { router.refresh(); return r; })} /></div>
        </div>
        <label className="text-sm">
          <span className="text-muted-foreground">Footer</span>
          <Input value={deckFooter} maxLength={120} placeholder="The Theme's footer" onChange={(e) => setDeckFooter(e.target.value)} className="mt-1 h-11 text-base md:h-9" />
        </label>
      </div>

      <ol className="grid gap-6">
        {description.slides.map((s, i) => {
          const e = edits[s.id]!;
          const drawn = drawing?.slides.find((d) => d.id === s.id && !d.part);
          return (
            <li key={s.id} className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] p-3 sm:p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className={e.hidden ? "opacity-50" : undefined}>
                {drawing && drawn ? <SlideView slide={drawn} look={drawing.look} /> : <div className="grid aspect-video place-items-center rounded-[var(--radius-input)] bg-muted text-sm text-muted-foreground">{s.hidden ? "Hidden: not in the presentation" : "Saved to show"}</div>}
              </div>
              <div className="grid content-start gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base">{i + 1}. {TYPE_WORDS[s.type] ?? s.type}</h2>
                  {s.type !== "about" && s.type !== "cover" && (
                    <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                      <input type="checkbox" checked={!e.hidden} onChange={(ev) => set(s.id, { hidden: !ev.target.checked })} className="size-5" />
                      Show
                    </label>
                  )}
                </div>
                {s.type !== "about" && s.type !== "cover" && (
                  <label className="text-sm">
                    <span className="text-muted-foreground">Own headline</span>
                    <Input value={e.headline} maxLength={140} placeholder="Ziffr writes one" onChange={(ev) => set(s.id, { headline: ev.target.value })} className="mt-1 h-11 text-base md:h-9" />
                  </label>
                )}
                {s.answers.map((a, k) => (
                  <label key={k} className="text-sm">
                    <span className="text-muted-foreground">{a.question}</span>
                    <Textarea value={e.answers[k] ?? ""} maxLength={400} onChange={(ev) => set(s.id, { answers: e.answers.map((t, j) => (j === k ? ev.target.value : t)) })} className="mt-1" />
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-2 border-t border-border bg-background py-3 max-md:bottom-16">
        <Button onClick={save} disabled={pending} className="min-h-11">{pending ? "Saving…" : "Save changes"}</Button>
        {description.slides.some((s) => s.answers.length > 0) && <Button variant="outline" disabled={pending} onClick={() => run(() => clearMadeAnswers(id), "Answers cleared")} className="min-h-11">Clear answers</Button>}
      </div>
    </div>
  );
}
