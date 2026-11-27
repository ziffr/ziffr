// First Steps, "Choose a ready-made set" (spec 0067; GLOSSARY: First Steps, Pack): the three that fit best, every one on
// request, and the way to a clean slate instead. It draws what the core offers this person: the Packs' own words.
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { FirstStepsSet, FirstStepsSets } from "@ziffr/core/first-steps-sets";
import { readSets } from "../actions";
import { Quiet, Reading, useShown } from "../closing-parts";
import { Choice, Choices, ScreenHeading } from "../parts";
import type { ScreenProps } from "./types";

/** How many sets show before "Show all". */
const FIRST = 3;

/** The sets to choose from. */
export function SetsScreen({ context, answers, go }: ScreenProps) {
  const ws = context.workspace?.id ?? "";
  const { data, failed, reload } = useShown(() => readSets(ws, answers.topic));
  // "Show all" is kept in the address, so coming back from a set finds the list as it was left.
  const all = useSearchParams().get("all") === "1";
  function showAll() {
    const query = new URLSearchParams(window.location.search);
    query.set("all", "1");
    // The entry keeps its place among the steps. Next.js's own marks stay out of what is passed: with them it would not
    // notice that the address changed.
    const { firstSteps = 0 } = (window.history.state ?? {}) as { firstSteps?: number };
    window.history.replaceState({ firstSteps }, "", `${window.location.pathname}?${query}`);
  }
  return (
    <>
      <ScreenHeading title="Choose a ready-made set">In Ziffr these are called Packs.{data?.alone ? " There are few for private use so far." : ""}</ScreenHeading>
      {data ? <SetList data={data} all={all} onShowAll={showAll} onOpen={(set) => go("set", { set })} /> : <Reading failed={failed} onRetry={() => void reload()} />}
      <div className="mt-4 text-center">
        <Quiet onClick={() => go("first")}>Start from a clean slate instead</Quiet>
      </div>
    </>
  );
}

function Words({ set }: { set: FirstStepsSet }) {
  return (
    <>
      <span className="block">{set.summary}</span>
      <span className="mt-1 block">{set.metrics} {set.metrics === 1 ? "metric" : "metrics"}</span>
      {set.match && <span className="mt-1 block font-medium text-foreground">{set.match}</span>}
    </>
  );
}

type ListProps = { data: FirstStepsSets; all: boolean; onShowAll: () => void; onOpen: (id: string) => void };

/** The list as drawn from what the core handed over. */
export function SetList({ data, all, onShowAll, onOpen }: ListProps) {
  const { sets } = data;
  const shown = all ? sets : sets.slice(0, FIRST);
  // "Show all" goes away when pressed: the keyboard moves on to the first set it brought.
  const list = useRef<HTMLDivElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!all || !asked.current) return;
    asked.current = false;
    list.current?.querySelectorAll("button")[FIRST]?.focus();
  }, [all]);
  if (!sets.length) return <p className="text-sm text-muted-foreground">There is no ready-made set to choose here.</p>;
  return (
    <>
      <div ref={list}>
        <Choices>
          {shown.map((s) => <Choice key={s.id} title={s.name} hint={<Words set={s} />} onPick={() => onOpen(s.id)} />)}
        </Choices>
      </div>
      {shown.length < sets.length && (
        <div className="mt-4 text-center">
          <Quiet onClick={() => { asked.current = true; onShowAll(); }}>Show all {sets.length} sets</Quiet>
        </div>
      )}
    </>
  );
}
