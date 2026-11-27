"use client";
// "Try it" (spec 0068; GLOSSARY: Pack, Position, Repeat): the screens of the guided set-up over the very file an export
// would write, so its author walks them as whoever gets it will, with made-up people, over the whole page.
// Security: it writes nothing. What it is given was read by the core for someone who may export; from there on all
// happens in the browser with the core's pure steps and plan: this module and what it hands the screens call no server
// action, keep nothing in the browser, name nobody of the Workspace and leave the page's address alone. "Set it up" ends
// the try: there is no step to take, so nothing can be installed, added or sent.
import { useMemo, useState } from "react";
import { ScreenHeading } from "@/app/first-steps/parts";
import { PHONE_ACTIONS, PHONE_BUTTON } from "@/app/setup/phone";
import { PackFlow, type PackFlowData } from "@/app/use-pack/flow";
import { Lines } from "@/app/use-pack/parts";
import { askedWhen } from "@/app/use-pack/when";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { PackExportTry } from "@ziffr/core/pack-export-try";
import { planStart, type StartContext, type StartPlan } from "@ziffr/core/pack-start-plan";
import { startSteps, type StartChoices, type StartRoom } from "@ziffr/core/pack-start-steps";

/** The made-up Workspace of a try: nothing limits it, and its people exist nowhere. */
const ROOM: StartRoom = { metrics: null, trial: null, practice: false };
const PEOPLE: StartContext = {
  me: { id: "try-me", name: "Alex Example" },
  people: [{ id: "try-sam", name: "Sam Example", kind: "member" }, { id: "try-kim", name: "Kim Example", kind: "contact" }],
};

/** What the screens of a try are given: the file's declarations and drawing, and the made-up Workspace. `today` is a
 * day such as "2026-03-02". */
function tryData(made: PackExportTry, viewer: string, numberStyle: NumberStyle, today: string): PackFlowData {
  const [preview] = startSteps(made.declarations, ROOM);
  return {
    options: {
      pack: { ...made.pack, installId: null }, declarations: made.declarations, room: ROOM, me: PEOPLE.me, people: PEOPLE.people,
      assistantTexts: made.assistantTexts, clock: { today, hour: 12, timeZone: "UTC", runHour: 8, todayRan: true }, unfinished: null,
      blocked: preview.step === "preview" ? preview.blocked : null,
    },
    view: null, drawing: made.drawing, templates: {}, feeds: [], viewer, numberStyle,
  };
}

/** Where a try ends: what a real set-up would have asked of whom. */
function TryEnd({ plan, data, onAgain, onClose }: { plan: StartPlan; data: PackFlowData; onAgain: () => void; onClose: () => void }) {
  const { declarations, clock } = data.options;
  const asked = plan.asked.map((a) => {
    const who = a.person === "me" ? "You" : plan.people.find((p) => p.ref === a.person)?.name ?? "Someone";
    return `${who}: ${a.metrics.length} ${a.metrics.length === 1 ? "number" : "numbers"}.`;
  });
  return (
    <>
      <ScreenHeading title="That is the whole set-up">This was a try: nothing was made, nobody was added and nothing was sent.</ScreenHeading>
      <div className="space-y-5">
        <Lines title="Who would be asked" items={asked.length ? asked : ["Nobody."]} />
        <Lines title="When" items={askedWhen(plan, declarations, clock)} />
        <Lines title="Would be left out" items={plan.leftOut.map((l) => `Not made: ${l.name}. ${l.why}`)} />
        <p className="text-sm text-muted-foreground">After a real set-up, the last screen opens what was made.</p>
        <div className={PHONE_ACTIONS}>
          <Button type="button" className={`${PHONE_BUTTON} sm:px-6`} onClick={onClose}>Back to the export</Button>
          <Button type="button" variant="ghost" className={PHONE_BUTTON} onClick={onAgain}>Try it again</Button>
        </div>
      </div>
    </>
  );
}

/** A try of one exported Pack, over the whole page. */
export function TryIt({ made, viewer, numberStyle, onClose }: { made: PackExportTry; viewer: string; numberStyle: NumberStyle; onClose: () => void }) {
  // Each round starts the questions anew.
  const [round, setRound] = useState(0);
  const data = useMemo(() => tryData(made, viewer, numberStyle, new Date().toISOString().slice(0, 10)), [made, viewer, numberStyle]);
  const actions = useMemo(() => ({ check: async (choices: StartChoices) => planStart(made.declarations, ROOM, choices, PEOPLE) }), [made]);
  const setsUp = startSteps(made.declarations, ROOM).some((s) => s.step === "preview" && s.setsUp);
  const tryOut = {
    notice: "A try of your Pack, with made-up people. Nothing is saved, made or sent.",
    onClose,
    end: (choices: StartChoices) => <TryEnd plan={planStart(made.declarations, ROOM, choices, PEOPLE)} data={data} onAgain={() => setRound((n) => n + 1)} onClose={onClose} />,
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false} className="top-0 left-0 block h-svh w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none bg-background p-0 sm:max-w-none"
        // Each screen's heading takes the focus: the new screen is shown from its top.
        onFocus={(e) => { if (e.target.tagName === "H1") e.currentTarget.scrollTop = 0; }}
      >
        <DialogTitle className="sr-only">Try it: {made.pack.name}</DialogTitle>
        <DialogDescription className="sr-only">The set-up as whoever gets this Pack sees it, with made-up people. Nothing is saved, made or sent.</DialogDescription>
        {setsUp
          ? <PackFlow key={round} data={data} actions={actions} keep={null} tryOut={tryOut} />
          : (
            <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-12">
              <ScreenHeading title="There are no questions to try">This Pack has no dashboard, deck or Workflow, so nothing is asked: whoever gets it adds it to their Workspace.</ScreenHeading>
              <Button type="button" className={`${PHONE_BUTTON} sm:px-6`} onClick={onClose}>Back to the export</Button>
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}
