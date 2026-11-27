"use client";
// "Use this pack" as the browser runs it (spec 0068; GLOSSARY: Pack): the preview, one question per screen, the check,
// the stepped set-up and the end. Which screens there are, and what they start with, comes from the core's `startSteps`.
// Each question is an entry in the browser's history, so a reload and the browser's Back both work; the answers are kept
// in this tab until the set-up is done. What it reads and what it does come in as props, so that "Try it" can run the
// same screens without writing anything. It decides nothing: the server checks every answer again.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/confirm-dialog";
import { FRAME_TAP, GuidedFrame } from "@/components/guided-frame";
import { Button, buttonVariants } from "@/components/ui/button";
import { shown, isActionError, type ActionError } from "@/lib/action-error";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { PackStartDrawing, PackStartOptions, PackStartResult, PackStartStep } from "@ziffr/core/pack-start";
import type { StartPlan } from "@ziffr/core/pack-start-plan";
import { startSteps, type StartChoices, type StartStep } from "@ziffr/core/pack-start-steps";
import type { SetupRun } from "@ziffr/core/pack-setup";
import type { PackPreview } from "@ziffr/core/packs";
import { cn } from "@/lib/utils";
import { filledLines, personName, startAnswers, stepAnswer, stepKey, stepTitle, tickedShares, toChoices, type Answers, type LinesStep } from "./answers";
import { CheckScreen } from "./check";
import { DoneScreen } from "./done";
import { dropDraft, keepDraft, loadDraft } from "./draft";
import { LinesScreen } from "./lines";
import { NumbersScreen, type Unit } from "./numbers";
import { PreviewScreen } from "./preview";
import { ProvidersScreen } from "./providers";
import { SettingUp } from "./run";
import { SourceScreen } from "./source";
import { PACKS_PAGE } from "./switch";
import { WhoScreen } from "./who";

/** What the server tells the screens, and nothing more: what starting this Pack offers this Owner or Admin, what its
 * preview draws, and the names a template download needs. */
export type PackFlowData = {
  options: PackStartOptions;
  /** The Pack's whole Preview, where there is one. */
  view: PackPreview | null;
  drawing: PackStartDrawing | null;
  /** The n8n templates' names, by id. */
  templates: Record<string, string>;
  feeds: { id: string; name: string }[];
  viewer: string;
  numberStyle: NumberStyle;
};

/** What the screens can ask the server to do. */
export type PackFlowActions = {
  /** What the answers would make, without writing anything. */
  check: (choices: StartChoices) => Promise<StartPlan | ActionError>;
  /** One step of the set-up. */
  takeStep: (choices: StartChoices, run: SetupRun | null) => Promise<PackStartStep | ActionError>;
};

type Props = {
  data: PackFlowData;
  actions: PackFlowActions;
  /** Where the answers are kept in this tab; null keeps nothing. */
  keep: string | null;
};

const never = () => () => {};

/** The guided set-up. Drawn in the browser only: what shows depends on what this tab has kept. */
export function PackFlow(props: Props) {
  const inBrowser = useSyncExternalStore(never, () => true, () => false);
  return inBrowser ? <Flow {...props} /> : null;
}

// How many entries of this flow lie behind this one in the browser's history; a freshly loaded page has none.
const depth = () => (window.history.state as { usePack?: number } | null)?.usePack ?? 0;

function urlOf(key: string): string {
  const query = new URLSearchParams(window.location.search);
  query.set("step", key);
  return `${window.location.pathname}?${query}`;
}

/** The answers, kept in the tab as they change. */
function useAnswers(keep: string | null, steps: StartStep[], room: PackStartOptions["room"]) {
  const [answers, setAnswers] = useState<Answers>(() => {
    const fresh = startAnswers(steps, room);
    return (keep ? loadDraft(keep, fresh, steps) : null) ?? fresh;
  });
  const change = useCallback((next: Answers) => { setAnswers(next); if (keep) keepDraft(keep, next); }, [keep]);
  const reset = () => { setAnswers(startAnswers(steps, room)); if (keep) dropDraft(keep); };
  return { answers, change, reset };
}

/** What the answers would make, asked again whenever they change while the check shows. */
function usePlan(choices: StartChoices | null, check: PackFlowActions["check"]) {
  const asked = choices && JSON.stringify({ ...choices, confirmed: undefined });
  const [got, setGot] = useState<{ asked: string; plan: StartPlan | null; failed: string | null } | null>(null);
  useEffect(() => {
    if (!asked) return;
    let wanted = true;
    check(JSON.parse(asked) as StartChoices).then(
      (r) => { if (wanted) setGot(isActionError(r) ? { asked, plan: null, failed: r.error } : { asked, plan: r, failed: null }); },
      (e) => { if (wanted) setGot({ asked, plan: null, failed: shown(e) }); },
    );
    return () => { wanted = false; };
  }, [asked, check]);
  return got && got.asked === asked ? got : { plan: null, failed: null };
}

