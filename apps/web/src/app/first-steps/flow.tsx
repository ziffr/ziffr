"use client";
// First Steps as the browser runs it (spec 0067; GLOSSARY: First Steps): which screen shows, the answers kept so far,
// and each step as an entry in the browser's history, so that a reload and the browser's Back both work.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { NO_ANSWERS, questionScreens, screenFor, type FirstStepsAnswers, type FirstStepsScreen } from "@ziffr/core/first-steps-screens";
import { useConfirm } from "@/components/confirm-dialog";
import { browserDefaults } from "./browser";
import { draftKey, dropDraft, keepDraft, loadDraft } from "./draft";
import { SCREENS } from "./screens/registry";
import type { FirstStepsContext } from "./screens/types";
import { Shell } from "./shell";

const never = () => () => {};

/** First Steps. Drawn in the browser only: what shows depends on what this browser has kept. */
export function FirstStepsFlow({ context }: { context: FirstStepsContext }) {
  const inBrowser = useSyncExternalStore(never, () => true, () => false);
  return inBrowser ? <Flow key={context.workspace?.id ?? ""} context={context} /> : null;
}

// How many First Steps entries lie behind this one in the browser's history; a freshly loaded page has none.
const depth = () => (window.history.state as { firstSteps?: number } | null)?.firstSteps ?? 0;

function urlOf(screen: FirstStepsScreen): string {
  const query = new URLSearchParams(window.location.search);
  query.delete("unsaved");
  query.set("step", screen);
  return `${window.location.pathname}?${query}`;
}

function Flow({ context }: { context: FirstStepsContext }) {
  const made = context.workspace;
  const key = draftKey(context.personId, made?.id ?? null);
  // The Workspace's own answers once it exists, else what the browser says about the day and the money.
  const fresh = (): FirstStepsAnswers => made?.answers ?? { ...NO_ANSWERS, ...browserDefaults(navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone) };
  const [answers, setAnswers] = useState(() => loadDraft(key) ?? fresh());
  const screen = screenFor(useSearchParams().get("step"), answers.who, made?.resume ?? null);
  const { confirm, dialog } = useConfirm();

  // A page the browser brings back from its memory may show the Workspace as not made yet: load it anew.
  useEffect(() => {
    const again = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); };
    window.addEventListener("pageshow", again);
    return () => window.removeEventListener("pageshow", again);
  }, []);

  function update(patch: Partial<FirstStepsAnswers>): FirstStepsAnswers {
    const kept = { ...answers, ...patch };
    setAnswers(kept);
    keepDraft(key, kept);
    return kept;
  }
  function go(to: FirstStepsScreen) {
    window.history.pushState({ firstSteps: depth() + 1 }, "", urlOf(to));
  }
  function next(patch: Partial<FirstStepsAnswers>) {
    const questions = questionScreens(update(patch).who);
    go(questions[questions.indexOf(screen) + 1] ?? "workspace");
  }
  function back() {
    if (depth() > 0) return window.history.back();
    // Opened or reloaded here: step to the screen before this one.
    const questions = questionScreens(answers.who);
    const at = questions.indexOf(screen);
    const before = at > 0 ? questions[at - 1] : screen === "start" ? "workspace" : screen === "sender" ? "value" : screen === "done" ? "sender" : "start";
    window.history.replaceState({ firstSteps: 0 }, "", urlOf(before));
  }
  function leave(url: string) {
    dropDraft(key);
    window.location.assign(url);
  }
  async function startOver() {
    if (made && !(await confirm({ title: "Start the questions again?", description: "Nothing you made is deleted.", confirmLabel: "Start over", destructive: false }))) return;
    dropDraft(key);
    setAnswers(fresh());
    go("who");
  }

  const Screen = SCREENS[screen];
  return (
    <Shell screen={screen} answers={answers} made={made !== null} onBack={screen === "who" ? null : back} onStartOver={() => void startOver()} onSignOut={() => dropDraft(key)}>
      <Screen key={screen} context={context} answers={answers} update={update} go={go} next={next} leave={leave} />
      {dialog}
    </Shell>
  );
}
