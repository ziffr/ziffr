"use client";
// The stepped "Set it up" (spec 0068; GLOSSARY: Pack): one call of the core after the other until all is made. A stop
// says in the server's words what happened and what was made, and Try again makes only what is missing: the call starts
// again without a run. Leaving keeps what was made; nothing is sent either way.
import { useCallback, useEffect, useRef, useState } from "react";
import { ScreenHeading } from "@/app/first-steps/parts";
import { PHONE_ACTIONS, PHONE_BUTTON } from "@/app/setup/phone";
import { Button } from "@/components/ui/button";
import { isActionError, shown, type ActionError } from "@/lib/action-error";
import type { SetupRun } from "@ziffr/core/pack-setup";
import type { PackStartResult, PackStartStep } from "@ziffr/core/pack-start";
import { NOTE } from "./parts";

type Props = {
  /** Takes one step: the first, or a try again, without `run`. */
  takeStep: (run: SetupRun | null) => Promise<PackStartStep | ActionError>;
  onDone: (result: PackStartResult) => void;
  /** Back to the answers, after a stop. */
  onChange: () => void;
};

/** Setting up, with how far it is. */
export function SettingUp({ takeStep, onDone, onChange }: Props) {
  const [progress, setProgress] = useState<{ made: number; of: number } | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  // One loop at a time, and none that outlives the screen.
  const busy = useRef(false);
  const here = useRef(true);

  const go = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStopped(null);
    try {
      let run: SetupRun | null = null;
      while (here.current) {
        const answered: PackStartStep | ActionError = await takeStep(run);
        if (isActionError(answered)) { setStopped(answered.error); break; }
        if (answered.done) { onDone(answered.result); break; }
        run = answered.run;
        setProgress({ made: answered.made, of: answered.of });
      }
    } catch (e) {
      setStopped(shown(e));
    } finally {
      busy.current = false;
    }
  }, [takeStep, onDone]);

  const started = useRef(false);
  useEffect(() => {
    here.current = true;
    if (!started.current) { started.current = true; void go(); }
    return () => { here.current = false; };
  }, [go]);

  if (stopped) {
    return (
      <>
        <ScreenHeading key="stopped" title="Setting up stopped">What was made is kept. Nothing was sent.</ScreenHeading>
        <div className="space-y-5">
          <p role="alert" className={NOTE}>{stopped}</p>
          <div className={PHONE_ACTIONS}>
            <Button type="button" className={`${PHONE_BUTTON} sm:px-6`} onClick={() => void go()}>Try again</Button>
            <Button type="button" variant="ghost" className={PHONE_BUTTON} onClick={onChange}>Change my answers</Button>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <ScreenHeading key="running" title="Setting up">Keep this page open. It takes a moment.</ScreenHeading>
      <div className="space-y-3" role="status">
        <progress className="h-2 w-full accent-[var(--color-ink)]" aria-label="Set-up progress" {...(progress ? { value: progress.made, max: progress.of } : {})} />
        <p className="text-sm text-muted-foreground">{progress ? `${progress.made} of ${progress.of} Metrics made` : "Starting…"}</p>
      </div>
    </>
  );
}
