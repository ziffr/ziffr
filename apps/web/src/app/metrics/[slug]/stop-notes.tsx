// Above a Metric's numbers, what stopped requests mean for it (GLOSSARY: Prompt, Submitter): a warning for its owner
// and Editors when nobody is asked any more, and for a person who stopped the emails, the way to switch them on. The
// core says who learns of whose stop (prompt-preview.ts).
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { AskingStops, StoppedSubmitter } from "@ziffr/core/prompt-preview";
import { listed } from "@ziffr/core/pack-places";
import { OptedOutNote } from "@/app/connectors/opted-out";

/** Who stopped what, in a sentence or two; the viewer is "you". */
function whoStopped(people: StoppedSubmitter[], viewer: string): string {
  const say = (list: StoppedSubmitter[], did: string) => (list.length ? [`${listed(list.map((p) => (p.id === viewer ? "You" : p.name)))} ${did}.`] : []);
  return [...say(people.filter((p) => p.ways.includes("email")), "unsubscribed from requests by email"), ...say(people.filter((p) => !p.ways.includes("email")), "stopped these requests")].join(" ");
}

/** The warning and the viewer's own note; nothing when nothing was stopped. */
export function StopNotes({ stops, viewer }: { stops: AskingStops; viewer: string }) {
  const mine = stops.mine.includes("email");
  // When the viewer's own stop is the only one, their note says it all.
  const alone = mine && stops.people.every((p) => p.id === viewer);
  return (
    <>
      {stops.nobody && !alone && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] border border-destructive p-4 text-sm">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 basis-56"><span className="font-medium">Nobody is asked for this number, so it will stay empty.</span> {whoStopped(stops.people, viewer)}</p>
          <Link href="?tab=settings#who-submits" className="inline-flex min-h-8 items-center font-medium underline max-md:min-h-11 pointer-coarse:min-h-11">Choose someone else</Link>
        </div>
      )}
      {mine && <div className="mb-4"><OptedOutNote says={`You are not asked for this number by email, because you unsubscribed.${stops.nobody && alone ? " Nobody else is asked for it, so it will stay empty." : ""}`} /></div>}
    </>
  );
}