function Flow({ data, actions, keep }: Props) {
  const { options, numberStyle } = data;
  const { declarations, room, me, people, clock } = options;
  const steps = useMemo(() => startSteps(declarations, room), [declarations, room]);
  const preview = steps[0] as Extract<StartStep, { step: "preview" }>;
  const keys = steps.map(stepKey);
  const asked = useSearchParams().get("step");
  const at = options.blocked ? 0 : Math.max(0, keys.indexOf(asked ?? ""));
  const step = steps[at];
  const { answers, change, reset } = useAnswers(keep, steps, room);
  // The choices being set up, from "Set it up" until it is done or the person goes back to the answers.
  const [sent, setSent] = useState<StartChoices | null>(null);
  const [result, setResult] = useState<PackStartResult | null>(null);
  const { confirm, dialog } = useConfirm();

  const choices = toChoices(answers, steps, numberStyle);
  const { plan, failed } = usePlan(step.step === "check" && !sent && !result ? choices : null, actions.check);

  function go(key: string) {
    window.history.pushState({ usePack: depth() + 1 }, "", urlOf(key));
    window.scrollTo(0, 0);
  }
  const next = () => go(keys[at + 1]);
  function back() {
    if (depth() > 0) return window.history.back();
    // Opened or reloaded here: step to the screen before this one.
    window.history.replaceState({ usePack: 0 }, "", urlOf(keys[at - 1] ?? keys[0]));
  }
  async function startOver() {
    if (!(await confirm({ title: "Start the questions again?", description: "What you typed here is cleared. Nothing you made is deleted.", confirmLabel: "Start over", destructive: false }))) return;
    reset();
    go(keys[0]);
  }
  const takeStep = useCallback((run: SetupRun | null) => actions.takeStep(sent!, run), [actions, sent]);
  const done = useCallback((r: PackStartResult) => {
    if (keep) dropDraft(keep);
    setResult(r);
    setSent(null);
    window.scrollTo(0, 0);
  }, [keep]);

  const asks = steps.filter((s) => s.step !== "preview");
  const current = result ? asks.length : sent ? asks.length - 1 : at - 1;
  const rows = steps.slice(1, result ? steps.length : Math.max(1, at)).flatMap((s): [string, string][] => {
    const words = stepAnswer(s, answers, people);
    return words ? [[stepTitle(s), words]] : [];
  });
  const lineSteps = steps.filter((s): s is LinesStep => s.step === "lines");
  const rowName = (repeat: string, id: number) => {
    const of = lineSteps.find((s) => s.repeat === repeat);
    const line = of && filledLines(of, answers).find((l) => l.id === id);
    if (!of || !line) return repeat;
    return of.asksName ? line.name : personName(line.person, people);
  };
  const units: Record<string, Unit> = Object.fromEntries((data.drawing?.sample.metrics ?? []).map((m) => [m.key, { unit: m.unit, unit_position: m.unit_position }]));

  // A plain link: the app around the Packs page is not drawn here, so it is loaded anew.
  const leave = (href: string, words: string) => <a href={href} className={cn(buttonVariants({ variant: "ghost" }), FRAME_TAP)}>{words}</a>;
  const ways = result ? leave("/", "Go to Home") : sent ? null : (
    <>
      {at > 0 && <Button type="button" variant="ghost" className={FRAME_TAP} onClick={() => void startOver()}>Start over</Button>}
      {leave(PACKS_PAGE, "Finish later")}
    </>
  );

  const shared = { answers, onChange: change, onContinue: next };
  const everyone = { room, me, people };
  function screen() {
    if (result) return <DoneScreen result={result} declarations={declarations} feeds={data.feeds} />;
    if (sent) return <SettingUp takeStep={takeStep} onDone={done} onChange={() => setSent(null)} />;
    switch (step.step) {
      case "preview":
        return <PreviewScreen step={preview} view={data.view} drawing={data.drawing} drawn={preview.draws?.kind === "dashboard" ? preview.draws.key : undefined} viewer={data.viewer} numberStyle={numberStyle} blocked={options.blocked} unfinished={options.unfinished?.made ?? null} onUse={next} exit={PACKS_PAGE} />;
      case "lines": return <LinesScreen key={keys[at]} step={step} {...shared} {...everyone} />;
      case "who": return <WhoScreen key={keys[at]} step={step} {...shared} {...everyone} />;
      case "providers": return <ProvidersScreen step={step} {...shared} {...everyone} />;
      case "numbers": return <NumbersScreen step={step} {...shared} style={numberStyle} lines={lineSteps} rowName={rowName} units={units} />;
      case "source": return <SourceScreen step={step} {...shared} templates={data.templates} />;
      case "check":
        return (
          <CheckScreen
            steps={steps} answers={answers} onChange={change} plan={plan} failed={failed} declarations={declarations} clock={clock} room={room} blocked={options.blocked}
            // Ziffr's own Packs are installed by "Set it up", so their confirmations stand here.
            assistantTexts={options.pack.installId === null ? options.assistantTexts : []}
            onSetUp={() => setSent({ ...choices, shares: tickedShares(plan!.shares, answers) })}
          />
        );
    }
  }

  return (
    <GuidedFrame steps={asks.map(stepTitle)} current={current} answers={rows} ways={ways} onBack={result || sent || at === 0 ? null : back} wide={!result && !sent && at === 0}>
      {screen()}
      {dialog}
    </GuidedFrame>
  );
}
